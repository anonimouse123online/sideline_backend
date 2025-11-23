// src/api/applicants.js
import express from 'express';
import pool from '../../db.js';

const router = express.Router();

// -------------------- POST /api/applicants -------------------- //
router.post('/', async (req, res) => {
  try {
   const {
  job_id,
  user_id,
  experience = null,
  location = null,
  cover_letter = null,
  resume_url = null,
  skills = null
} = req.body;



    if (!job_id || !user_id) {
      return res.status(400).json({ error: 'Missing required job_id or user_id' });
    }

    // Check if user already applied for this job
    const existing = await pool.query(
      'SELECT id FROM applicants WHERE job_id = $1 AND user_id = $2',
      [job_id, user_id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'You have already applied for this job' });
    }

    // Insert application
    const result = await pool.query(
  `INSERT INTO applicants 
   (job_id, user_id, experience, location, cover_letter, resume_url, skills, status, applied_at)
   VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())
   RETURNING *`,
  [
    job_id,
    user_id,
    experience,
    location,
    cover_letter,
    resume_url,
    skills ? JSON.stringify(skills) : null
  ]
);


    res.status(201).json({
      message: 'Application submitted successfully',
      application: result.rows[0]
    });
  } catch (error) {
    console.error('Error submitting application:', error.message, error.stack);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

export default router;
