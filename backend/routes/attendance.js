const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Mark attendance (faculty)
router.post('/mark', async (req, res) => {
  try {
    const { studentId, facultyId, date, period, status, subject } = req.body;
    if (!studentId || !facultyId || !date || !period || !status || !subject) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const periodNum = Number(period);
    if (!Number.isInteger(periodNum) || periodNum < 1 || periodNum > 6) {
      return res.status(400).json({ error: 'Period must be between 1 and 6' });
    }

    // Allow attendance only Monday-Saturday (Sun = 0)
    const parsedDate = new Date(date + 'T00:00:00');
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date' });
    }
    const day = parsedDate.getDay();
    if (day === 0) {
      return res.status(400).json({ error: 'Attendance can only be marked Monday to Saturday' });
    }

    await pool.query(
      'INSERT INTO attendance (Student_ID, Faculty_ID, Date, Period, Status, Subject) VALUES (?, ?, ?, ?, ?, ?)',
      [studentId, facultyId, date, periodNum, status, subject]
    );
    res.json({ message: 'Attendance marked successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark attendance' });
  }
});

// Get attendance for a student (student view)
router.get('/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    // #region agent log
    fetch('http://127.0.0.1:7393/ingest/d0dc3daf-fe68-4895-97af-dab123fe6d7b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'dd76fa'},body:JSON.stringify({sessionId:'dd76fa',runId:'pre_debug',hypothesisId:'H3',location:'backend/routes/attendance.js:GET /student',message:'request',data:{studentId},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const [rows] = await pool.query(
      'SELECT * FROM attendance WHERE Student_ID = ? ORDER BY Date DESC, Period DESC',
      [studentId]
    );
    // #region agent log
    fetch('http://127.0.0.1:7393/ingest/d0dc3daf-fe68-4895-97af-dab123fe6d7b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'dd76fa'},body:JSON.stringify({sessionId:'dd76fa',runId:'pre_debug',hypothesisId:'H3',location:'backend/routes/attendance.js:GET /student',message:'result',data:{count:Array.isArray(rows)?rows.length:0},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    res.json(rows);
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7393/ingest/d0dc3daf-fe68-4895-97af-dab123fe6d7b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'dd76fa'},body:JSON.stringify({sessionId:'dd76fa',runId:'pre_debug',hypothesisId:'H3',location:'backend/routes/attendance.js:GET /student',message:'error',data:{error:err && err.message ? err.message : String(err)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// Get attendance for a faculty (faculty view)
router.get('/faculty/:facultyId', async (req, res) => {
  try {
    const { facultyId } = req.params;
    // #region agent log
    fetch('http://127.0.0.1:7393/ingest/d0dc3daf-fe68-4895-97af-dab123fe6d7b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'dd76fa'},body:JSON.stringify({sessionId:'dd76fa',runId:'pre_debug',hypothesisId:'H3',location:'backend/routes/attendance.js:GET /faculty',message:'request',data:{facultyId},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const [rows] = await pool.query(
      'SELECT * FROM attendance WHERE Faculty_ID = ? ORDER BY Date DESC, Period DESC',
      [facultyId]
    );
    // #region agent log
    fetch('http://127.0.0.1:7393/ingest/d0dc3daf-fe68-4895-97af-dab123fe6d7b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'dd76fa'},body:JSON.stringify({sessionId:'dd76fa',runId:'pre_debug',hypothesisId:'H3',location:'backend/routes/attendance.js:GET /faculty',message:'result',data:{count:Array.isArray(rows)?rows.length:0},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    res.json(rows);
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7393/ingest/d0dc3daf-fe68-4895-97af-dab123fe6d7b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'dd76fa'},body:JSON.stringify({sessionId:'dd76fa',runId:'pre_debug',hypothesisId:'H3',location:'backend/routes/attendance.js:GET /faculty',message:'error',data:{error:err && err.message ? err.message : String(err)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

module.exports = router;
