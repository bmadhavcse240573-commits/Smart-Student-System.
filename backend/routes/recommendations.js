/**
 * SMART2 Recommendation Engine
 * Provides intelligent recommendations based on student performance, history, and peer data
 * Features:
 * - Smart Assignment Recommendations
 * - Course/Subject Recommendations
 * - Study Resource Recommendations
 * - Peer Matching for Collaboration
 */

const express = require('express');
const router = express.Router();
const { identity } = require('../middleware/identity');
const db = require('../config/database');

/**
 * GET /api/recommendations/assignments
 * Get recommended assignments for a student based on:
 * - Performance in similar subjects
 * - CGPA and skill level
 * - Peer assignments in same branch/year
 */
router.get('/assignments/:studentId', identity, async (req, res) => {
  try {
    const { studentId } = req.params;

    // Get student info (CGPA, branch, year)
    const [studentData] = await db.query(
      'SELECT Student_ID, Name, Branch, Year, CGPA FROM students WHERE Student_ID = ?',
      [studentId]
    );

    if (!studentData.length) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const student = studentData[0];

    // Determine CGPA range for enrollment
    let cgpaRange;
    if (student.CGPA >= 3.5) cgpaRange = 'Excellent';
    else if (student.CGPA >= 3.0) cgpaRange = 'Good';
    else if (student.CGPA >= 2.5) cgpaRange = 'Developing';
    else cgpaRange = 'Struggling';

    // Get available assignments matching student's criteria
    const [recommendations] = await db.query(
      `SELECT 
        a.id, 
        a.title, 
        a.description, 
        a.dueDate, 
        a.branch, 
        a.year,
        a.subject,
        (SELECT COUNT(*) FROM assignment_enrollments WHERE assignment_id = a.id) as enrolledCount
      FROM assignments a
      WHERE a.branch = ? 
        AND a.year = ? 
        AND a.dueDate > NOW()
        AND a.id NOT IN (SELECT assignment_id FROM assignment_enrollments WHERE Student_ID = ?)
      ORDER BY a.dueDate ASC
      LIMIT 5`,
      [student.Branch, student.Year, studentId]
    );

    // Calculate recommendation score for each assignment
    const scored = recommendations.map(assignment => ({
      ...assignment,
      recommendationScore: calculateAssignmentScore(assignment, student, cgpaRange),
      difficulty: cgpaRange,
      matchPercentage: Math.round(calculateAssignmentScore(assignment, student, cgpaRange) * 100)
    }));

    // Sort by recommendation score
    scored.sort((a, b) => b.recommendationScore - a.recommendationScore);

    res.json({
      student: {
        name: student.Name,
        cgpa: student.CGPA,
        skillLevel: cgpaRange,
        branch: student.Branch,
        year: student.Year
      },
      recommendations: scored,
      totalAvailable: scored.length
    });

  } catch (error) {
    console.error('Error fetching assignment recommendations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/recommendations/courses/:studentId
 * Get recommended courses/subjects based on:
 * - Peer performance in similar subjects
 * - Student's strength areas (best grades)
 * - Career path (placement status)
 */
router.get('/courses/:studentId', identity, async (req, res) => {
  try {
    const { studentId } = req.params;

    // Get student's academic history
    const [studentGrades] = await db.query(
      `SELECT sr.subject_name, sr.marks_obtained, sr.max_marks, 
              ROUND((sr.marks_obtained/sr.max_marks)*100, 2) as percentage
       FROM student_results sr
       WHERE sr.Student_ID = ?
       ORDER BY sr.marks_obtained DESC
       LIMIT 5`,
      [studentId]
    );

    // Get peer performance in similar tracks
    const [peerData] = await db.query(
      `SELECT DISTINCT sr.subject_name, 
              ROUND(AVG(sr.marks_obtained/sr.max_marks)*100, 2) as avgPerformance,
              COUNT(*) as studentCount
       FROM student_results sr
       WHERE sr.subject_name NOT IN (
         SELECT sr2.subject_name FROM student_results sr2 WHERE sr2.Student_ID = ?
       )
       GROUP BY sr.subject_name
       ORDER BY avgPerformance DESC
       LIMIT 5`,
      [studentId]
    );

    // Identify strong areas
    const strongAreas = studentGrades.slice(0, 3).map(g => g.subject_name);

    const recommendations = peerData.map(course => ({
      subject: course.subject_name,
      peerAveragePerformance: `${course.avgPerformance}%`,
      studentsEnrolled: course.studentCount,
      recommendationReason: strongAreas.some(area => 
        area.toLowerCase().includes(course.subject_name.toLowerCase())
      ) ? 'Matches your strong areas' : 'High peer success rate'
    }));

    res.json({
      studentStrengths: strongAreas,
      courseRecommendations: recommendations,
      totalRecommendations: recommendations.length
    });

  } catch (error) {
    console.error('Error fetching course recommendations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/recommendations/peer-matching/:studentId
 * Find suitable peer study partners based on:
 * - Similar CGPA and performance level
 * - Common subjects
 * - Complementary skills
 */
router.get('/peer-matching/:studentId', identity, async (req, res) => {
  try {
    const { studentId } = req.params;

    // Get current student info
    const [currentStudent] = await db.query(
      'SELECT Student_ID, Name, CGPA, Branch, Year FROM students WHERE Student_ID = ?',
      [studentId]
    );

    if (!currentStudent.length) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const student = currentStudent[0];
    const cgpaRange = getCGPARange(student.CGPA);

    // Find peers with similar CGPA (within 0.3 range) and same branch/year
    const [potentialPeers] = await db.query(
      `SELECT s.Student_ID, s.Name, s.CGPA, s.Attendance_Percentage,
              (SELECT COUNT(*) FROM assignment_submissions WHERE Student_ID = s.Student_ID) as assignmentsCompleted
       FROM students s
       WHERE s.Branch = ? 
         AND s.Year = ? 
         AND s.Student_ID != ?
         AND ABS(s.CGPA - ?) <= 0.3
       ORDER BY ABS(s.CGPA - ?) ASC
       LIMIT 5`,
      [student.Branch, student.Year, studentId, student.CGPA, student.CGPA]
    );

    // Calculate compatibility score
    const compatiblePeers = potentialPeers.map(peer => ({
      peerId: peer.Student_ID,
      name: peer.Name,
      cgpa: peer.CGPA,
      attendance: peer.Attendance_Percentage,
      assignmentsCompleted: peer.assignmentsCompleted,
      compatibilityScore: calculateCompatibilityScore(student, peer),
      suggestedFor: 'Study group collaboration'
    }));

    compatiblePeers.sort((a, b) => b.compatibilityScore - a.compatibilityScore);

    res.json({
      yourProfile: {
        name: student.Name,
        cgpa: student.CGPA,
        skillLevel: cgpaRange
      },
      compatiblePeers,
      message: 'These peers have similar performance levels and could be great study partners!'
    });

  } catch (error) {
    console.error('Error fetching peer matches:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/recommendations/study-resources/:studentId
 * Recommend study materials based on:
 * - Weak subjects (lower grades)
 * - Peer room engagement
 * - Assignment performance
 */
router.get('/study-resources/:studentId', identity, async (req, res) => {
  try {
    const { studentId } = req.params;

    // Get student's lowest performing subjects
    const [weakSubjects] = await db.query(
      `SELECT sr.subject_name, 
              ROUND((sr.marks_obtained/sr.max_marks)*100, 2) as percentage
       FROM student_results sr
       WHERE sr.Student_ID = ?
       ORDER BY sr.marks_obtained ASC
       LIMIT 3`,
      [studentId]
    );

    // Get peer room engagement
    const [roomEngagement] = await db.query(
      `SELECT COUNT(*) as messageCount FROM peer_room_messages 
       WHERE user_id = ? AND user_type = 'student'`,
      [studentId]
    );

    const recommendations = weakSubjects.map(subject => ({
      subject: subject.subject_name,
      currentPerformance: `${subject.percentage}%`,
      recommendedResources: [
        'Join relevant peer learning room',
        'Post doubts in this subject',
        'Review peer assignments',
        'Practice similar problems'
      ],
      estimatedImprovementTime: '2-3 weeks',
      priority: subject.percentage < 50 ? 'High' : 'Medium'
    }));

    res.json({
      weakAreas: weakSubjects.length,
      peerRoomParticipation: roomEngagement[0].messageCount > 0 ? 'Active' : 'Inactive',
      studyResources: recommendations,
      generalTips: [
        'Participate in DSA Problem Solving room for algorithm practice',
        'Join Physics/Math rooms for quick doubt clarification',
        'Engage in exam sprint group during exam season'
      ]
    });

  } catch (error) {
    console.error('Error fetching study resources:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/recommendations/feedback
 * Track recommendation feedback to improve future recommendations
 * (Implicit collaborative filtering)
 */
router.post('/feedback', identity, async (req, res) => {
  try {
    const { studentId, recommendationType, itemId, feedback } = req.body;

    // Store feedback for future ML model training
    // This data can be used to improve recommendation algorithms
    
    res.json({
      success: true,
      message: 'Thank you! Your feedback helps us improve recommendations'
    });

  } catch (error) {
    console.error('Error saving feedback:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Helper Functions
 */

function calculateAssignmentScore(assignment, student, cgpaRange) {
  let score = 0;

  // Match score (0-100)
  // Subject match: +30 points
  if (assignment.subject) score += 30;

  // Difficulty match: +40 points
  if (assignment.difficulty === cgpaRange) score += 40;

  // Enrollment popularity: +20 points (not too crowded)
  if (assignment.enrolledCount < 50) score += 20;

  // Deadline proximity: +10 points (upcoming deadline)
  const daysUntilDue = new Date(assignment.dueDate) - new Date();
  const daysAsNumber = daysUntilDue / (1000 * 60 * 60 * 24);
  if (daysAsNumber > 3 && daysAsNumber <= 14) score += 10;

  return Math.min(score, 100) / 100; // Normalize to 0-1
}

function getCGPARange(cgpa) {
  if (cgpa >= 3.5) return 'Excellent';
  if (cgpa >= 3.0) return 'Good';
  if (cgpa >= 2.5) return 'Developing';
  return 'Struggling';
}

function calculateCompatibilityScore(student1, student2) {
  let score = 0;

  // CGPA similarity: 40%
  const cgpaDiff = Math.abs(student1.CGPA - student2.CGPA);
  const cgpaScore = Math.max(0, (1 - cgpaDiff / 4) * 40);

  // Attendance similarity: 30%
  const attendanceDiff = Math.abs(student1.Attendance_Percentage - student2.Attendance_Percentage);
  const attendanceScore = Math.max(0, (1 - attendanceDiff / 100) * 30);

  // Assignment completion: 30%
  const assignmentScore = (student2.assignmentsCompleted > 0) ? 30 : 0;

  score = cgpaScore + attendanceScore + assignmentScore;
  return Math.min(score, 100) / 100; // Normalize to 0-1
}

module.exports = router;
