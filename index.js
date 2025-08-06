require("dotenv").config();
const express = require("express");
const cors = require("cors");
const StripeLib = require("stripe");           // renamed import
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;
const stripe = StripeLib(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

// 1) Health check
app.get("/", (req, res) => {
  res.send("server is running");
});

async function run() {
  try {
    // 2) Connect to MongoDB
    const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}` +
                `@cluster0.vvycnhh.mongodb.net/?retryWrites=true&w=majority`;
    const client = new MongoClient(uri, {
      serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
    });

    await client.connect();
    console.log("Connected to MongoDB");

    const parcels = client.db("DurontoCourier").collection("parcels");

    // 3) Parcel CRUD
    app.post("/parcels", async (req, res) => {
      try {
        const result = await parcels.insertOne(req.body);
        res.status(201).json({ insertedId: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to create parcel" });
      }
    });

    app.get("/parcels", async (req, res) => {
      try {
        const filter = req.query.user_email
          ? { "sender.user_email": req.query.user_email }
          : {};
        const data = await parcels.find(filter).toArray();
        res.json(data);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch parcels" });
      }
    });

    app.get("/parcels/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid parcel ID" });
        }
        const parcel = await parcels.findOne({ _id: new ObjectId(id) });
        if (!parcel) {
          return res.status(404).json({ message: "Parcel not found" });
        }
        res.json(parcel);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch parcel" });
      }
    });

    app.delete("/parcels/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { deletedCount } = await parcels.deleteOne({ _id: new ObjectId(id) });
        if (deletedCount === 0) {
          return res.status(404).json({ message: "Parcel not found" });
        }
        res.json({ message: "Parcel cancelled" });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to delete parcel" });
      }
    });

    // 4) Stripe payment‐intent route
    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { amount, currency = "usd", parcelId } = req.body;
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(amount * 100),
          currency,
          payment_method_types: ["card"],
          metadata: { parcelId },
        });
        res.json({ clientSecret: paymentIntent.client_secret });
      } catch (err) {
        console.error("Stripe Error:", err);
        res.status(500).json({ error: err.message });
      }
    });

    // 5) Start listening *after* routes are in place
    app.listen(port, () => {
      console.log(`Server listening on http://localhost:${port}`);
    });
  } catch (err) {
    console.error("Startup error:", err);
  }
}

run();
