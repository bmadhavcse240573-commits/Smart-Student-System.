CREATE TABLE IF NOT EXISTS attendance (
  Attendance_ID INT AUTO_INCREMENT PRIMARY KEY,
  Student_ID VARCHAR(20),
  Faculty_ID VARCHAR(20),
  Date DATE NOT NULL,
  Period TINYINT NOT NULL,
  Status ENUM('Present', 'Absent', 'Leave') NOT NULL,
  Subject VARCHAR(100),
  Timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (Student_ID) REFERENCES students(Student_ID),
  FOREIGN KEY (Faculty_ID) REFERENCES faculty(Faculty_ID)
);

-- Sample usage:
-- INSERT INTO attendance (Student_ID, Faculty_ID, Date, Period, Status, Subject) VALUES ('STU001', 'FAC001', '2026-03-18', 1, 'Present', 'Mathematics');
