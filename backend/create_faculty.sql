CREATE TABLE IF NOT EXISTS faculty (
  Faculty_ID VARCHAR(20) PRIMARY KEY,
  Name VARCHAR(255) NOT NULL,
  Branch VARCHAR(100),
  Designation VARCHAR(100),
  Qualification VARCHAR(50),
  Email VARCHAR(255) UNIQUE NOT NULL,
  Phone VARCHAR(20),
  Experience_Years INT,
  Date_of_Joining DATE
);

-- Sample INSERT statements
INSERT INTO faculty (Faculty_ID, Name, Branch, Designation, Qualification, Email, Phone, Experience_Years, Date_of_Joining) VALUES
('FAC001', 'Dr. Ashok Kumar', 'Computer Science', 'Professor', 'PhD', 'ashok.kumar@college.edu', '9123456780', 15, '2009-01-15'),
('FAC002', 'Dr. Neha Sharma', 'Computer Science', 'Associate Professor', 'PhD', 'neha.sharma@college.edu', '9123456781', 10, '2014-06-20'),
('FAC003', 'Prof. Rajesh Singh', 'Electronics', 'Professor', 'M.Tech', 'rajesh.singh@college.edu', '9123456782', 18, '2006-08-10');
-- Add more INSERTs as needed
