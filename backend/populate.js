require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('./models/Student');
const Faculty = require('./models/Faculty');
const fs = require('fs');

async function populateDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Clear existing data
    await Student.deleteMany({});
    await Faculty.deleteMany({});
    console.log('Cleared existing data');

    // Load students
    const studentsData = JSON.parse(fs.readFileSync('./data/students.json', 'utf8'));
    for (const student of studentsData) {
      const newStudent = new Student({
        fullName: student.fullName,
        email: student.email,
        password: student.password, // Will be hashed by pre-save hook
        studentId: student.studentId,
        department: student.department,
        gpa: student.gpa || 0,
        credits: student.credits || 0,
        semester: student.semester || 1,
        status: student.status || 'Active'
      });
      await newStudent.save();
    }
    console.log('Students populated');

      // Load faculty from facultyDatabase.json
      const facultyDb = JSON.parse(fs.readFileSync('./data/facultyDatabase.json', 'utf8'));
      for (const faculty of facultyDb.faculty) {
        const newFaculty = new Faculty({
          fullName: faculty.Name,
          email: faculty.Email,
          password: faculty.Password || 'defaultPassword',
          facultyId: faculty.Faculty_ID,
          subject: faculty.Branch,
          qualification: faculty.Qualification,
          department: faculty.Branch
        });
        await newFaculty.save();
      }
      console.log('Faculty populated');

    console.log('Database populated successfully');
  } catch (error) {
    console.error('Error populating database:', error);
  } finally {
    mongoose.connection.close();
  }
}

populateDatabase();