// In-memory mock database with file persistence
// Data persists to JSON files in data/ directory

const FileStorage = require('./storage/fileStorage');

// Initialize file storage
FileStorage.initialize();

const mockDb = {
  students: FileStorage.getAllStudents(),
  faculty: FileStorage.getAllFaculty()
};

// Mock Student class
class MockStudent {
  constructor(data) {
    this._id = Date.now().toString() + Math.random();
    this.fullName = data.fullName;
    this.email = data.email;
    this.password = data.password;
    this.studentId = data.studentId;
    this.department = data.department;
  }

  static async findOne(query) {
    return FileStorage.findStudentByEmail(query.email) || null;
  }

  async save() {
    mockDb.students.push(this);
    FileStorage.addStudent(this);
    return this;
  }

  async comparePassword(password) {
    return this.password === password;
  }
}

// Attach mockDb to class for AI analyzer access
MockStudent.mockDb = mockDb;

// Mock Faculty class
class MockFaculty {
  constructor(data) {
    this._id = Date.now().toString() + Math.random();
    this.fullName = data.fullName;
    this.email = data.email;
    this.password = data.password;
    this.facultyId = data.facultyId;
    this.subject = data.subject;
    this.qualification = data.qualification;
  }

  static async findOne(query) {
    return FileStorage.findFacultyByEmail(query.email) || null;
  }

  async save() {
    mockDb.faculty.push(this);
    FileStorage.addFaculty(this);
    return this;
  }

  async comparePassword(password) {
    return this.password === password;
  }
}

// Mock Admin class
class MockAdmin {
  constructor(data) {
    this._id = Date.now().toString() + Math.random();
    this.fullName = data.fullName;
    this.email = data.email;
    this.password = data.password;
    this.adminId = data.adminId || 'ADMIN-001';
    this.role = 'admin';
  }

  static async findOne(query) {
    return FileStorage.findAdminByEmail(query.email) || null;
  }

  static async findAll() {
    return FileStorage.getAllAdmins();
  }

  static async findById(id) {
    const admins = FileStorage.getAllAdmins();
    return admins.find(a => a._id === id) || null;
  }

  static async deleteById(id) {
    const admins = FileStorage.getAllAdmins();
    const filteredAdmins = admins.filter(a => a._id !== id);
    FileStorage.saveAdmins(filteredAdmins);
    return true;
  }

  async save() {
    mockDb.admins.push(this);
    FileStorage.addAdmin(this);
    return this;
  }

  async comparePassword(password) {
    return this.password === password;
  }
}

// Initialize admin array in mockDb
mockDb.admins = FileStorage.getAllAdmins();

module.exports = {
  Student: MockStudent,
  Faculty: MockFaculty,
  Admin: MockAdmin,
  mockDb
};
