const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');

console.log('DEBUG: DB_PASSWORD from env:', process.env.DB_PASSWORD);
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'engineering_college',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

// Test the connection (non-blocking)
let dbConnected = false;
pool.getConnection().then(async (connection) => {
  console.log('✅ MySQL Database connected successfully!');
  console.log(`📊 Database: ${process.env.DB_NAME || 'engineering_college'}`);
  console.log(`🖥️  Host: ${process.env.DB_HOST || 'localhost'}`);
  dbConnected = true;
  // Ensure credentials table exists for login
  try {
    await connection.query(`
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
    // Ensure assignments table exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        dueDate DATE,
        facultyId VARCHAR(50) NOT NULL,
        branch VARCHAR(100) NOT NULL,
        year INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure attendance table exists (period-wise tracking)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        Attendance_ID INT AUTO_INCREMENT PRIMARY KEY,
        Student_ID VARCHAR(20),
        Faculty_ID VARCHAR(20),
        Date DATE NOT NULL,
        Period TINYINT NOT NULL DEFAULT 1,
        Status ENUM('Present', 'Absent', 'Leave') NOT NULL,
        Subject VARCHAR(100),
        Timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (Student_ID) REFERENCES students(Student_ID),
        FOREIGN KEY (Faculty_ID) REFERENCES faculty(Faculty_ID)
      )
    `);

    // Add Period column if the table was created earlier without it
    try {
      await connection.query(`ALTER TABLE attendance ADD COLUMN Period TINYINT NOT NULL DEFAULT 1`);
    } catch (e) {
      // Column already exists or ALTER not permitted - safe to ignore
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        user_type VARCHAR(20) DEFAULT NULL,
        message TEXT,
        type VARCHAR(20) DEFAULT 'info',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_notifications_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Ensure assignment enrollment table exists (student "course" selection)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS assignment_enrollments (
        enrollment_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        assignment_id INT NOT NULL,
        Student_ID VARCHAR(20) NOT NULL,
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status ENUM('enrolled', 'completed') DEFAULT 'enrolled',
           UNIQUE KEY unique_enrollment (assignment_id, Student_ID),
        CONSTRAINT fk_enroll_assignment
          FOREIGN KEY (assignment_id)
          REFERENCES assignments(id)
          ON DELETE CASCADE
          ON UPDATE CASCADE,
           CONSTRAINT fk_enroll_student
             FOREIGN KEY (Student_ID)
             REFERENCES students(Student_ID)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS assignment_submissions (
        submission_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        assignment_id INT NOT NULL,
        Student_ID VARCHAR(20) NOT NULL,
        submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        file_path VARCHAR(500) NULL,
        submission_text TEXT NULL,
        marks_obtained DECIMAL(5, 2) NULL,
        feedback TEXT NULL,
        graded_by VARCHAR(20) NULL,
        graded_date TIMESTAMP NULL DEFAULT NULL,
        status ENUM('submitted', 'graded', 'late', 'resubmit') DEFAULT 'submitted',
        CONSTRAINT fk_submission_assignment
          FOREIGN KEY (assignment_id)
          REFERENCES assignments(id)
          ON DELETE CASCADE
          ON UPDATE CASCADE,
        CONSTRAINT fk_submission_student
          FOREIGN KEY (Student_ID)
          REFERENCES students(Student_ID)
          ON DELETE CASCADE
          ON UPDATE CASCADE,
        CONSTRAINT unique_submission UNIQUE (assignment_id, Student_ID),
        INDEX idx_assignment (assignment_id),
        INDEX idx_student (Student_ID)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS student_results (
        result_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        Student_ID VARCHAR(20) NOT NULL,
        subject_name VARCHAR(120) NOT NULL,
        marks_obtained DECIMAL(6,2) NOT NULL,
        max_marks DECIMAL(6,2) NOT NULL DEFAULT 100,
        exam_type VARCHAR(50) DEFAULT 'End Semester',
        semester INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_results_student (Student_ID)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS doubts (
        doubt_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        student_id VARCHAR(20) NOT NULL,
        faculty_id VARCHAR(20) NOT NULL,
        subject VARCHAR(150) NOT NULL,
        doubt_text TEXT NOT NULL,
        student_attachment_url VARCHAR(600) NULL,
        faculty_reply TEXT NULL,
        faculty_attachment_url VARCHAR(600) NULL,
        status ENUM('pending', 'replied') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        replied_at TIMESTAMP NULL DEFAULT NULL,
        INDEX idx_doubts_student (student_id),
        INDEX idx_doubts_faculty (faculty_id),
        INDEX idx_doubts_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const doubtAlterations = [
      `ALTER TABLE doubts MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending'`,
      `ALTER TABLE doubts ADD COLUMN category VARCHAR(40) NULL`,
      `ALTER TABLE doubts ADD COLUMN priority VARCHAR(20) NULL`,
      `ALTER TABLE doubts ADD COLUMN seen_by_faculty_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE doubts ADD COLUMN seen_by_student_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE doubts ADD COLUMN escalated_at TIMESTAMP NULL DEFAULT NULL`
    ];
    for (const sql of doubtAlterations) {
      try {
        await connection.query(sql);
      } catch (_e) {
        // Column/type already updated.
      }
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS doubt_messages (
        message_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        doubt_id INT UNSIGNED NOT NULL,
        sender_id VARCHAR(50) NOT NULL,
        sender_type VARCHAR(20) NOT NULL,
        message_text TEXT NULL,
        attachment_url VARCHAR(600) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_doubt_messages_doubt (doubt_id),
        INDEX idx_doubt_messages_sender (sender_id),
        CONSTRAINT fk_doubt_messages_doubt
          FOREIGN KEY (doubt_id)
          REFERENCES doubts(doubt_id)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS student_success_profiles (
        student_id VARCHAR(20) COLLATE utf8mb4_0900_ai_ci PRIMARY KEY,
        weekly_goal VARCHAR(255) NULL,
        streak INT NOT NULL DEFAULT 0,
        sessions_done INT NOT NULL DEFAULT 0,
        placement_json TEXT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS student_focus_sessions (
        session_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        student_id VARCHAR(20) COLLATE utf8mb4_0900_ai_ci NOT NULL,
        subject VARCHAR(120) NOT NULL,
        minutes INT NOT NULL,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_focus_student (student_id),
        INDEX idx_focus_completed (completed_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS student_success_extras (
        student_id VARCHAR(20) COLLATE utf8mb4_0900_ai_ci PRIMARY KEY,
        planner_exam VARCHAR(120) NULL,
        revision_topics VARCHAR(500) NULL,
        recovery_topic VARCHAR(120) NULL,
        recovery_days INT NOT NULL DEFAULT 2,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS peer_room_messages (
        message_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        room_id VARCHAR(80) NOT NULL,
        user_id VARCHAR(80) NOT NULL,
        user_type VARCHAR(20) NOT NULL,
        user_name VARCHAR(120) NOT NULL,
        message_text TEXT NOT NULL,
        system_flag TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_peer_room_messages_room_time (room_id, created_at),
        INDEX idx_peer_room_messages_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    const assignmentAlterations = [
      `ALTER TABLE assignments ADD COLUMN assignment_kind VARCHAR(32) DEFAULT 'assignment'`,
      `ALTER TABLE assignments ADD COLUMN admin_id VARCHAR(100) NULL`,
      `ALTER TABLE assignments ADD COLUMN cgpa_group VARCHAR(32) NULL`,
      `ALTER TABLE assignments ADD COLUMN workshop_name VARCHAR(255) NULL`
    ];
    for (const sql of assignmentAlterations) {
      try {
        await connection.query(sql);
      } catch (e) {
        // Column already exists
      }
    }
  } catch (e) {
    console.warn('Could not ensure credentials table:', e.message);
  }
  connection.release();
}).catch(err => {
  console.warn('⚠️  MySQL Database connection failed:');
  console.warn(`   Error: ${err.message}`);
  console.warn('   Continuing with limited functionality...');
  console.warn('   Event registrations will work, but student data endpoints will return errors.');
  console.warn('\n📌 To fix this, make sure:');
  console.warn('   1. MySQL is running');
  console.warn('   2. Database "engineering_college" exists');
  console.warn('   3. Import the SQL file:');
  console.warn('      mysql -u root engineering_college < Engineering_College_4000_Students.sql\n');
});

module.exports = pool;
