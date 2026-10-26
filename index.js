
import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
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

app.get('/destination', async(req, res)=>{
  const result = await destinationCollection.find().toArray()
  res.send(result)
})


app.get('/destination/:id', async(req, res) =>{
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