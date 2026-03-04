const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*", methods: ["GET", "POST", "DELETE"] }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, message: { error: "Too many requests. Please try again later." } });
app.use(limiter);

const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: { error: "Too many signup attempts. Please try again later." } });

app.use(express.static(path.join(__dirname, "public")));

const pool = mysql.createPool({
  host: process.env.DB_HOST, port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME, waitForConnections: true, connectionLimit: 10, queueLimit: 0,
});

async function initDB() {
  const conn = await pool.getConnection();
  await conn.execute("CREATE TABLE IF NOT EXISTS waitlist (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE, timestamp DATETIME NOT NULL DEFAULT NOW())");
  conn.release();
  console.log("Database ready.");
}

function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];
  if (!token || token !== process.env.ADMIN_SECRET) return res.status(401).json({ error: "Unauthorized" });
  next();
}

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.post("/signup", signupLimiter, async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: "Name and email are required." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Invalid email address." });
  if (name.length > 255 || email.length > 255) return res.status(400).json({ error: "Input too long." });
  try {
    await pool.execute("INSERT INTO waitlist (name, email) VALUES (?, ?)", [name.trim(), email.trim().toLowerCase()]);
    res.json({ success: true });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "duplicate" });
    console.error("Signup error:", err);
    res.status(500).json({ error: "Server error. Please try again." });
  }
});

app.get("/signups", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT id, name, email, DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i') AS timestamp FROM waitlist ORDER BY timestamp DESC");
    res.json({ records: rows.map(r => ({ rowIndex: r.id, name: r.name, email: r.email, timestamp: r.timestamp })) });
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ error: "Failed to fetch signups." });
  }
});

app.delete("/signup/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID." });
  try {
    await pool.execute("DELETE FROM waitlist WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Failed to delete entry." });
  }
});


app.post("/admin/login", (req, res) => {
  const { password } = req.body;
  if (!password || password !== process.env.ADMIN_UI_PASSWORD) {
    return res.status(401).json({ error: "Incorrect password" });
  }
  res.json({ token: process.env.ADMIN_SECRET });
});


app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

initDB().then(() => {
  app.listen(PORT, () => console.log("Server running on port " + PORT));
}).catch(err => {
  console.error("Failed to connect to database:", err.message);
  process.exit(1);
});
