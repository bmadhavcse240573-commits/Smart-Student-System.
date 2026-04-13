const express = require('express');
const router = express.Router();
const StudentAnalyzer = require('../ai/analyzer');
const pool = require('../config/database');
const jwt = require('jsonwebtoken');

const analyzer = new StudentAnalyzer();

// Middleware for token verification
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) {
        return res.status(401).json({ error: 'Missing token' });
    }

    const actualToken = token.replace('Bearer ', '');
    try {
        req.user = jwt.verify(actualToken, process.env.JWT_SECRET || 'secret');
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

function normalizeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function getRequesterId(req) {
    const payload = req.user || {};
    return payload.id || payload.user_id || payload.userId || null;
}

function getRequesterType(req) {
    const payload = req.user || {};
    return payload.user_type || payload.userType || payload.role || null;
}

function getRiskBand({ placementProbability, attendance, gpa }) {
    const placement = normalizeNumber(placementProbability, 0);
    const att = normalizeNumber(attendance, 0);
    const g = normalizeNumber(gpa, 0);
    if (placement < 45 || att < 70 || g < 2.5) return 'HIGH';
    if (placement < 70 || att < 80 || g < 3.2) return 'MEDIUM';
    return 'LOW';
}

function getPredictionLabel(placementProbability) {
    const p = normalizeNumber(placementProbability, 0);
    if (p < 50) return 'Likely to FAIL';
    if (p < 70) return 'Borderline PASS';
    return 'Likely to PASS';
}

async function buildStudentAiContext(studentId) {
    const student = await analyzer.fetchStudentFromDB(studentId);
    if (!student) return null;

    const analysis = await analyzer.analyzeStudent(student);
    if (!analysis) return null;

    const recommendations = analyzer.getRecommendations(analysis);
    const risk = getRiskBand(analysis);
    const prediction = getPredictionLabel(analysis.placementProbability);
    const confidence = Math.max(55, Math.min(97, Math.round(normalizeNumber(analysis.performanceScore, 0))));

    return {
        student,
        analysis,
        recommendations,
        risk,
        prediction,
        confidence
    };
}

async function fetchStudentTrend(studentId) {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query(
            `SELECT semester,
                    AVG((marks_obtained / NULLIF(max_marks, 0)) * 100) AS avg_percentage
             FROM student_results
             WHERE Student_ID = ?
             GROUP BY semester
             ORDER BY semester ASC`,
            [studentId]
        );

        const series = (rows || [])
            .map((r) => ({
                semester: Number(r.semester),
                average: Number((normalizeNumber(r.avg_percentage, 0)).toFixed(1))
            }))
            .filter((r) => Number.isFinite(r.semester));

        if (series.length < 2) {
            return {
                direction: 'stable',
                delta: 0,
                text: 'Insufficient semester-wise marks data for trend analysis.',
                series
            };
        }

        const delta = Number((series[series.length - 1].average - series[0].average).toFixed(1));
        const direction = delta > 0 ? 'improving' : (delta < 0 ? 'declining' : 'stable');
        const text = delta > 0
            ? `Marks improved by ${Math.abs(delta).toFixed(1)}% from Semester ${series[0].semester} to Semester ${series[series.length - 1].semester}.`
            : delta < 0
                ? `Marks declined by ${Math.abs(delta).toFixed(1)}% from Semester ${series[0].semester} to Semester ${series[series.length - 1].semester}.`
                : 'Marks are stable across recent semesters.';

        return { direction, delta, text, series };
    } catch (_error) {
        return {
            direction: 'stable',
            delta: 0,
            text: 'Trend data unavailable right now.',
            series: []
        };
    } finally {
        if (connection) connection.release();
    }
}

async function fetchStudentAttendancePattern(studentId) {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query(
            `SELECT Date, Status
             FROM attendance
             WHERE Student_ID = ?
             ORDER BY Date DESC
             LIMIT 180`,
            [studentId]
        );

        const records = Array.isArray(rows) ? rows : [];
        if (!records.length) {
            return {
                pattern: 'unknown',
                weakestDay: null,
                presentRate: null,
                text: 'Attendance pattern data unavailable.'
            };
        }

        const dayMap = { Sun: { present: 0, total: 0 }, Mon: { present: 0, total: 0 }, Tue: { present: 0, total: 0 }, Wed: { present: 0, total: 0 }, Thu: { present: 0, total: 0 }, Fri: { present: 0, total: 0 }, Sat: { present: 0, total: 0 } };
        let presentCount = 0;

        records.forEach((r) => {
            const d = new Date(r.Date);
            if (Number.isNaN(d.getTime())) return;
            const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
            if (!dayMap[day]) return;
            dayMap[day].total += 1;
            const status = String(r.Status || '').toLowerCase();
            const present = status === 'present' || status === 'p';
            if (present) {
                dayMap[day].present += 1;
                presentCount += 1;
            }
        });

        const weekdayStats = Object.entries(dayMap)
            .filter(([k]) => k !== 'Sun')
            .map(([day, counts]) => {
                const rate = counts.total ? (counts.present / counts.total) * 100 : 100;
                return { day, rate: Number(rate.toFixed(1)), total: counts.total };
            })
            .filter((x) => x.total > 0);

        if (!weekdayStats.length) {
            return {
                pattern: 'unknown',
                weakestDay: null,
                presentRate: null,
                text: 'Attendance pattern data unavailable.'
            };
        }

        const weakest = [...weekdayStats].sort((a, b) => a.rate - b.rate)[0];
        const presentRate = Number(((presentCount / records.length) * 100).toFixed(1));
        const pattern = presentRate < 75 ? 'irregular' : presentRate < 85 ? 'moderate' : 'healthy';

        return {
            pattern,
            weakestDay: weakest.day,
            presentRate,
            text: `Irregularity is highest on ${weakest.day}s (${weakest.rate}% present). Overall present rate is ${presentRate}%.`,
            byDay: weekdayStats
        };
    } catch (_error) {
        return {
            pattern: 'unknown',
            weakestDay: null,
            presentRate: null,
            text: 'Attendance pattern data unavailable.'
        };
    } finally {
        if (connection) connection.release();
    }
}

async function fetchStudentsForFaculty(facultyId) {
    let connection;
    try {
        connection = await pool.getConnection();

        const [sectionStudents] = await connection.query(
            `SELECT DISTINCT st.*
             FROM section_faculty sf
             JOIN section_students ss ON sf.Section_ID = ss.Section_ID
             JOIN students st ON ss.Student_ID = st.Student_ID
             WHERE sf.Faculty_ID = ?`,
            [facultyId]
        );

        if (sectionStudents && sectionStudents.length) {
            return sectionStudents;
        }

        let [facultyRows] = await connection.query('SELECT Branch FROM faculty WHERE Faculty_ID = ? LIMIT 1', [facultyId]);
        if (!facultyRows.length) {
            [facultyRows] = await connection.query('SELECT DISTINCT Branch FROM faculty LIMIT 1');
        }

        if (facultyRows.length) {
            const [branchStudents] = await connection.query('SELECT * FROM students WHERE Branch = ? LIMIT 500', [facultyRows[0].Branch]);
            return branchStudents || [];
        }

        const [fallbackStudents] = await connection.query('SELECT * FROM students LIMIT 500');
        return fallbackStudents || [];
    } catch (_error) {
        return [];
    } finally {
        if (connection) connection.release();
    }
}

function normalizeYearKey(yearValue) {
    const s = String(yearValue || '').toLowerCase();
    if (!s) return null;
    if (s.includes('1') || s.includes('first')) return 1;
    if (s.includes('2') || s.includes('second')) return 2;
    if (s.includes('3') || s.includes('third')) return 3;
    if (s.includes('4') || s.includes('fourth')) return 4;
    return null;
}

function classifyRiskFromStudent(student) {
    const cgpa = normalizeNumber(student.CGPA, 0);
    const attendance = normalizeNumber(student.Attendance_Percentage, 0);
    if (cgpa < 6.5 || attendance < 70) return 'high';
    if (cgpa < 8 || attendance < 80) return 'medium';
    return 'low';
}

async function buildFacultySummary(facultyId, filters = {}) {
    const students = await fetchStudentsForFaculty(facultyId);
    let filtered = [...students];

    if (filters.year && filters.year !== 'all') {
        const wanted = Number(filters.year);
        filtered = filtered.filter((s) => normalizeYearKey(s.Year) === wanted);
    }

    if (filters.risk && filters.risk !== 'all') {
        filtered = filtered.filter((s) => classifyRiskFromStudent(s) === filters.risk);
    }

    const total = filtered.length;
    const avgCgpa = total ? filtered.reduce((sum, s) => sum + normalizeNumber(s.CGPA, 0), 0) / total : 0;
    const avgAttendance = total ? filtered.reduce((sum, s) => sum + normalizeNumber(s.Attendance_Percentage, 0), 0) / total : 0;

    const highRisk = filtered.filter((s) => classifyRiskFromStudent(s) === 'high').length;
    const mediumRisk = filtered.filter((s) => classifyRiskFromStudent(s) === 'medium').length;
    const lowRisk = Math.max(0, total - highRisk - mediumRisk);

    const likelyFail = filtered.filter((s) => normalizeNumber(s.CGPA, 0) < 6.5 || normalizeNumber(s.Attendance_Percentage, 0) < 70).length;
    const likelyPass = Math.max(0, total - likelyFail);
    const confidence = total ? Math.round((likelyPass / total) * 100) : 0;

    const yearBuckets = { 1: [], 2: [], 3: [], 4: [] };
    filtered.forEach((s) => {
        const y = normalizeYearKey(s.Year);
        if (y && yearBuckets[y]) yearBuckets[y].push(normalizeNumber(s.CGPA, 0));
    });

    const yearSeries = Object.entries(yearBuckets)
        .filter(([, vals]) => vals.length)
        .map(([year, vals]) => ({
            year: Number(year),
            avgCgpa: Number((vals.reduce((a, n) => a + n, 0) / vals.length).toFixed(2))
        }))
        .sort((a, b) => a.year - b.year);

    let trendText = 'Insufficient year-wise data for trend analysis.';
    if (yearSeries.length >= 2) {
        const delta = Number((yearSeries[yearSeries.length - 1].avgCgpa - yearSeries[0].avgCgpa).toFixed(2));
        trendText = delta >= 0
            ? `CGPA trend improved by ${delta.toFixed(2)} points from Year ${yearSeries[0].year} to Year ${yearSeries[yearSeries.length - 1].year}.`
            : `CGPA trend dropped by ${Math.abs(delta).toFixed(2)} points from Year ${yearSeries[0].year} to Year ${yearSeries[yearSeries.length - 1].year}.`;
    }

    let attendancePatternText;
    if (avgAttendance < 75) {
        attendancePatternText = `Attendance trend is weak (${avgAttendance.toFixed(1)}%). Consider reminder and mentoring nudges.`;
    } else if (avgAttendance < 85) {
        attendancePatternText = `Attendance is moderate (${avgAttendance.toFixed(1)}%). Target a 5% lift for medium-risk students.`;
    } else {
        attendancePatternText = `Attendance pattern is healthy (${avgAttendance.toFixed(1)}%). Sustain engagement with advanced workshops.`;
    }

    const reportText = `Class summary: ${total} students analyzed. ${likelyPass} likely to pass and ${likelyFail} likely to fail based on attendance and CGPA signals. ${trendText} High-risk students currently: ${highRisk}.`;

    const excellentAttendance = filtered.filter((s) => normalizeNumber(s.Attendance_Percentage, 0) >= 90).length;
    const goodAttendance = filtered.filter((s) => normalizeNumber(s.Attendance_Percentage, 0) >= 75 && normalizeNumber(s.Attendance_Percentage, 0) < 90).length;
    const needsImprovement = filtered.filter((s) => normalizeNumber(s.Attendance_Percentage, 0) < 75).length;

    return {
        total,
        avgCgpa: Number(avgCgpa.toFixed(2)),
        avgAttendance: Number(avgAttendance.toFixed(1)),
        risk: { high: highRisk, medium: mediumRisk, low: lowRisk },
        prediction: {
            likelyPass,
            likelyFail,
            confidence,
            text: `Likely PASS ${likelyPass}, Likely FAIL ${likelyFail}`
        },
        trend: {
            text: trendText,
            yearSeries
        },
        attendancePattern: {
            text: attendancePatternText
        },
        report: {
            text: reportText
        },
        attendanceStats: {
            excellentAttendance,
            goodAttendance,
            needsImprovement
        }
    };
}

// GET /api/ai/profile - Get student's detailed AI analysis with ML-based recommendations
router.get('/profile', verifyToken, async (req, res) => {
    try {
        let studentId = req.query.studentId || req.body.studentId;
        if (!studentId) {
            const raw = req.headers['authorization'] || req.headers['Authorization'] || '';
            const actualToken = raw.replace(/^Bearer\s+/i, '');
            try {
                const payload = jwt.verify(actualToken, process.env.JWT_SECRET || 'secret');
                studentId = payload.id || payload.user_id || payload.userId;
            } catch (_) {
                studentId = null;
            }
        }

        if (!studentId) {
            return res.status(400).json({ error: 'Student ID is required' });
        }

        // Fetch student from real database
        const student = await analyzer.fetchStudentFromDB(studentId);
        
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Fetch all students for comparison
        const allStudents = await analyzer.fetchAllStudentsFromDB();
        
        // Analyze the student
        const analysis = await analyzer.analyzeStudent(student);
        if (!analysis) {
            return res.status(500).json({ error: 'Could not analyze student data' });
        }
        const recommendations = analyzer.getRecommendations(analysis);
        
        // Find similar students for peer comparison
        const similarStudents = await analyzer.findSimilarStudents(studentId, allStudents, 5);
        const similarAnalyzed = await Promise.all(
            similarStudents.map(s => analyzer.analyzeStudent(s))
        );

        res.json({
            success: true,
            student: analysis,
            recommendations: recommendations,
            peerComparison: {
                count: similarAnalyzed.length,
                averagePerformance: (similarAnalyzed.reduce((sum, s) => sum + s.performanceScore, 0) / similarAnalyzed.length).toFixed(1),
                peers: similarAnalyzed.map(s => ({
                    name: s.Name,
                    cgpa: s.CGPA,
                    performanceScore: s.performanceScore,
                    division: s.division
                }))
            }
        });
    } catch (error) {
        console.error('Error in /api/ai/profile:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/ai/divisions - Get all students grouped by division with ML clustering
router.get('/divisions', verifyToken, async (req, res) => {
    try {
        // Fetch all students from database
        const students = await analyzer.fetchAllStudentsFromDB();
        
        if (!students || students.length === 0) {
            return res.json({
                success: true,
                totalStudents: 0,
                divisions: {
                    A: { count: 0, percentage: 0, students: [], avgPerformance: 0 },
                    B: { count: 0, percentage: 0, students: [], avgPerformance: 0 },
                    C: { count: 0, percentage: 0, students: [], avgPerformance: 0 }
                }
            });
        }

        const { analyzed, summary } = await analyzer.analyzeAllStudents(students);
        
        res.json({
            success: true,
            ...summary
        });
    } catch (error) {
        console.error('Error in /api/ai/divisions:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/ai/skills - Get skills distribution and recommendations across students
router.get('/skills', verifyToken, async (req, res) => {
    try {
        const students = await analyzer.fetchAllStudentsFromDB();
        
        if (!students || students.length === 0) {
            return res.json({ success: true, skillsCount: 0, topSkills: [], skillsByPerformance: {} });
        }

        const { analyzed } = await analyzer.analyzeAllStudents(students);
        
        const skillsMap = {};
        const skillsByPerformance = {
            'excellent': {},
            'good': {},
            'developing': {},
            'struggling': {}
        };

        analyzed.forEach(student => {
            student.skills.forEach(skill => {
                if (!skillsMap[skill.name]) {
                    skillsMap[skill.name] = 0;
                }
                skillsMap[skill.name]++;
                
                const level = student.performanceLevel;
                if (!skillsByPerformance[level][skill.name]) {
                    skillsByPerformance[level][skill.name] = 0;
                }
                skillsByPerformance[level][skill.name]++;
            });
        });

        const topSkills = Object.entries(skillsMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15)
            .map(([name, count]) => ({
                name,
                count,
                percentage: ((count / analyzed.length) * 100).toFixed(1)
            }));

        res.json({
            success: true,
            skillsCount: Object.keys(skillsMap).length,
            totalStudents: analyzed.length,
            topSkills: topSkills,
            skillsByPerformance: skillsByPerformance,
            recommendations: {
                'excellent': 'Focus on advanced and specialized skills',
                'good': 'Maintain and deepen current skills',
                'developing': 'Build foundation and core skills',
                'struggling': 'Focus on fundamentals and core competencies'
            }
        });
    } catch (error) {
        console.error('Error in /api/ai/skills:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/ai/workshops - Get recommended workshops based on performance analytics
router.get('/workshops', verifyToken, async (req, res) => {
    try {
        const students = await analyzer.fetchAllStudentsFromDB();
        
        if (!students || students.length === 0) {
            return res.json({ success: true, workshops: [], recommendations: [] });
        }

        const { analyzed } = await analyzer.analyzeAllStudents(students);
        
        const workshopsMap = {};
        const workshopsByLevel = {
            'excellent': {},
            'good': {},
            'developing': {},
            'struggling': {}
        };

        analyzed.forEach(student => {
            student.workshops.forEach(workshop => {
                if (!workshopsMap[workshop.name]) {
                    workshopsMap[workshop.name] = 0;
                }
                workshopsMap[workshop.name]++;
                
                const level = student.performanceLevel;
                if (!workshopsByLevel[level][workshop.name]) {
                    workshopsByLevel[level][workshop.name] = 0;
                }
                workshopsByLevel[level][workshop.name]++;
            });
        });

        const topWorkshops = Object.entries(workshopsMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count]) => ({
                name,
                count,
                enrollmentPercentage: ((count / analyzed.length) * 100).toFixed(1)
            }));

        res.json({
            success: true,
            totalWorkshopsRecommended: Object.keys(workshopsMap).length,
            topWorkshops: topWorkshops,
            workshopsByPerformanceLevel: workshopsByLevel,
            insights: {
                'excellent': 'High performers focus on advanced technical workshops',
                'good': 'Good performers balance technical and soft skills training',
                'developing': 'Developing students focus on foundational skills',
                'struggling': 'Struggling students need remedial and motivation workshops'
            }
        });
    } catch (error) {
        console.error('Error in /api/ai/workshops:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/ai/attendance - Get attendance analytics and patterns
router.get('/attendance', verifyToken, async (req, res) => {
    try {
        const students = await analyzer.fetchAllStudentsFromDB();
        
        if (!students || students.length === 0) {
            return res.json({
                success: true,
                averageAttendance: 0,
                attendanceData: [],
                insights: {}
            });
        }

        const { analyzed } = await analyzer.analyzeAllStudents(students);
        
        const attendanceData = analyzed
            .map(s => ({
                name: s.Name,
                studentId: s.Student_ID,
                attendance: s.Attendance_Percentage,
                cgpa: s.CGPA,
                division: s.division
            }))
            .sort((a, b) => b.attendance - a.attendance);

        const avg = analyzed.reduce((sum, s) => sum + s.Attendance_Percentage, 0) / analyzed.length;
        const excellentAttendance = analyzed.filter(s => s.Attendance_Percentage >= 90).length;
        const poorAttendance = analyzed.filter(s => s.Attendance_Percentage < 75).length;

        const attendanceVsCGPA = {
            excellent: analyzed.filter(s => s.Attendance_Percentage >= 90).reduce((sum, s) => sum + s.CGPA, 0) / Math.max(1, excellentAttendance),
            good: analyzed.filter(s => s.Attendance_Percentage >= 75 && s.Attendance_Percentage < 90).reduce((sum, s) => sum + s.CGPA, 0) / Math.max(1, analyzed.filter(s => s.Attendance_Percentage >= 75 && s.Attendance_Percentage < 90).length),
            poor: analyzed.filter(s => s.Attendance_Percentage < 75).reduce((sum, s) => sum + s.CGPA, 0) / Math.max(1, poorAttendance)
        };

        res.json({
            success: true,
            averageAttendance: parseFloat(avg.toFixed(1)),
            attendanceData: attendanceData.slice(0, 50),
            statistics: {
                excellentAttendance: excellentAttendance,
                goodAttendance: analyzed.filter(s => s.Attendance_Percentage >= 75 && s.Attendance_Percentage < 90).length,
                poorAttendance: poorAttendance,
                averageByDivision: {
                    A: analyzed.filter(s => s.division === 'A').reduce((sum, s) => sum + s.Attendance_Percentage, 0) / Math.max(1, analyzed.filter(s => s.division === 'A').length),
                    B: analyzed.filter(s => s.division === 'B').reduce((sum, s) => sum + s.Attendance_Percentage, 0) / Math.max(1, analyzed.filter(s => s.division === 'B').length),
                    C: analyzed.filter(s => s.division === 'C').reduce((sum, s) => sum + s.Attendance_Percentage, 0) / Math.max(1, analyzed.filter(s => s.division === 'C').length)
                }
            },
            insights: {
                avgCGPAByAttendance: attendanceVsCGPA,
                recommendation: 'Students with >90% attendance have significantly higher CGPA. Monitoring and improving attendance is critical.'
            }
        });
    } catch (error) {
        console.error('Error in /api/ai/attendance:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/ai/placement-analysis - Predict placement probabilities
router.get('/placement-analysis', verifyToken, async (req, res) => {
    try {
        const students = await analyzer.fetchAllStudentsFromDB();
        
        if (!students || students.length === 0) {
            return res.json({
                success: true,
                placementStats: {},
                topCandidates: [],
                atRiskCandidates: []
            });
        }

        const { analyzed, summary } = await analyzer.analyzeAllStudents(students);
        
        const topCandidates = analyzed
            .filter(s => s.placementProbability >= 70)
            .sort((a, b) => b.placementProbability - a.placementProbability)
            .slice(0, 10)
            .map(s => ({
                name: s.Name,
                studentId: s.Student_ID,
                cgpa: s.CGPA,
                placementProbability: s.placementProbability,
                division: s.division
            }));

        const atRiskCandidates = analyzed
            .filter(s => s.placementProbability < 50)
            .sort((a, b) => a.placementProbability - b.placementProbability)
            .slice(0, 10)
            .map(s => ({
                name: s.Name,
                studentId: s.Student_ID,
                cgpa: s.CGPA,
                placementProbability: s.placementProbability,
                backlogs: s.Backlogs,
                recommendations: analyzer.getRecommendations(s).slice(0, 3)
            }));

        res.json({
            success: true,
            placementStats: summary.placementStats,
            topCandidates: topCandidates,
            atRiskCandidates: atRiskCandidates,
            advice: {
                improve: 'For at-risk students: focus on attendance, CGPA improvement, and clearing backlogs',
                maintain: 'For top candidates: maintain performance and pursue internships',
                upskill: 'All students should complete recommended workshops'
            }
        });
    } catch (error) {
        console.error('Error in /api/ai/placement-analysis:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/ai/predict - Personalized prediction summary for a student
router.get('/predict', verifyToken, async (req, res) => {
    try {
        const requestedId = req.query.studentId;
        const requesterType = getRequesterType(req);
        const requesterId = getRequesterId(req);
        const studentId = requestedId || requesterId;

        if (!studentId) {
            return res.status(400).json({ success: false, error: 'Student ID is required' });
        }

        if (requesterType === 'student' && requestedId && requestedId !== requesterId) {
            return res.status(403).json({ success: false, error: 'You can only access your own prediction' });
        }

        const ctx = await buildStudentAiContext(studentId);
        if (!ctx) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }

        return res.json({
            success: true,
            studentId,
            prediction: ctx.prediction,
            confidence: ctx.confidence,
            placementProbability: normalizeNumber(ctx.analysis.placementProbability, 0),
            performanceScore: normalizeNumber(ctx.analysis.performanceScore, 0)
        });
    } catch (error) {
        console.error('Error in /api/ai/predict:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/ai/risk - Personalized risk diagnostics for a student
router.get('/risk', verifyToken, async (req, res) => {
    try {
        const requestedId = req.query.studentId;
        const requesterType = getRequesterType(req);
        const requesterId = getRequesterId(req);
        const studentId = requestedId || requesterId;

        if (!studentId) {
            return res.status(400).json({ success: false, error: 'Student ID is required' });
        }

        if (requesterType === 'student' && requestedId && requestedId !== requesterId) {
            return res.status(403).json({ success: false, error: 'You can only access your own risk profile' });
        }

        const ctx = await buildStudentAiContext(studentId);
        if (!ctx) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }

        const reasons = [];
        if (ctx.analysis.attendance < 70) reasons.push(`Low attendance (${ctx.analysis.attendance}%)`);
        if (ctx.analysis.gpa < 2.5) reasons.push(`Low GPA (${ctx.analysis.gpa})`);
        if (ctx.analysis.placementProbability < 45) reasons.push(`Low placement signal (${ctx.analysis.placementProbability}%)`);
        if (!reasons.length) reasons.push('No critical risk signals detected.');

        return res.json({
            success: true,
            studentId,
            risk: ctx.risk,
            reasons,
            attendance: ctx.analysis.attendance,
            gpa: ctx.analysis.gpa,
            placementProbability: ctx.analysis.placementProbability
        });
    } catch (error) {
        console.error('Error in /api/ai/risk:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/ai/trend - Semester trend analytics for a student
router.get('/trend', verifyToken, async (req, res) => {
    try {
        const requestedId = req.query.studentId;
        const requesterType = getRequesterType(req);
        const requesterId = getRequesterId(req);
        const studentId = requestedId || requesterId;

        if (!studentId) {
            return res.status(400).json({ success: false, error: 'Student ID is required' });
        }

        if (requesterType === 'student' && requestedId && requestedId !== requesterId) {
            return res.status(403).json({ success: false, error: 'You can only access your own trend' });
        }

        const trend = await fetchStudentTrend(studentId);
        return res.json({ success: true, studentId, ...trend });
    } catch (error) {
        console.error('Error in /api/ai/trend:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/ai/attendance-pattern - Attendance behavior analysis for a student
router.get('/attendance-pattern', verifyToken, async (req, res) => {
    try {
        const requestedId = req.query.studentId;
        const requesterType = getRequesterType(req);
        const requesterId = getRequesterId(req);
        const studentId = requestedId || requesterId;

        if (!studentId) {
            return res.status(400).json({ success: false, error: 'Student ID is required' });
        }

        if (requesterType === 'student' && requestedId && requestedId !== requesterId) {
            return res.status(403).json({ success: false, error: 'You can only access your own attendance pattern' });
        }

        const pattern = await fetchStudentAttendancePattern(studentId);
        return res.json({ success: true, studentId, ...pattern });
    } catch (error) {
        console.error('Error in /api/ai/attendance-pattern:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/ai/report - Auto-generated AI report for student or faculty scope
router.get('/report', verifyToken, async (req, res) => {
    try {
        const scope = String(req.query.scope || getRequesterType(req) || 'student').toLowerCase();

        if (scope === 'faculty') {
            const facultyId = req.query.facultyId || getRequesterId(req);
            if (!facultyId) {
                return res.status(400).json({ success: false, error: 'Faculty ID is required' });
            }

            const year = req.query.year || 'all';
            const risk = req.query.risk || 'all';
            const summary = await buildFacultySummary(facultyId, { year, risk });
            return res.json({
                success: true,
                scope: 'faculty',
                facultyId,
                report: summary.report.text,
                summary
            });
        }

        const requestedId = req.query.studentId;
        const requesterType = getRequesterType(req);
        const requesterId = getRequesterId(req);
        const studentId = requestedId || requesterId;

        if (!studentId) {
            return res.status(400).json({ success: false, error: 'Student ID is required' });
        }

        if (requesterType === 'student' && requestedId && requestedId !== requesterId) {
            return res.status(403).json({ success: false, error: 'You can only access your own report' });
        }

        const ctx = await buildStudentAiContext(studentId);
        if (!ctx) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }

        const trend = await fetchStudentTrend(studentId);
        const topAction = ctx.recommendations[0]?.action || 'Follow your weekly AI plan';
        const reportText = `${ctx.analysis.Name || 'Student'} shows ${ctx.prediction.toLowerCase()} trajectory. Current attendance is ${ctx.analysis.attendance}%, GPA is ${ctx.analysis.gpa.toFixed(2)}, and performance score is ${ctx.analysis.performanceScore}%. ${trend.text} Recommended focus: ${topAction}.`;

        return res.json({
            success: true,
            scope: 'student',
            studentId,
            report: reportText,
            trend: trend.text,
            risk: ctx.risk,
            prediction: ctx.prediction
        });
    } catch (error) {
        console.error('Error in /api/ai/report:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/ai/faculty-summary - AI class analytics for faculty dashboard
router.get('/faculty-summary', verifyToken, async (req, res) => {
    try {
        const facultyId = req.query.facultyId || getRequesterId(req);
        if (!facultyId) {
            return res.status(400).json({ success: false, error: 'Faculty ID is required' });
        }

        const year = req.query.year || 'all';
        const risk = req.query.risk || 'all';
        const summary = await buildFacultySummary(facultyId, { year, risk });

        return res.json({
            success: true,
            facultyId,
            year,
            risk,
            ...summary,
            excellentAttendance: summary.attendanceStats.excellentAttendance,
            goodAttendance: summary.attendanceStats.goodAttendance,
            needsImprovement: summary.attendanceStats.needsImprovement
        });
    } catch (error) {
        console.error('Error in /api/ai/faculty-summary:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/ai/chat - Context-aware AI chatbot response
router.post('/chat', verifyToken, async (req, res) => {
    try {
        const message = String(req.body?.message || '').trim();
        if (!message) {
            return res.status(400).json({ success: false, error: 'Message is required' });
        }

        const scope = String(req.body?.scope || getRequesterType(req) || 'student').toLowerCase();
        const lower = message.toLowerCase();

        if (scope === 'faculty') {
            const facultyId = req.body?.facultyId || getRequesterId(req);
            const year = req.body?.year || 'all';
            const risk = req.body?.risk || 'all';
            const summary = await buildFacultySummary(facultyId, { year, risk });

            let answer = 'Ask about prediction, risk, attendance, trend, or report.';
            if (lower.includes('risk')) {
                answer = `Current high-risk count: ${summary.risk.high} students.`;
            } else if (lower.includes('predict') || lower.includes('pass') || lower.includes('fail')) {
                answer = `${summary.prediction.text} (confidence ${summary.prediction.confidence}%).`;
            } else if (lower.includes('trend')) {
                answer = summary.trend.text;
            } else if (lower.includes('report')) {
                answer = summary.report.text;
            } else if (lower.includes('attendance')) {
                answer = summary.attendancePattern.text;
            }

            return res.json({ success: true, scope: 'faculty', answer, summary });
        }

        const requestedId = req.body?.studentId;
        const requesterType = getRequesterType(req);
        const requesterId = getRequesterId(req);
        const studentId = requestedId || requesterId;

        if (!studentId) {
            return res.status(400).json({ success: false, error: 'Student ID is required' });
        }

        if (requesterType === 'student' && requestedId && requestedId !== requesterId) {
            return res.status(403).json({ success: false, error: 'You can only access your own AI chat context' });
        }

        const ctx = await buildStudentAiContext(studentId);
        if (!ctx) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }

        const trend = await fetchStudentTrend(studentId);
        const pattern = await fetchStudentAttendancePattern(studentId);
        const topRec = ctx.recommendations.slice(0, 3).map((r) => r.title || r.message || r.action).filter(Boolean);

        let answer = 'Try asking about attendance, marks, risk, prediction, trend, report, or recommendations.';
        if (lower.includes('attendance')) {
            answer = `Your attendance signal is ${ctx.analysis.attendance}%. ${pattern.text}`;
        } else if (lower.includes('risk')) {
            answer = `Current AI risk level: ${ctx.risk}.`;
        } else if (lower.includes('predict') || lower.includes('pass') || lower.includes('fail')) {
            answer = `${ctx.prediction} with confidence ${ctx.confidence}%.`;
        } else if (lower.includes('trend') || lower.includes('improv')) {
            answer = trend.text;
        } else if (lower.includes('report')) {
            const action = ctx.recommendations[0]?.action || 'follow your weekly AI plan';
            answer = `${ctx.analysis.Name || 'Student'} currently has ${ctx.analysis.attendance}% attendance and ${ctx.analysis.gpa.toFixed(2)} GPA. ${trend.text} Recommended focus: ${action}.`;
        } else if (lower.includes('recommend')) {
            answer = topRec.length ? `Top recommendations: ${topRec.join(' | ')}` : 'No recommendation available right now.';
        }

        return res.json({
            success: true,
            scope: 'student',
            answer,
            context: {
                prediction: ctx.prediction,
                confidence: ctx.confidence,
                risk: ctx.risk,
                attendance: ctx.analysis.attendance,
                trend: trend.text
            }
        });
    } catch (error) {
        console.error('Error in /api/ai/chat:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
