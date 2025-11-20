// src/api/jobs.js
import express from 'express';
import pool from '../../db.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

// JWT Authentication Middleware for jobs
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

// POST /api/jobs - Create a new job (PROTECTED)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      skills,
      jobType,
      location,
      duration,
      startDate,
      paymentType,
      minBudget,
      maxBudget,
      currency,
      contact_email,
      deadline,
      screeningQuestions,
      termsAccepted
    } = req.body;

    const userId = req.user.userId; // Get user ID from JWT token

    // Validation
    if (!title || !description || !category || !jobType || !paymentType || !contact_email || !termsAccepted) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(
      `INSERT INTO jobs
      (title, description, category, skills, job_type, location, duration, start_date, payment_type, min_budget, max_budget, currency, contact_email, deadline, screening_questions, terms_accepted, user_id, status)
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *`,
      [
        title,
        description,
        category,
        skills || [],
        jobType,
        location || null,
        duration || null,
        startDate || null,
        paymentType,
        minBudget || null,
        maxBudget || null,
        currency || null,
        contact_email,
        deadline || null,
        screeningQuestions || [],
        termsAccepted,
        userId, // Link job to user
        'active' // Default status
      ]
    );

    res.status(201).json({ 
      message: 'Job posted successfully',
      job: result.rows[0] 
    });
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/jobs/my-jobs - Get jobs posted by current user (PROTECTED)
router.get('/my-jobs', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `SELECT j.*, 
              COUNT(a.id) as applications_count
       FROM jobs j 
       LEFT JOIN applicants a ON j.id = a.job_id 
       WHERE j.user_id = $1 
       GROUP BY j.id 
       ORDER BY j.created_at DESC`,
      [userId]
    );

    const jobs = result.rows.map(job => ({
      id: job.id,
      title: job.title,
      description: job.description,
      category: job.category,
      skills: job.skills || [],
      job_type: job.job_type,
      location: job.location,
      duration: job.duration,
      start_date: job.start_date,
      payment_type: job.payment_type,
      min_budget: job.min_budget,
      max_budget: job.max_budget,
      currency: job.currency,
      contact_email: job.contact_email,
      deadline: job.deadline,
      screening_questions: job.screening_questions || [],
      status: job.status,
      created_at: job.created_at,
      applications: job.applications_count || 0
    }));

    res.status(200).json({ jobs });
  } catch (error) {
    console.error('Error fetching user jobs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/jobs/search - Search jobs (public)
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: "Missing search query" });

    const result = await pool.query(
      `SELECT j.*, 
              u.first_name, 
              u.last_name,
              COUNT(a.id) as applications_count
       FROM jobs j 
       LEFT JOIN users u ON j.user_id = u.id
       LEFT JOIN applicants a ON j.id = a.job_id 
       WHERE (LOWER(j.title) LIKE LOWER($1)
          OR LOWER(j.description) LIKE LOWER($1)
          OR LOWER(j.category) LIKE LOWER($1))
         AND j.status = 'active'
       GROUP BY j.id, u.first_name, u.last_name
       ORDER BY j.created_at DESC`,
      [`%${q}%`]
    );

    const jobs = result.rows.map(job => {
      let skills = [];
      try {
        skills = job.skills ? JSON.parse(job.skills) : [];
      } catch (e) {
        console.log('Error parsing skills:', e);
      }
      return { 
        ...job, 
        skills,
        applications: job.applications_count || 0,
        employer: {
          firstName: job.first_name,
          lastName: job.last_name
        }
      };
    });

    res.status(200).json(jobs);
  } catch (err) {
    console.error("Search jobs error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/jobs - Get all jobs (public)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT j.*, 
              u.first_name, 
              u.last_name,
              COUNT(a.id) as applications_count
       FROM jobs j 
       LEFT JOIN users u ON j.user_id = u.id
       LEFT JOIN applicants a ON j.id = a.job_id 
       WHERE j.status = 'active'
       GROUP BY j.id, u.first_name, u.last_name
       ORDER BY j.created_at DESC`
    );

    const jobs = result.rows.map(job => ({
      id: job.id,
      title: job.title,
      description: job.description,
      category: job.category,
      skills: job.skills || [],
      job_type: job.job_type,
      location: job.location,
      duration: job.duration,
      start_date: job.start_date,
      payment_type: job.payment_type,
      min_budget: job.min_budget,
      max_budget: job.max_budget,
      currency: job.currency,
      contact_email: job.contact_email,
      deadline: job.deadline,
      screening_questions: job.screening_questions || [],
      status: job.status,
      created_at: job.created_at,
      applications: job.applications_count || 0,
      employer: {
        firstName: job.first_name,
        lastName: job.last_name
      }
    }));

    res.status(200).json({ jobs });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/jobs/:id - Get single job by ID (public) - THIS SHOULD BE LAST!
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ STRONG VALIDATION: Check if it's a special route name that should be handled by other routes
    const reservedRoutes = ['my-jobs', 'search', 'applicants', 'categories'];
    if (reservedRoutes.includes(id)) {
      console.log(`⚠️ Reserved route '${id}' accessed via :id parameter`);
      return res.status(404).json({ error: 'Job not found' });
    }

    // ✅ Validate that id is a number and positive integer
    const jobId = parseInt(id);
    if (isNaN(jobId) || jobId <= 0 || !Number.isInteger(jobId)) {
      return res.status(400).json({ error: 'Invalid job ID. Must be a positive integer.' });
    }

    const result = await pool.query(
      `SELECT j.*, 
              u.first_name, 
              u.last_name,
              u.profile_pic,
              COUNT(a.id) as applications_count
       FROM jobs j 
       LEFT JOIN users u ON j.user_id = u.id
       LEFT JOIN applicants a ON j.id = a.job_id 
       WHERE j.id = $1
       GROUP BY j.id, u.first_name, u.last_name, u.profile_pic`,
      [jobId] // Use parsed integer
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = result.rows[0];
    const jobWithDetails = {
      id: job.id,
      title: job.title,
      description: job.description,
      category: job.category,
      skills: job.skills || [],
      job_type: job.job_type,
      location: job.location,
      duration: job.duration,
      start_date: job.start_date,
      payment_type: job.payment_type,
      min_budget: job.min_budget,
      max_budget: job.max_budget,
      currency: job.currency,
      contact_email: job.contact_email,
      deadline: job.deadline,
      screening_questions: job.screening_questions || [],
      status: job.status,
      created_at: job.created_at,
      applications: job.applications_count || 0,
      employer: {
        id: job.user_id,
        firstName: job.first_name,
        lastName: job.last_name,
        profilePic: job.profile_pic
      }
    };

    res.status(200).json({ job: jobWithDetails });
  } catch (error) {
    console.error('Error fetching job:', error);
    
    // More specific error handling
    if (error.code === '22P02') { // Invalid text representation error
      return res.status(400).json({ error: 'Invalid job ID format' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;