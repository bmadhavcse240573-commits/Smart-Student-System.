-- Create sections table
CREATE TABLE IF NOT EXISTS sections (
  Section_ID INT AUTO_INCREMENT PRIMARY KEY,
  Section_Name VARCHAR(20) NOT NULL,
  Branch VARCHAR(100) NOT NULL,
  Year INT NOT NULL
);

-- Map students to sections
CREATE TABLE IF NOT EXISTS section_students (
  Section_ID INT,
  Student_ID VARCHAR(20),
  PRIMARY KEY (Section_ID, Student_ID),
  FOREIGN KEY (Section_ID) REFERENCES sections(Section_ID) ON DELETE CASCADE,
  FOREIGN KEY (Student_ID) REFERENCES students(Student_ID) ON DELETE CASCADE
);

-- Map faculty to sections (one faculty per section)
CREATE TABLE IF NOT EXISTS section_faculty (
  Section_ID INT PRIMARY KEY,
  Faculty_ID VARCHAR(20),
  FOREIGN KEY (Section_ID) REFERENCES sections(Section_ID) ON DELETE CASCADE,
  FOREIGN KEY (Faculty_ID) REFERENCES faculty(Faculty_ID) ON DELETE SET NULL
);