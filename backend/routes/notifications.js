const express = require('express');
const Notification = require('../models/Notification');
const pool = require('../config/database');
const router = express.Router();

// Get notifications for a user
router.get('/user/:userId', async (req, res) => {
  try {
    const notifications = await Notification.getForUser(req.params.userId);
    if (!notifications || notifications.length === 0) {
      return res.json({ success: true, notifications: [] });
    }
    res.json({ success: true, notifications });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching notifications: ' + err.message });
  }
});

// Get notifications for a user type (student/faculty/admin)
router.get('/type/:userType', async (req, res) => {
  try {
    const notifications = await Notification.getForType(req.params.userType);
    res.json({ success: true, notifications });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching notifications: ' + err.message });
  }
});

// Create a notification
router.post('/create', async (req, res) => {
  try {
    const { userId, userType, message, type } = req.body;
    await Notification.create({ userId, userType, message, type });
    res.json({ success: true, message: 'Notification created.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error creating notification: ' + err.message });
  }
});

// Announce results to students (optionally filtered by branch/year)
router.post('/announce-results', async (req, res) => {
  let connection;
  try {
    const {
      message,
      branch,
      year,
      type
    } = req.body;

    const baseMessage = (message || '').trim();
    if (!baseMessage) {
      return res.status(400).json({ success: false, message: 'Announcement message is required' });
    }

    connection = await pool.getConnection();

    const filters = [];
    const params = [];
    if (branch && String(branch).trim() !== '' && String(branch).toLowerCase() !== 'all') {
      filters.push('Branch = ?');
      params.push(String(branch).trim());
    }
    if (year && String(year).trim() !== '' && String(year).toLowerCase() !== 'all') {
      filters.push('Year = ?');
      params.push(Number(year));
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [students] = await connection.query(
      `SELECT Student_ID FROM students ${whereClause}`,
      params
    );

    if (!students.length) {
      return res.status(404).json({ success: false, message: 'No students found for selected filters' });
    }

    const notificationType = type || 'info';
    for (const student of students) {
      await connection.query(
        'INSERT INTO notifications (user_id, user_type, message, type, created_at) VALUES (?, ?, ?, ?, NOW())',
        [student.Student_ID, 'student', baseMessage, notificationType]
      );
    }

    return res.json({
      success: true,
      message: `Results announcement sent to ${students.length} student(s)`
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error announcing results: ' + err.message });
  } finally {
    if (connection) connection.release();
  }
});

// Get recent results announcement history (grouped batches)
router.get('/announce-results/history', async (req, res) => {
  let connection;
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    connection = await pool.getConnection();

    const [rows] = await connection.query(
      `SELECT
         message,
         type,
         DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS announced_at,
         COUNT(*) AS recipients
       FROM notifications
       WHERE user_type = 'student'
         AND LOWER(message) LIKE '%result%'
       GROUP BY message, type, announced_at
       ORDER BY announced_at DESC
       LIMIT ?`,
      [limit]
    );

    return res.json({ success: true, announcements: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error fetching announcement history: ' + err.message });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
