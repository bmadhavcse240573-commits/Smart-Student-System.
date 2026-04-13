const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const router = express.Router();

// Login endpoint for students and faculty
router.post('/login', async (req, res) => {
  let connection;
  try {
    const { email, username, password } = req.body;

    if ((!email && !username) || !password) {
      return res.status(400).json({ success: false, message: 'Email/username and password required' });
    }

    connection = await pool.getConnection();
    let credentials;
    if (username) {
      // Admin login (email used as username in credentials)
      [credentials] = await connection.query(
        'SELECT * FROM credentials WHERE email = ? AND password = ? AND user_type = "admin"',
        [username, password]
      );
    } else {
      // Student/Faculty login
      [credentials] = await connection.query(
        'SELECT * FROM credentials WHERE email = ? AND password = ? AND user_type IN ("student", "faculty")',
        [email, password]
      );
    }

    if (!credentials || credentials.length === 0) {
      // Try JSON fallback for student/faculty
      const userType = req.body.userType;
      let user = null;
      if (userType === 'faculty') {
        const facultyPath = require('path').join(__dirname, '../data/facultyDatabase.json');
        if (require('fs').existsSync(facultyPath)) {
          const facultyData = JSON.parse(require('fs').readFileSync(facultyPath, 'utf8'));
          user = facultyData.faculty.find(f => f.Email === email && f.password === password);
        }
      } else if (userType === 'student') {
        const studentPath = require('path').join(__dirname, '../data/studentDatabase.json');
        if (require('fs').existsSync(studentPath)) {
          const studentData = JSON.parse(require('fs').readFileSync(studentPath, 'utf8'));
          user = studentData.students.find(s => s.Email === email && s.password === password);
        }
      }
      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }
      // Build full user object
      const token = jwt.sign(
        {
          id: user.Faculty_ID || user.Student_ID,
          email: user.Email,
          name: user.Name,
          userType: userType,
        },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: '24h' }
      );
      res.json({
        success: true,
        message: `Welcome ${user.Name}!`,
        token: token,
        user: {
          id: user.Faculty_ID || user.Student_ID,
          email: user.Email,
          name: user.Name,
          userType: userType,
          branch: user.Branch,
          year: user.Year,
          cgpa: user.CGPA,
          phone: user.Phone,
          placementStatus: user.Placement_Status,
          company: user.Company,
          designation: user.Designation,
          qualification: user.Qualification,
          experienceYears: user.Experience_Years,
          dateOfJoining: user.Date_of_Joining,
        }
      });
      return;
    }

    const cred = credentials[0];
    // Always merge full details from JSON if available
    let userDetails = {
      id: cred.user_id,
      email: cred.email,
      name: cred.user_name,
      userType: cred.user_type
    };
    if (cred.user_type === 'faculty') {
      const facultyPath = require('path').join(__dirname, '../data/facultyDatabase.json');
      if (require('fs').existsSync(facultyPath)) {
        const facultyData = JSON.parse(require('fs').readFileSync(facultyPath, 'utf8'));
        const user = facultyData.faculty.find(f => f.Email === cred.email);
        if (user) Object.assign(userDetails, {
          fullName: user.Name,
          facultyId: user.Faculty_ID,
          department: user.Branch,
          subject: user.Designation,
          qualification: user.Qualification,
          experienceYears: user.Experience_Years,
          dateOfJoining: user.Date_of_Joining,
          phone: user.Phone
        });
      }
    } else if (cred.user_type === 'student') {
      const studentPath = require('path').join(__dirname, '../data/studentDatabase.json');
      if (require('fs').existsSync(studentPath)) {
        const studentData = JSON.parse(require('fs').readFileSync(studentPath, 'utf8'));
        const user = studentData.students.find(s => s.Email === cred.email);
        if (user) Object.assign(userDetails, {
          fullName: user.Name,
          studentId: user.Student_ID,
          department: user.Branch,
          year: user.Year,
          cgpa: user.CGPA,
          phone: user.Phone,
          placementStatus: user.Placement_Status,
          company: user.Company
        });
      }
    }
    const token = jwt.sign(
      {
        id: cred.user_id,
        email: cred.email,
        name: cred.user_name,
        userType: cred.user_type
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    );
    res.json({
      success: true,
      message: `Welcome ${cred.user_name}!`,
      token: token,
      user: userDetails
    });
    console.log('DEBUG: Login response user object:', userDetails);
  } catch (err) {
    console.error('Login error:', err.message);
    const isTableMissing = err.message && (err.message.includes("doesn't exist") || err.code === 'ER_NO_SUCH_TABLE');
    const message = isTableMissing
      ? 'Credentials table not set up. Run from backend folder: node populate_credentials.js'
      : (err.message || 'Login failed');
    res.status(isTableMissing ? 503 : 500).json({ success: false, message });
  } finally {
    if (connection) connection.release();
  }
});

// Get all credentials (Admin only)
router.get('/all', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [credentials] = await connection.query(
      'SELECT email, password, user_id, user_name, user_type FROM credentials ORDER BY user_type, user_name'
    );
    connection.release();

    res.json({
      success: true,
      count: credentials.length,
      credentials: credentials
    });
  } catch (err) {
    console.error('Error fetching credentials:', err.message);
    res.status(500).json({ success: false, message: 'Error: ' + err.message });
  }
});

module.exports = router;
