// src/api/applicants.js
import express from 'express';
import pool from '../../db.js';

const router = express.Router();

// -------------------- POST /api/applicants -------------------- //
router.post('/', async (req, res) => {
  try {
    const {
      job_id,
      position = null,
      experience = null,
      location = null,
      cover_letter = null,
      resume_url = null,
      skills = []
    } = req.body;

    if (!job_id) {
      return res.status(400).json({ error: 'Missing required job_id' });
    }

    // Insert application safely
    const result = await pool.query(
      `INSERT INTO applicants 
       (job_id, position, experience, location, cover_letter, resume_url, skills, status, applied_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())
       RETURNING *`,
      [
        job_id,
        position,
        experience,
        location,
        cover_letter,
        resume_url,
        skills.length ? JSON.stringify(skills) : null
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
