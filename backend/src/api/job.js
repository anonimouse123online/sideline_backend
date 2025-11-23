// src/api/job.js
import express from 'express';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// -------------------- JWT Authentication Middleware -------------------- //
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// -------------------- POST /api/jobs -------------------- //
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      skills = [],
      jobType,
      location = null,
      duration = null,
      startDate = null,
      paymentType,
      minBudget = null,
      maxBudget = null,
      currency,
      contact_email,
      deadline = null,
      screeningQuestions = [],
    } = req.body;

    // Validation
    if (!title || !description || !category || !jobType || !paymentType || !contact_email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(
      `INSERT INTO jobs
        (title, description, category, skills, job_type, location, duration, start_date,
         payment_type, min_budget, max_budget, currency, contact_email, deadline, screening_questions)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        title,
        description,
        category,
        JSON.stringify(skills),
        jobType,
        location || null,
        duration || null,
        startDate || null,
        paymentType,
        minBudget !== undefined ? minBudget : null,
        maxBudget !== undefined ? maxBudget : null,
        currency,
        contact_email,
        deadline || null,
        JSON.stringify(screeningQuestions),
      ]
    );

    res.status(201).json({ message: 'Job posted successfully', job: result.rows[0] });
  } catch (err) {
    console.error('Error creating job:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// -------------------- GET /api/jobs -------------------- //
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM jobs ORDER BY created_at DESC');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching jobs:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// -------------------- GET /api/jobs/search?q= -------------------- //
router.get('/search', async (req, res) => {
  const q = req.query.q || '';
  try {
    const result = await pool.query(
      'SELECT * FROM jobs WHERE title ILIKE $1 OR description ILIKE $1 ORDER BY created_at DESC',
      [`%${q}%`]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error searching jobs:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
