import express from 'express';
import pool from '../../db.js';
import nodemailer from 'nodemailer';

const router = express.Router();

// Gmail transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'paulkurtperocillo@gmail.com',
    pass: 'wypmuzgtcxcymvfh',
  },
});

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
    skills = null
  } = req.body;

  // -------- VALIDATION --------
  const missingFields = [];
  if (!job_id) missingFields.push("job_id");
  if (!user_id) missingFields.push("user_id");

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

    // Try inserting
    let inserted;
    try {
      inserted = await pool.query(
        `INSERT INTO applicants 
         (job_id, user_id, experience, location, cover_letter, resume_url, skills, status, applied_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',NOW())
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
    } catch (sqlErr) {
      console.error("❌ SQL Insert Error:", sqlErr.message);

      return res.status(500).json({
        error: "Database insert failed",
        details: sqlErr.message,
        hint: "Check NOT NULL columns, or mismatched column names in applicants table"
      });
    }

    const application = inserted.rows[0];

    // -------- FETCH USER --------
    const applicantRes = await pool.query(
      `SELECT first_name, last_name, email 
       FROM users WHERE id=$1`,
      [user_id]
    );

    if (applicantRes.rows.length === 0) {
      console.warn("⚠️ Applicant not found in users table!");
    }

    const applicant = applicantRes.rows[0];

    // -------- FETCH JOB INFO --------
    const jobRes = await pool.query(
      `SELECT title, description, contact_email
       FROM jobs WHERE id=$1`,
      [job_id]
    );

    if (jobRes.rows.length === 0) {
      console.warn("⚠️ Job not found!");
    }

    const job = jobRes.rows[0];

    // -------- SEND EMAIL TO CLIENT --------
    if (job && job.contact_email) {
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

      const mailOptions = {
        from: '"Sideline Jobs" <paulkurtperocillo@gmail.com>',
        to: job.contact_email,
        subject: `New Application: ${job.title}`,
        html: emailHTML
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(`📧 Email sent to client: ${job.contact_email}`);
      } catch (emailErr) {
        console.error("❌ Email sending failed:", emailErr.message);
      }
    } else {
      console.warn("⚠️ No contact_email found for job — skipping email.");
    }

    res.status(201).json({
      message: 'Application submitted successfully',
      application
    });

  } catch (err) {
    console.error("❌ Unexpected error:", err);

    res.status(500).json({
      error: 'Internal server error',
      details: err.message
    });
  }
});

export default router;
