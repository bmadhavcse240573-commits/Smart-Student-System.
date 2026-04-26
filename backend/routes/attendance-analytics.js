/**
 * SMART2 Attendance Analytics Module
 * Provides advanced attendance analytics and early warning system
 * Features:
 * - Attendance pattern analysis
 * - Risk prediction for low attendance
 * - Trend analysis
 * - Intervention recommendations
 */

const express = require('express');
const router = express.Router();
const { identity } = require('../middleware/identity');
const db = require('../config/database');

/**
 * GET /api/attendance-analytics/student/:studentId
 * Get comprehensive attendance analytics for a student
 */
router.get('/student/:studentId', identity, async (req, res) => {
  try {
    const { studentId } = req.params;

    // Get attendance summary
    const [attendanceSummary] = await db.query(
      `SELECT 
        COUNT(*) as totalClasses,
        SUM(CASE WHEN Status = 'Present' THEN 1 ELSE 0 END) as presentClasses,
        SUM(CASE WHEN Status = 'Absent' THEN 1 ELSE 0 END) as absentClasses,
        SUM(CASE WHEN Status = 'Leave' THEN 1 ELSE 0 END) as leaveClasses,
        ROUND((SUM(CASE WHEN Status = 'Present' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) as attendancePercentage
       FROM attendance
       WHERE Student_ID = ?`,
      [studentId]
    );

    // Get attendance by day of week
    const [attendanceByDay] = await db.query(
      `SELECT 
        DAYNAME(Date) as dayOfWeek,
        COUNT(*) as totalClasses,
        SUM(CASE WHEN Status = 'Present' THEN 1 ELSE 0 END) as presentClasses,
        ROUND((SUM(CASE WHEN Status = 'Present' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) as dayPercentage
       FROM attendance
       WHERE Student_ID = ?
       GROUP BY DAYNAME(Date)
       ORDER BY FIELD(DAYNAME(Date), 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')`,
      [studentId]
    );

    // Get last 10 classes attendance
    const [recentAttendance] = await db.query(
      `SELECT 
        Date, 
        Period, 
        Status,
        DATE_FORMAT(Date, '%d-%m-%Y') as formattedDate
       FROM attendance
       WHERE Student_ID = ?
       ORDER BY Date DESC, Period DESC
       LIMIT 10`,
      [studentId]
    );

    // Calculate risk level
    const attendancePercentage = attendanceSummary[0].attendancePercentage;
    let riskLevel = 'Low';
    let riskScore = 0;

    if (attendancePercentage < 75) riskLevel = 'High';
    else if (attendancePercentage < 85) riskLevel = 'Medium';
    else riskLevel = 'Low';

    // Calculate trend (last 5 days vs previous 5 days)
    const [trendData] = await db.query(
      `SELECT 
        (SELECT ROUND((SUM(CASE WHEN Status = 'Present' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2)
         FROM attendance 
         WHERE Student_ID = ? AND Date >= DATE_SUB(NOW(), INTERVAL 5 DAY)) as recentTrend,
        (SELECT ROUND((SUM(CASE WHEN Status = 'Present' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2)
         FROM attendance 
         WHERE Student_ID = ? AND Date >= DATE_SUB(NOW(), INTERVAL 10 DAY) AND Date < DATE_SUB(NOW(), INTERVAL 5 DAY)) as previousTrend`,
      [studentId, studentId]
    );

    const trend = calculateTrend(trendData[0].recentTrend, trendData[0].previousTrend);

    res.json({
      summary: {
        attendancePercentage: attendanceSummary[0].attendancePercentage,
        totalClasses: attendanceSummary[0].totalClasses,
        present: attendanceSummary[0].presentClasses,
        absent: attendanceSummary[0].absentClasses,
        leaves: attendanceSummary[0].leaveClasses,
        riskLevel,
        riskScore
      },
      byDay: attendanceByDay,
      recentClasses: recentAttendance,
      trend: {
        direction: trend,
        recentAverage: trendData[0].recentTrend || 0,
        previousAverage: trendData[0].previousTrend || 0
      }
    });

  } catch (error) {
    console.error('Error fetching attendance analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/attendance-analytics/risk-prediction/:studentId
 * Predict risk of low attendance and suggest interventions
 */
router.get('/risk-prediction/:studentId', identity, async (req, res) => {
  try {
    const { studentId } = req.params;

    // Get student info
    const [student] = await db.query(
      'SELECT s.Student_ID, s.Name, s.Attendance_Percentage, s.CGPA FROM students WHERE Student_ID = ?',
      [studentId]
    );

    if (!student.length) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const studentData = student[0];

    // Calculate risk factors
    const riskFactors = [];
    let riskScore = 0;

    // Factor 1: Current attendance percentage (weight: 40%)
    if (studentData.Attendance_Percentage < 75) {
      riskFactors.push({
        factor: 'Low Attendance',
        severity: studentData.Attendance_Percentage < 65 ? 'Critical' : 'High',
        weight: 0.4,
        score: (100 - studentData.Attendance_Percentage) / 100
      });
      riskScore += 0.4 * ((100 - studentData.Attendance_Percentage) / 100);
    }

    // Factor 2: Recent absence trend (weight: 30%)
    const [recentAbsences] = await db.query(
      `SELECT COUNT(*) as absenceCount FROM attendance 
       WHERE Student_ID = ? AND Status = 'Absent' AND Date >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      [studentId]
    );

    if (recentAbsences[0].absenceCount >= 2) {
      riskFactors.push({
        factor: 'Recent Absences',
        severity: recentAbsences[0].absenceCount >= 4 ? 'Critical' : 'Medium',
        weight: 0.3,
        score: Math.min(recentAbsences[0].absenceCount / 5, 1)
      });
      riskScore += 0.3 * Math.min(recentAbsences[0].absenceCount / 5, 1);
    }

    // Factor 3: Academic performance (weight: 20%)
    if (studentData.CGPA < 2.5) {
      riskFactors.push({
        factor: 'Low CGPA',
        severity: 'Medium',
        weight: 0.2,
        score: (3.0 - studentData.CGPA) / 3.0
      });
      riskScore += 0.2 * ((3.0 - studentData.CGPA) / 3.0);
    }

    // Factor 4: Assignment submission rate (weight: 10%)
    const [submissionRate] = await db.query(
      `SELECT 
        COUNT(DISTINCT assignment_id) as enrolledAssignments,
        SUM(CASE WHEN status IN ('submitted', 'graded') THEN 1 ELSE 0 END) as completedAssignments
       FROM assignment_enrollments
       WHERE Student_ID = ?`,
      [studentId]
    );

    const submissionPercentage = submissionRate[0].enrolledAssignments > 0 
      ? (submissionRate[0].completedAssignments / submissionRate[0].enrolledAssignments) * 100
      : 0;

    if (submissionPercentage < 60) {
      riskFactors.push({
        factor: 'Low Assignment Completion',
        severity: 'Medium',
        weight: 0.1,
        score: (100 - submissionPercentage) / 100
      });
      riskScore += 0.1 * ((100 - submissionPercentage) / 100);
    }

    // Determine overall risk level
    let overallRisk = 'Low';
    if (riskScore >= 0.7) overallRisk = 'Critical';
    else if (riskScore >= 0.5) overallRisk = 'High';
    else if (riskScore >= 0.3) overallRisk = 'Medium';

    // Generate recommendations
    const recommendations = generateInterventionRecommendations(riskFactors, studentData);

    res.json({
      student: {
        id: studentData.Student_ID,
        name: studentData.Name,
        currentAttendance: studentData.Attendance_Percentage,
        cgpa: studentData.CGPA
      },
      riskAssessment: {
        overallRisk,
        riskScore: Math.round(riskScore * 100),
        criticalityLevel: overallRisk === 'Critical' ? 'Requires immediate intervention' : 
                          overallRisk === 'High' ? 'Needs attention' : 'Monitor closely'
      },
      riskFactors: riskFactors.map(f => ({
        factor: f.factor,
        severity: f.severity,
        impact: Math.round(f.score * 100) + '%'
      })),
      interventionRecommendations: recommendations
    });

  } catch (error) {
    console.error('Error in risk prediction:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/attendance-analytics/class-level/:section/:date
 * Get class-level attendance analytics for faculty
 */
router.get('/class-level/:section/:date', identity, async (req, res) => {
  try {
    const { section, date } = req.params;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    // Get attendance for the class
    const [classAttendance] = await db.query(
      `SELECT 
        a.Student_ID,
        s.Name,
        a.Period,
        a.Status,
        s.CGPA
       FROM attendance a
       JOIN students s ON a.Student_ID = s.Student_ID
       WHERE a.Date = ? AND a.Section_ID = (SELECT Section_ID FROM sections WHERE Section_Name = ?)
       ORDER BY a.Period, s.Name`,
      [date, section]
    );

    // Calculate statistics
    const totalPresent = classAttendance.filter(a => a.Status === 'Present').length;
    const totalAbsent = classAttendance.filter(a => a.Status === 'Absent').length;
    const totalLeave = classAttendance.filter(a => a.Status === 'Leave').length;
    const totalStudents = classAttendance.length;
    const attendancePercentage = totalStudents > 0 ? ((totalPresent / totalStudents) * 100).toFixed(2) : 0;

    // Identify students with attendance issues
    const attendanceByStudent = {};
    classAttendance.forEach(record => {
      if (!attendanceByStudent[record.Student_ID]) {
        attendanceByStudent[record.Student_ID] = {
          name: record.Name,
          cgpa: record.CGPA,
          present: 0,
          absent: 0,
          leave: 0
        };
      }
      if (record.Status === 'Present') attendanceByStudent[record.Student_ID].present++;
      else if (record.Status === 'Absent') attendanceByStudent[record.Student_ID].absent++;
      else attendanceByStudent[record.Student_ID].leave++;
    });

    const riskStudents = Object.entries(attendanceByStudent)
      .filter(([, data]) => data.absent > 0 || data.present === 0)
      .map(([id, data]) => ({
        studentId: id,
        name: data.name,
        cgpa: data.cgpa,
        status: data.present === 0 ? 'Absent' : 'Present',
        riskLevel: data.absent > 1 ? 'High' : 'Medium'
      }));

    res.json({
      classInfo: {
        section,
        date,
        totalStudents,
        totalPresent,
        totalAbsent,
        totalLeave,
        attendancePercentage: `${attendancePercentage}%`
      },
      riskStudents,
      recommendation: riskStudents.length > 0 ? 'Consider following up with absent students' : 'Good attendance for this class'
    });

  } catch (error) {
    console.error('Error fetching class attendance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/attendance-analytics/branch-report/:branch/:year
 * Get branch-level attendance report for admin/faculty
 */
router.get('/branch-report/:branch/:year', identity, async (req, res) => {
  try {
    const { branch, year } = req.params;

    // Get overall statistics
    const [stats] = await db.query(
      `SELECT 
        COUNT(DISTINCT s.Student_ID) as totalStudents,
        ROUND(AVG(s.Attendance_Percentage), 2) as avgAttendance,
        COUNT(DISTINCT CASE WHEN s.Attendance_Percentage < 75 THEN s.Student_ID END) as atRiskStudents
       FROM students s
       WHERE s.Branch = ? AND s.Year = ?`,
      [branch, year]
    );

    // Get top performers
    const [topPerformers] = await db.query(
      `SELECT Student_ID, Name, Attendance_Percentage, CGPA
       FROM students
       WHERE Branch = ? AND Year = ? 
       ORDER BY Attendance_Percentage DESC, CGPA DESC
       LIMIT 5`,
      [branch, year]
    );

    // Get at-risk students
    const [atRiskStudents] = await db.query(
      `SELECT Student_ID, Name, Attendance_Percentage, CGPA
       FROM students
       WHERE Branch = ? AND Year = ? AND Attendance_Percentage < 75
       ORDER BY Attendance_Percentage ASC
       LIMIT 5`,
      [branch, year]
    );

    // Get attendance distribution
    const [distribution] = await db.query(
      `SELECT 
        COUNT(CASE WHEN Attendance_Percentage >= 90 THEN 1 END) as excellent,
        COUNT(CASE WHEN Attendance_Percentage >= 80 AND Attendance_Percentage < 90 THEN 1 END) as good,
        COUNT(CASE WHEN Attendance_Percentage >= 75 AND Attendance_Percentage < 80 THEN 1 END) as fair,
        COUNT(CASE WHEN Attendance_Percentage < 75 THEN 1 END) as poor
       FROM students
       WHERE Branch = ? AND Year = ?`,
      [branch, year]
    );

    res.json({
      branchInfo: { branch, year },
      overallStatistics: stats[0],
      distribution: {
        excellent: distribution[0].excellent,
        good: distribution[0].good,
        fair: distribution[0].fair,
        poor: distribution[0].poor
      },
      topPerformers,
      atRiskStudents,
      actionItems: [
        'Follow up with at-risk students',
        'Recognize top performers',
        'Implement attendance improvement plan'
      ]
    });

  } catch (error) {
    console.error('Error fetching branch report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Helper Functions
 */

function calculateTrend(recent, previous) {
  if (!recent || !previous) return 'No data';
  if (recent > previous) return 'Improving';
  if (recent < previous) return 'Declining';
  return 'Stable';
}

function generateInterventionRecommendations(riskFactors, studentData) {
  const recommendations = [];

  if (riskFactors.some(f => f.factor === 'Low Attendance')) {
    recommendations.push({
      type: 'Attendance',
      priority: 'High',
      action: 'Schedule meeting with student to understand barriers',
      expectedOutcome: 'Identify and address attendance issues'
    });
  }

  if (riskFactors.some(f => f.factor === 'Recent Absences')) {
    recommendations.push({
      type: 'Engagement',
      priority: 'High',
      action: 'Connect student with mentor/advisor for support',
      expectedOutcome: 'Increase motivation and engagement'
    });
  }

  if (riskFactors.some(f => f.factor === 'Low CGPA')) {
    recommendations.push({
      type: 'Academic',
      priority: 'High',
      action: 'Enroll in tutoring/peer learning sessions',
      expectedOutcome: 'Improve academic performance'
    });
  }

  if (riskFactors.some(f => f.factor === 'Low Assignment Completion')) {
    recommendations.push({
      type: 'Academic',
      priority: 'Medium',
      action: 'Set up deadline reminders and track assignment progress',
      expectedOutcome: 'Improve assignment submission rate'
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      type: 'General',
      priority: 'Low',
      action: 'Continue monitoring and maintain current standards',
      expectedOutcome: 'Sustain good attendance and performance'
    });
  }

  return recommendations;
}

module.exports = router;
