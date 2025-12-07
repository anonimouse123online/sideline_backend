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

// --- POST Job (Create New Job) ---
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
    jobType,                  // matches job_type column
    location || null,
    duration || null,
    startDate || null,        // matches start_date column
    paymentType,              // matches payment_type column
    minBudget !== undefined ? minBudget : null, // matches min_budget
    maxBudget !== undefined ? maxBudget : null, // matches max_budget
    currency,
    contact_email,
    deadline || null,
    JSON.stringify(screeningQuestions)
  ]
);




    res.status(201).json({ message: 'Job posted successfully', job: result.rows[0] });
  } catch (err) {
    console.error('Error creating job:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 🚀 UPDATED: GET Jobs (Handle Search and Location Filters)
router.get('/', async (req, res) => {
    // Extract query parameters
    const keyword = req.query.q;
    const location = req.query.location;

    // Base query always starts with 1=1 for easy condition appending
    let query = 'SELECT * FROM jobs WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    try {
        // 1. Add Keyword Filter (q)
        if (keyword) {
            query += ` AND (title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
            params.push(`%${keyword}%`);
            paramIndex++;
        }

        // 2. Add Location Filter
        if (location) {
            query += ` AND location ILIKE $${paramIndex}`;
            params.push(`%${location}%`);
            paramIndex++;
        }

        // 3. Finalize and Execute Query
        query += ' ORDER BY created_at DESC';
        
        const result = await pool.query(query, params);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching jobs:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// ⚠️ NOTE: Since the root route now handles searching, 
// I recommend removing the dedicated '/search' route below for simplicity, 
// OR updating it to point to the root route's logic.

// --- GET Job Count ---
router.get('/count', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM jobs');
    res.status(200).json({ count: parseInt(result.rows[0].count, 10) });
  } catch (err) {
    console.error('Error counting jobs:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- REMOVED /search route to use the root GET route for all filtering.
/* router.get('/search', async (req, res) => {
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
*/

// --- GET Single Job by ID ---
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Job ID must be a number' });

  try {
    const result = await pool.query('SELECT * FROM jobs WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Job not found' });

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching job:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- GET User-Posted Jobs ---
router.get('/user/me', authenticateToken, async (req, res) => {
  try {
    const userEmail = req.user.email;
    console.log("📌 JWT email for fetching jobs:", userEmail);

    const result = await pool.query(
      'SELECT * FROM jobs WHERE contact_email = $1 ORDER BY created_at DESC',
      [userEmail]
    );

    console.log("📥 Jobs fetched for user:", result.rows);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching user jobs:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- DELETE Job ---
router.delete('/:id', authenticateToken, async (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  const userEmail = req.user.email;

  try {
    const result = await pool.query(
      'DELETE FROM jobs WHERE id = $1 AND contact_email = $2 RETURNING *',
      [jobId, userEmail]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Job not found or unauthorized' });

    res.json({ message: 'Job deleted successfully', job: result.rows[0] });
  } catch (err) {
    console.error('Error deleting job:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- PUT/PATCH Job (Update Existing Job) ---
router.put('/:id', authenticateToken, async (req, res) => {
    const jobId = parseInt(req.params.id, 10);
    const userEmail = req.user.email;

    if (isNaN(jobId)) {
        return res.status(400).json({ error: 'Job ID must be a number' });
    }

    try {
        // 1. Fetch existing job
        const currentJobResult = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
        if (currentJobResult.rowCount === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }
        const currentJob = currentJobResult.rows[0];

        // 2. Check ownership
        if (currentJob.contact_email !== userEmail) {
            return res.status(403).json({ error: 'You are not authorized to update this job.' });
        }

        // 3. Merge new data with existing data
        const updatedData = { ...currentJob, ...req.body };

        // 4. Normalize arrays
        const skills = JSON.stringify(updatedData.skills || []);
        const screeningQuestions = JSON.stringify(updatedData.screening_questions || []);

        // 5. Budget handling
        const minBudget = updatedData.payment_type === 'negotiable' ? null : (updatedData.min_budget ?? null);
        const maxBudget = updatedData.payment_type === 'negotiable' ? null : (updatedData.max_budget ?? null);

        // 6. Location check
        if ((updatedData.job_type === 'on-site' || updatedData.job_type === 'hybrid') && !updatedData.location) {
             return res.status(400).json({ error: "Location is required for 'on-site' or 'hybrid' jobs." });
        }

        // 7. Execute UPDATE
        const result = await pool.query(
            `UPDATE jobs SET
                title = $1,
                description = $2,
                category = $3,
                skills = $4,
                job_type = $5,
                location = $6,
                duration = $7,
                start_date = $8,
                payment_type = $9,
                min_budget = $10,
                max_budget = $11,
                currency = $12,
                contact_email = $13,
                deadline = $14,
                screening_questions = $15
            WHERE id = $16
            RETURNING *`,
            [
                updatedData.title,
                updatedData.description,
                updatedData.category,
                skills,
                updatedData.job_type,
                updatedData.location || null,
                updatedData.duration || null,
                updatedData.start_date || null,
                updatedData.payment_type,
                minBudget,
                maxBudget,
                updatedData.currency,
                updatedData.contact_email,
                updatedData.deadline || null,
                screeningQuestions,
                jobId
            ]
        );

        res.status(200).json({ message: 'Job updated successfully', job: result.rows[0] });

    } catch (err) {
        console.error(`Error updating job ${jobId}:`, err);
        res.status(500).json({ error: 'Internal server error during update' });
    }
});



export default router;