// src/server.js
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import pkg from "pg";
import multer from "multer";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import jobsRouter from './api/job.js'; // ✅ FIXED: Correct file name
import applicantsRouter from './api/applicants.js';
import adminRouter from './api/admin.js';

dotenv.config();

const { Pool } = pkg;
const app = express();
const port = process.env.PORT || 10000;

// ✅ ES module __dirname workaround
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ✅ Validate DATABASE_URL and JWT_SECRET early
if (!process.env.DATABASE_URL) {
  console.error("❌ FATAL: DATABASE_URL is not set.");
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.error("❌ FATAL: JWT_SECRET is not set.");
  process.exit(1);
}

// ✅ PostgreSQL connection — use DATABASE_URL + SSL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ✅ SIMPLE CORS CONFIGURATION - This works
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'https://sideline-frontend.onrender.com' // <-- add your deployed frontend here
  ],
  credentials: true
}));

app.use(bodyParser.json());

// ✅ JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// ✅ Health check on startup (prevents server from starting if DB fails)
const startServer = async () => {
  try {
    await pool.query("SELECT 1");
    console.log("✅ Database connected successfully");
  } catch (err) {
    console.error("❌ Failed to connect to database:", err.message);
    process.exit(1);
  }

  // Ensure uploads folder exists
  const uploadsDir = join(__dirname, "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log("✅ Uploads directory created");
  }

  // -------------------- USER ENDPOINTS -------------------- //

  // ✅ UPDATED: Signup with JWT token
  app.post("/api/signup", async (req, res) => {
    try {
      const { firstName, lastName, email, phone, password } = req.body;
      if (!firstName || !lastName || !email || !password)
        return res.status(400).json({ error: "Missing required fields" });

      // Check if user already exists
      const existingUser = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
      if (existingUser.rows.length > 0)
        return res.status(400).json({ error: "Email already registered" });

      // Hash password
      // TEMP: Store plain password (no hashing)
      // Hash password before saving
      const hashedPassword = await bcrypt.hash(password, 10);



      // Create user
      const newUser = await pool.query(
        `INSERT INTO users (first_name, last_name, email, phone, password) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING id, first_name, last_name, email, phone`,
        [firstName, lastName, email, phone || null, hashedPassword]
      );

      const user = newUser.rows[0];

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user.id,
          email: user.email 
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.status(201).json({ 
        message: "Account created successfully",
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          phone: user.phone
        },
        token: token,
        expiresIn: '24h'
      });
    } catch (err) {
      console.error("Signup error:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ✅ UPDATED: Login with JWT token
  app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    // Check if user exists
    const userResult = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: "User not found" });
    }

    const user = userResult.rows[0];

    // 🟦 PLAIN PASSWORD CHECK (NO BCRYPT)
   // Check if password is hashed (bcrypt hashes start with $2)
if (user.password.startsWith("$2")) {
  // Compare hashed password
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ error: "Invalid password" });
} else {
  // Plain text password (old user)
  if (password !== user.password) return res.status(400).json({ error: "Invalid password" });

  // Upgrade to hashed password after successful login
  const hash = await bcrypt.hash(password, 10);
  await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hash, user.id]);
}


    // Generate token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Success response
    res.status(200).json({
      message: "Login successful",
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        phone: user.phone
      },
      token: token,
      expiresIn: '24h'
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


  // ✅ UPDATE: Profile update with authentication
  app.put("/api/profile/update", authenticateToken, async (req, res) => {
    try {
      const { firstName, lastName, phone, email } = req.body;
      
      const result = await pool.query(
        `UPDATE users 
         SET first_name = $1, last_name = $2, phone = $3 
         WHERE email = $4 
         RETURNING id, first_name, last_name, email, phone`,
        [firstName, lastName, phone, email]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const updatedUser = result.rows[0];
      res.status(200).json({
        message: "Profile updated successfully",
        user: {
          id: updatedUser.id,
          firstName: updatedUser.first_name,
          lastName: updatedUser.last_name,
          email: updatedUser.email,
          phone: updatedUser.phone
        }
      });
    } catch (err) {
      console.error("Profile update error:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // Fetch profile
  app.get("/api/profile", async (req, res) => {
    try {
      const { email } = req.query;
      if (!email) return res.status(400).json({ error: "Email is required" });

      const userResult = await pool.query(
        `SELECT id, first_name AS "firstName", last_name AS "lastName", email, phone FROM users WHERE email = $1`,
        [email]
      );

      if (userResult.rows.length === 0)
        return res.status(404).json({ error: "User not found" });
      res.status(200).json({ user: userResult.rows[0] });
    } catch (err) {
      // ✅ This is the correct place! 'err' contains the detailed PostgreSQL error.
      console.error("Profile fetch error:", err);
      // The client sees this generic message:
      res.status(500).json({ error: "Server error" });
    }
  });

  // ✅ Use the imported routers - ALL jobs routes are in the router
  app.use('/api/jobs', jobsRouter);
  app.use('/api/applicants', applicantsRouter);
  app.use('/api/admin', adminRouter);

  // ✅ NO DIRECT /api/jobs/* ROUTES HERE - All jobs routes are in jobsRouter

  // -------------------- STATIC FILES -------------------- //
  app.use("/uploads", express.static(uploadsDir));

  // -------------------- START SERVER -------------------- //
  app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
    console.log(`✅ CORS enabled for localhost development`);
    console.log(`✅ JWT Authentication enabled`);
    console.log(`✅ Uploads directory: ${uploadsDir}`);
    console.log(`✅ Jobs routes: All routes are in jobsRouter`);
  });
};
app.use((req, res, next) => {
  console.log(`📡 Incoming request: ${req.method} ${req.url}`);
  next();
});


// Start the app
startServer();