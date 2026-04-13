require('dotenv').config();
const pool = require('./config/database');

async function run() {
  try {
    const sql = `
      INSERT INTO credentials (email, password, user_id, user_name, user_type)
      SELECT 
        Email,
        CONCAT(SUBSTRING_INDEX(Name, ' ', 1), '@2026'),
        Faculty_ID,
        Name,
        'faculty'
      FROM faculty
      WHERE Email IS NOT NULL AND Email <> ''
        AND Email LIKE 'arjun.%@engineeringcollege.edu'
      ON DUPLICATE KEY UPDATE
        password = VALUES(password),
        user_type = VALUES(user_type);
    `;

    const [result] = await pool.query(sql);
    console.log('Updated/inserted rows:', result.affectedRows);

    const [rows] = await pool.query(
      "SELECT email, password, user_type FROM credentials WHERE email LIKE 'arjun.%@engineeringcollege.edu' LIMIT 20"
    );
    console.log(rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

run();
