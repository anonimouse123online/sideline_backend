// backend/routes/applicants.js
import express from 'express';
import pool from '../../db.js';
import dotenv from 'dotenv';

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

    // Async: fetch user and job info for email
    const [applicantRes, jobRes] = await Promise.all([
      pool.query(`SELECT first_name, last_name, email FROM users WHERE id=$1`, [user_id]),
      pool.query(`SELECT title, description, contact_email FROM jobs WHERE id=$1`, [job_id])
    ]);

    const applicant = applicantRes.rows[0];
    const job = jobRes.rows[0];

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
            sender: { name: "Sideline Jobs", email: "paulkurtperocillo@gmail.com" },
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

// GET all applications for a user
router.get('/user/:id/applications', async (req, res) => {
  const userId = req.params.id;
  try {
    const result = await pool.query(
      `SELECT a.id AS application_id, a.job_id, a.status, a.position, a.applied_at,
              j.title AS job_title, j.description AS job_description, j.contact_email
       FROM applicants a
       LEFT JOIN jobs j ON a.job_id = j.id
       WHERE a.user_id = $1
       ORDER BY a.applied_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching applications:", err);
    res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

// GET all applicants for a specific job
router.get('/jobs/:jobId/applicants', async (req, res) => {
  const jobId = req.params.jobId;
  try {
    const result = await pool.query(
      `SELECT a.id AS id, a.user_id, a.status, a.position, a.applied_at,
              u.first_name, u.last_name, u.email, u.phone,
              a.cover_letter, a.skills, a.location, a.experience, a.resume_url
       FROM applicants a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.job_id = $1
       ORDER BY a.applied_at DESC`,
      [jobId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching applicants:", err);
    res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

// Update application status
router.put('/:id', async (req, res) => {
  const applicationId = req.params.id;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: "Missing 'status' in request body" });
  }

  try {
    const result = await pool.query(
      `UPDATE applicants
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, applicationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json({ message: 'Status updated', application: result.rows[0] });
  } catch (err) {
    console.error("❌ Error updating application status:", err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});
// PUT /api/applicants/:id/sent-email
// PUT /api/applicants/:userId/sent-email
router.put('/:userId/sent-email', async (req, res) => {
  const userId = parseInt(req.params.userId);
  const { sent_email } = req.body;

  if (typeof sent_email !== "boolean") {
    return res.status(400).json({ error: "sent_email must be true or false" });
  }

  try {
    // Determine new status
    const newStatus = sent_email ? "approved" : "pending";

    // 1️⃣ Check for existing verification
    const verificationRes = await pool.query(
      `SELECT * FROM account_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    let verification = verificationRes.rows[0];

    if (!verification) {
      // 2️⃣ Create if it doesn't exist
      const createRes = await pool.query(
        `INSERT INTO account_verifications (user_id, sent_email, status, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         RETURNING *`,
        [userId, sent_email, newStatus]
      );

      verification = createRes.rows[0];
      return res.status(201).json({
        success: true,
        message: "Verification record created",
        verification,
        isVerified: newStatus === "approved"
      });
    }

    // 3️⃣ Update existing verification
    const updateRes = await pool.query(
      `UPDATE account_verifications
       SET sent_email = $1, status = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [sent_email, newStatus, verification.id]
    );

    verification = updateRes.rows[0];

    // ✅ Respond with verification + immediate status for frontend
    res.json({
      success: true,
      message: `Email sent status updated to ${sent_email}`,
      verification,
      isVerified: newStatus === "approved"
    });

  } catch (err) {
    console.error("❌ Error updating sent_email:", err);
    res.status(500).json({ error: "Internal server error", details: err.message });
  }
});


export default router;
