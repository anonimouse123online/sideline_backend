import express from 'express';
import pool from '../../db.js';
import nodemailer from 'nodemailer';

const router = express.Router();

// Configure Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'paulkurtperocillo@gmail.com', // your Gmail
    pass: 'wypmuzgtcxcymvfh',           // your App Password
  },
});

// POST /api/applicants - apply for a job
router.post('/', async (req, res) => {
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

  try {
    // Check if user already applied
    const existing = await pool.query(
      'SELECT id FROM applicants WHERE job_id=$1 AND user_id=$2',
      [job_id, user_id]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'You have already applied for this job' });
    }

    // Insert application
    const result = await pool.query(
      `INSERT INTO applicants 
       (job_id, user_id, experience, location, cover_letter, resume_url, skills, status, applied_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',NOW())
       RETURNING *`,
      [job_id, user_id, experience, location, cover_letter, resume_url, skills ? JSON.stringify(skills) : null]
    );

    const application = result.rows[0];

    // Fetch job and client info to send email
    const jobRes = await pool.query(
      `SELECT j.title, j.description, j.contact_email, u.first_name AS client_first_name, u.last_name AS client_last_name
       FROM jobs j
       JOIN users u ON j.contact_email = u.email
       WHERE j.id = $1`,
      [job_id]
    );

    if (jobRes.rows.length > 0) {
      const job = jobRes.rows[0];

      // Compose email
      const mailOptions = {
        from: '"Sideline Jobs" <paulkurtperocillo@gmail.com>',
        to: job.contact_email, // client email
        subject: `New Application for Your Job: ${job.title}`,
        html: `
          <p>Hi ${job.client_first_name},</p>
          <p>You have a new applicant for your job posting: <strong>${job.title}</strong>.</p>
          <p><strong>Applicant Details:</strong></p>
          <ul>
            <li>Experience: ${experience || 'N/A'}</li>
            <li>Location: ${location || 'N/A'}</li>
            <li>Cover Letter: ${cover_letter || 'N/A'}</li>
            <li>Resume: ${resume_url ? `<a href="${resume_url}">View Resume</a>` : 'N/A'}</li>
            <li>Skills: ${skills ? skills.join(', ') : 'N/A'}</li>
          </ul>
          <p>Please check your Sideline dashboard for more details.</p>
          <p>Best regards,<br/>Sideline Team</p>
        `
      };

      // Send email
      transporter.sendMail(mailOptions, (err, info) => {
        if (err) console.error('Error sending email:', err);
        else console.log('Email sent:', info.response);
      });
    }

    res.status(201).json({ message: 'Application submitted successfully', application });
  } catch (err) {
    console.error('Error submitting application:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET applicants for a job
router.get('/jobs/:jobId/applicants', async (req, res) => {
  const { jobId } = req.params;
  try {
    const result = await pool.query(
      `SELECT a.*, u.first_name, u.last_name, u.email, u.phone, u.profile_pic
       FROM applicants a
       JOIN users u ON a.user_id = u.id
       WHERE a.job_id = $1`,
      [jobId]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching applicants:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT update applicant status
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Missing status' });

  try {
    const result = await pool.query(
      `UPDATE applicants SET status=$1 WHERE id=$2 RETURNING *`,
      [status, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Applicant not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating applicant status:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET applied jobs for a user
router.get('/user/:id/applications', async (req, res) => {
  const userId = req.params.id;
  try {
    const result = await pool.query(
      `SELECT a.*, j.title, j.description
       FROM applicants a
       JOIN jobs j ON a.job_id = j.id
       WHERE a.user_id = $1`,
      [userId]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching user applications:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
