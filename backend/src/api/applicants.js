import express from 'express';
import pool from '../../db.js';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

const otpStore = {};

dotenv.config();

const router = express.Router();

const BREVO_API_KEY = process.env.BREVO_API_KEY; 

const VALID_STATUSES = ['pending', 'reviewed', 'accepted', 'rejected'];

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


    res.status(201).json({
      message: 'Application submitted successfully',
      application
    });


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
    
    <p><strong>Name:</strong> ${applicant?.first_name || ''} ${applicant?.last_name || ''}</p>
    <p><strong>Email:</strong> ${applicant?.email || 'N/A'}</p>
    <p><strong>Skills:</strong> ${skills ? skills.join(', ') : 'N/A'}</p>

    <p style="margin-top: 20px;">Please log into your Sideline account to manage this application.</p>
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


router.put('/:id', async (req, res) => {
    const applicationId = req.params.id;
    const { status } = req.body;

    if (!status) {
        return res.status(400).json({ error: "Missing 'status' in request body" });
    }

    if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ 
            error: `Invalid status value: '${status}'. Must be one of: ${VALID_STATUSES.join(', ')}` 
        });
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

router.put('/:userId/sent-email', async (req, res) => {
  const userId = req.params.userId;
  const { sent_email } = req.body;

  if (typeof sent_email !== "boolean") {
    return res.status(400).json({ error: "sent_email must be true or false" });
  }

  try {
    const newStatus = sent_email ? "accepted" : "pending";
    const applicantRes = await pool.query(
      `SELECT * FROM applicants WHERE user_id = $1 ORDER BY applied_at DESC LIMIT 1`,
      [userId]
    );

    if (applicantRes.rows.length === 0) {
      return res.status(404).json({ error: "Applicant not found" });
    }

    const applicant = applicantRes.rows[0];

    const updateRes = await pool.query(
  `UPDATE applicants
   SET email_sent = $1, status = $2
   WHERE id = $3
   RETURNING *`,
  [sent_email, newStatus, applicant.id]
);


    res.json({
      success: true,
      message: "Email status updated",
      applicant: updateRes.rows[0],
      isVerified: sent_email
    });

  } catch (err) {
    console.error("❌ Error updating sent_email:", err);
    res.status(500).json({ error: "Internal server error", details: err.message });
  }
});
router.post("/forgot-password/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    // Check if user exists
    const userRes = await pool.query("SELECT id, first_name FROM users WHERE email=$1", [email]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "Email not found" });

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 2 * 60 * 1000; // 2 minutes

    // Save OTP in memory
    otpStore[email] = { otp, expires };

    // Prepare email HTML
    const emailHTML = `
      <p>Hello ${userRes.rows[0].first_name || ""},</p>
      <p>Your OTP for password reset is:</p>
      <h2>${otp}</h2>
      <p>This OTP will expire in 2 minutes.</p>
    `;

    // Send via Brevo
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY
      },
      body: JSON.stringify({
        sender: { name: "Sideline Jobs", email: "paulkurtperocillo@gmail.com" },
        to: [{ email }],
        subject: "Your OTP for Password Reset",
        htmlContent: emailHTML
      })
    });

    const result = await response.json();
    console.log("📧 OTP sent via Brevo:", result);

    res.json({ message: "OTP sent successfully" });
  } catch (err) {
    console.error("❌ Error sending OTP:", err.message);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});
router.post("/forgot-password/verify-otp", async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword)
    return res.status(400).json({ error: "Email, OTP, and newPassword are required" });

  const record = otpStore[email];

  // Check if OTP exists and is valid
  if (!record || record.expires < Date.now())
    return res.status(400).json({ error: "OTP expired or invalid" });

  if (record.otp !== otp)
    return res.status(400).json({ error: "Incorrect OTP" });

  try {

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password=$1 WHERE email=$2", [hashedPassword, email]);


    delete otpStore[email];

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    console.error("❌ Error resetting password:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});


export default router;
