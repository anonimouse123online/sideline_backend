// routes/jobs.js
import express from 'express';
import pool from '../db.js'; // PostgreSQL pool

const router = express.Router();

// POST /api/jobs
router.post('/', async (req, res) => {
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

    // Validation
    if (!title || !description || !category || !jobType || !paymentType || !contact_email || !termsAccepted) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(
      `INSERT INTO jobs
      (title, description, category, skills, job_type, location, duration, start_date, payment_type, min_budget, max_budget, currency, contact_email, deadline, screening_questions, terms_accepted)
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
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
        termsAccepted
      ]
    );

    res.status(201).json({ job: result.rows[0] });
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
