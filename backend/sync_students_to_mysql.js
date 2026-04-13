// Script to sync students from backend/data/studentDatabase.json into MySQL students table
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function syncStudents() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'engineering_college',
    port: process.env.DB_PORT || 3306,
  });

  const studentsPath = path.join(__dirname, 'data', 'studentDatabase.json');
  const studentsData = JSON.parse(fs.readFileSync(studentsPath, 'utf8'));
  const students = studentsData.students;

  for (const s of students) {
    // Upsert student into MySQL
    await db.execute(
      `REPLACE INTO students (Student_ID, Name, Email, Branch, Year, CGPA, Attendance_Percentage, Placement_Status, Company, Phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        s.Student_ID,
        s.Name,
        s.Email,
        s.Branch,
        s.Year,
        s.CGPA,
        s.Attendance_Percentage,
        s.Placement_Status,
        s.Company,
        s.Phone
      ]
    );
    console.log(`Upserted student: ${s.Student_ID} - ${s.Name}`);
  }

  await db.end();
  console.log('All students synced to MySQL.');
}

syncStudents().catch(err => {
  console.error('Error syncing students:', err);
});
