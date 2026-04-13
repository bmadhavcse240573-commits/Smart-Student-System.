require('dotenv').config();
const pool = require('./config/database');
const fs = require('fs');

async function importSQL(filePath) {
  try {
    const sql = fs.readFileSync(filePath, 'utf8');
    const statements = sql.split(';').filter(s => s.trim());

    for (const statement of statements) {
      if (statement.trim()) {
        await pool.query(statement);
      }
    }
    console.log('SQL imported successfully');
  } catch (error) {
    console.error('Error importing SQL:', error);
  } finally {
    process.exit(0);
  }
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node import_sql.js <path_to_sql_file>');
  process.exit(1);
}

importSQL(filePath);