const express = require('express');
const router = express.Router();
const dbConfig = require('../config/database');
const jwt = require('jsonwebtoken');

// Middleware: Only allow admin (JWT)
function adminAuthMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');

    // Token from /api/admins/login sets { isAdmin: true, role, id }
    if (decoded && decoded.isAdmin === true) {
      req.adminId = decoded.id;
      req.adminRole = decoded.role;
      return next();
    }
    return res.status(403).json({ error: 'Admin access required' });
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Get all sections with students and faculty
router.get('/', adminAuthMiddleware, async (req, res) => {
  // #region agent log
  fetch('http://127.0.0.1:7393/ingest/d0dc3daf-fe68-4895-97af-dab123fe6d7b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'dd76fa'},body:JSON.stringify({sessionId:'dd76fa',runId:'pre_debug',hypothesisId:'H4',location:'backend/routes/sections.js:GET /api/sections',message:'request',data:{adminId:req.adminId||null,adminRole:req.adminRole||null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  const connection = await dbConfig.getConnection();
  try {
    const [sections] = await connection.query(`
      SELECT s.Section_ID, s.Section_Name, s.Branch, s.Year, f.Faculty_ID, f.Name AS Faculty_Name
      FROM sections s
      LEFT JOIN section_faculty sf ON s.Section_ID = sf.Section_ID
      LEFT JOIN faculty f ON sf.Faculty_ID = f.Faculty_ID
    `);

    // #region agent log
    fetch('http://127.0.0.1:7393/ingest/d0dc3daf-fe68-4895-97af-dab123fe6d7b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'dd76fa'},body:JSON.stringify({sessionId:'dd76fa',runId:'pre_debug',hypothesisId:'H4',location:'backend/routes/sections.js:GET /api/sections',message:'sections query result',data:{count:Array.isArray(sections)?sections.length:0},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    for (const section of sections) {
      const [students] = await connection.query(
        `SELECT st.Student_ID, st.Name, st.Email FROM section_students ss JOIN students st ON ss.Student_ID = st.Student_ID WHERE ss.Section_ID = ?`,
        [section.Section_ID]
      );
      section.students = students;
    }
    res.json(sections);
  } finally {
    await connection.end();
  }
});

// Add student to section
router.post('/add-student', adminAuthMiddleware, async (req, res) => {
  const { Section_ID, Student_ID } = req.body;
  if (!Section_ID || !Student_ID) return res.status(400).json({ error: 'Missing Section_ID or Student_ID' });
  const connection = await dbConfig.getConnection();
  try {
    await connection.query('INSERT INTO section_students (Section_ID, Student_ID) VALUES (?, ?)', [Section_ID, Student_ID]);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  } finally {
    await connection.end();
  }
});

// Remove student from section
router.post('/remove-student', adminAuthMiddleware, async (req, res) => {
  const { Section_ID, Student_ID } = req.body;
  if (!Section_ID || !Student_ID) return res.status(400).json({ error: 'Missing Section_ID or Student_ID' });
  const connection = await dbConfig.getConnection();
  try {
    await connection.query('DELETE FROM section_students WHERE Section_ID = ? AND Student_ID = ?', [Section_ID, Student_ID]);
    res.json({ success: true });
  } finally {
    await connection.end();
  }
});

// Change student's section
router.post('/change-student-section', adminAuthMiddleware, async (req, res) => {
  const { Old_Section_ID, New_Section_ID, Student_ID } = req.body;
  if (!Old_Section_ID || !New_Section_ID || !Student_ID) return res.status(400).json({ error: 'Missing parameters' });
  const connection = await dbConfig.getConnection();
  try {
    await connection.query('DELETE FROM section_students WHERE Section_ID = ? AND Student_ID = ?', [Old_Section_ID, Student_ID]);
    await connection.query('INSERT INTO section_students (Section_ID, Student_ID) VALUES (?, ?)', [New_Section_ID, Student_ID]);
    res.json({ success: true });
  } finally {
    await connection.end();
  }
});

// Assign faculty to section
router.post('/assign-faculty', adminAuthMiddleware, async (req, res) => {
  const { Section_ID, Faculty_ID } = req.body;
  if (!Section_ID || !Faculty_ID) return res.status(400).json({ error: 'Missing Section_ID or Faculty_ID' });
  const connection = await dbConfig.getConnection();
  try {
    await connection.query('REPLACE INTO section_faculty (Section_ID, Faculty_ID) VALUES (?, ?)', [Section_ID, Faculty_ID]);
    res.json({ success: true });
  } finally {
    await connection.end();
  }
});

// Remove faculty from section
router.post('/remove-faculty', adminAuthMiddleware, async (req, res) => {
  const { Section_ID } = req.body;
  if (!Section_ID) return res.status(400).json({ error: 'Missing Section_ID' });
  const connection = await dbConfig.getConnection();
  try {
    await connection.query('DELETE FROM section_faculty WHERE Section_ID = ?', [Section_ID]);
    res.json({ success: true });
  } finally {
    await connection.end();
  }
});

// Create new section (branch-wise)
router.post('/create', adminAuthMiddleware, async (req, res) => {
  const { Section_Name, Branch, Year } = req.body;
  if (!Section_Name || !Branch || !Year) {
    return res.status(400).json({ error: 'Section_Name, Branch, and Year are required' });
  }
  const yearInt = parseInt(String(Year).replace(/\D/g, ''), 10);
  if (!yearInt || yearInt < 1 || yearInt > 4) {
    return res.status(400).json({ error: 'Year must be 1, 2, 3, or 4' });
  }

  const connection = await dbConfig.getConnection();
  try {
    const [ins] = await connection.query(
      'INSERT INTO sections (Section_Name, Branch, Year) VALUES (?, ?, ?)',
      [String(Section_Name).trim(), String(Branch).trim(), yearInt]
    );
    res.json({ success: true, Section_ID: ins.insertId, message: 'Section created successfully' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  } finally {
    await connection.end();
  }
});

// Seed default sections (A/B/C) by Branch+Year using students' CGPA ranking.
// This is only applied when the `sections` table is empty, so it won't overwrite existing data.
router.post('/seed', adminAuthMiddleware, async (req, res) => {
  const connection = await dbConfig.getConnection();
  try {
    await connection.beginTransaction();

    const [countRows] = await connection.query('SELECT COUNT(*) AS c FROM sections');
    const sectionCount = countRows && countRows[0] ? countRows[0].c : 0;
    if (Number(sectionCount) > 0) {
      await connection.rollback();
      return res.json({ success: true, message: 'Sections already exist', count: sectionCount });
    }

    const [groups] = await connection.query(
      'SELECT Branch, Year FROM students GROUP BY Branch, Year'
    );

    let createdSections = 0;
    let createdStudentMappings = 0;
    let createdFacultyMappings = 0;

    for (const g of groups) {
      const branch = g.Branch;
      const year = g.Year;
      const yearInt = parseInt(String(year).replace(/\D/g, ''), 10);
      if (!yearInt) continue;

      const [students] = await connection.query(
        'SELECT Student_ID, CGPA FROM students WHERE Branch = ? AND Year = ? ORDER BY COALESCE(CGPA, 0) DESC',
        [branch, year]
      );

      if (!students || students.length === 0) continue;

      const third = Math.ceil(students.length / 3);
      const groupA = students.slice(0, third);
      const groupB = students.slice(third, third * 2);
      const groupC = students.slice(third * 2);

      const sectionIds = [];
      const names = ['A', 'B', 'C'];
      const studentGroups = [groupA, groupB, groupC];

      for (let i = 0; i < 3; i++) {
        const sectionName = names[i];
        const [ins] = await connection.query(
          'INSERT INTO sections (Section_Name, Branch, Year) VALUES (?, ?, ?)',
          [sectionName, branch, yearInt]
        );
        const sectionId = ins.insertId;
        sectionIds.push(sectionId);
        createdSections++;

        // Insert student mappings for this section
        for (const stu of studentGroups[i]) {
          await connection.query(
            'INSERT INTO section_students (Section_ID, Student_ID) VALUES (?, ?)',
            [sectionId, stu.Student_ID]
          );
          createdStudentMappings++;
        }
      }

      // Assign up to 3 faculty from the same branch (A=first, B=second, C=third)
      const [facultyRows] = await connection.query(
        'SELECT Faculty_ID FROM faculty WHERE Branch = ? ORDER BY Faculty_ID LIMIT 3',
        [branch]
      );

      for (let i = 0; i < 3; i++) {
        if (!facultyRows || !facultyRows[i]) continue;
        await connection.query(
          'INSERT INTO section_faculty (Section_ID, Faculty_ID) VALUES (?, ?) ON DUPLICATE KEY UPDATE Faculty_ID = VALUES(Faculty_ID)',
          [sectionIds[i], facultyRows[i].Faculty_ID]
        );
        createdFacultyMappings++;
      }
    }

    await connection.commit();
    return res.json({
      success: true,
      message: 'Sections seeded successfully',
      createdSections,
      createdStudentMappings,
      createdFacultyMappings
    });
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    return res.status(500).json({ success: false, message: err.message || 'Seed failed' });
  } finally {
    await connection.end();
  }
});

module.exports = router;
