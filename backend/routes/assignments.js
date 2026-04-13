const express = require('express');
const router = express.Router();
const pool = require('../config/database');

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../uploads/assignment_submissions');
try {
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
} catch (_) {}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const original = file.originalname || 'file';
        const safeOriginal = original.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        cb(null, `${Date.now()}-${safeOriginal}`);
    }
});

const upload = multer({ storage });

/** Map student Year field to 1–4 */
function parseStudentYearToInt(raw) {
    if (raw === undefined || raw === null) return null;
    const s = String(raw).trim().toLowerCase();
    if (!s) return null;
    const digits = s.replace(/\D/g, '');
    const first = parseInt(digits.charAt(0) || '0', 10);
    if (first >= 1 && first <= 4 && digits.length <= 2) return first;
    if (/\b1\s*st\b|^i\b|first|year\s*1/.test(s)) return 1;
    if (/\b2\s*nd\b|^ii\b|second|year\s*2|sophomore/.test(s)) return 2;
    if (/\b3\s*rd\b|^iii\b|third|year\s*3|junior/.test(s)) return 3;
    if (/\b4\s*th\b|^iv\b|fourth|year\s*4|senior/.test(s)) return 4;
    const n = parseInt(digits, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= 4) return n;
    return null;
}

/** Admin CGPA groups (must match admin-dashboard groupLabels) */
const CGPA_GROUP_RANGES = {
    excellent: { min: 8.5, max: 10 },
    good: { min: 7.0, max: 8.49 },
    developing: { min: 5.5, max: 6.99 },
    struggling: { min: 0, max: 5.49 }
};

async function enrollStudentsForAssignment(assignmentId, branch, yearNum) {
    const [students] = await pool.query(
        'SELECT Student_ID, Year, Branch FROM students WHERE Branch = ?',
        [branch]
    );
    const ids = (students || [])
        .filter((s) => parseStudentYearToInt(s.Year) === yearNum)
        .map((s) => s.Student_ID);
    if (ids.length === 0) return { enrolled: 0 };
    const rows = ids.map((id) => [assignmentId, id, 'enrolled']);
    await pool.query(
        'INSERT IGNORE INTO assignment_enrollments (assignment_id, Student_ID, status) VALUES ?',
        [rows]
    );
    return { enrolled: ids.length };
}

async function enrollStudentsByCgpaRange(assignmentId, minCgpa, maxCgpa) {
    const [students] = await pool.query(
        'SELECT Student_ID FROM students WHERE CGPA IS NOT NULL AND CGPA >= ? AND CGPA <= ?',
        [minCgpa, maxCgpa]
    );
    const ids = (students || []).map((s) => s.Student_ID);
    if (ids.length === 0) return { enrolled: 0 };
    const rows = ids.map((id) => [assignmentId, id, 'enrolled']);
    await pool.query(
        'INSERT IGNORE INTO assignment_enrollments (assignment_id, Student_ID, status) VALUES ?',
        [rows]
    );
    return { enrolled: ids.length };
}

// GET /api/assignments/workshops-for-student?student_id=
router.get('/workshops-for-student', async (req, res) => {
    try {
        const Student_ID = req.query.student_id || req.query.Student_ID;
        if (!Student_ID) {
            return res.status(400).json({ error: 'student_id is required' });
        }
        const [rows] = await pool.query(
            `
            SELECT ae.assignment_id, ae.enrolled_at, ae.status, a.*, f.Name AS facultyName
            FROM assignment_enrollments ae
            JOIN assignments a ON ae.assignment_id = a.id
            LEFT JOIN faculty f ON a.facultyId = f.Faculty_ID
            WHERE ae.Student_ID = ? AND a.assignment_kind = 'workshop'
            ORDER BY ae.enrolled_at DESC
            `,
            [Student_ID]
        );
        return res.json({ success: true, workshops: rows });
    } catch (err) {
        console.error('workshops-for-student:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// POST /api/assignments/workshop-by-cgpa
router.post('/workshop-by-cgpa', async (req, res) => {
    const { title, description, dueDate, group, workshopName, adminId } = req.body || {};
    if (!title || !group || !adminId) {
        return res.status(400).json({ error: 'Missing required fields (title, group, adminId)' });
    }
    const range = CGPA_GROUP_RANGES[group];
    if (!range) {
        return res.status(400).json({ error: 'Invalid CGPA group' });
    }
    try {
        const [result] = await pool.query(
            `INSERT INTO assignments (
                title, description, dueDate, facultyId, branch, year,
                assignment_kind, admin_id, cgpa_group, workshop_name
            ) VALUES (?, ?, ?, 'ADMIN', 'ALL', 0, 'workshop', ?, ?, ?)`,
            [
                title,
                description || null,
                dueDate || null,
                adminId,
                group,
                workshopName || title
            ]
        );
        const assignmentId = result.insertId;
        await enrollStudentsByCgpaRange(assignmentId, range.min, range.max);
        const [rows] = await pool.query('SELECT * FROM assignments WHERE id = ?', [assignmentId]);
        res.json({ success: true, assignment: rows[0], enrolled: true });
    } catch (err) {
        console.error('workshop-by-cgpa:', err);
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});

// Create assignment (faculty)
router.post('/', async (req, res) => {
    const { title, description, dueDate, facultyId, branch, year } = req.body;
    if (!title || !facultyId || !branch || !year) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    const yearNum = parseInt(String(year).replace(/\D/g, ''), 10);
    if (Number.isNaN(yearNum) || yearNum < 1 || yearNum > 4) {
        return res.status(400).json({ error: 'Year must be between 1 and 4' });
    }
    try {
        const [result] = await pool.query(
            `INSERT INTO assignments (title, description, dueDate, facultyId, branch, year, assignment_kind)
             VALUES (?, ?, ?, ?, ?, ?, 'assignment')`,
            [title, description, dueDate, facultyId, branch, yearNum]
        );
        const assignmentId = result.insertId;
        await enrollStudentsForAssignment(assignmentId, branch, yearNum);
        const [rows] = await pool.query('SELECT * FROM assignments WHERE id = ?', [assignmentId]);
        res.json({ success: true, assignment: rows[0] });
    } catch (err) {
        console.error('Error creating assignment:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// List assignments: facultyId | adminId | branch+year | student enrollments
router.get('/', async (req, res) => {
    try {
        const facultyId = req.query.facultyId;
        const adminId = req.query.adminId;
        const student_id = req.query.student_id || req.query.Student_ID;
        const branch = req.query.branch;
        const year = req.query.year;

        if (facultyId != null && String(facultyId).trim() !== '') {
            const [rows] = await pool.query(
                `SELECT a.*, f.Name AS facultyName
                 FROM assignments a
                 LEFT JOIN faculty f ON a.facultyId = f.Faculty_ID
                 WHERE a.facultyId = ?
                   AND (a.assignment_kind IS NULL OR a.assignment_kind = '' OR a.assignment_kind = 'assignment')
                 ORDER BY a.id DESC`,
                [facultyId]
            );
            return res.json({ success: true, assignments: rows });
        }

        if (adminId != null && String(adminId).trim() !== '') {
            const [rows] = await pool.query(
                `SELECT a.* FROM assignments a
                 WHERE a.admin_id = ? AND a.assignment_kind = 'workshop'
                 ORDER BY a.id DESC`,
                [adminId]
            );
            return res.json({ success: true, assignments: rows });
        }

        if (branch != null && String(branch).trim() !== '') {
            const params = [branch];
            let sql = `
                SELECT a.*, f.Name AS facultyName
                FROM assignments a
                LEFT JOIN faculty f ON a.facultyId = f.Faculty_ID
                WHERE a.branch = ?
                  AND (a.assignment_kind IS NULL OR a.assignment_kind = '' OR a.assignment_kind = 'assignment')
            `;
            if (year != null && String(year).trim() !== '') {
                const yNum = parseInt(String(year).replace(/\D/g, ''), 10);
                if (!Number.isNaN(yNum)) {
                    sql += ' AND (a.year = ? OR CAST(a.year AS CHAR) = ? OR a.year = ?)';
                    params.push(yNum, String(year), String(yNum));
                }
            }
            sql += ' ORDER BY a.id DESC';
            const [rows] = await pool.query(sql, params);
            return res.json({ success: true, assignments: rows });
        }

        if (!student_id) {
            return res.status(400).json({ error: 'branch, facultyId, adminId, or student_id is required' });
        }

        const [rows] = await pool.query(
            `
            SELECT
                ae.assignment_id,
                ae.enrolled_at,
                ae.status,
                a.*,
                f.Name as facultyName
            FROM assignment_enrollments ae
            JOIN assignments a ON ae.assignment_id = a.id
            LEFT JOIN faculty f ON a.facultyId = f.Faculty_ID
            WHERE ae.Student_ID = ?
            ORDER BY ae.enrolled_at DESC
            `,
            [student_id]
        );

        return res.json({ success: true, enrollments: rows });
    } catch (err) {
        console.error('Error fetching assignments:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

router.post('/:id/enroll', async (req, res) => {
    try {
        const assignment_id = parseInt(req.params.id, 10);
        const Student_ID = req.body.Student_ID || req.body.student_id;
        if (!assignment_id || !Student_ID) {
            return res.status(400).json({ error: 'Missing assignment_id or Student_ID' });
        }

        await pool.query(
            'INSERT INTO assignment_enrollments (assignment_id, Student_ID, status) VALUES (?, ?, ?)',
            [assignment_id, Student_ID, 'enrolled']
        );
        res.json({ success: true, message: 'Enrolled successfully' });
    } catch (err) {
        if (String(err && err.code).includes('ER_DUP_ENTRY')) {
            return res.status(409).json({ error: 'Already enrolled' });
        }
        console.error('Error enrolling:', err);
        res.status(500).json({ error: 'Database error', details: err && err.message });
    }
});

router.get('/enrolled', async (req, res) => {
    try {
        const Student_ID = req.query.Student_ID || req.query.student_id;
        if (!Student_ID) return res.status(400).json({ error: 'student_id is required' });

        const [rows] = await pool.query(
            `
            SELECT
                ae.assignment_id,
                ae.enrolled_at,
                ae.status,
                a.*,
                f.Name as facultyName
            FROM assignment_enrollments ae
            JOIN assignments a ON ae.assignment_id = a.id
            LEFT JOIN faculty f ON a.facultyId = f.Faculty_ID
            WHERE ae.Student_ID = ?
            ORDER BY ae.enrolled_at DESC
            `,
            [Student_ID]
        );

        res.json({ success: true, enrollments: rows });
    } catch (err) {
        console.error('Error fetching enrollments:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

router.post('/:id/submit', async (req, res) => {
    const assignment_id = parseInt(req.params.id);
    const Student_ID = req.body.Student_ID || req.body.student_id;
    const { file_path, submission_text } = req.body;
    if (!assignment_id || !Student_ID) {
        return res.status(400).json({ error: 'Missing assignment_id or Student_ID' });
    }
    try {
        const [existing] = await pool.query(
            'SELECT * FROM assignment_submissions WHERE assignment_id = ? AND Student_ID = ?',
            [assignment_id, Student_ID]
        );
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Already submitted' });
        }
        const [result] = await pool.query(
            'INSERT INTO assignment_submissions (assignment_id, Student_ID, file_path, submission_text) VALUES (?, ?, ?, ?)',
            [assignment_id, Student_ID, file_path || null, submission_text || null]
        );
        res.json({ success: true, submission_id: result.insertId });
    } catch (err) {
        console.error('Error submitting assignment:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

router.post('/:id/submit-upload', upload.single('assessmentFile'), async (req, res) => {
    const assignment_id = parseInt(req.params.id, 10);
    const Student_ID = req.body.Student_ID || req.body.student_id;
    const { submission_text } = req.body;

    if (!assignment_id || !Student_ID) {
        return res.status(400).json({ error: 'Missing assignment_id or student_id' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const file_path = req.file ? `${baseUrl}/uploads/assignment_submissions/${req.file.filename}` : null;

    try {
        const [existing] = await pool.query(
            'SELECT * FROM assignment_submissions WHERE assignment_id = ? AND Student_ID = ?',
            [assignment_id, Student_ID]
        );
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Already submitted' });
        }

        const [result] = await pool.query(
            'INSERT INTO assignment_submissions (assignment_id, Student_ID, file_path, submission_text) VALUES (?, ?, ?, ?)',
            [assignment_id, Student_ID, file_path, submission_text || null]
        );

        res.json({ success: true, submission_id: result.insertId });
    } catch (err) {
        console.error('Error submitting assignment upload:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/:id/submissions', async (req, res) => {
    const assignment_id = parseInt(req.params.id, 10);
    if (!assignment_id) {
        return res.status(400).json({ error: 'Missing assignment_id' });
    }
    try {
        const [rows] = await pool.query(
            `SELECT
                sub.submission_id,
                sub.assignment_id,
                sub.Student_ID,
                sub.file_path,
                sub.submission_text,
                sub.submission_date,
                sub.marks_obtained,
                sub.feedback,
                sub.graded_by,
                sub.graded_date,
                sub.status AS submission_status,
                s.Name AS student_name,
                s.Email AS student_email,
                s.Branch AS student_branch,
                s.Year AS student_year,
                s.CGPA AS student_cgpa
             FROM assignment_submissions sub
             JOIN students s ON sub.Student_ID = s.Student_ID
             WHERE sub.assignment_id = ?`,
            [assignment_id]
        );
        const submissions = rows.map((row) => ({
            submission_id: row.submission_id,
            assignment_id: row.assignment_id,
            Student_ID: row.Student_ID,
            student_name: row.student_name,
            student_email: row.student_email,
            branch: row.student_branch,
            year: row.student_year,
            cgpa: row.student_cgpa,
            file_path: row.file_path,
            submission_text: row.submission_text,
            submission_date: row.submission_date,
            marks_obtained: row.marks_obtained,
            feedback: row.feedback,
            graded_by: row.graded_by,
            graded_date: row.graded_date,
            status: row.submission_status
        }));
        res.json({ success: true, submissions });
    } catch (err) {
        console.error('Error fetching submissions:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
