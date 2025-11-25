// backend/routes/admin.js
import express from 'express';
import pool from '../../db.js';

const router = express.Router();

// -------------------- DASHBOARD STATS -------------------- //
router.get('/users/count', async (req, res) => {
  console.log("🔹 GET /admin/users/count called");
  try {
    const result = await pool.query('SELECT COUNT(*) FROM users');
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error("❌ Error fetching users count:", err);
    res.status(500).json({ error: err.message });
  }
});
router.get('/verify-account/user/:userId', async (req, res) => {
  const { userId } = req.params;
  console.log(`🔹 GET /admin/verify-account/user/${userId} called`);
  try {
    const result = await pool.query(
      `SELECT * FROM account_verifications WHERE user_id = $1`,
      [userId]
    );
    if (result.rows.length === 0) return res.json({ verification: null });
    res.json({ verification: result.rows[0] });
  } catch (err) {
    console.error("❌ Error fetching user verification:", err);
    res.status(500).json({ error: err.message });
  }
});


router.get('/jobs/count', async (req, res) => {
  console.log("🔹 GET /admin/jobs/count called");
  try {
    const result = await pool.query('SELECT COUNT(*) FROM jobs');
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error("❌ Error fetching jobs count:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/applicants/count', async (req, res) => {
  console.log("🔹 GET /admin/applicants/count called");
  try {
    const result = await pool.query('SELECT COUNT(*) FROM applicants');
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error("❌ Error fetching applicants count:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/users', async (req, res) => {
  console.log("🔹 GET /admin/users called");
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching users:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/jobs', async (req, res) => {
  console.log("🔹 GET /admin/jobs called");
  try {
    const result = await pool.query('SELECT * FROM jobs ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching jobs:", err);
    res.status(500).json({ error: err.message });
  }
});


router.get('/applicants', async (req, res) => {
  console.log("🔹 GET /admin/applicants called");
  try {
    const result = await pool.query(`
      SELECT a.id, a.job_id, a.user_id, a.position, a.status, a.applied_at,
             u.first_name, u.last_name, u.email,
             v.status AS verification_status,
             v.sent_email
      FROM applicants a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN account_verifications v ON v.user_id = a.user_id
      ORDER BY a.applied_at DESC
    `);

    const applicants = result.rows.map(a => ({
      ...a,
      sent_email: !!a.sent_email,           
      verificationSent: !!a.verification_status
    }));

    res.json(applicants);
  } catch (err) {
    console.error("❌ Error fetching applicants:", err);
    res.status(500).json({ error: err.message });
  }
});


// PUT applicant status by ID
router.put('/applicants/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`🔹 PUT /admin/applicants/${id} called`);
  let { status } = req.body;

  if (!status) return res.status(400).json({ error: "Status is required" });

  status = status.trim().toLowerCase();
  const validStatuses = ["pending", "approved", "rejected"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(", ")}` });
  }

  try {
    const result = await pool.query(
      `UPDATE applicants
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: "Applicant not found" });

    res.json({ message: `Applicant status updated to ${status}`, applicant: result.rows[0] });
  } catch (err) {
    console.error("❌ Error updating applicant:", err);
    res.status(500).json({ error: err.message });
  }
});

// backend/routes/admin.js
// Update verification by account_verifications.id
router.put('/verify-account/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`🔹 PUT /admin/verify-account/${id} called`);
  const { status } = req.body;

  if (!status) return res.status(400).json({ error: "Status is required" });

  const normalizedStatus = status.trim().toLowerCase();
  const validStatuses = ["pending", "approved", "rejected"];
  if (!validStatuses.includes(normalizedStatus)) {
    return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(", ")}` });
  }

  try {
    const result = await pool.query(
      `UPDATE account_verifications
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [normalizedStatus, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Verification not found" });
    }

    res.json({ message: `Verification ${normalizedStatus}`, verification: result.rows[0] });
  } catch (err) {
    console.error("❌ Error updating verification:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


export default router;
