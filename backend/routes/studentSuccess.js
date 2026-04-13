const express = require('express');
const pool = require('../config/database');
const { authAnyRole, resolveStudentForRequest } = require('../middleware/identity');

const router = express.Router();

function emitStudentSuccessUpdate(req, studentId, payload) {
  try {
    const io = req.app.get('io');
    if (!io) return;
    io.to(`student:${studentId}`).emit('student-success:updated', payload || { updated: true });
  } catch (_e) {}
}

function normalizePlacement(input) {
  if (!Array.isArray(input)) return [false, false, false, false];
  const cleaned = input.slice(0, 4).map((v) => !!v);
  while (cleaned.length < 4) cleaned.push(false);
  return cleaned;
}

async function resolveStudent(connection, req, res) {
  if (req.userType !== 'student') {
    res.status(403).json({ success: false, message: 'Student access required' });
    return null;
  }
  const student = await resolveStudentForRequest(connection, req);
  if (!student) {
    res.status(404).json({ success: false, message: 'Student profile not found' });
    return null;
  }
  return student;
}

router.get('/profile', authAnyRole, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const student = await resolveStudent(connection, req, res);
    if (!student) return;

    const [rows] = await connection.query(
      `SELECT weekly_goal, streak, sessions_done, placement_json, updated_at
       FROM student_success_profiles
       WHERE student_id = ?
       LIMIT 1`,
      [student.Student_ID]
    );

    const row = rows[0] || {};
    let placement = [false, false, false, false];
    try {
      placement = normalizePlacement(JSON.parse(String(row.placement_json || '[false,false,false,false]')));
    } catch (_e) {}

    return res.json({
      success: true,
      profile: {
        studentId: student.Student_ID,
        weeklyGoal: String(row.weekly_goal || ''),
        streak: Number(row.streak || 0),
        sessionsDone: Number(row.sessions_done || 0),
        placement,
        updatedAt: row.updated_at || null
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load profile' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/extras', authAnyRole, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const student = await resolveStudent(connection, req, res);
    if (!student) return;

    const [rows] = await connection.query(
      `SELECT planner_exam, revision_topics, recovery_topic, recovery_days, updated_at
       FROM student_success_extras
       WHERE student_id = ?
       LIMIT 1`,
      [student.Student_ID]
    );

    const row = rows[0] || {};
    return res.json({
      success: true,
      extras: {
        plannerExam: String(row.planner_exam || ''),
        revisionTopics: String(row.revision_topics || ''),
        recoveryTopic: String(row.recovery_topic || ''),
        recoveryDays: Number(row.recovery_days || 2),
        updatedAt: row.updated_at || null
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load extras' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/peer-rooms/status', authAnyRole, async (req, res) => {
  try {
    const role = String(req.userType || '').toLowerCase();
    if (role !== 'student' && role !== 'faculty') {
      return res.status(403).json({ success: false, message: 'Student or faculty access required' });
    }

    const store = req.app.get('peerRoomStore');
    const rooms = store && typeof store.status === 'function' ? store.status() : [];
    return res.json({ success: true, rooms });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load peer room status' });
  }
});

router.get('/peer-rooms/:roomId/messages', authAnyRole, async (req, res) => {
  try {
    const role = String(req.userType || '').toLowerCase();
    if (role !== 'student' && role !== 'faculty') {
      return res.status(403).json({ success: false, message: 'Student or faculty access required' });
    }

    const roomId = String(req.params.roomId || '').trim();
    const allowed = new Set(['dsa-problem-solving', 'physics-quick-doubts', 'math-weekly-practice', 'exam-sprint-group']);
    if (!allowed.has(roomId)) {
      return res.status(400).json({ success: false, message: 'Invalid room id' });
    }

    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 100)));

    const [rows] = await pool.query(
      `SELECT message_id, room_id, user_id, user_type, user_name, message_text, system_flag, created_at
       FROM peer_room_messages
       WHERE room_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [roomId, limit]
    );

    if (Array.isArray(rows) && rows.length) {
      const messages = rows.reverse().map((row) => ({
        id: String(row.message_id),
        roomId: String(row.room_id),
        userId: String(row.user_id),
        userType: String(row.user_type),
        userName: String(row.user_name),
        text: String(row.message_text || ''),
        createdAt: row.created_at,
        system: !!row.system_flag
      }));
      return res.json({ success: true, roomId, messages });
    }

    const store = req.app.get('peerRoomStore');
    const messages = store && typeof store.listMessages === 'function' ? store.listMessages(roomId, limit) : [];
    return res.json({ success: true, roomId, messages });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load room messages' });
  }
});

router.put('/extras', authAnyRole, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const student = await resolveStudent(connection, req, res);
    if (!student) return;

    const plannerExam = String(req.body.plannerExam || '').slice(0, 120);
    const revisionTopics = String(req.body.revisionTopics || '').slice(0, 500);
    const recoveryTopic = String(req.body.recoveryTopic || '').slice(0, 120);
    const recoveryDays = Math.max(1, Math.min(14, Number(req.body.recoveryDays || 2)));

    await connection.query(
      `INSERT INTO student_success_extras
        (student_id, planner_exam, revision_topics, recovery_topic, recovery_days, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
        planner_exam = VALUES(planner_exam),
        revision_topics = VALUES(revision_topics),
        recovery_topic = VALUES(recovery_topic),
        recovery_days = VALUES(recovery_days),
        updated_at = NOW()`,
      [student.Student_ID, plannerExam, revisionTopics, recoveryTopic, recoveryDays]
    );

    emitStudentSuccessUpdate(req, student.Student_ID, { type: 'extras' });

    return res.json({
      success: true,
      extras: { plannerExam, revisionTopics, recoveryTopic, recoveryDays }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to save extras' });
  } finally {
    if (connection) connection.release();
  }
});

router.put('/profile', authAnyRole, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const student = await resolveStudent(connection, req, res);
    if (!student) return;

    const weeklyGoal = String(req.body.weeklyGoal || '').slice(0, 255);
    const streak = Math.max(0, Number(req.body.streak || 0));
    const sessionsDone = Math.max(0, Number(req.body.sessionsDone || 0));
    const placement = normalizePlacement(req.body.placement);

    await connection.query(
      `INSERT INTO student_success_profiles
        (student_id, weekly_goal, streak, sessions_done, placement_json, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
        weekly_goal = VALUES(weekly_goal),
        streak = VALUES(streak),
        sessions_done = VALUES(sessions_done),
        placement_json = VALUES(placement_json),
        updated_at = NOW()`,
      [student.Student_ID, weeklyGoal, streak, sessionsDone, JSON.stringify(placement)]
    );

    emitStudentSuccessUpdate(req, student.Student_ID, { type: 'profile' });

    return res.json({
      success: true,
      profile: { weeklyGoal, streak, sessionsDone, placement }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to save profile' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/focus-sessions', authAnyRole, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const student = await resolveStudent(connection, req, res);
    if (!student) return;

    const limit = Math.max(1, Math.min(30, Number(req.query.limit || 10)));
    const [rows] = await connection.query(
      `SELECT session_id, subject, minutes, completed_at
       FROM student_focus_sessions
       WHERE student_id = ?
       ORDER BY completed_at DESC
       LIMIT ?`,
      [student.Student_ID, limit]
    );

    return res.json({
      success: true,
      sessions: rows.map((row) => ({
        id: row.session_id,
        subject: row.subject,
        minutes: Number(row.minutes || 0),
        at: row.completed_at
      }))
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load sessions' });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/focus-sessions', authAnyRole, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const student = await resolveStudent(connection, req, res);
    if (!student) return;

    const subject = String(req.body.subject || '').trim().slice(0, 120);
    const minutes = Math.max(1, Math.min(240, Number(req.body.minutes || 0)));
    const completedAt = req.body.completedAt ? new Date(req.body.completedAt) : new Date();

    if (!subject || !minutes) {
      return res.status(400).json({ success: false, message: 'subject and minutes are required' });
    }

    const at = Number.isNaN(completedAt.getTime()) ? new Date() : completedAt;

    const [result] = await connection.query(
      `INSERT INTO student_focus_sessions (student_id, subject, minutes, completed_at, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [student.Student_ID, subject, minutes, at]
    );

    emitStudentSuccessUpdate(req, student.Student_ID, { type: 'focus-session' });

    return res.status(201).json({
      success: true,
      session: {
        id: result.insertId,
        subject,
        minutes,
        at
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to save session' });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
