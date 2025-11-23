// backend/routes/applicants.js
import express from 'express';
import pool from '../../db.js';
import dotenv from 'dotenv';
import fetch from 'node-fetch'; // Make sure node-fetch is installed

dotenv.config();

const router = express.Router();

const BREVO_API_KEY = process.env.BREVO_API_KEY; // Your xkeysib-... API key

// POST /api/applicants
router.post('/', async (req, res) => {
  console.log("📩 Incoming Application:", req.body);

  const {
    job_id,
    user_id,
    experience = null,
    location = null,
    cover_letter = null,
    resume_url = null,
    skills = null,
    position
  } = req.body;

  // -------- VALIDATION --------
  const missingFields = [];
  if (!job_id) missingFields.push("job_id");
  if (!user_id) missingFields.push("user_id");
  if (!position) missingFields.push("position");

  if (missingFields.length > 0) {
    return res.status(400).json({
      error: `Missing required fields: ${missingFields.join(", ")}`,
      received_body: req.body
    });
  }

  try {
    // Check duplicate
    const existing = await pool.query(
      'SELECT id FROM applicants WHERE job_id=$1 AND user_id=$2',
      [job_id, user_id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        error: 'You have already applied for this job',
        applicant_id: existing.rows[0].id
      });
    }

    // Insert application
    const inserted = await pool.query(
      `INSERT INTO applicants 
       (job_id, user_id, experience, location, cover_letter, resume_url, skills, status, position, applied_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,NOW())
       RETURNING *`,
      [
        job_id,
        user_id,
        experience,
        location,
        cover_letter,
        resume_url,
        skills ? JSON.stringify(skills) : null,
        position
      ]
    );

    const application = inserted.rows[0];

    // Respond immediately to client
    res.status(201).json({
      message: 'Application submitted successfully',
      application
    });

    // -------- FETCH USER & JOB INFO --------
    const [applicantRes, jobRes] = await Promise.all([
      pool.query(`SELECT first_name, last_name, email FROM users WHERE id=$1`, [user_id]),
      pool.query(`SELECT title, description, contact_email FROM jobs WHERE id=$1`, [job_id])
    ]);

    const applicant = applicantRes.rows[0];
    const job = jobRes.rows[0];

    // -------- SEND EMAIL TO CLIENT VIA BREVO API ASYNC --------
    if (job?.contact_email) {
      const emailHTML = `
        <p>Hello,</p>
        <p>You received a new application for <strong>${job.title}</strong>.</p>
        <h3>Applicant Details:</h3>
        <ul>
          <li><strong>Name:</strong> ${applicant?.first_name || ''} ${applicant?.last_name || ''}</li>
          <li><strong>Email:</strong> ${applicant?.email || 'N/A'}</li>
          <li><strong>Experience:</strong> ${experience || 'N/A'}</li>
          <li><strong>Location:</strong> ${location || 'N/A'}</li>
          <li><strong>Cover Letter:</strong> ${cover_letter || 'N/A'}</li>
          <li><strong>Skills:</strong> ${skills ? skills.join(', ') : 'N/A'}</li>
          <li><strong>Resume:</strong> ${resume_url ? `<a href="${resume_url}">View Resume</a>` : 'N/A'}</li>
        </ul>
      `;

      try {
        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": BREVO_API_KEY
          },
          body: JSON.stringify({
            sender: { name: "Sideline Jobs", email: "no-reply@sideline.com" },
            to: [{ email: job.contact_email }],
            subject: `New Application: ${job.title}`,
            htmlContent: emailHTML
          })
        });

        const result = await response.json();
        console.log("📧 Email sent via Brevo API:", result);
      } catch (err) {
        console.error("❌ Brevo API email failed:", err.message);
      }
    } else {
      console.warn("⚠️ No contact_email found for job — skipping email.");
    }

  } catch (err) {
    console.error("❌ Unexpected error:", err);
    res.status(500).json({
      error: 'Internal server error',
      details: err.message
    });
  }
});

export default router;
