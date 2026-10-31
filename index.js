import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';
import cors from 'cors';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const DB_NAME = 'wanderlast';

app.use(cors());
app.use(express.json());

class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

// Accept only a real MongoDB URI. Also tolerate the common copy/paste mistake
// of wrapping the value in matching quotes; never log the value itself.
function normalizeMongoUri(raw) {
  if (typeof raw !== 'string') return null;

  let uri = raw.replace(/^\uFEFF/, '').trim();
  const first = uri[0];
  const last = uri[uri.length - 1];

  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    uri = uri.slice(1, -1).trim();
  }

  if (!uri || /\s/.test(uri)) return null;
  if (!/^mongodb(\+srv)?:\/\//i.test(uri)) return null;

  return uri;
}

const mongoUri = normalizeMongoUri(process.env.MONGODB_URL);

let mongoClientPromise;

function getMongoClient() {
  if (!mongoUri) {
    return Promise.reject(
      new ConfigError(
        'MONGODB_URL is missing, empty, or does not start with "mongodb://" or "mongodb+srv://".',
      ),
    );
  }

  if (!mongoClientPromise) {
    const client = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      maxPoolSize: 10,
    });

    mongoClientPromise = client.connect().catch((error) => {
      // Allow a later request to retry instead of caching a rejected promise.
      mongoClientPromise = undefined;
      client.close().catch(() => {});
      throw error;
    });
  }

  return mongoClientPromise;
}

async function getDb() {
  const client = await getMongoClient();
  return client.db(DB_NAME);
}

function describeMongoError(error) {
  if (error instanceof ConfigError) return error.message;
  if (error?.name === 'MongoParseError') return 'MongoDB connection string is invalid.';
  if (error?.name === 'MongoServerSelectionError' || error?.name === 'MongoNetworkError') {
    return 'MongoDB is unreachable.';
  }
  return `${error?.name ?? 'Error'}: ${error?.message ?? 'unknown error'}`;
}

const requireDb = async (req, res, next) => {
  try {
    req.db = await getDb();
    next();
  } catch (error) {
    console.error('MongoDB connection failed:', describeMongoError(error));
    res.status(503).json({
      success: false,
      message: 'Database is unavailable.',
    });
  }
};

let jwks;

function getJwks() {
  if (jwks) return jwks;

  const rawClientUrl = process.env.CLIENT_URL?.trim();
  if (!rawClientUrl) {
    throw new ConfigError('CLIENT_URL is not configured.');
  }

  let clientUrl;
  try {
    clientUrl = new URL(rawClientUrl);
  } catch {
    throw new ConfigError('CLIENT_URL is not a valid absolute URL.');
  }

  if (clientUrl.protocol !== 'http:' && clientUrl.protocol !== 'https:') {
    throw new ConfigError('CLIENT_URL must use http or https.');
  }

  if (process.env.VERCEL && clientUrl.protocol !== 'https:') {
    throw new ConfigError('CLIENT_URL must use https on Vercel.');
  }

  // Better Auth exposes the JWT plugin's JWKS at /api/auth/jwks.
  // Using the origin avoids a double slash when CLIENT_URL ends in "/".
  jwks = createRemoteJWKSet(new URL('/api/auth/jwks', clientUrl.origin), {
    timeoutDuration: 5000,
    cooldownDuration: 30000,
  });

  return jwks;
}

function isJwksUnavailable(error) {
  const message = String(error?.message ?? '');

  return (
    error?.code === 'ERR_JWKS_TIMEOUT' ||
    error?.name === 'TypeError' ||
    message === 'fetch failed' ||
    message === 'Expected 200 OK from the JSON Web Key Set HTTP response'
  );
}

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized user. Token is missing.',
    });
  }

  const token = authHeader.slice('Bearer '.length).trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized user. Token is missing.',
    });
  }

  try {
    // Better Auth's JWT plugin signs EdDSA (Ed25519) tokens by default.
    const { payload } = await jwtVerify(token, getJwks(), {
      algorithms: ['EdDSA'],
    });

    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error('Auth configuration error:', error.message);
      return res.status(503).json({
        success: false,
        message: 'Authentication is not configured.',
      });
    }

    if (isJwksUnavailable(error)) {
      console.error('JWKS fetch failed:', error.message);
      return res.status(503).json({
        success: false,
        message: 'Authentication service is temporarily unavailable.',
      });
    }

    console.error('JWT verification failed:', error.code ?? error.name);
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication token.',
    });
  }
};

app.post('/add-destination', verifyToken, requireDb, async (req, res) => {
  const result = await req.db.collection('destination').insertOne(req.body);
  res.send(result);
});

app.get('/destination', requireDb, async (req, res) => {
  const result = await req.db.collection('destination').find().toArray();
  res.send(result);
});

app.get('/destination/:id', verifyToken, requireDb, async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid destination id.' });
  }

  const result = await req.db.collection('destination').findOne({ _id: new ObjectId(id) });
  res.send({ result });
});

app.patch('/destination/:id', verifyToken, requireDb, async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid destination id.' });
  }

  const result = await req.db
    .collection('destination')
    .updateOne({ _id: new ObjectId(id) }, { $set: req.body });

  res.send(result);
});

app.delete('/destination/:id', verifyToken, requireDb, async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid destination id.' });
  }

  const result = await req.db.collection('destination').deleteOne({ _id: new ObjectId(id) });
  res.json(result);
});

app.post('/bookings', verifyToken, requireDb, async (req, res) => {
  const result = await req.db.collection('bookings').insertOne(req.body);
  res.send(result);
});

app.delete('/bookings/:id', verifyToken, requireDb, async (req, res) => {
  const { id } = req.params;
  const { email } = req.query;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid booking id.' });
  }

  if (!email) {
    return res.status(400).json({ message: 'An email is required to delete a booking.' });
  }

  // Bookings created from BookingPanel inherit the destination's string _id;
  // newer records may use a generated ObjectId, so match either representation.
  const result = await req.db.collection('bookings').deleteOne({
    _id: { $in: [id, new ObjectId(id)] },
    email,
  });

  if (result.deletedCount === 0) {
    return res.status(404).json({ message: 'Booking not found.' });
  }

  res.json({ success: true });
});

app.get('/my-bookings/:email', requireDb, async (req, res) => {
  const { email } = req.params;
  const result = await req.db.collection('bookings').find({ email }).toArray();
  res.send(result);
});

app.get('/', (req, res) => {
  res.send({ message: 'Server is running fine!' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error('Unhandled request error:', error?.name ?? 'Error');
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

// Vercel imports the exported app and invokes it per request. Only bind a port
// when running locally; never call app.listen() in the serverless runtime.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });

  getDb()
    .then(() => console.log('You successfully connected to MongoDB!'))
    .catch((error) => console.error('MongoDB connection failed:', describeMongoError(error)));
}

export default app;
