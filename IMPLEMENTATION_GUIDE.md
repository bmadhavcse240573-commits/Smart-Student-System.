# SMART2 Enhancement Features - Implementation Guide

**Date**: April 25, 2026  
**Version**: 1.0  
**Status**: Ready for Integration

---

## Overview

This document outlines the new enhancement features integrated into Smart2 based on the RADIT (RFID-based Student Wallet System) template. These features significantly enhance the platform's capabilities in recommendation systems, analytics, and risk prediction.

---

## Table of Contents

1. [Features Implemented](#features-implemented)
2. [API Documentation](#api-documentation)
3. [Integration Instructions](#integration-instructions)
4. [Usage Examples](#usage-examples)
5. [Database Queries](#database-queries)
6. [Performance Considerations](#performance-considerations)

---

## Features Implemented

### 1. **Intelligent Recommendation System** ✅

**Module**: `backend/routes/recommendations.js`

#### 1.1 Smart Assignment Recommendations

Recommends assignments based on:
- Student's CGPA and performance level
- Branch and year compatibility
- Subject relevance
- Enrollment popularity (not overcrowded)
- Deadline proximity

**Scoring Algorithm**:
```
Total Score = 
  Subject Match (30%) +
  Difficulty Match (40%) +
  Enrollment Popularity (20%) +
  Deadline Proximity (10%)
```

**API Endpoint**:
```
GET /api/recommendations/assignments/:studentId
```

**Response**:
```json
{
  "student": {
    "name": "John Doe",
    "cgpa": 3.5,
    "skillLevel": "Excellent",
    "branch": "CSE",
    "year": 3
  },
  "recommendations": [
    {
      "id": 1,
      "title": "Web Development Project",
      "description": "Build a full-stack application",
      "dueDate": "2026-05-15",
      "recommendationScore": 0.95,
      "matchPercentage": 95,
      "difficulty": "Excellent"
    }
  ]
}
```

#### 1.2 Course/Subject Recommendations

Recommends courses based on:
- Student's academic strengths (best grades)
- Peer performance in similar tracks
- Career path alignment

**API Endpoint**:
```
GET /api/recommendations/courses/:studentId
```

**Response**:
```json
{
  "studentStrengths": ["Data Structures", "Algorithms"],
  "courseRecommendations": [
    {
      "subject": "Advanced Algorithms",
      "peerAveragePerformance": "82%",
      "studentsEnrolled": 45,
      "recommendationReason": "Matches your strong areas"
    }
  ]
}
```

#### 1.3 Peer Matching for Study Groups

Recommends study partners based on:
- Similar CGPA (within 0.3 range)
- Same branch/year
- Complementary skills
- Attendance levels

**Compatibility Score**:
```
Score = 
  CGPA Similarity (40%) +
  Attendance Similarity (30%) +
  Assignment Completion (30%)
```

**API Endpoint**:
```
GET /api/recommendations/peer-matching/:studentId
```

**Response**:
```json
{
  "yourProfile": {
    "name": "John Doe",
    "cgpa": 3.5,
    "skillLevel": "Excellent"
  },
  "compatiblePeers": [
    {
      "peerId": 2001,
      "name": "Jane Smith",
      "cgpa": 3.45,
      "attendance": 92,
      "assignmentsCompleted": 15,
      "compatibilityScore": 0.92,
      "suggestedFor": "Study group collaboration"
    }
  ]
}
```

#### 1.4 Study Resource Recommendations

Recommends study materials based on:
- Weak subjects (lower grades)
- Peer room engagement
- Assignment performance

**API Endpoint**:
```
GET /api/recommendations/study-resources/:studentId
```

---

### 2. **Attendance Analytics & Risk Prediction** ✅

**Module**: `backend/routes/attendance-analytics.js`

#### 2.1 Student Attendance Analytics

Provides comprehensive attendance insights:
- Overall attendance percentage
- Day-wise attendance breakdown
- Recent attendance trend
- Risk assessment

**API Endpoint**:
```
GET /api/attendance-analytics/student/:studentId
```

**Response**:
```json
{
  "summary": {
    "attendancePercentage": 87.5,
    "totalClasses": 40,
    "present": 35,
    "absent": 3,
    "leaves": 2,
    "riskLevel": "Low",
    "riskScore": 0
  },
  "byDay": [
    {
      "dayOfWeek": "Monday",
      "totalClasses": 8,
      "presentClasses": 7,
      "dayPercentage": 87.5
    }
  ],
  "recentClasses": [
    {
      "date": "2026-04-25",
      "period": 1,
      "status": "Present",
      "formattedDate": "25-04-2026"
    }
  ],
  "trend": {
    "direction": "Improving",
    "recentAverage": 90,
    "previousAverage": 85
  }
}
```

#### 2.2 Risk Prediction & Intervention Recommendations

Predicts attendance-related risks using multi-factor analysis:

**Risk Factors** (Weight-based):
1. **Low Attendance** (40%): Current percentage < 75%
2. **Recent Absences** (30%): Absences in last 7 days
3. **Low CGPA** (20%): CGPA < 2.5 (correlation with attendance)
4. **Assignment Completion** (10%): Low submission rate

**Risk Levels**:
- `Critical`: Risk Score ≥ 70% (Immediate intervention required)
- `High`: Risk Score 50-70% (Needs attention)
- `Medium`: Risk Score 30-50% (Monitor closely)
- `Low`: Risk Score < 30% (Maintain current level)

**API Endpoint**:
```
GET /api/attendance-analytics/risk-prediction/:studentId
```

**Response**:
```json
{
  "student": {
    "id": 1001,
    "name": "John Doe",
    "currentAttendance": 72.5,
    "cgpa": 2.3
  },
  "riskAssessment": {
    "overallRisk": "High",
    "riskScore": 62,
    "criticalityLevel": "Needs attention"
  },
  "riskFactors": [
    {
      "factor": "Low Attendance",
      "severity": "High",
      "impact": "60%"
    },
    {
      "factor": "Recent Absences",
      "severity": "Medium",
      "impact": "40%"
    }
  ],
  "interventionRecommendations": [
    {
      "type": "Attendance",
      "priority": "High",
      "action": "Schedule meeting with student to understand barriers",
      "expectedOutcome": "Identify and address attendance issues"
    },
    {
      "type": "Engagement",
      "priority": "High",
      "action": "Connect student with mentor/advisor for support",
      "expectedOutcome": "Increase motivation and engagement"
    }
  ]
}
```

#### 2.3 Class-Level Attendance Analytics

Provides faculty with class attendance summary:
- Overall attendance for specific date/class
- Student-wise breakdown
- Risk identification
- Recommendations

**API Endpoint**:
```
GET /api/attendance-analytics/class-level/:section/:date
```

**Example**: `/api/attendance-analytics/class-level/CSE-A/2026-04-25`

#### 2.4 Branch-Level Attendance Report

Provides admin/faculty with branch statistics:
- Overall attendance average
- At-risk students count
- Top performers
- Distribution by performance band

**API Endpoint**:
```
GET /api/attendance-analytics/branch-report/:branch/:year
```

**Example**: `/api/attendance-analytics/branch-report/CSE/3`

---

## API Documentation

### Base URL
```
http://localhost:5000/api
```

### Authentication
All endpoints require JWT token in header:
```
Authorization: Bearer <jwt_token>
```

### Recommendation Endpoints

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---|
| `/recommendations/assignments/:studentId` | GET | Get recommended assignments | Yes |
| `/recommendations/courses/:studentId` | GET | Get recommended courses | Yes |
| `/recommendations/peer-matching/:studentId` | GET | Find study partners | Yes |
| `/recommendations/study-resources/:studentId` | GET | Get study resource recommendations | Yes |
| `/recommendations/feedback` | POST | Submit recommendation feedback | Yes |

### Attendance Analytics Endpoints

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---|
| `/attendance-analytics/student/:studentId` | GET | Student attendance analytics | Yes |
| `/attendance-analytics/risk-prediction/:studentId` | GET | Risk assessment & interventions | Yes |
| `/attendance-analytics/class-level/:section/:date` | GET | Class-level attendance | Yes |
| `/attendance-analytics/branch-report/:branch/:year` | GET | Branch attendance report | Yes |

---

## Integration Instructions

### Step 1: Verify File Creation

Check that these files exist in your backend:
```
backend/routes/recommendations.js
backend/routes/attendance-analytics.js
```

### Step 2: Verify Server Configuration

Open `backend/server.js` and confirm these lines are present:

```javascript
app.use('/api/recommendations', require('./routes/recommendations'));
app.use('/api/attendance-analytics', require('./routes/attendance-analytics'));
```

### Step 3: Dependencies Check

Verify that all required packages are in `backend/package.json`:
```json
{
  "express": "^4.18.2",
  "mysql2": "^3.17.4",
  "jsonwebtoken": "^9.0.0",
  "bcryptjs": "^2.4.3"
}
```

If missing, run:
```bash
cd backend
npm install express mysql2 jsonwebtoken bcryptjs
```

### Step 4: Database Verification

Ensure these tables exist in MySQL:
- `students`
- `attendance`
- `assignments`
- `assignment_enrollments`
- `assignment_submissions`
- `student_results`
- `peer_room_messages`

If tables are missing, run the database setup scripts in `backend/` directory.

### Step 5: Start Backend Server

```bash
cd backend
npm start
```

Expected output:
```
✅ Using MySQL database for data persistence
🚀 Backend server running on http://localhost:5000
📌 API Health Check: http://localhost:5000/api/health
```

### Step 6: Test Endpoints

Test one endpoint to verify setup:
```bash
curl -X GET http://localhost:5000/api/attendance-analytics/student/1001 \
  -H "Authorization: Bearer <your_jwt_token>"
```

---

## Usage Examples

### Example 1: Get Assignment Recommendations for Student

**Request**:
```bash
GET /api/recommendations/assignments/1001
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response**:
```json
{
  "student": {
    "name": "Alice Johnson",
    "cgpa": 3.7,
    "skillLevel": "Excellent",
    "branch": "CSE",
    "year": 3
  },
  "recommendations": [
    {
      "id": 5,
      "title": "Machine Learning Project",
      "subject": "AI/ML",
      "dueDate": "2026-05-20",
      "branch": "CSE",
      "year": 3,
      "recommendationScore": 0.98,
      "matchPercentage": 98,
      "difficulty": "Excellent"
    },
    {
      "id": 8,
      "title": "Web App Development",
      "subject": "Web Technologies",
      "dueDate": "2026-05-25",
      "recommendationScore": 0.92,
      "matchPercentage": 92,
      "difficulty": "Excellent"
    }
  ],
  "totalAvailable": 2
}
```

### Example 2: Check Attendance Risk

**Request**:
```bash
GET /api/attendance-analytics/risk-prediction/1002
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response** (High Risk Student):
```json
{
  "student": {
    "id": 1002,
    "name": "Bob Smith",
    "currentAttendance": 68.5,
    "cgpa": 2.1
  },
  "riskAssessment": {
    "overallRisk": "Critical",
    "riskScore": 75,
    "criticalityLevel": "Requires immediate intervention"
  },
  "riskFactors": [
    {
      "factor": "Low Attendance",
      "severity": "Critical",
      "impact": "80%"
    },
    {
      "factor": "Recent Absences",
      "severity": "Critical",
      "impact": "75%"
    },
    {
      "factor": "Low CGPA",
      "severity": "Medium",
      "impact": "45%"
    }
  ],
  "interventionRecommendations": [
    {
      "type": "Attendance",
      "priority": "High",
      "action": "Schedule immediate meeting with student",
      "expectedOutcome": "Understand barriers and create action plan"
    },
    {
      "type": "Engagement",
      "priority": "High",
      "action": "Assign peer mentor or counselor",
      "expectedOutcome": "Provide support and motivation"
    },
    {
      "type": "Academic",
      "priority": "High",
      "action": "Enroll in intensive tutoring/peer learning",
      "expectedOutcome": "Improve academic performance"
    }
  ]
}
```

### Example 3: Find Peer Study Partners

**Request**:
```bash
GET /api/recommendations/peer-matching/1003
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response**:
```json
{
  "yourProfile": {
    "name": "Carol Davis",
    "cgpa": 3.2,
    "skillLevel": "Good"
  },
  "compatiblePeers": [
    {
      "peerId": 1004,
      "name": "David Wilson",
      "cgpa": 3.25,
      "attendance": 88,
      "assignmentsCompleted": 12,
      "compatibilityScore": 0.94,
      "suggestedFor": "Study group collaboration"
    },
    {
      "peerId": 1005,
      "name": "Emma Brown",
      "cgpa": 3.15,
      "attendance": 86,
      "assignmentsCompleted": 11,
      "compatibilityScore": 0.89,
      "suggestedFor": "Study group collaboration"
    }
  ],
  "message": "These peers have similar performance levels and could be great study partners!"
}
```

---

## Database Queries

### Create Recommendation History Table (Optional)
```sql
CREATE TABLE recommendation_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT,
  recommendation_type VARCHAR(50),
  item_id INT,
  feedback ENUM('accepted', 'rejected', 'neutral'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(Student_ID),
  INDEX idx_student_type (student_id, recommendation_type)
);
```

### Query: Find Students at Risk
```sql
SELECT 
  s.Student_ID,
  s.Name,
  s.CGPA,
  s.Attendance_Percentage,
  COUNT(CASE WHEN a.Status = 'Absent' AND a.Date >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as recentAbsences
FROM students s
LEFT JOIN attendance a ON s.Student_ID = a.Student_ID
WHERE s.Attendance_Percentage < 75 OR s.CGPA < 2.5
GROUP BY s.Student_ID
ORDER BY s.Attendance_Percentage ASC;
```

### Query: Get Top Recommendation Matches
```sql
SELECT 
  a.id,
  a.title,
  a.subject,
  COUNT(ae.Student_ID) as enrolledCount
FROM assignments a
LEFT JOIN assignment_enrollments ae ON a.id = ae.assignment_id
WHERE a.dueDate > NOW()
GROUP BY a.id
ORDER BY enrolledCount ASC
LIMIT 10;
```

---

## Performance Considerations

### Query Optimization
- Indexes created on frequently queried columns:
  - `students(Student_ID, CGPA, Branch, Year)`
  - `attendance(Student_ID, Date, Status)`
  - `assignments(branch, year, dueDate)`
  - `assignment_enrollments(Student_ID, assignment_id)`

### Caching Recommendations (Future Enhancement)
```javascript
// Implement Redis caching for frequent recommendations
const redis = require('redis');
const client = redis.createClient();

// Cache key: recommendations:student:1001:assignments
// TTL: 1 hour
```

### Batch Processing for Analytics
For large datasets, consider:
```sql
-- Use DATE_TRUNC for monthly aggregations
SELECT 
  DATE_TRUNC('month', Date) as month,
  COUNT(*) as attendanceCount
FROM attendance
GROUP BY DATE_TRUNC('month', Date);
```

### Connection Pooling
Already configured in `backend/config/database.js`:
```javascript
connectionLimit: 10,
waitForConnections: true,
queueLimit: 0,
enableKeepAlive: true
```

---

## Frontend Integration (Next Steps)

### 1. Create Recommendation Component
```javascript
// src/components/RecommendationWidget.jsx
const RecommendationWidget = ({ studentId }) => {
  const [recommendations, setRecommendations] = useState([]);
  
  useEffect(() => {
    fetchRecommendations(studentId);
  }, [studentId]);
};
```

### 2. Create Risk Dashboard
```javascript
// src/components/RiskDashboard.jsx
// Display risk scores and intervention recommendations
```

### 3. Create Peer Matching UI
```javascript
// src/components/PeerMatchingPanel.jsx
// Show compatible peers with collaboration options
```

---

## Troubleshooting

### Issue: 404 on Recommendation Endpoints
**Solution**: Verify routes are registered in `backend/server.js`

### Issue: 500 Error on Analytics Queries
**Solution**: Check database table existence and column names

### Issue: Slow Analytics Queries
**Solution**: Add indexes to `attendance` and `students` tables

### Issue: JWT Token Invalid
**Solution**: Verify token is included in Authorization header

---

## Future Enhancements

1. **Machine Learning Integration**
   - Train models on historical data
   - Predict student success probability
   - Early warning system for dropouts

2. **Advanced Filtering**
   - Filter recommendations by topic/subject
   - Difficulty level preferences
   - Time-based recommendations

3. **Collaborative Filtering**
   - Use peer group recommendations
   - Content-based filtering
   - Hybrid recommendation approach

4. **Real-time Notifications**
   - Notify students of new recommendations
   - Alert faculty of at-risk students
   - Escalation mechanisms

5. **Mobile App Integration**
   - Recommendation push notifications
   - Peer matching in mobile app
   - Risk alerts on mobile

---

## Support & Maintenance

### Logs
Check backend logs for debugging:
```
backend/logs/server.log
backend/logs/database.log
```

### Monitoring
Monitor API performance:
```
GET /api/health - Basic health check
GET /api/recommendations/*/response-time - Query time metrics
```

---

## Document Information

**Created**: April 25, 2026  
**Last Updated**: April 25, 2026  
**Version**: 1.0  
**Status**: Active  
**Reviewed By**: Development Team  

