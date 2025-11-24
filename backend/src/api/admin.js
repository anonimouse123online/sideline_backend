// backend/routes/admin.js
import express from 'express';
import pool from '../../db.js';

const router = express.Router();

// -------------------- DASHBOARD STATS -------------------- //

router.get('/users/count', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM users');
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error("❌ Error fetching users count:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/jobs/count', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM jobs');
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error("❌ Error fetching jobs count:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/applicants/count', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM applicants');
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error("❌ Error fetching applicants count:", err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------- VERIFICATIONS -------------------- //

// GET all account verifications (admin view)
router.get('/verify-account', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.id, v.user_id, v.status, v.created_at, u.first_name, u.last_name, u.email
       FROM account_verifications v
       JOIN users u ON u.id = v.user_id
       ORDER BY v.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching verifications:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST to create/update verification status
router.post('/verify-account', async (req, res) => {
  const { user_id, status } = req.body;
  if (!user_id || !status) {
    return res.status(400).json({ error: "user_id and status are required" });
  }

  try {
    const update = await pool.query(
      `UPDATE account_verifications
       SET status = $1
       WHERE user_id = $2
       RETURNING *`,
      [status, user_id]
    );

    if (update.rows.length === 0) {
      const insert = await pool.query(
        `INSERT INTO account_verifications (user_id, status, created_at)
         VALUES ($1, $2, NOW())
         RETURNING *`,
        [user_id, status]
      );
      return res.status(201).json({ message: "Verification created", verification: insert.rows[0] });
    }

    res.status(200).json({ message: "Verification updated", verification: update.rows[0] });

  } catch (err) {
    console.error("❌ Error updating verification:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/verify-account/:id — update by verification id
router.put('/verify-account/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) return res.status(400).json({ error: "Status is required" });

  try {
    const result = await pool.query(
      `UPDATE account_verifications
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Verification not found" });
    }

    res.json({ message: `Verification ${status}`, verification: result.rows[0] });
  } catch (err) {
    console.error("❌ Error updating verification:", err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------- FULL LISTS FOR ADMIN -------------------- //

router.get('/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching users:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/jobs', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM jobs ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching jobs:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET all applicants (with verification info)
router.get('/applicants', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.id, a.job_id, a.user_id, a.position, a.status, a.applied_at,
              u.first_name, u.last_name, u.email,
              v.status AS verification_status
       FROM applicants a
       LEFT JOIN users u ON a.user_id = u.id
       LEFT JOIN account_verifications v ON v.user_id = a.user_id
       ORDER BY a.applied_at DESC`
    );

    const applicantsWithVerification = result.rows.map(a => ({
      ...a,
      verificationSent: !!a.verification_status
    }));

    res.json(applicantsWithVerification);
  } catch (err) {
    console.error("❌ Error fetching applicants:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
