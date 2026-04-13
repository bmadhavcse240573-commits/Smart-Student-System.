// AI Analytics Module - Analyzes student performance across multiple metrics with ML

const pool = require('../config/database');

class StudentAnalyzer {
    constructor() {
        this.divisions = {
            'A': { name: 'Distinguished', range: [3.5, 4.0], color: '#10b981' },
            'B': { name: 'Proficient', range: [2.5, 3.49], color: '#f59e0b' },
            'C': { name: 'Developing', range: [0, 2.49], color: '#ef4444' }
        };
        
        // ML Model: Skill mappings based on performance patterns
        this.skillMappings = {
            'Computer Science': {
                'excellent': ['Python', 'Machine Learning', 'Data Structures', 'System Design', 'Web Development'],
                'good': ['JavaScript', 'Database Design', 'Algorithms', 'Web Development'],
                'developing': ['Python', 'Problem Solving', 'Basic Programming', 'Logic Building']
            },
            'Engineering': {
                'excellent': ['CAD', 'Project Management', 'Circuit Design', 'Advanced MATLAB'],
                'good': ['MATLAB', 'AutoCAD', 'Technical Drawing', 'Problem Analysis'],
                'developing': ['Basic CAD', 'Drawing', 'Technical Concepts']
            },
            'Business': {
                'excellent': ['Business Analytics', 'Leadership', 'Financial Management', 'Strategic Planning'],
                'good': ['Analytics', 'Communication', 'Planning', 'Negotiation'],
                'developing': ['Business Basics', 'Communication', 'Teamwork']
            },
            'default': {
                'excellent': ['Advanced Problem Solving', 'Leadership', 'Research', 'Innovation'],
                'good': ['Problem Solving', 'Critical Thinking', 'Collaboration'],
                'developing': ['Foundation Building', 'Basics', 'Learning Fundamentals']
            }
        };

        // Workshop recommendations based on performance
        this.workshopMappings = {
            'high_gpa': [
                'Advanced Python Programming',
                'Machine Learning Masterclass',
                'Cloud Architecture & AWS',
                'Data Science & Analytics',
                'Leadership & Management'
            ],
            'medium_gpa': [
                'Web Development Bootcamp',
                'Full Stack Development',
                'Data Analysis Fundamentals',
                'Project Management Essentials',
                'Communication Skills'
            ],
            'low_gpa': [
                'Programming Fundamentals',
                'Problem Solving Workshop',
                'Study Skills & Time Management',
                'Basics of Web Development',
                'Soft Skills Training'
            ],
            'high_attendance': [
                'Certification Programs',
                'Industry Expert Sessions',
                'Advanced Workshops'
            ],
            'low_attendance': [
                'Time Management Workshop',
                'Motivation & Goal Setting',
                'Basic Courses'
            ]
        };
    }

    // ML: Classify performance level based on CGPA
    classifyPerformanceLevel(cgpa) {
        if (cgpa >= 8.5) return 'excellent';
        if (cgpa >= 7.0) return 'good';
        if (cgpa >= 5.5) return 'developing';
        return 'struggling';
    }

    // ML: Calculate performance score (0-100) combining multiple factors
    calculatePerformanceScore(student) {
        const cgpaScore = (student.CGPA / 10) * 60;  // 60% weight for CGPA
        const attendanceScore = (student.Attendance_Percentage / 100) * 30;  // 30% weight for attendance
        const backlogs = student.Backlogs || 0;
        const backlogs_penalty = Math.max(0, (backlogs * 10));  // Deduct 10% per backlog
        
        const totalScore = cgpaScore + attendanceScore - backlogs_penalty;
        return Math.max(0, Math.min(100, totalScore));
    }

    // ML: Predict placement probability based on historical patterns
    predictPlacementProbability(student) {
        const cgpa_factor = (student.CGPA / 10) * 0.5;
        const attendance_factor = (student.Attendance_Percentage / 100) * 0.3;
        const backlogs_factor = Math.max(0, 1 - (student.Backlogs || 0) * 0.1) * 0.2;
        
        const probability = (cgpa_factor + attendance_factor + backlogs_factor) * 100;
        return Math.min(100, Math.max(0, probability));
    }

    // ML: KNN-based student clustering (find similar students)
    async findSimilarStudents(studentId, allStudents, k = 5) {
        const targetStudent = allStudents.find(s => s.Student_ID === studentId);
        if (!targetStudent) return [];

        const distances = allStudents
            .filter(s => s.Student_ID !== studentId)
            .map(student => {
                const cgpaDiff = Math.abs(student.CGPA - targetStudent.CGPA);
                const attendanceDiff = Math.abs(student.Attendance_Percentage - targetStudent.Attendance_Percentage);
                const yearDiff = Math.abs((student.Year || 0) - (targetStudent.Year || 0)) * 0.5;
                
                // Euclidean distance
                const distance = Math.sqrt(cgpaDiff ** 2 + attendanceDiff ** 2 + yearDiff ** 2);
                return { student, distance };
            })
            .sort((a, b) => a.distance - b.distance)
            .slice(0, k);

        return distances.map(d => d.student);
    }

    // ML: Recommend skills based on department and performance
    generateSkillsByPerformance(student, allStudents) {
        const performanceLevel = this.classifyPerformanceLevel(student.CGPA);
        // Normalize branch names to match skillMappings keys
        let dept = (student.Branch || '').toLowerCase();
        if (["cse", "cs", "computer science", "computer engineering"].includes(dept)) dept = "Computer Science";
        else if (["ece", "electronics", "electronics and communication"].includes(dept)) dept = "Engineering";
        else if (["aiml", "ai", "artificial intelligence", "machine learning"].includes(dept)) dept = "Engineering";
        else if (["mech", "mechanical"].includes(dept)) dept = "Engineering";
        else if (["civil"].includes(dept)) dept = "Engineering";
        else if (["mba", "business administration", "business"].includes(dept)) dept = "Business";
        else dept = "default";
        const mappings = this.skillMappings[dept] || this.skillMappings['default'];
        const recommendedSkills = mappings[performanceLevel] || mappings['developing'];

        return recommendedSkills.map(skill => ({
            name: skill,
            proficiency: this.calculateProficiency(student.CGPA, student.Attendance_Percentage),
            recommendation: 'Strong fit',
            priority: performanceLevel === 'excellent' ? 'High' : 'Medium'
        }));
    }

    // ML: Calculate proficiency score based on CGPA and attendance
    calculateProficiency(cgpa, attendance) {
        const base = (cgpa / 10) * 60 + (attendance / 100) * 40;
        return Math.round(Math.max(30, Math.min(100, base)));
    }

    // ML: Recommend workshops based on performance and gaps
    generateWorkshopsByPerformance(student, allStudents) {
        const performanceScore = this.calculatePerformanceScore(student);
        let category = 'medium_gpa';
        
        if (student.CGPA >= 8.5) {
            category = 'high_gpa';
        } else if (student.CGPA < 6.5) {
            category = 'low_gpa';
        }

        const workshops = this.workshopMappings[category] || [];
        const attendanceCategory = student.Attendance_Percentage >= 85 ? 'high_attendance' : 'low_attendance';
        
        const additionalWorkshops = this.workshopMappings[attendanceCategory] || [];
        
        return [...new Set([...workshops, ...additionalWorkshops])].slice(0, 5).map(workshop => ({
            name: workshop,
            importance: performanceScore < 50 ? 'Critical' : 'Important',
            duration: '4-6 weeks',
            skills: ['Problem Solving', 'Technical Skills', 'Professional Growth']
        }));
    }

    // Fetch real student data from MySQL
    async fetchStudentFromDB(studentId) {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.query('SELECT * FROM students WHERE Student_ID = ?', [studentId]);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching student from DB:', error);
            return null;
        } finally {
            if (connection) connection.release();
        }
    }

    // Fetch all students for analysis
    async fetchAllStudentsFromDB() {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.query('SELECT * FROM students LIMIT 500');
            return rows;
        } catch (error) {
            console.error('Error fetching all students from DB:', error);
            return [];
        } finally {
            if (connection) connection.release();
        }
    }

    // ML: Classify division (A, B, C) based on real CGPA
    classifyDivision(cgpa, attendance) {
        const normalizedScore = (cgpa / 10) * 0.6 + (attendance / 100) * 0.4;
        
        if (normalizedScore >= 0.85) return 'A';
        if (normalizedScore >= 0.70) return 'B';
        return 'C';
    }

    // ML: Analyze complete student profile with real data
    async analyzeStudent(student) {
        // Validate student data
        if (!student || !student.Student_ID) {
            return null;
        }

        const cgpaNum = Number(student.CGPA) || 0;
        const attendanceNum = Number(student.Attendance_Percentage) || 0;
        const division = this.classifyDivision(cgpaNum, attendanceNum);
        const performanceScore = this.calculatePerformanceScore(student);
        const placementProbability = this.predictPlacementProbability(student);
        const performanceLevel = this.classifyPerformanceLevel(cgpaNum);
        
        const skills = this.generateSkillsByPerformance(student, []);
        const workshops = this.generateWorkshopsByPerformance(student, []);

        return {
            Student_ID: student.Student_ID,
            Name: student.Name || 'Unknown',
            Email: student.Email || 'N/A',
            Branch: student.Branch || 'Not Specified',
            Year: student.Year || 1,
            CGPA: cgpaNum,
            Attendance_Percentage: attendanceNum,
            gpa: parseFloat(((cgpaNum / 10) * 4).toFixed(2)),
            attendance: attendanceNum,
            Backlogs: student.Backlogs || 0,
            Placement_Status: student.Placement_Status || 'Not Placed',
            division: division,
            divisionName: this.divisions[division].name,
            divisionColor: this.divisions[division].color,
            performanceScore: parseFloat(performanceScore.toFixed(1)),
            performanceLevel: performanceLevel,
            placementProbability: parseFloat(placementProbability.toFixed(1)),
            skills: skills,
            workshops: workshops,
            strengths: skills.filter(s => s.proficiency >= 75).map(s => s.name),
            areasImprovement: skills.filter(s => s.proficiency < 60).map(s => s.name)
        };
    }

    // ML: Analyze all students and group by division
    async analyzeAllStudents(students) {
        if (!students || students.length === 0) {
            return {
                analyzed: [],
                summary: {
                    totalStudents: 0,
                    divisions: {
                        A: { count: 0, percentage: 0, students: [], avgPerformance: 0 },
                        B: { count: 0, percentage: 0, students: [], avgPerformance: 0 },
                        C: { count: 0, percentage: 0, students: [], avgPerformance: 0 }
                    },
                    averageCGPA: 0,
                    averageAttendance: 0,
                    topPerformers: [],
                    needsAttention: []
                }
            };
        }

        const analyzed = [];
        for (const student of students) {
            const analyzed_student = await this.analyzeStudent(student);
            if (analyzed_student) {
                analyzed.push(analyzed_student);
            }
        }

        const byDivision = {
            'A': [],
            'B': [],
            'C': []
        };

        analyzed.forEach(student => {
            byDivision[student.division].push(student);
        });

        const avgDivisionPerformance = (division) => {
            const students = byDivision[division];
            if (students.length === 0) return 0;
            return (students.reduce((sum, s) => sum + s.performanceScore, 0) / students.length).toFixed(1);
        };

        const summary = {
            totalStudents: analyzed.length,
            divisions: {
                A: {
                    count: byDivision['A'].length,
                    percentage: ((byDivision['A'].length / analyzed.length) * 100).toFixed(1),
                    students: byDivision['A'].sort((a, b) => b.performanceScore - a.performanceScore),
                    avgPerformance: avgDivisionPerformance('A')
                },
                B: {
                    count: byDivision['B'].length,
                    percentage: ((byDivision['B'].length / analyzed.length) * 100).toFixed(1),
                    students: byDivision['B'].sort((a, b) => b.performanceScore - a.performanceScore),
                    avgPerformance: avgDivisionPerformance('B')
                },
                C: {
                    count: byDivision['C'].length,
                    percentage: ((byDivision['C'].length / analyzed.length) * 100).toFixed(1),
                    students: byDivision['C'].sort((a, b) => b.performanceScore - a.performanceScore),
                    avgPerformance: avgDivisionPerformance('C')
                }
            },
            averageCGPA: (analyzed.reduce((sum, s) => sum + s.CGPA, 0) / analyzed.length).toFixed(2),
            averageAttendance: (analyzed.reduce((sum, s) => sum + s.Attendance_Percentage, 0) / analyzed.length).toFixed(1),
            topPerformers: analyzed.sort((a, b) => b.performanceScore - a.performanceScore).slice(0, 5),
            needsAttention: analyzed.filter(s => s.performanceScore < 50).sort((a, b) => a.performanceScore - b.performanceScore).slice(0, 5),
            placementStats: {
                likelyPlaced: analyzed.filter(s => s.placementProbability >= 70).length,
                moderatePlaced: analyzed.filter(s => s.placementProbability >= 50 && s.placementProbability < 70).length,
                atRisk: analyzed.filter(s => s.placementProbability < 50).length
            }
        };

        return { analyzed, summary };
    }

    // ML: Get personalized recommendations for a student
    getRecommendations(student) {
        const recommendations = [];

        // Attendance-based recommendations
        if (student.Attendance_Percentage < 75) {
            recommendations.push({
                type: 'critical',
                priority: 'High',
                title: 'Improve Attendance',
                message: `Current attendance: ${student.Attendance_Percentage}%`,
                action: 'Aim for at least 80% attendance',
                impact: 'Affects eligibility for placement and exams'
            });
        }

        // CGPA-based recommendations
        if (student.CGPA < 6.5) {
            recommendations.push({
                type: 'warning',
                priority: 'High',
                title: 'Improve Academic Performance',
                message: `Current CGPA: ${student.CGPA}`,
                action: 'Focus on core subjects and seek tutoring',
                impact: 'CGPA is major factor for placements'
            });
        } else if (student.CGPA >= 8.5) {
            recommendations.push({
                type: 'success',
                priority: 'Low',
                title: 'Excellent Performance',
                message: `Outstanding CGPA: ${student.CGPA}`,
                action: 'Aim for internships and leadership roles',
                impact: 'Strong candidate for top placements'
            });
        }

        // Backlogs-based recommendations
        if (student.Backlogs > 0) {
            recommendations.push({
                type: 'critical',
                priority: 'Critical',
                title: 'Clear Backlogs',
                message: `You have ${student.Backlogs} backlog(s)`,
                action: 'Clear these backlogs immediately',
                impact: 'Backlogs prevent placement eligibility'
            });
        }

        // Skill development recommendations
        const lowSkills = student.skills.filter(s => s.proficiency < 60);
        if (lowSkills.length > 0) {
            recommendations.push({
                type: 'info',
                priority: 'Medium',
                title: 'Build Core Skills',
                message: `Strengthen: ${lowSkills.slice(0, 2).map(s => s.name).join(', ')}`,
                action: 'Take workshops and practice',
                impact: 'Improves job readiness'
            });
        }

        // Workshop recommendations
        recommendations.push({
            type: 'info',
            priority: 'Medium',
            title: 'Complete Recommended Workshops',
            message: 'Upskill through professional development',
            action: `Enroll in: ${student.workshops.slice(0, 2).map(w => w.name).join(', ')}`,
            impact: 'Increases employment prospects'
        });

        // Placement probability based
        if (student.placementProbability < 50) {
            recommendations.push({
                type: 'warning',
                priority: 'High',
                title: 'Low Placement Probability',
                message: `Current placement probability: ${student.placementProbability.toFixed(1)}%`,
                action: 'Focus on attendance, CGPA, and skill development',
                impact: 'Urgent action needed'
            });
        }

        return recommendations;
    }
}

module.exports = StudentAnalyzer;
