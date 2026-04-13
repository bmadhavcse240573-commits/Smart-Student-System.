require('dotenv').config({ path: __dirname + '/.env' });
const pool = require('./config/database');

async function populateCredentials() {
  try {
    console.log('Populating credentials...');

    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS credentials (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        user_id VARCHAR(50) NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        user_type ENUM('student', 'faculty', 'admin') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert students
    await pool.query(`
      INSERT INTO credentials (email, password, user_id, user_name, user_type)
      SELECT 
        Email,
        CONCAT(SUBSTRING_INDEX(Name, ' ', 1), '@2026'),
        Student_ID,
        Name,
        'student'
      FROM students
      WHERE Email IS NOT NULL AND Email != ''
      ON DUPLICATE KEY UPDATE
        password = VALUES(password),
        user_id = VALUES(user_id),
        user_name = VALUES(user_name),
        user_type = VALUES(user_type)
    `);

    // Insert faculty
    await pool.query(`
      INSERT INTO credentials (email, password, user_id, user_name, user_type)
      SELECT 
        Email,
        CONCAT(SUBSTRING_INDEX(Name, ' ', 1), '@2026'),
        Faculty_ID,
        Name,
        'faculty'
      FROM faculty
      WHERE Email IS NOT NULL AND Email != ''
      ON DUPLICATE KEY UPDATE
        password = VALUES(password),
        user_id = VALUES(user_id),
        user_name = VALUES(user_name),
        user_type = VALUES(user_type)
    `);

    // Check count
    const [result] = await pool.query('SELECT COUNT(*) as count FROM credentials');
    console.log(`Credentials populated: ${result[0].count} records`);

    process.exit(0);
  } catch (error) {
    console.error('Error populating credentials:', error);
    process.exit(1);
  }
}

populateCredentials();