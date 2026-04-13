const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const router = express.Router();

// Admin Authentication Middleware
const adminAuthMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    if (!decoded.isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    req.adminId = decoded.id;
    req.adminRole = decoded.role;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

// Proxy for all students (for frontend section management)
router.get('/all-students', adminAuthMiddleware, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [students] = await connection.query(
      'SELECT Student_ID, Name, Email FROM students'
    );
    connection.release();
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Proxy for all faculty (for frontend section management)
router.get('/all-faculty', adminAuthMiddleware, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [faculty] = await connection.query(
      'SELECT Faculty_ID, Name, Email FROM faculty'
    );
    connection.release();
    res.json(faculty);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Credentials list for admin dashboard
router.get('/credentials', adminAuthMiddleware, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [credentials] = await connection.query(
      'SELECT email, password, user_id, user_name, user_type FROM credentials ORDER BY user_type, user_name'
    );
    connection.release();
    res.json({
      success: true,
      count: credentials.length,
      credentials
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching credentials: ' + err.message });
  }
});

// Helper function to read mock database from JSON files
// ...existing code...

// Role-based middleware for Super Admin only
const superAdminMiddleware = (req, res, next) => {
  if (req.adminRole !== 'Super Admin') {
    return res.status(403).json({ success: false, message: 'Super Admin access required' });
  }
  next();
};

// Default Admin Credentials (hardcoded for simplicity)
const ADMIN_USERS = {
  'admin': { password: 'Admin@123', username: 'admin', role: 'Super Admin' },
  'admin2': { password: 'Madhav@05', username: 'admin2', role: 'Admin' }
};

// Email transporter (using Ethereal for testing)
const transporter = nodemailer.createTransport({
  host: 'smtp.ethereal.email',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.ETHEREAL_USER || 'your-ethereal-user@ethereal.email',
    pass: process.env.ETHEREAL_PASS || 'your-ethereal-password'
  }
});

// Helper function to log audit events
const logAuditEvent = async (adminId, action, details, ipAddress = null) => {
  try {
    await pool.query(`
      INSERT INTO audit_logs (admin_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `, [adminId, action, JSON.stringify(details), ipAddress || 'unknown']);
  } catch (err) {
    console.error('Audit logging failed:', err);
  }
};
// Helper function to send email
const sendCredentialsEmail = async (email, name, password, userType) => {
  try {
    const mailOptions = {
      from: '"Smart Student System" <noreply@smartstudent.edu>',
      to: email,
      subject: `🎓 Welcome to Smart Student System - Your ${userType.charAt(0).toUpperCase() + userType.slice(1)} Account`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Welcome to Smart Student System</title>
        </head>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">🎓 Smart Student System</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Welcome aboard!</p>
            </div>

            <!-- Content -->
            <div style="padding: 40px 30px;">
              <h2 style="color: #333; margin-bottom: 20px;">Hello ${name}!</h2>
              <p style="color: #666; line-height: 1.6; margin-bottom: 30px;">
                Your ${userType} account has been successfully created. You can now access the Smart Student System with your login credentials.
              </p>

              <!-- Credentials Box -->
              <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); border-radius: 8px; padding: 25px; margin: 30px 0; text-align: center;">
                <h3 style="color: white; margin: 0 0 15px 0; font-size: 18px;">Your Login Credentials</h3>
                <div style="background: rgba(255,255,255,0.2); border-radius: 6px; padding: 15px; margin-bottom: 10px;">
                  <p style="color: white; margin: 5px 0; font-weight: bold;">
                    <span style="display: inline-block; width: 80px; text-align: left;">Email:</span>
                    <code style="background: rgba(255,255,255,0.3); padding: 2px 6px; border-radius: 3px;">${email}</code>
                  </p>
                  <p style="color: white; margin: 5px 0; font-weight: bold;">
                    <span style="display: inline-block; width: 80px; text-align: left;">Password:</span>
                    <code style="background: rgba(255,255,255,0.3); padding: 2px 6px; border-radius: 3px;">${password}</code>
                  </p>
                  <p style="color: white; margin: 5px 0; font-weight: bold;">
                    <span style="display: inline-block; width: 80px; text-align: left;">Role:</span>
                    <span style="background: rgba(255,255,255,0.3); padding: 2px 6px; border-radius: 3px;">${userType.charAt(0).toUpperCase() + userType.slice(1)}</span>
                  </p>
                </div>
              </div>

              <!-- Instructions -->
              <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 30px 0;">
                <h4 style="color: #333; margin: 0 0 15px 0;">📋 Getting Started:</h4>
                <ol style="color: #666; margin: 0; padding-left: 20px;">
                  <li>Visit the login page: <a href="http://localhost:3000/login.html" style="color: #667eea;">http://localhost:3000/login.html</a></li>
                  <li>Use your email and password above to log in</li>
                  <li>Change your password immediately for security</li>
                  <li>Explore your dashboard and features</li>
                </ol>
              </div>

              <!-- Footer -->
              <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px; text-align: center;">
                <p style="color: #999; margin: 0; font-size: 14px;">
                  This is an automated message from Smart Student System.<br>
                  If you have any questions, please contact your administrator.
                </p>
                <p style="color: #999; margin: 10px 0 0 0; font-size: 12px;">
                  © 2026 Smart Student System. All rights reserved.
                </p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${email}: ${info.messageId}`);
    console.log(`📧 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    throw new Error('Failed to send welcome email');
  }
};

// Admin Login Endpoint (hardcoded users + credentials table)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    // 1. Try hardcoded admin users first
    const admin = ADMIN_USERS[username];
    if (admin && admin.password === password) {
      const token = jwt.sign(
        { id: username, isAdmin: true, role: admin.role },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: '24h' }
      );
      return res.json({
        success: true,
        message: 'Admin login successful',
        token,
        admin: { username: admin.username, role: admin.role }
      });
    }

    // 2. Try credentials table (email or user_id as username)
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(
        'SELECT * FROM credentials WHERE user_type = "admin" AND password = ? AND (email = ? OR user_id = ?)',
        [password, username, username]
      );
      connection.release();

      if (rows && rows.length > 0) {
        const cred = rows[0];
        const token = jwt.sign(
          { id: cred.user_id, isAdmin: true, role: cred.role || 'Admin' },
          process.env.JWT_SECRET || 'secret',
          { expiresIn: '24h' }
        );
        return res.json({
          success: true,
          message: 'Admin login successful',
          token,
          admin: { username: cred.email || cred.user_id, role: cred.role || 'Admin' }
        });
      }
    } catch (dbErr) {
      if (connection) connection.release();
      // If table doesn't exist, fall through to invalid credentials
      if (!dbErr.message || !dbErr.message.includes("doesn't exist")) {
        console.error('Admin login DB check:', dbErr.message);
      }
    }

    return res.status(401).json({ success: false, message: 'Invalid username or password' });
  } catch (err) {
    console.error('Admin login error:', err.message);
    res.status(500).json({ success: false, message: 'Login error: ' + err.message });
  }
});

// Get All Students (Protected)
router.get('/students/all', adminAuthMiddleware, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [students] = await connection.query(
      'SELECT Student_ID, Name, Father_Name, Branch, Year, Email, Phone, CGPA, Attendance_Percentage, Backlogs, Placement_Status FROM students'
    );
    connection.release();

    res.json({
      success: true,
      count: students.length,
      students: students
    });
  } catch (err) {
    console.log('⚠️ MySQL not available, using mock student database');
    const mockStudents = readMockDatabase('student');
    
    if (mockStudents.length > 0) {
      return res.json({
        success: true,
        count: mockStudents.length,
        mode: 'demo',
        message: 'Using demo data (MySQL unavailable)',
        students: mockStudents
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error fetching students: ' + err.message,
      hint: 'Make sure MySQL is running and database is imported'
    });
  }
});

// Get All Faculty (Protected) - same list as All Credentials (from credentials table)
router.get('/faculty/all', adminAuthMiddleware, async (req, res) => {
  try {
    let connection;
    try {
      connection = await pool.getConnection();
      // 1) Get all faculty from credentials (same source as All Credentials) - no JOIN so it never fails
      const [credRows] = await connection.query(
        'SELECT user_id, user_name, email FROM credentials WHERE user_type = ? ORDER BY user_id',
        ['faculty']
      );
      if (credRows && credRows.length > 0) {
        const ids = credRows.map(r => r.user_id || r.user_id);
        // 2) Optionally enrich from faculty table (Branch, Designation, etc.)
        let extraMap = {};
        try {
          const placeholders = ids.map(() => '?').join(',');
          const [facRows] = await connection.query(
            `SELECT Faculty_ID, Branch, Designation, Phone, Experience_Years, Date_of_Joining FROM faculty WHERE Faculty_ID IN (${placeholders})`,
            ids
          );
          if (facRows && facRows.length > 0) {
            facRows.forEach(f => {
              const id = f.Faculty_ID || f.faculty_id;
              if (id) extraMap[id] = f;
            });
          }
        } catch (e) {
          // faculty table may not exist
        }
        connection.release();
        const faculty = credRows.map(r => {
          const id = r.user_id ?? r.user_id;
          const extra = extraMap[id] || {};
          return {
            Faculty_ID: String(id ?? ''),
            Name: String(r.user_name ?? r.user_name ?? ''),
            Email: String(r.email ?? r.email ?? ''),
            Branch: extra.Branch ?? extra.branch ?? null,
            Designation: extra.Designation ?? extra.designation ?? null,
            Phone: extra.Phone ?? extra.phone ?? null,
            Experience_Years: extra.Experience_Years ?? extra.experience_years ?? null,
            Date_of_Joining: extra.Date_of_Joining ?? extra.date_of_joining ?? null,
            Qualification: extra.Qualification ?? extra.qualification ?? null
          };
        });
        return res.json({ success: true, count: faculty.length, faculty });
      }
      // No faculty in credentials: try faculty table directly
      try {
        const [facRows] = await connection.query('SELECT * FROM faculty ORDER BY Faculty_ID');
        if (facRows && facRows.length > 0) {
          const faculty = facRows.map(f => ({
            Faculty_ID: f.Faculty_ID ?? f.faculty_id ?? '',
            Name: f.Name ?? f.name ?? '',
            Email: f.Email ?? f.email ?? '',
            Branch: f.Branch ?? f.branch ?? null,
            Designation: f.Designation ?? f.designation ?? null,
            Phone: f.Phone ?? f.phone ?? null,
            Experience_Years: f.Experience_Years ?? f.experience_years ?? null,
            Date_of_Joining: f.Date_of_Joining ?? f.date_of_joining ?? null,
            Qualification: f.Qualification ?? f.qualification ?? null
          }));
          connection.release();
          return res.json({ success: true, count: faculty.length, faculty });
        }
      } catch (e) {
        // faculty table may not exist
      }
      connection.release();
    } catch (dbErr) {
      if (connection) connection.release();
      console.error('Faculty/all error:', dbErr.message);
    }
    // Fallback: facultyDatabase.json
    const filePath = path.join(__dirname, '../data/facultyDatabase.json');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return res.json({ success: true, count: data.faculty.length, faculty: data.faculty });
    }
    res.json({ success: true, count: 0, faculty: [] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching faculty: ' + err.message });
  }
});

// Get Student Details by ID (Protected)
router.get('/student/:studentId', adminAuthMiddleware, async (req, res) => {
  try {
    const { studentId } = req.params;
    const connection = await pool.getConnection();
    const [students] = await connection.query(
      'SELECT * FROM students WHERE Student_ID = ?',
      [studentId]
    );
    connection.release();

    if (students.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    res.json({
      success: true,
      student: students[0]
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error: ' + err.message });
  }
});

// Get Faculty Details by ID (Protected)
router.get('/faculty/:facultyId', adminAuthMiddleware, async (req, res) => {
  try {
    const { facultyId } = req.params;
    const connection = await pool.getConnection();
    const [faculty] = await connection.query(
      'SELECT * FROM faculty WHERE Faculty_ID = ?',
      [facultyId]
    );
    connection.release();

    if (faculty.length === 0) {
      return res.status(404).json({ success: false, message: 'Faculty not found' });
    }

    res.json({
      success: true,
      faculty: faculty[0]
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error: ' + err.message });
  }
});

// Get Dashboard Statistics (Protected)
router.get('/dashboard/stats', adminAuthMiddleware, async (req, res) => {
  try {
    const connection = await pool.getConnection();

    // Get student statistics
    const [studentStats] = await connection.query(`
      SELECT 
        COUNT(*) as total_students,
        AVG(CGPA) as avg_cgpa,
        AVG(Attendance_Percentage) as avg_attendance,
        SUM(CASE WHEN Placement_Status = 'Placed' THEN 1 ELSE 0 END) as placed_count,
        SUM(CASE WHEN Placement_Status = 'Not Placed' THEN 1 ELSE 0 END) as not_placed_count
      FROM students
    `);

    // Get faculty statistics
    const [facultyStats] = await connection.query(`
      SELECT 
        COUNT(*) as total_faculty,
        AVG(Experience_Years) as avg_experience
      FROM faculty
    `);

    // Get branch-wise student distribution
    const [branchStats] = await connection.query(`
      SELECT 
        Branch,
        COUNT(*) as count
      FROM students
      GROUP BY Branch
    `);

    connection.release();

    res.json({
      success: true,
      students: studentStats[0],
      faculty: facultyStats[0],
      branches: branchStats
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error: ' + err.message });
  }
});

// Get Students by Branch (Protected)
router.get('/branch/:branchName', adminAuthMiddleware, async (req, res) => {
  try {
    const { branchName } = req.params;
    const connection = await pool.getConnection();
    const [students] = await connection.query(
      'SELECT Student_ID, Name, CGPA, Attendance_Percentage, Placement_Status FROM students WHERE Branch = ? LIMIT 500',
      [branchName]
    );
    connection.release();

    res.json({
      success: true,
      branch: branchName,
      count: students.length,
      students: students
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error: ' + err.message });
  }
});

// Search Students (Protected)
router.get('/search/student', adminAuthMiddleware, async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.length < 2) {
      return res.status(400).json({ success: false, message: 'Query too short' });
    }

    const connection = await pool.getConnection();
    const [students] = await connection.query(
      'SELECT * FROM students WHERE Name LIKE ? OR Student_ID LIKE ? OR Email LIKE ? LIMIT 50',
      [`%${query}%`, `%${query}%`, `%${query}%`]
    );
    connection.release();

    res.json({
      success: true,
      count: students.length,
      students: students
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error: ' + err.message });
  }
});

// Get Admin Credentials List (Protected - Super Admin only)
router.get('/credentials/list', adminAuthMiddleware, (req, res) => {
  try {
    // Only Super Admin can view credentials
    if (req.query.role !== 'list-all') {
      const credentials = Object.entries(ADMIN_USERS).map(([username, data]) => ({
        username: data.username,
        password: data.password,
        role: data.role
      }));

      return res.json({
        success: true,
        admins: credentials
      });
    }

    res.status(403).json({ success: false, message: 'Unauthorized' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error: ' + err.message });
  }
});

// Add New Student (Protected - Super Admin only)
router.post('/add-student', adminAuthMiddleware, superAdminMiddleware, async (req, res) => {
  try {
    const {
      name,
      fatherName,
      branch,
      year,
      email,
      phone,
      cgpa,
      attendance,
      backlogs,
      placementStatus
    } = req.body;

    // Validation
    if (!name || !email || !branch) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and branch are required fields'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Check if email already exists
    const [existingStudent] = await pool.query(
      'SELECT Student_ID FROM students WHERE Email = ?',
      [email]
    );

    if (existingStudent.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A student with this email already exists'
      });
    }

    // Generate Student ID
    const [countResult] = await pool.query('SELECT COUNT(*) as count FROM students');
    const studentId = `STU${String(countResult[0].count + 1).padStart(4, '0')}`;

    // Insert student with transaction
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(`
        INSERT INTO students (
          Student_ID, Name, Father_Name, Branch, Year, Email, Phone,
          CGPA, Attendance_Percentage, Backlogs, Placement_Status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        studentId, name, fatherName || '', branch, year || '1st Year', email,
        phone || '', cgpa || 0, attendance || 0, backlogs || 0, placementStatus || 'Not Placed'
      ]);

      // Generate password and create credentials
      const password = `${name.split(' ')[0]}@2026`;
      await connection.query(`
        INSERT INTO credentials (email, password, user_id, user_name, user_type)
        VALUES (?, ?, ?, ?, 'student')
        ON DUPLICATE KEY UPDATE password = VALUES(password)
      `, [email, password, studentId, name]);

      await connection.commit();

      // Send email (outside transaction to avoid rollback on email failure)
      try {
        await sendCredentialsEmail(email, name, password, 'student');
      } catch (emailError) {
        console.error('Email sending failed, but student was created:', emailError);
        // Don't fail the request, just log it
      }

      // Log audit event
      await logAuditEvent(req.adminId, 'ADD_STUDENT', {
        studentId,
        name,
        email,
        branch
      }, req.ip);

      res.json({
        success: true,
        message: 'Student added successfully',
        studentId,
        password,
        note: 'Welcome email sent to student'
      });

    } catch (dbError) {
      await connection.rollback();
      throw dbError;
    } finally {
      connection.release();
    }

  } catch (err) {
    console.error('Add student error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to add student. Please try again.',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Add New Faculty (Protected - Super Admin only)
router.post('/add-faculty', adminAuthMiddleware, superAdminMiddleware, async (req, res) => {
  try {
    const {
      name,
      branch,
      designation,
      qualification,
      specialization,
      experience,
      email,
      phone,
      gender,
      joiningDate
    } = req.body;

    // Validation
    if (!name || !email || !branch) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and branch are required fields'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Check if email already exists
    const [existingFaculty] = await pool.query(
      'SELECT Faculty_ID FROM faculty WHERE Email = ?',
      [email]
    );

    if (existingFaculty.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A faculty member with this email already exists'
      });
    }

    // Generate Faculty ID
    const [countResult] = await pool.query('SELECT COUNT(*) as count FROM faculty');
    const facultyId = `FAC${String(countResult[0].count + 1).padStart(4, '0')}`;

    // Insert faculty with transaction
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(`
        INSERT INTO faculty (
          Faculty_ID, Name, Branch, Designation, Qualification, Specialization,
          Experience_Years, Email, Phone, Gender, Date_of_Joining
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        facultyId, name, branch, designation || 'Assistant Professor',
        qualification || '', specialization || '', experience || 0,
        email, phone || '', gender || 'Male', joiningDate || new Date().toISOString().split('T')[0]
      ]);

      // Generate password and create credentials
      const password = `${name.split(' ')[0]}@2026`;
      await connection.query(`
        INSERT INTO credentials (email, password, user_id, user_name, user_type)
        VALUES (?, ?, ?, ?, 'faculty')
        ON DUPLICATE KEY UPDATE password = VALUES(password)
      `, [email, password, facultyId, name]);

      await connection.commit();

      // Send email (outside transaction to avoid rollback on email failure)
      try {
        await sendCredentialsEmail(email, name, password, 'faculty');
      } catch (emailError) {
        console.error('Email sending failed, but faculty was created:', emailError);
        // Don't fail the request, just log it
      }

      // Log audit event
      await logAuditEvent(req.adminId, 'ADD_FACULTY', {
        facultyId,
        name,
        email,
        branch
      }, req.ip);

      res.json({
        success: true,
        message: 'Faculty added successfully',
        facultyId,
        password,
        note: 'Welcome email sent to faculty member'
      });

    } catch (dbError) {
      await connection.rollback();
      throw dbError;
    } finally {
      connection.release();
    }

  } catch (err) {
    console.error('Add faculty error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to add faculty. Please try again.',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Remove Student (Protected - Super Admin only)
router.delete('/remove-student/:studentId', adminAuthMiddleware, superAdminMiddleware, async (req, res) => {
  try {
    const { studentId } = req.params;

    // Validate student ID format
    if (!studentId || !studentId.startsWith('STU')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID format'
      });
    }

    // Check if student exists first
    const [existingStudent] = await pool.query(
      'SELECT Name, Email FROM students WHERE Student_ID = ?',
      [studentId]
    );

    if (existingStudent.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const studentInfo = existingStudent[0];

    // Remove with transaction
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Delete from credentials first (foreign key constraint)
      await connection.query(
        'DELETE FROM credentials WHERE user_id = ? AND user_type = ?',
        [studentId, 'student']
      );

      // Delete from students
      const [result] = await connection.query(
        'DELETE FROM students WHERE Student_ID = ?',
        [studentId]
      );

      await connection.commit();

      // Log audit event
      await logAuditEvent(req.adminId, 'REMOVE_STUDENT', {
        studentId,
        name: studentInfo.Name,
        email: studentInfo.Email
      }, req.ip);

      res.json({
        success: true,
        message: 'Student removed successfully',
        removedStudent: {
          id: studentId,
          name: studentInfo.Name,
          email: studentInfo.Email
        }
      });

    } catch (dbError) {
      await connection.rollback();
      throw dbError;
    } finally {
      connection.release();
    }

  } catch (err) {
    console.error('Remove student error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to remove student. Please try again.',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Remove Faculty (Protected - Super Admin only)
router.delete('/remove-faculty/:facultyId', adminAuthMiddleware, superAdminMiddleware, async (req, res) => {
  try {
    const { facultyId } = req.params;

    // Validate faculty ID format
    if (!facultyId || !facultyId.startsWith('FAC')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid faculty ID format'
      });
    }

    // Check if faculty exists first
    const [existingFaculty] = await pool.query(
      'SELECT Name, Email FROM faculty WHERE Faculty_ID = ?',
      [facultyId]
    );

    if (existingFaculty.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Faculty member not found'
      });
    }

    const facultyInfo = existingFaculty[0];

    // Remove with transaction
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Delete from credentials first (foreign key constraint)
      await connection.query(
        'DELETE FROM credentials WHERE user_id = ? AND user_type = ?',
        [facultyId, 'faculty']
      );

      // Delete from faculty
      const [result] = await connection.query(
        'DELETE FROM faculty WHERE Faculty_ID = ?',
        [facultyId]
      );

      await connection.commit();

      // Log audit event
      await logAuditEvent(req.adminId, 'REMOVE_FACULTY', {
        facultyId,
        name: facultyInfo.Name,
        email: facultyInfo.Email
      }, req.ip);

      res.json({
        success: true,
        message: 'Faculty member removed successfully',
        removedFaculty: {
          id: facultyId,
          name: facultyInfo.Name,
          email: facultyInfo.Email
        }
      });

    } catch (dbError) {
      await connection.rollback();
      throw dbError;
    } finally {
      connection.release();
    }

  } catch (err) {
    console.error('Remove faculty error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to remove faculty member. Please try again.',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

module.exports = router;
