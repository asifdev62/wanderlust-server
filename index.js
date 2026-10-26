
import express from 'express';
import { MongoClient } from 'mongodb';
import 'dotenv/config';
import cors from "cors";

const app = express();
const PORT = 5000;

app.use(cors())
app.use(express.json())

// MongoDB connection string
const uri = process.env.MONGODB_URI;

const client = new MongoClient(process.env.MONGODB_URL);

async function connectToMongoDB() {
  try{
  await client.connect();
  console.log('You successfully connected to MongoDB!');
  return client;
  } catch (err){
    console.dir(err);
  }
}

const mongoClinet = await connectToMongoDB();
const db = mongoClinet.db('wanderlast')
const destinationCollection = db.collection('destination')

app.post("/add-destination", async(req, res)=>{
const data = req.body

const result = await destinationCollection.insertOne(data)

console.log(result)
  res.send(result)
})

app.get('/', (req, res) => {
  res.send({ message: 'Server is running fine!' });
});

async function startServer() {
  try {
    await connectToMongoDB();

    app.listen(PORT, () => {
      console.log(`Server is running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
}

startServer();