require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("server is running");
});
app.listen(port, () => {
  console.log(`server is running on port:${port}`);
});

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vvycnhh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    const parcelsCollection = client.db("DurontoCourier").collection("parcels");
    app.post("/parcels", async (req, res) => {
      try {
        const parcel = req.body;
        const result = await parcelsCollection.insertOne(parcel);
        res.status(201).json({ insertedId: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to create parcel" });
      }
    });
    app.get("/parcels", async (req, res) => {
      try {
        const email = req.query.user_email;
        const filter = email ? { "sender.user_email": email } : {};
        const parcels = await parcelsCollection.find(filter).toArray();
        res.status(200).json(parcels);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch parcels" });
      }

      app.delete("/parcels/:id", async (req, res) => {
        try {
          const id = req.params.id;
          const result = await parcelsCollection.deleteOne({
            _id: new ObjectId(id),
          });

          if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Parcel not found" });
          }
          res.status(200).json({ message: "Parcel cancelled" });
        } catch (err) {
          console.error(err);
          res.status(500).json({ message: "Failed to delete parcel" });
        }
      });

      app.get("/parcels/:id", async (req, res) => {
        try {
          const { id } = req.params;
          // Validate the ID format
          if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid parcel ID" });
          }

          // Look up the parcel
          const parcel = await parcelsCollection.findOne({
            _id: new ObjectId(id),
          });
          if (!parcel) {
            return res.status(404).json({ message: "Parcel not found" });
          }

          res.status(200).json(parcel);
        } catch (err) {
          console.error("GET /parcels/:id error", err);
          res.status(500).json({ message: "Failed to fetch parcel" });
        }
      });

      // PATCH /parcels/:id  — update payment or delivery status
      app.patch("/parcels/:id", async (req, res) => {
        try {
          const id = req.params.id;
          const updates = req.body; // e.g. { paymentStatus: "paid" } or { deliveryStatus: "shipped" }

          const result = await parcelsCollection.findOneAndUpdate(
            { _id: new ObjectId(id) },
            { $set: updates },
            { returnDocument: "after" }
          );

          if (!result.value) {
            return res.status(404).json({ message: "Parcel not found" });
          }
          res.status(200).json(result.value);
        } catch (err) {
          console.error(err);
          res.status(500).json({ message: "Failed to update parcel" });
        }
      });
    });
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);
