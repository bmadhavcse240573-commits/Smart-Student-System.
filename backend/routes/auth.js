const express = require('express');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password, userType } = req.body;
    const connection = await pool.getConnection();
    const [credentials] = await connection.query(
      'SELECT * FROM credentials WHERE email = ? AND user_type = ?',
      [email, userType]
    );
    if (credentials.length === 0) {
      connection.release();
      return res.status(400).json({ message: 'User not found' });
    }
    const credential = credentials[0];
    if (credential.password !== password) {
      connection.release();
      return res.status(400).json({ message: 'Invalid password' });
    }
    let userData = null;
    if (userType === 'student') {
      const [students] = await connection.query(
        'SELECT * FROM students WHERE Student_ID = ?',
        [credential.user_id]
      );
      if (students.length > 0) {
        const student = students[0];
        userData = {
          id: student.Student_ID,
          fullName: student.Name,
          email: student.Email,
          studentId: student.Student_ID,
          department: student.Branch,
          year: student.Year,
          cgpa: student.CGPA,
          attendance: student.Attendance_Percentage || 'N/A'
        };
      }
    } else if (userType === 'faculty') {
      const [faculty] = await connection.query(
        'SELECT * FROM faculty WHERE Faculty_ID = ?',
        [credential.user_id]
      );
      if (faculty.length > 0) {
        const fac = faculty[0];
        userData = {
          id: fac.Faculty_ID,
          fullName: fac.Name,
          email: fac.Email,
          facultyId: fac.Faculty_ID,
          subject: fac.Specialization || fac.Branch,
          qualification: fac.Qualification,
          designation: fac.Designation,
          experience: fac.Experience_Years,
          branch: fac.Branch
        };
      }
    } else if (userType === 'admin') {
      userData = {
        id: credential.user_id,
        fullName: credential.user_name,
        email: credential.email,
        adminId: credential.user_id,
        role: 'admin'
      };
    }
    connection.release();
    if (!userData) {
      return res.status(400).json({ message: 'User data not found' });
    }
    const token = jwt.sign(
      { id: userData.id, userType, user_type: userType },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: userData
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Error logging in: ' + err.message });
  }
});

module.exports = router;

// Password Update (after OTP verification)
router.post('/update-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'Email, OTP, and new password are required.' });
    }
    global._userOtps = global._userOtps || {};
    if (global._userOtps[email] !== otp) {
      return res.status(401).json({ success: false, message: 'Invalid OTP.' });
    }
    const connection = await pool.getConnection();
    const [credentials] = await connection.query(
      'SELECT * FROM credentials WHERE email = ?',
      [email]
    );
    if (credentials.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    // Update password
    await connection.query(
      'UPDATE credentials SET password = ? WHERE email = ?',
      [newPassword, email]
    );
    connection.release();
    // Clear OTP
    delete global._userOtps[email];
    return res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error('Update password error:', err);
    return res.status(500).json({ success: false, message: 'Error updating password.' });
  }
});

// Forgot Password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }
    const connection = await pool.getConnection();
    // Check credentials table for any user type
    const [credentials] = await connection.query(
      'SELECT * FROM credentials WHERE email = ?',
      [email]
    );
    connection.release();
    if (credentials.length === 0) {
      return res.status(404).json({ success: false, message: 'No user found with this email.' });
    }
    // Simulate sending email/OTP (integration can be added later)
    // For now, just respond success
    return res.json({ success: true, message: 'Password reset instructions sent to your email.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ success: false, message: 'Error processing request.' });
  }
});
