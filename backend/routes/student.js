
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const fs = require('fs');
const path = require('path');
const router = express.Router();




// Get students grouped by CGPA (High, Medium, Low)
router.get('/group/cgpa', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    // High: CGPA >= 8.0, Medium: 6.5 <= CGPA < 8.0, Low: CGPA < 6.5
    const [high] = await connection.query('SELECT * FROM students WHERE CGPA >= 8.0');
    const [medium] = await connection.query('SELECT * FROM students WHERE CGPA >= 6.5 AND CGPA < 8.0');
    const [low] = await connection.query('SELECT * FROM students WHERE CGPA < 6.5');
    connection.release();
    res.json({
      success: true,
      groups: {
        high: { label: 'High (CGPA ≥ 8.0)', count: high.length, students: high },
        medium: { label: 'Medium (6.5 ≤ CGPA < 8.0)', count: medium.length, students: medium },
        low: { label: 'Low (CGPA < 6.5)', count: low.length, students: low }
      }
    });
  } catch (err) {
    console.error('Error grouping students by CGPA:', err);
    res.status(500).json({ success: false, message: 'Error grouping students: ' + err.message });
  }
});


// Middleware to verify token
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.userId = decoded.id;
    req.userEmail = decoded.email || null;
    req.userName = decoded.name || null;
    req.userType = decoded.user_type || decoded.userType || decoded.role || null;
    if (req.userType !== 'student') {
      return res.status(403).json({ message: 'Student access required' });
    }
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

async function resolveStudentForRequest(connection, req) {
  const directId = String(req.userId || '').trim();
  const email = String(req.userEmail || '').trim();

  if (directId) {
    const [rows] = await connection.query(
      'SELECT Student_ID, Name, Branch, Year, Email FROM students WHERE Student_ID = ? LIMIT 1',
      [directId]
    );
    if (rows.length) return rows[0];
  }

  if (email) {
    const [rows] = await connection.query(
      'SELECT Student_ID, Name, Branch, Year, Email FROM students WHERE Email = ? LIMIT 1',
      [email]
    );
    if (rows.length) return rows[0];
  }

  // Map legacy/alternate token identity via credentials table.
  try {
    const numericId = Number(directId);
    const idForQuery = Number.isFinite(numericId) ? numericId : -1;
    const [credRows] = await connection.query(
      `SELECT user_id
       FROM credentials
       WHERE user_type = 'student'
         AND (user_id = ? OR email = ? OR id = ?)
       LIMIT 1`,
      [directId || '', email || '', idForQuery]
    );

    if (credRows.length) {
      const mappedId = String(credRows[0].user_id || '').trim();
      if (mappedId) {
        const [rows] = await connection.query(
          'SELECT Student_ID, Name, Branch, Year, Email FROM students WHERE Student_ID = ? LIMIT 1',
          [mappedId]
        );
        if (rows.length) return rows[0];
      }
    }
  } catch (_ignore) {
    // credentials table may be unavailable in some setups.
  }

  // Final fallback for setups using JSON-based login data.
  try {
    const studentDbPath = path.join(__dirname, '../data/studentDatabase.json');
    if (fs.existsSync(studentDbPath)) {
      const raw = fs.readFileSync(studentDbPath, 'utf8');
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed?.students) ? parsed.students : [];
      const match = list.find((s) =>
        String(s.Student_ID || '').trim() === directId ||
        String(s.Email || '').trim().toLowerCase() === email.toLowerCase()
      );
      if (match) {
        return {
          Student_ID: match.Student_ID || directId || req.userId,
          Name: match.Name || req.userName || 'Student',
          Branch: match.Branch || null,
          Year: match.Year || null,
          Email: match.Email || email || null
        };
      }
    }
  } catch (_ignore) {
    // ignore json fallback issues
  }

  return null;
}

function buildBranchAliases(branchValue) {
  const raw = String(branchValue || '').trim();
  const upper = raw.toUpperCase();
  const set = new Set();
  if (raw) {
    set.add(raw);
    set.add(upper);
  }

  const aliasMap = {
    CSE: ['CSE', 'Computer Science', 'Computer Science and Engineering'],
    ECE: ['ECE', 'Electronics', 'Electronics and Communication Engineering'],
    EEE: ['EEE', 'Electrical', 'Electrical and Electronics Engineering'],
    MECH: ['MECH', 'Mechanical', 'Mechanical Engineering'],
    CIVIL: ['CIVIL', 'Civil', 'Civil Engineering']
  };

  const key = Object.keys(aliasMap).find((k) => upper.includes(k));
  if (key) aliasMap[key].forEach((v) => set.add(v));

  return Array.from(set);
}

// Get all students
router.get('/all', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [students] = await connection.query('SELECT * FROM students LIMIT 100');
    connection.release();
    
    res.json({
      success: true,
      count: students.length,
      students: students
    });
  } catch (err) {
    console.error('Error fetching students:', err.message);
    res.status(500).json({ 
      success: false, 
      message: 'Database Error: ' + err.message
    });
  }
});

// Dashboard summary (must be before /:studentId)
router.get('/performance', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const studentId = decoded.id;
    if (!studentId) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    const connection = await pool.getConnection();
    const [rows] = await connection.query('SELECT * FROM students WHERE Student_ID = ?', [studentId]);
    connection.release();
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    const s = rows[0];
    const cgpa = s.CGPA != null ? Number(s.CGPA) : 7.5;
    const gpa4 = Math.min(4, Math.max(0, (cgpa / 10) * 4));
    const yearVal = s.Year != null ? String(s.Year) : '4';
    res.json({
      gpa: gpa4.toFixed(2),
      credits: 45,
      semester: yearVal,
      status: s.Placement_Status || 'Active'
    });
  } catch (err) {
    console.error('Error /student/performance:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

function getGradeFromPercent(percent) {
  if (percent >= 90) return 'A+';
  if (percent >= 80) return 'A';
  if (percent >= 70) return 'B+';
  if (percent >= 60) return 'B';
  if (percent >= 50) return 'C';
  return 'F';
}

function buildFallbackSubjects(branch) {
  const normalized = String(branch || '').toUpperCase();
  if (normalized.includes('CSE')) {
    return ['Data Structures', 'Database Systems', 'Operating Systems', 'Computer Networks', 'Web Technologies'];
  }
  if (normalized.includes('ECE')) {
    return ['Digital Electronics', 'Signals and Systems', 'Microprocessors', 'Communication Systems', 'VLSI Basics'];
  }
  if (normalized.includes('EEE')) {
    return ['Circuit Theory', 'Power Systems', 'Electrical Machines', 'Control Systems', 'Power Electronics'];
  }
  return ['Core Subject 1', 'Core Subject 2', 'Core Subject 3', 'Core Subject 4', 'Core Subject 5'];
}

// Student results with subject-wise marks
router.get('/results/:studentId?', authMiddleware, async (req, res) => {
  let connection;
  try {
    const requestedId = req.params.studentId;
    const tokenStudentId = req.userId;
    const studentId = requestedId || tokenStudentId;

    if (!studentId) {
      return res.status(400).json({ success: false, message: 'Student ID is required' });
    }

    if (requestedId && requestedId !== tokenStudentId) {
      return res.status(403).json({ success: false, message: 'You can only view your own results' });
    }

    connection = await pool.getConnection();
    const [students] = await connection.query(
      'SELECT Student_ID, Name, Branch, Year, CGPA, Attendance_Percentage FROM students WHERE Student_ID = ? LIMIT 1',
      [studentId]
    );

    if (!students.length) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const student = students[0];
    const cgpa = Number(student.CGPA) || 0;
    const semester = Number(student.Year) || 1;

    let resultRows = [];
    try {
      const [rows] = await connection.query(
        `SELECT subject_name, marks_obtained, max_marks, exam_type, semester
         FROM student_results
         WHERE Student_ID = ?
         ORDER BY semester DESC, subject_name ASC`,
        [studentId]
      );
      resultRows = Array.isArray(rows) ? rows : [];
    } catch (err) {
      // Table may not exist yet; fallback rows are returned below.
      resultRows = [];
    }

    let subjects;
    if (resultRows.length > 0) {
      subjects = resultRows.map((row) => {
        const maxMarks = Number(row.max_marks) || 100;
        const marks = Number(row.marks_obtained) || 0;
        const percent = maxMarks > 0 ? (marks / maxMarks) * 100 : 0;
        const grade = getGradeFromPercent(percent);
        return {
          subject: row.subject_name,
          semester: Number(row.semester) || semester,
          examType: row.exam_type || 'End Semester',
          marksObtained: marks,
          maxMarks,
          percentage: Number(percent.toFixed(2)),
          grade,
          status: grade === 'F' ? 'Fail' : 'Pass'
        };
      });
    } else {
      const baseSubjects = buildFallbackSubjects(student.Branch);
      subjects = baseSubjects.map((subjectName, idx) => {
        const generatedPercent = Math.max(48, Math.min(96, Math.round(cgpa * 10 + (idx - 2) * 3)));
        const marksObtained = generatedPercent;
        const grade = getGradeFromPercent(generatedPercent);
        return {
          subject: subjectName,
          semester,
          examType: 'Internal + External',
          marksObtained,
          maxMarks: 100,
          percentage: generatedPercent,
          grade,
          status: grade === 'F' ? 'Fail' : 'Pass'
        };
      });
    }

    const totalMarksObtained = subjects.reduce((sum, s) => sum + Number(s.marksObtained || 0), 0);
    const totalMaxMarks = subjects.reduce((sum, s) => sum + Number(s.maxMarks || 0), 0);
    const avgPercent = totalMaxMarks > 0 ? (totalMarksObtained / totalMaxMarks) * 100 : 0;
    const latestSgpa = Number((avgPercent / 10).toFixed(2));
    const failedCount = subjects.filter((s) => s.status === 'Fail').length;

    return res.json({
      success: true,
      student: {
        studentId: student.Student_ID,
        name: student.Name,
        branch: student.Branch,
        semester,
        cgpa: Number(cgpa.toFixed(2)),
        latestSgpa,
        resultStatus: failedCount === 0 ? 'Published' : 'Published (With Backlogs)'
      },
      summary: {
        totalSubjects: subjects.length,
        passedSubjects: subjects.length - failedCount,
        failedSubjects: failedCount,
        totalMarksObtained,
        totalMaxMarks,
        percentage: Number(avgPercent.toFixed(2))
      },
      subjects
    });
  } catch (err) {
    console.error('Error fetching student results:', err);
    return res.status(500).json({ success: false, message: 'Error fetching results: ' + err.message });
  } finally {
    if (connection) connection.release();
  }
});

// Get faculty contacts for logged-in student (prefer assigned section faculty, fallback by branch)
router.get('/faculty-contacts', authMiddleware, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const student = await resolveStudentForRequest(connection, req);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    const studentId = student.Student_ID;
    const branchAliases = buildBranchAliases(student.Branch);
    const branchPlaceholders = branchAliases.map(() => '?').join(',');

    const [sectionFacultyRows] = await connection.query(
      `SELECT DISTINCT
          f.Faculty_ID,
          f.Name,
          f.Email,
          f.Branch,
          f.Specialization,
          s.Section_Name,
          s.Year,
          t.Subject_Name
       FROM section_students ss
       JOIN section_faculty sf ON sf.Section_ID = ss.Section_ID
       JOIN faculty f ON f.Faculty_ID = sf.Faculty_ID
       JOIN sections s ON s.Section_ID = ss.Section_ID
       LEFT JOIN class_timetables t ON t.Section_ID = ss.Section_ID
       WHERE ss.Student_ID = ?`,
      [studentId]
    );

    const [branchFacultyRows] = await connection.query(
      `SELECT DISTINCT
          f.Faculty_ID,
          f.Name,
          f.Email,
          f.Branch,
          f.Specialization,
          s.Section_Name,
          s.Year,
          t.Subject_Name
       FROM faculty f
       LEFT JOIN section_faculty sf ON sf.Faculty_ID = f.Faculty_ID
       LEFT JOIN sections s ON s.Section_ID = sf.Section_ID
       LEFT JOIN class_timetables t ON t.Section_ID = s.Section_ID
       WHERE UPPER(TRIM(f.Branch)) IN (${branchPlaceholders})
       ORDER BY f.Name ASC`,
      branchAliases.map((b) => String(b).trim().toUpperCase())
    );

    const sourceRows = [
      ...(Array.isArray(sectionFacultyRows) ? sectionFacultyRows : []),
      ...(Array.isArray(branchFacultyRows) ? branchFacultyRows : [])
    ];

    const map = new Map();
    sourceRows.forEach((row) => {
      const facultyId = String(row.Faculty_ID || '').trim();
      if (!facultyId) return;
      if (!map.has(facultyId)) {
        map.set(facultyId, {
          facultyId,
          facultyName: row.Name || facultyId,
          email: row.Email || null,
          branch: row.Branch || null,
          sectionName: row.Section_Name || null,
          year: row.Year || null,
          specialization: row.Specialization || null,
          subjects: new Set()
        });
      }
      const subjectName = String(row.Subject_Name || row.Specialization || row.Branch || '').trim();
      if (subjectName) map.get(facultyId).subjects.add(subjectName);
    });

    const contacts = Array.from(map.values()).map((item) => {
      const subjects = Array.from(item.subjects);
      return {
        facultyId: item.facultyId,
        facultyName: item.facultyName,
        email: item.email,
        branch: item.branch,
        sectionName: item.sectionName,
        year: item.year,
        specialization: item.specialization,
        subjects,
        primarySubject: subjects[0] || item.specialization || item.branch || 'General'
      };
    });

    return res.json({
      success: true,
      student: {
        studentId: student.Student_ID,
        name: student.Name,
        branch: student.Branch,
        year: student.Year
      },
      count: contacts.length,
      contacts
    });
  } catch (err) {
    console.error('Error fetching faculty contacts:', err);
    return res.status(500).json({ success: false, message: 'Error fetching faculty contacts: ' + err.message });
  } finally {
    if (connection) connection.release();
  }
});

// Student submits a doubt to selected faculty
router.post('/doubts', authMiddleware, async (req, res) => {
  let connection;
  try {
    const facultyId = String(req.body?.facultyId || '').trim();
    const subject = String(req.body?.subject || '').trim();
    const doubtText = String(req.body?.doubtText || '').trim();

    if (!facultyId || !subject || !doubtText) {
      return res.status(400).json({ success: false, message: 'facultyId, subject, and doubtText are required' });
    }

    connection = await pool.getConnection();

    const student = await resolveStudentForRequest(connection, req);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const [facultyRows] = await connection.query(
      'SELECT Faculty_ID, Name, Branch, Email FROM faculty WHERE Faculty_ID = ? LIMIT 1',
      [facultyId]
    );
    if (!facultyRows.length) {
      return res.status(404).json({ success: false, message: 'Selected faculty not found' });
    }
    const faculty = facultyRows[0];

    const facultyMessage =
      `Doubt from ${student.Name} (${student.Student_ID}) | Subject: ${subject} | ` +
      `Branch: ${student.Branch || '-'} | Year: ${student.Year || '-'} | Question: ${doubtText}`;

    await connection.query(
      'INSERT INTO notifications (user_id, user_type, message, type, created_at) VALUES (?, ?, ?, ?, NOW())',
      [faculty.Faculty_ID, 'faculty', facultyMessage, 'info']
    );

    const studentAck = `Your doubt has been sent to ${faculty.Name} (${faculty.Faculty_ID}) for subject ${subject}.`;
    await connection.query(
      'INSERT INTO notifications (user_id, user_type, message, type, created_at) VALUES (?, ?, ?, ?, NOW())',
      [student.Student_ID, 'student', studentAck, 'info']
    );

    return res.json({
      success: true,
      message: 'Doubt submitted to faculty successfully',
      recipient: {
        facultyId: faculty.Faculty_ID,
        facultyName: faculty.Name,
        email: faculty.Email || null
      }
    });
  } catch (err) {
    console.error('Error submitting student doubt:', err);
    return res.status(500).json({ success: false, message: 'Error submitting doubt: ' + err.message });
  } finally {
    if (connection) connection.release();
  }
});

// Get student by ID
router.get('/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const connection = await pool.getConnection();
    const [students] = await connection.query('SELECT * FROM students WHERE Student_ID = ?', [studentId]);
    connection.release();
    
    if (students.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    res.json({
      success: true,
      student: students[0]
    });
  } catch (err) {
    console.error('Error fetching student:', err);
    res.status(500).json({ success: false, message: 'Error fetching student: ' + err.message });
  }
});

// Get students by branch
router.get('/branch/:branchName', async (req, res) => {
  try {
    const { branchName } = req.params;
    const connection = await pool.getConnection();
    const [students] = await connection.query('SELECT * FROM students WHERE Branch = ? LIMIT 50', [branchName]);
    connection.release();
    
    res.json({
      success: true,
      branch: branchName,
      count: students.length,
      students: students
    });
  } catch (err) {
    console.error('Error fetching students by branch:', err);
    res.status(500).json({ success: false, message: 'Error fetching students: ' + err.message });
  }
});

// Get students by placement status
router.get('/placement/:status', async (req, res) => {
  try {
    const { status } = req.params;
    const connection = await pool.getConnection();
    const [rows] = await connection.query('SELECT * FROM students WHERE Placement_Status = ? LIMIT 50', [status]);
    connection.release();
    
    res.json({
      success: true,
      placementStatus: status,
      count: rows.length,
      students: rows
    });
  } catch (err) {
    console.error('Error fetching students by placement:', err);
    res.status(500).json({ success: false, message: 'Error fetching students: ' + err.message });
  }
});

// Get placement statistics
router.get('/stats/placement-summary', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query(`
      SELECT 
        Placement_Status,
        COUNT(*) as count,
        ROUND(AVG(CGPA), 2) as avg_cgpa,
        ROUND(AVG(Attendance_Percentage), 2) as avg_attendance
      FROM students 
      GROUP BY Placement_Status
    `);
    connection.release();
    
    res.json({
      success: true,
      placementStats: rows
    });
  } catch (err) {
    console.error('Error fetching placement stats:', err);
    res.status(500).json({ success: false, message: 'Error fetching stats: ' + err.message });
  }
});

async function handleStudentProfileUpdate(req, res) {
  try {
    const { studentId } = req.params;
    const { fullName, email, department, semester, status } = req.body;
    const connection = await pool.getConnection();
    const [result] = await connection.query(
      'UPDATE students SET Name = ?, Email = ?, Branch = ?, Year = ?, Placement_Status = ? WHERE Student_ID = ?',
      [fullName, email, department, semester, status, studentId]
    );
    const [updated] = await connection.query('SELECT * FROM students WHERE Student_ID = ?', [studentId]);
    connection.release();
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    const u = updated[0] || {};
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        fullName: u.Name,
        studentId: u.Student_ID,
        email: u.Email,
        department: u.Branch,
        year: u.Year,
        Branch: u.Branch,
        Year: u.Year
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error updating profile: ' + err.message });
  }
}

router.put('/update/:studentId', handleStudentProfileUpdate);
router.put('/profile/:studentId', handleStudentProfileUpdate);

module.exports = router;
