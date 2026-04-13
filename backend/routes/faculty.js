
const express = require('express');
const jwt = require('jsonwebtoken');
const { mockDb } = require('../mockDb');
const pool = require('../config/database');
const router = express.Router();

// Middleware to verify token
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.userId = decoded.id;
    req.userType = decoded.user_type || decoded.userType || decoded.role || null;
    if (req.userType !== 'faculty') {
      return res.status(403).json({ message: 'Faculty access required' });
    }
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Get students for a faculty: from assigned sections first, fallback to branch
router.get('/:facultyId/students', async (req, res) => {
  try {
    const { facultyId } = req.params;
    const connection = await pool.getConnection();

    // Get students from sections where this faculty is assigned
    const [sectionStudents] = await connection.query(`
      SELECT DISTINCT
        st.*, ss.Section_ID, sec.Section_Name
      FROM section_faculty sf
      JOIN section_students ss ON sf.Section_ID = ss.Section_ID
      JOIN sections sec ON sec.Section_ID = ss.Section_ID
      JOIN students st ON ss.Student_ID = st.Student_ID
      WHERE sf.Faculty_ID = ?
    `, [facultyId]);

    let students = sectionStudents || [];
    let branch = null;

    // If no section assignments, fallback to students by faculty's branch
    if (students.length === 0) {
      let [facultyRows] = await connection.query('SELECT Branch FROM faculty WHERE Faculty_ID = ?', [facultyId]);
      if (facultyRows.length === 0) {
        [facultyRows] = await connection.query('SELECT DISTINCT Branch FROM faculty LIMIT 1');
      }
      if (facultyRows.length > 0) {
        branch = facultyRows[0].Branch;
        const [branchStudents] = await connection.query(
          'SELECT * FROM students WHERE Branch = ?',
          [branch]
        );
        students = branchStudents || [];
      }
    }

    // Normalize to match frontend expectations (dashboard-faculty.html)
    const normalizedStudents = (students || []).map(st => ({
      ...st,
      fullName: st.Name,
      studentId: st.Student_ID,
      email: st.Email,
      department: st.Branch,
      sectionId: st.Section_ID || null,
      sectionName: st.Section_Name || st.Section || null,
      gpa: st.CGPA,
      status: st.Placement_Status || 'Active',
      attendance: st.Attendance_Percentage,

      // Keep original keys too (for other UI parts)
      Name: st.Name,
      Student_ID: st.Student_ID,
      Email: st.Email,
      Branch: st.Branch,
      Section_ID: st.Section_ID || null,
      Section_Name: st.Section_Name || st.Section || null,
      Section: st.Section || st.Section_Name || null,
      Year: st.Year,
      CGPA: st.CGPA,
      Attendance_Percentage: st.Attendance_Percentage
    }));

    connection.release();
    res.json({
      success: true,
      facultyId,
      branch: branch || (students[0] && students[0].Branch),
      count: normalizedStudents.length,
      students: normalizedStudents
    });
  } catch (err) {
    console.error('Error fetching students for faculty:', err);
    res.status(500).json({ success: false, message: 'Error fetching students: ' + err.message });
  }
});




// Get faculty's students
router.get('/students', authMiddleware, async (req, res) => {
  try {
    // Return all registered students
    const students = mockDb.students.map(s => ({
      _id: s._id,
      studentId: s.studentId,
      fullName: s.fullName,
      email: s.email,
      department: s.department,
      gpa: 3.8,
      status: 'Active'
    }));
    
    res.json(students);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching students: ' + err.message });
  }
});

// Create or update a student's subject result (faculty only)
router.post('/results', authMiddleware, async (req, res) => {
  let connection;
  try {
    const {
      studentId,
      subjectName,
      marksObtained,
      maxMarks,
      examType,
      semester
    } = req.body;

    if (!studentId || !subjectName || marksObtained == null) {
      return res.status(400).json({ success: false, message: 'studentId, subjectName, and marksObtained are required' });
    }

    const maxMarksValue = Number(maxMarks || 100);
    const marksValue = Number(marksObtained);
    const semesterValue = Number(semester || 1);
    const examTypeValue = (examType || 'End Semester').trim();

    if (Number.isNaN(marksValue) || Number.isNaN(maxMarksValue) || maxMarksValue <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid marks or max marks' });
    }

    if (marksValue < 0 || marksValue > maxMarksValue) {
      return res.status(400).json({ success: false, message: 'Marks must be between 0 and max marks' });
    }

    connection = await pool.getConnection();

    // Ensure the student exists
    const [studentRows] = await connection.query(
      'SELECT Student_ID FROM students WHERE Student_ID = ? LIMIT 1',
      [studentId]
    );
    if (!studentRows.length) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Upsert behavior by logical key
    const [existing] = await connection.query(
      `SELECT result_id
       FROM student_results
       WHERE Student_ID = ? AND subject_name = ? AND semester = ? AND exam_type = ?
       ORDER BY result_id DESC
       LIMIT 1`,
      [studentId, subjectName.trim(), semesterValue, examTypeValue]
    );

    if (existing.length > 0) {
      await connection.query(
        `UPDATE student_results
         SET marks_obtained = ?, max_marks = ?, updated_at = CURRENT_TIMESTAMP
         WHERE result_id = ?`,
        [marksValue, maxMarksValue, existing[0].result_id]
      );

      return res.json({
        success: true,
        message: 'Result updated successfully',
        action: 'updated',
        resultId: existing[0].result_id
      });
    }

    const [insertResult] = await connection.query(
      `INSERT INTO student_results
       (Student_ID, subject_name, marks_obtained, max_marks, exam_type, semester)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [studentId, subjectName.trim(), marksValue, maxMarksValue, examTypeValue, semesterValue]
    );

    return res.json({
      success: true,
      message: 'Result published successfully',
      action: 'created',
      resultId: insertResult.insertId
    });
  } catch (err) {
    console.error('Error publishing result:', err);
    return res.status(500).json({ success: false, message: 'Error publishing result: ' + err.message });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
