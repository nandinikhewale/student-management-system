require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/database");

const app = express();

const allowed = (process.env.FRONTEND_URL || "").split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: allowed }));
app.use(express.json());

app.get("/", (req, res) => res.send("Student API is running"));
app.use("/api/students", require("./routes/studentRoutes"));
if (process.env.MCP_SECRET) require("./mcp")(app);

connectDB()
  .then(() => app.listen(process.env.PORT || 5000, () => console.log("Server running")))
  .catch((e) => {
    console.error("Database connection failed:", e.message);
    process.exit(1);
  });
