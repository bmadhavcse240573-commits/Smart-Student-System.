// Script to import and initialize sections, section_students, and section_faculty tables
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');


require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

async function importSections() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'engineering_college',
    port: process.env.DB_PORT || 3306
  });
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'create_sections.sql'), 'utf8');
    // Split by semicolon and run each statement separately
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await connection.query(stmt);
    }
    console.log('Sections and mapping tables created/verified.');
  } finally {
    await connection.end();
  }
}

importSections().catch(console.error);