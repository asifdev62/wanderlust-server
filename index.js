
import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';
import cors from "cors";

const app = express();
const PORT = 5000;

app.use(cors())
app.use(express.json())

const verifyApi = (req, res, next)=>{
  const authHeader = req.headers.authorization
  console.log(authHeader)

  if(authHeader !== "user looged in"){
    return res.status(401).send({msg:'Unauthorized users!'})
  }
  console.log('I am milediar')
 next()
}

// MongoDB connection string
const uri = process.env.MONGODB_URL;

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
const bookingCollection = db.collection("bookings")



app.post("/add-destination", async(req, res)=>{
const data = req.body

const result = await destinationCollection.insertOne(data)

console.log(result)
  res.send(result)
})



app.get('/destination', async(req, res)=>{
  const result = await destinationCollection.find().toArray()
  res.send(result)
})


app.get('/destination/:id', verifyApi, async(req, res) =>{
  
  const {id} = req.params
  const result = await destinationCollection.findOne({_id: new ObjectId(id)})
  console.log(id)

  res.send({result})
})


app.patch('/destination/:id', async(req, res)=>{
    const {id} = req.params
    const updateddata = req.body

    const result = await destinationCollection.updateOne({
      _id: new ObjectId(id)},
     {$set: updateddata}
    )
    res.send(result)
})

app.delete('/destination/:id', async(req, res) =>{
  const {id} = req.params
  const result = await destinationCollection.deleteOne({id: new ObjectId(id)})

  res.json(result)
})



app.post('/bookings', async (req, res)=>{
  const data = req.body
  const result = await bookingCollection.insertOne(data)
  res.send(result)
})

app.delete('/bookings/:id', async (req, res)=>{
  const {id} = req.params
  const {email} = req.query

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({message: 'Invalid booking id.'})
  }

  if (!email) {
    return res.status(400).json({message: 'An email is required to delete a booking.'})
  }

  // Bookings created from BookingPanel inherit the destination's string _id;
  // newer records may use a generated ObjectId, so match either representation.
  const result = await bookingCollection.deleteOne({
    _id: {$in: [id, new ObjectId(id)]},
    email,
  })

  if (result.deletedCount === 0) {
    return res.status(404).json({message: 'Booking not found.'})
  }

  res.json({success: true})
})

app.get('/my-bookings/:email', async(req, res)=>{
  const {email} = req.params
  const result = await bookingCollection.find({email:email}).toArray()

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




