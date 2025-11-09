// db.js
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.DB_URL, // Use the DB_URL environment variable
    ssl: { rejectUnauthorized: false }    // Required for hosted Postgres (Render, ElephantSQL, etc.)
});

export default pool;
