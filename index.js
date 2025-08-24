require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
const StripeLib = require("stripe"); // renamed import
const admin = require("firebase-admin");
app.use(cors());
app.use(express.json());
const stripe = StripeLib(process.env.STRIPE_SECRET_KEY);

var serviceAccount = require("./duronto-courier-admin-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
// 1) Health check
app.get("/", (req, res) => {
  res.send("server is running");
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
    // 2) Connect to MongoDB

    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    const parcelsCollection = client.db("DurontoCourier").collection("parcels");
    const paymentsCollection = client
      .db("DurontoCourier")
      .collection("payments");
    const riders = client.db("DurontoCourier").collection("riders");
    const userCollection = client.db("DurontoCourier").collection("users");

    const verifyFirebaseToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ message: "Unauthorized: No token" });
      }

      // Bearer <token>
      const token = authHeader.split(" ")[1];
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
      } catch (error) {
        return res.status(403).json({ message: "Forbidden: Invalid token" });
      }
      // jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      //   if (err) {
      //     return res.status(403).json({ message: "Forbidden: Invalid token" });
      //   }
      //   req.decoded = decoded; // { email, iat, exp }
      //   next();
      // });
    };

    // 3) Parcel CRUD
    app.post("/parcels", async (req, res) => {
      try {
        const result = await parcelsCollection.insertOne(req.body);
        res.status(201).json({ insertedId: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to create parcel" });
      }
    });

    app.get("/parcels", verifyFirebaseToken, async (req, res) => {
      try {
        const filter = req.query.user_email
          ? { "sender.user_email": req.query.user_email }
          : {};
        const data = await parcelsCollection.find(filter).toArray();
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
        const parcel = await parcelsCollection.findOne({
          _id: new ObjectId(id),
        });
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
        const { deletedCount } = await parcelsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (deletedCount === 0) {
          return res.status(404).json({ message: "Parcel not found" });
        }
        res.json({ message: "Parcel cancelled" });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to delete parcel" });
      }
    });
    // riders
    app.post("/riders", async (req, res) => {
      try {
        const newRider = req.body;
        // optional: server-side validation here
        newRider.status = "pending";
        const result = await riders.insertOne(newRider);
        // result = { acknowledged: true, insertedId: ObjectId("…") }
        res.status(201).json(result);
      } catch (insertErr) {
        console.error("Insert error:", insertErr);
        res.status(500).json({
          acknowledged: false,
          message: "Failed to register rider",
        });
      }
    });
    app.get("/riders", verifyFirebaseToken, async (req, res) => {
      try {
        const filter = {};
        if (req.query.status) {
          filter.status = req.query.status;
        }
        const list = await riders.find(filter).toArray();
        res.json(list);
      } catch (err) {
        console.error("GET /riders error:", err);
        res.status(500).json({ message: "Failed to fetch riders" });
      }
    });

    //
    // 3) Approve rider → PATCH status to “active”
    //
    app.patch("/riders/:id", verifyFirebaseToken, async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid rider ID" });
        }
        const update = { $set: { status: req.body.status || "active" } };
        const result = await riders.updateOne(
          { _id: new ObjectId(id) },
          update
        );
        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Rider not found" });
        }
        res.json({ modifiedCount: result.modifiedCount });
      } catch (err) {
        console.error("PATCH /riders/:id error:", err);
        res.status(500).json({ message: "Failed to update rider status" });
      }
    });

    //
    // 4) Reject rider → DELETE document
    //
    app.delete("/riders/:id", verifyFirebaseToken, async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid rider ID" });
        }
        const { deletedCount } = await riders.deleteOne({
          _id: new ObjectId(id),
        });
        if (deletedCount === 0) {
          return res.status(404).json({ message: "Rider not found" });
        }
        res.json({ message: "Rider rejected and removed" });
      } catch (err) {
        console.error("DELETE /riders/:id error:", err);
        res.status(500).json({ message: "Failed to reject rider" });
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
    // POST /payments — save payment and mark parcel as paid
    app.post("/payments", async (req, res) => {
      try {
        const {
          parcelId, // string (Mongo ObjectId)
          amount, // number (in smallest unit used on server-side; keep consistent)
          currency = "usd", // string
          user_email, // who paid
          paymentIntentId, // Stripe PaymentIntent id (pi_*)
          paymentMethod = "card",
          status = "succeeded",
        } = req.body;

        // Validate parcelId
        if (!ObjectId.isValid(parcelId)) {
          return res.status(400).json({ message: "Invalid parcelId" });
        }

        // Insert a payment record
        const paymentDoc = {
          parcelId: new ObjectId(parcelId),
          amount,
          currency,
          user_email,
          paymentIntentId,
          paymentMethod,
          status,
          createdAt: new Date(),
        };
        const insertResult = await paymentsCollection.insertOne(paymentDoc);

        // Update the parcel’s paymentStatus to 'paid'
        const updateResult = await parcelsCollection.updateOne(
          { _id: new ObjectId(parcelId) },
          {
            $set: {
              paymentStatus: "paid",
              paidAt: new Date(),
              paymentIntentId,
            },
          }
        );

        if (updateResult.matchedCount === 0) {
          return res.status(404).json({ message: "Parcel not found" });
        }

        return res.status(201).json({
          paymentId: insertResult.insertedId,
          updatedParcel: updateResult.modifiedCount === 1,
        });
      } catch (err) {
        // Handle duplicate paymentIntentId gracefully
        if (err.code === 11000) {
          return res.status(409).json({ message: "Payment already recorded" });
        }
        console.error("POST /payments error", err);
        return res.status(500).json({ message: "Failed to save payment" });
      }
    });

    // GET /payments?user_email=... — list a user's payments
    app.get("/payments", verifyFirebaseToken, async (req, res) => {
      try {
        const { user_email } = req.query;
        console.log("decoded", req.decoded);
        if (req.decoded.email !== user_email) {
          return res.status(403).send({ message: "forbidden access" });
        }
        const filter = user_email ? { user_email } : {};
        const payments = await paymentsCollection
          .find(filter)
          .sort({ createdAt: -1 })
          .toArray();
        return res.json(payments);
      } catch (err) {
        console.error("GET /payments error", err);
        return res.status(500).json({ message: "Failed to fetch payments" });
      }
    });
    app.post("/users", async (req, res) => {
      try {
        const {
          name,
          email,
          createdAt = new Date(),
          role = "user", // optional: default role
        } = req.body;

        // Check if user already exists
        const existing = await userCollection.findOne({ email });
        if (existing) {
          return res.status(409).json({ message: "User already exists" });
        }

        const newUser = {
          name,
          email,
          createdAt,
          role,
        };

        const result = await userCollection.insertOne(newUser);
        res.status(201).json({ insertedId: result.insertedId });
      } catch (err) {
        console.error("POST /users error", err);
        res.status(500).json({ message: "Failed to register user" });
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
