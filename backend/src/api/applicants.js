import express from 'express';
import pool from '../../db.js';

const router = express.Router();

// -------------------- GET applicants for a specific job -------------------- //
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
       JOIN users u ON a.id = u.id  -- match applicants.id = users.id
       WHERE a.job_id = $1
       ORDER BY a.applied_at DESC`,
      [jobId]
    );

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

// -------------------- PUT /api/applicants/:applicantId -------------------- //
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

// -------------------- POST /api/applicants -------------------- //
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

    // Insert application without any user reference
    const result = await pool.query(
      `INSERT INTO applicants 
       (job_id, position, experience, location, cover_letter, resume_url, skills, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING *`,
      [
        job_id,
        position,
        experience,
        location,
        cover_letter,
        resume_url,
        JSON.stringify(skills)
      ]
    );

    res.status(201).json({ 
      message: 'Application submitted successfully',
      application: result.rows[0] 
    });
  } catch (error) {
    console.error('Error submitting application:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});


export default router;
