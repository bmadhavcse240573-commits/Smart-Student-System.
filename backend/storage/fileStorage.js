const fs = require('fs');
const path = require('path');

// Data directory for storing JSON files
const DATA_DIR = path.join(__dirname, '../data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('📁 Data directory created:', DATA_DIR);
}

const FILES = {
    STUDENTS: path.join(DATA_DIR, 'students.json'),
    FACULTY: path.join(DATA_DIR, 'faculty.json'),
    ADMINS: path.join(DATA_DIR, 'admins.json')
};

class FileStorage {
    // Initialize files if they don't exist
    static initialize() {
        Object.values(FILES).forEach(file => {
            if (!fs.existsSync(file)) {
                fs.writeFileSync(file, JSON.stringify([], null, 2));
            }
        });
    }

    // Load all students from file
    static loadStudents() {
        try {
            const data = fs.readFileSync(FILES.STUDENTS, 'utf8');
            return JSON.parse(data) || [];
        } catch (error) {
            console.error('Error loading students:', error.message);
            return [];
        }
    }

    // Load all faculty from file
    static loadFaculty() {
        try {
            const data = fs.readFileSync(FILES.FACULTY, 'utf8');
            return JSON.parse(data) || [];
        } catch (error) {
            console.error('Error loading faculty:', error.message);
            return [];
        }
    }

    // Save students to file
    static saveStudents(students) {
        try {
            fs.writeFileSync(FILES.STUDENTS, JSON.stringify(students, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving students:', error.message);
            return false;
        }
    }

    // Save faculty to file
    static saveFaculty(faculty) {
        try {
            fs.writeFileSync(FILES.FACULTY, JSON.stringify(faculty, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving faculty:', error.message);
            return false;
        }
    }

    // Add a student
    static addStudent(student) {
        const students = this.loadStudents();
        students.push(student);
        this.saveStudents(students);
        return student;
    }

    // Add faculty member
    static addFaculty(faculty) {
        const facultyList = this.loadFaculty();
        facultyList.push(faculty);
        this.saveFaculty(facultyList);
        return faculty;
    }

    // Load all admins from file
    static loadAdmins() {
        try {
            const data = fs.readFileSync(FILES.ADMINS, 'utf8');
            return JSON.parse(data) || [];
        } catch (error) {
            console.error('Error loading admins:', error.message);
            return [];
        }
    }

    // Save admins to file
    static saveAdmins(admins) {
        try {
            fs.writeFileSync(FILES.ADMINS, JSON.stringify(admins, null, 2));
        } catch (error) {
            console.error('Error saving admins:', error.message);
        }
    }

    // Add admin
    static addAdmin(admin) {
        const adminList = this.loadAdmins();
        adminList.push(admin);
        this.saveAdmins(adminList);
        return admin;
    }

    // Find student by email
    static findStudentByEmail(email) {
        const students = this.loadStudents();
        return students.find(s => s.email === email) || null;
    }

    // Find faculty by email
    static findFacultyByEmail(email) {
        const facultyList = this.loadFaculty();
        return facultyList.find(f => f.email === email) || null;
    }

    // Find admin by email
    static findAdminByEmail(email) {
        const adminList = this.loadAdmins();
        return adminList.find(a => a.email === email) || null;
    }

    // Get all students
    static getAllStudents() {
        return this.loadStudents();
    }

    // Get all faculty
    static getAllFaculty() {
        return this.loadFaculty();
    }

    // Get all admins
    static getAllAdmins() {
        return this.loadAdmins();
    }

    // Delete all data (for testing)
    static clearAll() {
        this.saveStudents([]);
        this.saveFaculty([]);
        this.saveAdmins([]);
    }
}

module.exports = FileStorage;
