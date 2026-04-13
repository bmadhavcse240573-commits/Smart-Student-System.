const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const pool = require('../config/database');
const {
  authAnyRole,
  resolveStudentForRequest,
  resolveFacultyForRequest
} = require('../middleware/identity');

const router = express.Router();

const doubtReplyTemplates = [
  'Please share the exact question number and your current approach.',
  'Review the classroom notes for this topic and send where you are blocked.',
  'I have attached a reference file; go through it and follow up if needed.',
  'This will be covered in tomorrow\'s session; meanwhile revise prerequisite concepts.'
];

const doubtsUploadDir = path.join(__dirname, '../uploads/doubts');
try {
  if (!fs.existsSync(doubtsUploadDir)) fs.mkdirSync(doubtsUploadDir, { recursive: true });
} catch (_e) {}

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, doubtsUploadDir);
  },
  filename: function (_req, file, cb) {
    const original = file.originalname || 'attachment';
    const safeOriginal = original.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${Date.now()}-${safeOriginal}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (_req, file, cb) {
    if (!file || !file.mimetype || ALLOWED_MIME_TYPES.has(file.mimetype)) return cb(null, true);
    return cb(new Error('Unsupported attachment type'));
  }
});

function buildAttachmentUrl(req, file) {
  if (!file) return null;
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return `${baseUrl}/uploads/doubts/${file.filename}`;
}

function safeStatus(v) {
  const normalized = String(v || '').trim().toLowerCase();
  const allowed = new Set(['pending', 'in-review', 'replied', 'closed']);
  return allowed.has(normalized) ? normalized : null;
}

function safePriority(v) {
  const normalized = String(v || '').trim().toLowerCase();
  const allowed = new Set(['low', 'medium', 'high']);
  return allowed.has(normalized) ? normalized : 'medium';
}

function safeCategory(v) {
  const normalized = String(v || '').trim().toLowerCase();
  const allowed = new Set(['assignment', 'exam', 'concept', 'lab', 'project', 'other']);
  return allowed.has(normalized) ? normalized : 'concept';
}

function emitDoubtEvent(req, room, event, payload) {
  try {
    const io = req.app.get('io');
    if (io && room) io.to(room).emit(event, payload);
  } catch (_e) {}
}

function emitToParticipants(req, doubt) {
  emitDoubtEvent(req, `student:${doubt.student_id}`, 'doubt:updated', { doubtId: doubt.doubt_id });
  emitDoubtEvent(req, `faculty:${doubt.faculty_id}`, 'doubt:updated', { doubtId: doubt.doubt_id });
}

async function addDoubtMessage(connection, doubtId, senderId, senderType, messageText, attachmentUrl) {
  await connection.query(
    `INSERT INTO doubt_messages
      (doubt_id, sender_id, sender_type, message_text, attachment_url, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [doubtId, senderId, senderType, messageText || null, attachmentUrl || null]
  );
}

async function getDoubtById(connection, doubtId) {
  const [rows] = await connection.query(
    `SELECT doubt_id, student_id, faculty_id, subject, status, priority, category
     FROM doubts WHERE doubt_id = ? LIMIT 1`,
    [doubtId]
  );
  return rows.length ? rows[0] : null;
}

router.get('/templates', authAnyRole, (_req, res) => {
  return res.json({ success: true, templates: doubtReplyTemplates });
});

router.post('/student', authAnyRole, upload.single('attachment'), async (req, res) => {
  let connection;
  try {
    if (req.userType !== 'student') {
      return res.status(403).json({ success: false, message: 'Student access required' });
    }

    const facultyId = String(req.body?.facultyId || '').trim();
    const subject = String(req.body?.subject || '').trim();
    const doubtText = String(req.body?.doubtText || '').trim();
    const category = safeCategory(req.body?.category);
    const priority = safePriority(req.body?.priority);

    if (!facultyId || !subject || !doubtText) {
      return res.status(400).json({ success: false, message: 'facultyId, subject, and doubtText are required' });
    }

    connection = await pool.getConnection();
    const student = await resolveStudentForRequest(connection, req);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const [facultyRows] = await connection.query(
      'SELECT Faculty_ID, Name, Email FROM faculty WHERE Faculty_ID = ? LIMIT 1',
      [facultyId]
    );
    if (!facultyRows.length) {
      return res.status(404).json({ success: false, message: 'Selected faculty not found' });
    }

    const studentAttachmentUrl = buildAttachmentUrl(req, req.file);
    const [insertResult] = await connection.query(
      `INSERT INTO doubts
        (student_id, faculty_id, subject, doubt_text, student_attachment_url, category, priority, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [student.Student_ID, facultyId, subject, doubtText, studentAttachmentUrl, category, priority]
    );

    await addDoubtMessage(connection, insertResult.insertId, student.Student_ID, 'student', doubtText, studentAttachmentUrl);

    const facultyMessage =
      `New ${priority} priority doubt from ${student.Name} (${student.Student_ID}) | Subject: ${subject} | Category: ${category}` +
      (studentAttachmentUrl ? ' | Attachment included' : '');
    await connection.query(
      'INSERT INTO notifications (user_id, user_type, message, type, created_at) VALUES (?, ?, ?, ?, NOW())',
      [facultyId, 'faculty', facultyMessage, priority === 'high' ? 'warning' : 'info']
    );

    const studentAck = `Your doubt was sent to ${facultyRows[0].Name} (${facultyId}) for ${subject}.`;
    await connection.query(
      'INSERT INTO notifications (user_id, user_type, message, type, created_at) VALUES (?, ?, ?, ?, NOW())',
      [student.Student_ID, 'student', studentAck, 'info']
    );

    emitDoubtEvent(req, `faculty:${facultyId}`, 'doubt:new', { doubtId: insertResult.insertId, priority, category });

    return res.json({
      success: true,
      message: 'Doubt submitted successfully',
      doubt: {
        doubtId: insertResult.insertId,
        studentAttachmentUrl,
        category,
        priority,
        status: 'pending'
      }
    });
  } catch (err) {
    console.error('Error creating student doubt:', err);
    return res.status(500).json({ success: false, message: 'Error creating doubt: ' + err.message });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/student/my', authAnyRole, async (req, res) => {
  let connection;
  try {
    if (req.userType !== 'student') {
      return res.status(403).json({ success: false, message: 'Student access required' });
    }

    connection = await pool.getConnection();
    const student = await resolveStudentForRequest(connection, req);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    await connection.query(
      `UPDATE doubts
       SET seen_by_student_at = NOW()
       WHERE student_id = ? AND status IN ('replied', 'closed')`,
      [student.Student_ID]
    );

    const [rows] = await connection.query(
      `SELECT
         d.doubt_id,
         d.student_id,
         d.faculty_id,
         d.subject,
         d.doubt_text,
         d.student_attachment_url,
         d.faculty_reply,
         d.faculty_attachment_url,
         d.status,
         d.category,
         d.priority,
         d.created_at,
         d.replied_at,
         d.seen_by_faculty_at,
         d.seen_by_student_at,
         f.Name AS faculty_name,
         f.Email AS faculty_email
       FROM doubts d
       LEFT JOIN faculty f ON f.Faculty_ID COLLATE utf8mb4_unicode_ci = d.faculty_id
       WHERE d.student_id = ?
       ORDER BY d.created_at DESC`,
      [student.Student_ID]
    );

    return res.json({ success: true, doubts: rows || [] });
  } catch (err) {
    console.error('Error loading student doubts:', err);
    return res.status(500).json({ success: false, message: 'Error loading doubts: ' + err.message });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/faculty/inbox', authAnyRole, async (req, res) => {
  let connection;
  try {
    if (req.userType !== 'faculty') {
      return res.status(403).json({ success: false, message: 'Faculty access required' });
    }

    connection = await pool.getConnection();
    const faculty = await resolveFacultyForRequest(connection, req);
    if (!faculty) {
      return res.status(404).json({ success: false, message: 'Faculty not found' });
    }

    const status = safeStatus(req.query.status);
    const category = String(req.query.category || '').trim().toLowerCase();
    const priority = String(req.query.priority || '').trim().toLowerCase();
    const subject = String(req.query.subject || '').trim();
    const branch = String(req.query.branch || '').trim();
    const year = String(req.query.year || '').trim();
    const q = String(req.query.q || '').trim();

    const filters = ['d.faculty_id = ?'];
    const params = [faculty.Faculty_ID];

    if (status) {
      filters.push('LOWER(d.status) = ?');
      params.push(status);
    }
    if (category) {
      filters.push('LOWER(COALESCE(d.category, \"\")) = ?');
      params.push(category);
    }
    if (priority) {
      filters.push('LOWER(COALESCE(d.priority, \"\")) = ?');
      params.push(priority);
    }
    if (subject) {
      filters.push('LOWER(d.subject) LIKE ?');
      params.push(`%${subject.toLowerCase()}%`);
    }
    if (branch) {
      filters.push('LOWER(COALESCE(s.Branch, \"\")) LIKE ?');
      params.push(`%${branch.toLowerCase()}%`);
    }
    if (year) {
      filters.push('CAST(COALESCE(s.Year, \"\") AS CHAR) = ?');
      params.push(year);
    }
    if (q) {
      filters.push('(LOWER(COALESCE(s.Name, \"\")) LIKE ? OR LOWER(COALESCE(d.doubt_text, \"\")) LIKE ?)');
      params.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`);
    }

    await connection.query(
      `UPDATE doubts SET seen_by_faculty_at = NOW() WHERE faculty_id = ? AND status IN ('pending', 'in-review')`,
      [faculty.Faculty_ID]
    );

    const [rows] = await connection.query(
      `SELECT
         d.doubt_id,
         d.student_id,
         d.faculty_id,
         d.subject,
         d.doubt_text,
         d.student_attachment_url,
         d.faculty_reply,
         d.faculty_attachment_url,
         d.status,
         d.category,
         d.priority,
         d.created_at,
         d.replied_at,
         d.seen_by_faculty_at,
         d.seen_by_student_at,
         s.Name AS student_name,
         s.Email AS student_email,
         s.Branch AS student_branch,
         s.Year AS student_year
       FROM doubts d
       LEFT JOIN students s ON s.Student_ID COLLATE utf8mb4_unicode_ci = d.student_id
       WHERE ${filters.join(' AND ')}
       ORDER BY
         CASE WHEN d.status = 'pending' THEN 0 WHEN d.status = 'in-review' THEN 1 ELSE 2 END,
         CASE WHEN LOWER(COALESCE(d.priority,'')) = 'high' THEN 0 WHEN LOWER(COALESCE(d.priority,'')) = 'medium' THEN 1 ELSE 2 END,
         d.created_at DESC`,
      params
    );

    return res.json({ success: true, doubts: rows || [] });
  } catch (err) {
    console.error('Error loading faculty doubts inbox:', err);
    return res.status(500).json({ success: false, message: 'Error loading inbox: ' + err.message });
  } finally {
    if (connection) connection.release();
  }
});

router.patch('/:doubtId/status', authAnyRole, async (req, res) => {
  let connection;
  try {
    if (req.userType !== 'faculty') return res.status(403).json({ success: false, message: 'Faculty access required' });

    const doubtId = Number(req.params.doubtId);
    const status = safeStatus(req.body?.status);
    if (!Number.isFinite(doubtId) || doubtId <= 0 || !status) {
      return res.status(400).json({ success: false, message: 'Valid doubt id and status are required' });
    }

    connection = await pool.getConnection();
    const faculty = await resolveFacultyForRequest(connection, req);
    if (!faculty) return res.status(404).json({ success: false, message: 'Faculty not found' });

    const doubt = await getDoubtById(connection, doubtId);
    if (!doubt) return res.status(404).json({ success: false, message: 'Doubt not found' });
    if (String(doubt.faculty_id) !== String(faculty.Faculty_ID)) {
      return res.status(403).json({ success: false, message: 'Forbidden for this doubt' });
    }

    await connection.query(
      `UPDATE doubts
       SET status = ?, replied_at = CASE WHEN ? IN ('replied','closed') THEN NOW() ELSE replied_at END
       WHERE doubt_id = ?`,
      [status, status, doubtId]
    );

    if (status === 'closed') {
      await connection.query(
        'INSERT INTO notifications (user_id, user_type, message, type, created_at) VALUES (?, ?, ?, ?, NOW())',
        [doubt.student_id, 'student', `Your doubt on ${doubt.subject} was marked as closed.`, 'info']
      );
    }

    emitToParticipants(req, { ...doubt, doubt_id: doubtId });
    return res.json({ success: true, message: 'Status updated', status });
  } catch (err) {
    console.error('Error updating doubt status:', err);
    return res.status(500).json({ success: false, message: 'Error updating status: ' + err.message });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/:doubtId/messages', authAnyRole, upload.single('attachment'), async (req, res) => {
  let connection;
  try {
    const doubtId = Number(req.params.doubtId);
    const messageText = String(req.body?.messageText || '').trim();
    if (!Number.isFinite(doubtId) || doubtId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid doubt id' });
    }
    if (!messageText && !req.file) {
      return res.status(400).json({ success: false, message: 'Message text or attachment is required' });
    }

    connection = await pool.getConnection();
    const doubt = await getDoubtById(connection, doubtId);
    if (!doubt) return res.status(404).json({ success: false, message: 'Doubt not found' });

    let senderId = null;
    if (req.userType === 'student') {
      const student = await resolveStudentForRequest(connection, req);
      if (!student || String(student.Student_ID) !== String(doubt.student_id)) {
        return res.status(403).json({ success: false, message: 'Student cannot post on this doubt' });
      }
      senderId = student.Student_ID;
    } else if (req.userType === 'faculty') {
      const faculty = await resolveFacultyForRequest(connection, req);
      if (!faculty || String(faculty.Faculty_ID) !== String(doubt.faculty_id)) {
        return res.status(403).json({ success: false, message: 'Faculty cannot post on this doubt' });
      }
      senderId = faculty.Faculty_ID;
    } else {
      return res.status(403).json({ success: false, message: 'Unsupported role' });
    }

    const attachmentUrl = buildAttachmentUrl(req, req.file);
    await addDoubtMessage(connection, doubtId, senderId, req.userType, messageText, attachmentUrl);

    const nextStatus = req.userType === 'student' ? 'pending' : 'in-review';
    await connection.query('UPDATE doubts SET status = ? WHERE doubt_id = ?', [nextStatus, doubtId]);

    emitToParticipants(req, doubt);
    return res.json({ success: true, message: 'Thread message added', status: nextStatus, attachmentUrl });
  } catch (err) {
    console.error('Error adding thread message:', err);
    return res.status(500).json({ success: false, message: 'Error adding message: ' + err.message });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/:doubtId/messages', authAnyRole, async (req, res) => {
  let connection;
  try {
    const doubtId = Number(req.params.doubtId);
    if (!Number.isFinite(doubtId) || doubtId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid doubt id' });
    }

    connection = await pool.getConnection();
    const doubt = await getDoubtById(connection, doubtId);
    if (!doubt) return res.status(404).json({ success: false, message: 'Doubt not found' });

    if (req.userType === 'student') {
      const student = await resolveStudentForRequest(connection, req);
      if (!student || String(student.Student_ID) !== String(doubt.student_id)) {
        return res.status(403).json({ success: false, message: 'Student cannot access this thread' });
      }
    } else if (req.userType === 'faculty') {
      const faculty = await resolveFacultyForRequest(connection, req);
      if (!faculty || String(faculty.Faculty_ID) !== String(doubt.faculty_id)) {
        return res.status(403).json({ success: false, message: 'Faculty cannot access this thread' });
      }
    } else {
      return res.status(403).json({ success: false, message: 'Unsupported role' });
    }

    const [rows] = await connection.query(
      `SELECT message_id, doubt_id, sender_id, sender_type, message_text, attachment_url, created_at
       FROM doubt_messages
       WHERE doubt_id = ?
       ORDER BY created_at ASC`,
      [doubtId]
    );

    return res.json({ success: true, messages: rows || [] });
  } catch (err) {
    console.error('Error loading doubt thread:', err);
    return res.status(500).json({ success: false, message: 'Error loading thread: ' + err.message });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/:doubtId/seen', authAnyRole, async (req, res) => {
  let connection;
  try {
    const doubtId = Number(req.params.doubtId);
    if (!Number.isFinite(doubtId) || doubtId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid doubt id' });
    }

    connection = await pool.getConnection();
    const doubt = await getDoubtById(connection, doubtId);
    if (!doubt) return res.status(404).json({ success: false, message: 'Doubt not found' });

    if (req.userType === 'student') {
      const student = await resolveStudentForRequest(connection, req);
      if (!student || String(student.Student_ID) !== String(doubt.student_id)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      await connection.query('UPDATE doubts SET seen_by_student_at = NOW() WHERE doubt_id = ?', [doubtId]);
    } else if (req.userType === 'faculty') {
      const faculty = await resolveFacultyForRequest(connection, req);
      if (!faculty || String(faculty.Faculty_ID) !== String(doubt.faculty_id)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      await connection.query('UPDATE doubts SET seen_by_faculty_at = NOW() WHERE doubt_id = ?', [doubtId]);
    }

    return res.json({ success: true, message: 'Seen receipt updated' });
  } catch (err) {
    console.error('Error marking seen receipt:', err);
    return res.status(500).json({ success: false, message: 'Error marking seen: ' + err.message });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/faculty/:doubtId/reply', authAnyRole, upload.single('attachment'), async (req, res) => {
  let connection;
  try {
    if (req.userType !== 'faculty') {
      return res.status(403).json({ success: false, message: 'Faculty access required' });
    }

    const doubtId = Number(req.params.doubtId);
    const replyText = String(req.body?.replyText || '').trim();
    if (!Number.isFinite(doubtId) || doubtId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid doubt id' });
    }
    if (!replyText && !req.file) {
      return res.status(400).json({ success: false, message: 'Reply text or attachment is required' });
    }

    connection = await pool.getConnection();
    const faculty = await resolveFacultyForRequest(connection, req);
    if (!faculty) {
      return res.status(404).json({ success: false, message: 'Faculty not found' });
    }

    const doubt = await getDoubtById(connection, doubtId);
    if (!doubt) {
      return res.status(404).json({ success: false, message: 'Doubt not found' });
    }

    if (String(doubt.faculty_id) !== String(faculty.Faculty_ID)) {
      return res.status(403).json({ success: false, message: 'You can only reply to your assigned doubts' });
    }

    const facultyAttachmentUrl = buildAttachmentUrl(req, req.file);
    await connection.query(
      `UPDATE doubts
       SET faculty_reply = ?,
           faculty_attachment_url = ?,
           status = 'replied',
           replied_at = NOW(),
           seen_by_student_at = NULL
       WHERE doubt_id = ?`,
      [replyText || null, facultyAttachmentUrl, doubtId]
    );

    await addDoubtMessage(connection, doubtId, faculty.Faculty_ID, 'faculty', replyText, facultyAttachmentUrl);

    const studentMessage =
      `Your doubt on ${doubt.subject} was clarified by ${faculty.Name}.` +
      (facultyAttachmentUrl ? ' Faculty attached a file/image.' : '');
    await connection.query(
      'INSERT INTO notifications (user_id, user_type, message, type, created_at) VALUES (?, ?, ?, ?, NOW())',
      [doubt.student_id, 'student', studentMessage, 'info']
    );

    emitToParticipants(req, doubt);

    return res.json({
      success: true,
      message: 'Reply sent successfully',
      reply: {
        doubtId,
        facultyReply: replyText || null,
        facultyAttachmentUrl,
        status: 'replied'
      }
    });
  } catch (err) {
    console.error('Error replying to doubt:', err);
    return res.status(500).json({ success: false, message: 'Error sending reply: ' + err.message });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/faculty/analytics/summary', authAnyRole, async (req, res) => {
  let connection;
  try {
    if (req.userType !== 'faculty') return res.status(403).json({ success: false, message: 'Faculty access required' });

    connection = await pool.getConnection();
    const faculty = await resolveFacultyForRequest(connection, req);
    if (!faculty) return res.status(404).json({ success: false, message: 'Faculty not found' });

    const [summaryRows] = await connection.query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
         SUM(CASE WHEN status = 'in-review' THEN 1 ELSE 0 END) AS in_review_count,
         SUM(CASE WHEN status = 'replied' THEN 1 ELSE 0 END) AS replied_count,
         SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed_count,
         AVG(CASE WHEN replied_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, created_at, replied_at) END) AS avg_reply_mins
       FROM doubts
       WHERE faculty_id = ?`,
      [faculty.Faculty_ID]
    );

    const [subjectRows] = await connection.query(
      `SELECT subject, COUNT(*) AS count
       FROM doubts
       WHERE faculty_id = ?
       GROUP BY subject
       ORDER BY count DESC
       LIMIT 5`,
      [faculty.Faculty_ID]
    );

    const summary = summaryRows[0] || {};
    return res.json({
      success: true,
      summary: {
        total: Number(summary.total || 0),
        pending: Number(summary.pending_count || 0),
        inReview: Number(summary.in_review_count || 0),
        replied: Number(summary.replied_count || 0),
        closed: Number(summary.closed_count || 0),
        avgReplyMinutes: summary.avg_reply_mins == null ? null : Number(summary.avg_reply_mins)
      },
      topSubjects: subjectRows || []
    });
  } catch (err) {
    console.error('Error loading doubt analytics:', err);
    return res.status(500).json({ success: false, message: 'Error loading analytics: ' + err.message });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/faculty/analytics/export.csv', authAnyRole, async (req, res) => {
  let connection;
  try {
    if (req.userType !== 'faculty') return res.status(403).json({ success: false, message: 'Faculty access required' });

    connection = await pool.getConnection();
    const faculty = await resolveFacultyForRequest(connection, req);
    if (!faculty) return res.status(404).json({ success: false, message: 'Faculty not found' });

    const [rows] = await connection.query(
      `SELECT
         doubt_id,
         subject,
         COALESCE(category, 'concept') AS category,
         COALESCE(priority, 'medium') AS priority,
         status,
         student_id,
         DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(replied_at, '%Y-%m-%d %H:%i:%s') AS replied_at,
         CASE WHEN replied_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, created_at, replied_at) ELSE NULL END AS reply_minutes
       FROM doubts
       WHERE faculty_id = ?
       ORDER BY created_at DESC`,
      [faculty.Faculty_ID]
    );

    const header = ['doubt_id', 'subject', 'category', 'priority', 'status', 'student_id', 'created_at', 'replied_at', 'reply_minutes'];
    const lines = [header.join(',')];
    (rows || []).forEach((row) => {
      const vals = header.map((k) => {
        const raw = row[k] == null ? '' : String(row[k]);
        return `"${raw.replace(/"/g, '""')}"`;
      });
      lines.push(vals.join(','));
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="doubt-analytics-${faculty.Faculty_ID}.csv"`);
    return res.status(200).send(lines.join('\n'));
  } catch (err) {
    console.error('Error exporting doubt analytics csv:', err);
    return res.status(500).json({ success: false, message: 'Error exporting analytics CSV: ' + err.message });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/faculty/escalate-pending', authAnyRole, async (req, res) => {
  let connection;
  try {
    if (req.userType !== 'faculty') return res.status(403).json({ success: false, message: 'Faculty access required' });

    const thresholdHours = Math.max(1, Math.min(168, Number(req.body?.thresholdHours || 24)));

    connection = await pool.getConnection();
    const faculty = await resolveFacultyForRequest(connection, req);
    if (!faculty) return res.status(404).json({ success: false, message: 'Faculty not found' });

    const [rows] = await connection.query(
      `SELECT doubt_id, student_id, subject
       FROM doubts
       WHERE faculty_id = ?
         AND status IN ('pending', 'in-review')
         AND created_at <= DATE_SUB(NOW(), INTERVAL ? HOUR)
         AND escalated_at IS NULL`,
      [faculty.Faculty_ID, thresholdHours]
    );

    let escalated = 0;
    for (const row of rows || []) {
      await connection.query('UPDATE doubts SET escalated_at = NOW() WHERE doubt_id = ?', [row.doubt_id]);
      await connection.query(
        'INSERT INTO notifications (user_id, user_type, message, type, created_at) VALUES (?, ?, ?, ?, NOW())',
        [row.student_id, 'student', `Your doubt on ${row.subject} is escalated for faster follow-up.`, 'warning']
      );
      escalated += 1;
      emitDoubtEvent(req, `student:${row.student_id}`, 'doubt:escalated', { doubtId: row.doubt_id });
    }

    return res.json({ success: true, escalated, thresholdHours });
  } catch (err) {
    console.error('Error escalating pending doubts:', err);
    return res.status(500).json({ success: false, message: 'Error escalating doubts: ' + err.message });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
