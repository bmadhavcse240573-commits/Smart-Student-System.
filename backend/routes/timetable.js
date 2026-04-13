const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const router = express.Router();

let tableEnsured = false;

async function ensureTimetableTable(connection) {
  if (tableEnsured) return;
  await connection.query(`
    CREATE TABLE IF NOT EXISTS class_timetables (
      Timetable_ID INT AUTO_INCREMENT PRIMARY KEY,
      Section_ID INT NOT NULL,
      Day_of_Week VARCHAR(20) NOT NULL,
      Start_Time VARCHAR(10) NOT NULL,
      End_Time VARCHAR(10) NOT NULL,
      Subject_Name VARCHAR(150) NOT NULL,
      Faculty_Name VARCHAR(150) NULL,
      Room_No VARCHAR(50) NULL,
      Notes VARCHAR(255) NULL,
      Created_By VARCHAR(80) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_timetable_section_day (Section_ID, Day_of_Week)
    )
  `);
  tableEnsured = true;
}

function verifyToken(req) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'secret');
  } catch (_err) {
    return null;
  }
}

function adminOnly(req, res, next) {
  const decoded = verifyToken(req);
  if (!decoded) return res.status(401).json({ success: false, message: 'No or invalid token' });
  if (decoded.isAdmin !== true) return res.status(403).json({ success: false, message: 'Admin access required' });
  req.auth = decoded;
  return next();
}

function isValidTimeRange(startTime, endTime) {
  if (!startTime || !endTime) return false;
  return String(startTime) < String(endTime);
}

async function findTimetableOverlap(connection, payload, ignoreTimetableId = null) {
  const { sectionId, dayOfWeek, startTime, endTime } = payload;
  let query = `
    SELECT Timetable_ID, Subject_Name, Start_Time, End_Time
    FROM class_timetables
    WHERE Section_ID = ?
      AND Day_of_Week = ?
      AND Start_Time < ?
      AND End_Time > ?
  `;
  const params = [Number(sectionId), String(dayOfWeek).trim(), String(endTime).trim(), String(startTime).trim()];

  if (ignoreTimetableId) {
    query += ' AND Timetable_ID <> ?';
    params.push(Number(ignoreTimetableId));
  }

  const [rows] = await connection.query(query, params);
  return rows && rows.length ? rows[0] : null;
}

function sortRows(rows) {
  const dayOrder = {
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
    Sunday: 7
  };
  return [...rows].sort((a, b) => {
    const d = (dayOrder[a.Day_of_Week] || 99) - (dayOrder[b.Day_of_Week] || 99);
    if (d !== 0) return d;
    return String(a.Start_Time || '').localeCompare(String(b.Start_Time || ''));
  });
}

router.get('/sections', adminOnly, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await ensureTimetableTable(connection);
    const [sections] = await connection.query(
      'SELECT Section_ID, Section_Name, Branch, Year FROM sections ORDER BY Year, Branch, Section_Name'
    );
    return res.json({ success: true, sections });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    connection.release();
  }
});

router.post('/', adminOnly, async (req, res) => {
  const {
    sectionId,
    dayOfWeek,
    startTime,
    endTime,
    subjectName,
    facultyName,
    roomNo,
    notes
  } = req.body || {};

  if (!sectionId || !dayOfWeek || !startTime || !endTime || !subjectName) {
    return res.status(400).json({
      success: false,
      message: 'sectionId, dayOfWeek, startTime, endTime, and subjectName are required'
    });
  }

  if (!isValidTimeRange(startTime, endTime)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid time range. End time must be after start time.'
    });
  }

  const connection = await pool.getConnection();
  try {
    await ensureTimetableTable(connection);

    const [sectionRows] = await connection.query(
      'SELECT Section_ID, Section_Name FROM sections WHERE Section_ID = ? LIMIT 1',
      [sectionId]
    );
    if (!sectionRows.length) {
      return res.status(404).json({ success: false, message: 'Section not found' });
    }

    const conflict = await findTimetableOverlap(connection, {
      sectionId,
      dayOfWeek,
      startTime,
      endTime
    });
    if (conflict) {
      return res.status(409).json({
        success: false,
        message: `Time conflict with ${conflict.Subject_Name} (${conflict.Start_Time}-${conflict.End_Time}).`
      });
    }

    const [ins] = await connection.query(
      `INSERT INTO class_timetables
      (Section_ID, Day_of_Week, Start_Time, End_Time, Subject_Name, Faculty_Name, Room_No, Notes, Created_By)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(sectionId),
        String(dayOfWeek).trim(),
        String(startTime).trim(),
        String(endTime).trim(),
        String(subjectName).trim(),
        facultyName ? String(facultyName).trim() : null,
        roomNo ? String(roomNo).trim() : null,
        notes ? String(notes).trim() : null,
        String(req.auth.id || 'admin')
      ]
    );

    return res.json({
      success: true,
      message: 'Timetable entry created',
      timetableId: ins.insertId,
      section: sectionRows[0]
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    connection.release();
  }
});

router.put('/:timetableId', adminOnly, async (req, res) => {
  const { timetableId } = req.params;
  const {
    sectionId,
    dayOfWeek,
    startTime,
    endTime,
    subjectName,
    facultyName,
    roomNo,
    notes
  } = req.body || {};

  if (!sectionId || !dayOfWeek || !startTime || !endTime || !subjectName) {
    return res.status(400).json({
      success: false,
      message: 'sectionId, dayOfWeek, startTime, endTime, and subjectName are required'
    });
  }

  if (!isValidTimeRange(startTime, endTime)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid time range. End time must be after start time.'
    });
  }

  const connection = await pool.getConnection();
  try {
    await ensureTimetableTable(connection);

    const [existing] = await connection.query(
      'SELECT Timetable_ID FROM class_timetables WHERE Timetable_ID = ? LIMIT 1',
      [timetableId]
    );
    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'Timetable entry not found' });
    }

    const [sectionRows] = await connection.query(
      'SELECT Section_ID, Section_Name FROM sections WHERE Section_ID = ? LIMIT 1',
      [sectionId]
    );
    if (!sectionRows.length) {
      return res.status(404).json({ success: false, message: 'Section not found' });
    }

    const conflict = await findTimetableOverlap(connection, {
      sectionId,
      dayOfWeek,
      startTime,
      endTime
    }, timetableId);
    if (conflict) {
      return res.status(409).json({
        success: false,
        message: `Time conflict with ${conflict.Subject_Name} (${conflict.Start_Time}-${conflict.End_Time}).`
      });
    }

    await connection.query(
      `UPDATE class_timetables
       SET Section_ID = ?, Day_of_Week = ?, Start_Time = ?, End_Time = ?, Subject_Name = ?,
           Faculty_Name = ?, Room_No = ?, Notes = ?
       WHERE Timetable_ID = ?`,
      [
        Number(sectionId),
        String(dayOfWeek).trim(),
        String(startTime).trim(),
        String(endTime).trim(),
        String(subjectName).trim(),
        facultyName ? String(facultyName).trim() : null,
        roomNo ? String(roomNo).trim() : null,
        notes ? String(notes).trim() : null,
        Number(timetableId)
      ]
    );

    return res.json({
      success: true,
      message: 'Timetable entry updated',
      timetableId: Number(timetableId),
      section: sectionRows[0]
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    connection.release();
  }
});

router.delete('/:timetableId', adminOnly, async (req, res) => {
  const { timetableId } = req.params;
  const connection = await pool.getConnection();
  try {
    await ensureTimetableTable(connection);
    const [del] = await connection.query('DELETE FROM class_timetables WHERE Timetable_ID = ?', [timetableId]);
    if (!del.affectedRows) {
      return res.status(404).json({ success: false, message: 'Timetable entry not found' });
    }
    return res.json({ success: true, message: 'Timetable entry deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    connection.release();
  }
});

router.get('/section/:sectionId', async (req, res) => {
  const { sectionId } = req.params;
  const connection = await pool.getConnection();
  try {
    await ensureTimetableTable(connection);
    const [sectionRows] = await connection.query(
      'SELECT Section_ID, Section_Name, Branch, Year FROM sections WHERE Section_ID = ? LIMIT 1',
      [sectionId]
    );
    if (!sectionRows.length) {
      return res.status(404).json({ success: false, message: 'Section not found' });
    }

    const [rows] = await connection.query(
      `SELECT t.*, s.Section_Name, s.Branch, s.Year
       FROM class_timetables t
       JOIN sections s ON s.Section_ID = t.Section_ID
       WHERE t.Section_ID = ?`,
      [sectionId]
    );

    return res.json({
      success: true,
      section: sectionRows[0],
      entries: sortRows(rows)
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    connection.release();
  }
});

router.get('/student/:studentId', async (req, res) => {
  const { studentId } = req.params;
  const decoded = verifyToken(req);
  if (!decoded) return res.status(401).json({ success: false, message: 'No or invalid token' });
  if (decoded.userType === 'student' || decoded.user_type === 'student') {
    if (String(decoded.id) !== String(studentId)) {
      return res.status(403).json({ success: false, message: 'Access denied for this student' });
    }
  }

  const connection = await pool.getConnection();
  try {
    await ensureTimetableTable(connection);

    const [rows] = await connection.query(
      `SELECT t.*, s.Section_Name, s.Branch, s.Year, s.Section_ID
       FROM section_students ss
       JOIN sections s ON s.Section_ID = ss.Section_ID
       LEFT JOIN class_timetables t ON t.Section_ID = s.Section_ID
       WHERE ss.Student_ID = ?`,
      [studentId]
    );

    const sectionMap = new Map();
    const entries = [];
    rows.forEach((r) => {
      if (r.Section_ID && !sectionMap.has(r.Section_ID)) {
        sectionMap.set(r.Section_ID, {
          Section_ID: r.Section_ID,
          Section_Name: r.Section_Name,
          Branch: r.Branch,
          Year: r.Year
        });
      }
      if (r.Timetable_ID) entries.push(r);
    });

    // Fallback: if section_students mapping is missing, derive section from students table (Branch + Year + Section).
    if (sectionMap.size === 0) {
      const [studentRows] = await connection.query(
        'SELECT Student_ID, Branch, Year, Section FROM students WHERE Student_ID = ? LIMIT 1',
        [studentId]
      );

      if (studentRows.length) {
        const st = studentRows[0];
        const branch = String(st.Branch || '').trim();
        const sectionName = String(st.Section || '').trim();
        const yearNum = parseInt(String(st.Year || '').replace(/\D/g, ''), 10);

        if (branch && sectionName) {
          let query = `
            SELECT t.*, s.Section_Name, s.Branch, s.Year, s.Section_ID
            FROM sections s
            LEFT JOIN class_timetables t ON t.Section_ID = s.Section_ID
            WHERE UPPER(TRIM(s.Branch)) = UPPER(TRIM(?))
              AND UPPER(TRIM(s.Section_Name)) = UPPER(TRIM(?))
          `;
          const params = [branch, sectionName];

          if (Number.isFinite(yearNum)) {
            query += ' AND s.Year = ?';
            params.push(yearNum);
          }

          const [fallbackRows] = await connection.query(query, params);
          fallbackRows.forEach((r) => {
            if (r.Section_ID && !sectionMap.has(r.Section_ID)) {
              sectionMap.set(r.Section_ID, {
                Section_ID: r.Section_ID,
                Section_Name: r.Section_Name,
                Branch: r.Branch,
                Year: r.Year
              });
            }
            if (r.Timetable_ID) entries.push(r);
          });
        }
      }
    }

    return res.json({
      success: true,
      sections: [...sectionMap.values()],
      entries: sortRows(entries)
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    connection.release();
  }
});

router.get('/faculty/:facultyId', async (req, res) => {
  const { facultyId } = req.params;
  const decoded = verifyToken(req);
  if (!decoded) return res.status(401).json({ success: false, message: 'No or invalid token' });
  if (decoded.userType === 'faculty' || decoded.user_type === 'faculty') {
    if (String(decoded.id) !== String(facultyId)) {
      return res.status(403).json({ success: false, message: 'Access denied for this faculty' });
    }
  }

  const connection = await pool.getConnection();
  try {
    await ensureTimetableTable(connection);

    const [rows] = await connection.query(
      `SELECT t.*, s.Section_Name, s.Branch, s.Year, s.Section_ID
       FROM section_faculty sf
       JOIN sections s ON s.Section_ID = sf.Section_ID
       LEFT JOIN class_timetables t ON t.Section_ID = s.Section_ID
       WHERE sf.Faculty_ID = ?`,
      [facultyId]
    );

    const sectionMap = new Map();
    const entries = [];
    rows.forEach((r) => {
      if (r.Section_ID && !sectionMap.has(r.Section_ID)) {
        sectionMap.set(r.Section_ID, {
          Section_ID: r.Section_ID,
          Section_Name: r.Section_Name,
          Branch: r.Branch,
          Year: r.Year
        });
      }
      if (r.Timetable_ID) entries.push(r);
    });

    return res.json({
      success: true,
      sections: [...sectionMap.values()],
      entries: sortRows(entries)
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    connection.release();
  }
});

module.exports = router;
