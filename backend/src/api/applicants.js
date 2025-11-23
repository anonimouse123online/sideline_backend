// src/api/applicants.js
import express from 'express';
import pool from '../../db.js';

const router = express.Router();

// GET applicants for a specific job
router.get('/jobs/:jobId/applicants', async (req, res) => {
  try {
    const { jobId } = req.params;

    const result = await pool.query(
      `SELECT 
        a.*,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        u.profile_pic
       FROM applicants a
       JOIN users u ON a.id = u.id  -- ✅ changed 
       WHERE a.job_id = $1
       ORDER BY a.applied_at DESC`,
      [jobId]
    );

    if (result.rows.length === 0) return res.status(200).json([]);

    const applicants = result.rows.map(applicant => ({
      id: applicant.id,
      name: `${applicant.first_name} ${applicant.last_name}`,
      email: applicant.email,
      phone: applicant.phone,
      profile_pic: applicant.profile_pic,
      position: applicant.position,
      experience: applicant.experience,
      location: applicant.location,
      cover_letter: applicant.cover_letter,
      resume_url: applicant.resume_url,
      status: applicant.status,
      applied_at: applicant.applied_at,
      skills: applicant.skills ? JSON.parse(applicant.skills) : []
    }));

    res.status(200).json(applicants);
  } catch (error) {
    console.error('Error fetching applicants:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/applicants/:applicantId - Update application status
router.put('/:applicantId', async (req, res) => {
  try {
    const { applicantId } = req.params;
    const { status } = req.body;

    if (!['pending', 'reviewed', 'accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await pool.query(
      `UPDATE applicants 
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, applicantId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Application not found' });

    res.status(200).json({ application: result.rows[0] });
  } catch (error) {
    console.error('Error updating application:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/applicants - Apply for a job
router.post('/', async (req, res) => {
  try {
    const {
      job_id,
      id, // ✅ changed from 
      position,
      experience,
      location,
      cover_letter,
      resume_url,
      skills
    } = req.body;

    if (!job_id || !id || !position || !cover_letter) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if user already applied
    const existingApplication = await pool.query(
      'SELECT id FROM applicants WHERE job_id = $1 AND id = $2',
      [job_id, id]
    );

    if (existingApplication.rows.length > 0) {
      return res.status(400).json({ error: 'You have already applied for this job' });
    }

    const result = await pool.query(
      `INSERT INTO applicants 
       (job_id, id, position, experience, location, cover_letter, resume_url, skills, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING *`,
      [
        job_id,
        id,
        position,
        experience || null,
        location || null,
        cover_letter,
        resume_url || null,
        JSON.stringify(skills || [])
      ]
    );

    res.status(201).json({ 
      message: 'Application submitted successfully',
      application: result.rows[0] 
    });
  } catch (error) {
    console.error('Error submitting application:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
