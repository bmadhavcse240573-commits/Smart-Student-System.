# Database Setup Guide

## Overview
The Smart Student System now uses MySQL database to store all student data. The SQL file contains engineering college data with 4000+ students.

## Prerequisites
- **MySQL Server** installed and running (Download: https://www.mysql.com/downloads/)
- **MySQL Command Line** or **MySQL Workbench**

---

## Step 1: Start MySQL Server

### Windows
```bash
# If MySQL is installed as a service, it should start automatically
# To verify MySQL is running:
mysql -u root -p

# If you get a connection prompt, MySQL is running
# Press Ctrl+C to exit
```

### macOS/Linux
```bash
# Start MySQL
mysql.server start

# Verify connection
mysql -u root -p
```

---

## Step 2: Import the SQL File

### Option A: Using Command Line (Recommended)
```bash
# Navigate to where the SQL file is located
cd "c:\Users\B MAdhav\Downloads"

# Import the database
mysql -u root engineering_college < Engineering_College_4000_Students.sql

# Or if you have a password:
mysql -u root -p engineering_college < Engineering_College_4000_Students.sql
```

### Option B: Using MySQL Workbench
1. Open MySQL Workbench
2. Create a new connection to your MySQL server (if not already done)
3. Click "File" → "Open SQL Script"
4. Select `Engineering_College_4000_Students.sql`
5. Click the lightning bolt icon (Execute) to run the script

### Option C: Using phpMyAdmin
1. Open phpMyAdmin in your browser
2. Create a new database called `engineering_college`
3. Click on the database
4. Go to "Import" tab
5. Choose the SQL file and click "Go"

---

## Step 3: Verify Database Import

Connect to MySQL and check the data:

```bash
# Connect to MySQL
mysql -u root -p engineering_college

# List tables
SHOW TABLES;

# Count students
SELECT COUNT(*) as total_students FROM students;

# View sample student record
SELECT * FROM students LIMIT 1;
```

Expected output:
```
+-------+
| COUNT(*) |
+-------+
| 4000  |
+-------+
```

---

## Step 4: Configure Backend Connection

### Update .env file in backend directory
The `.env` file in `backend/` should have:

```env
# MySQL Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=engineering_college
DB_PORT=3306
```

**If you have a MySQL password:**
```env
DB_PASSWORD=your_mysql_password
```

---

## Step 5: Test Backend Database Connection

1. Stop the backend server if running (Ctrl+C)
2. Start the backend server:
```bash
cd backend
npm start
```

You should see:
```
✅ MySQL Database connected successfully!
📊 Database: engineering_college
🖥️  Host: localhost
🚀 Backend server running on http://localhost:5000
```

---

## Available API Endpoints

### Get All Students
```bash
GET http://localhost:5000/api/student/all
```

### Search Students by Branch
```bash
GET http://localhost:5000/api/student/branch/CSE
```

### Get Student by ID
```bash
GET http://localhost:5000/api/student/BT20260001
```

### Get Students by Placement Status
```bash
GET http://localhost:5000/api/student/placement/Placed
```

---

## Troubleshooting

### Error: "connect ECONNREFUSED 127.0.0.1:3306"
**Solution:** MySQL is not running
```bash
# Windows
net start MySQL80

# macOS
mysql.server start

# Linux
sudo systemctl start mysql
```

### Error: "ER_NO_DB_ERROR: No database selected"
**Solution:** The database wasn't created. Run the SQL import commands above.

### Error: "ER_ACCESS_DENIED_FOR_USER"
**Solution:** Wrong MySQL password. Update `.env` file with correct password.

### Error: "ENOTFOUND localhost"
**Solution:** MySQL server is not accessible. Check:
- MySQL is installed
- MySQL service is running
- `DB_HOST` in `.env` is correct (usually `localhost` or `127.0.0.1`)

---

## Database Schema

### Students Table
```sql
CREATE TABLE students (
    Student_ID VARCHAR(20) PRIMARY KEY,
    Name VARCHAR(100),
    Father_Name VARCHAR(100),
    Branch VARCHAR(50),
    Year VARCHAR(20),
    Gender VARCHAR(10),
    DOB DATE,
    Phone VARCHAR(15),
    Email VARCHAR(100),
    Address VARCHAR(255),
    City VARCHAR(50),
    State VARCHAR(50),
    CGPA FLOAT,
    Attendance_Percentage INT,
    Backlogs INT,
    Skills VARCHAR(255),
    Internship_Completed VARCHAR(10),
    Placement_Status VARCHAR(20)
);
```

---

## Important Notes

- **Default MySQL User**: `root` (no password by default on local installations)
- **Database Name**: `engineering_college`
- **Total Records**: ~4000 student records
- **Backup**: Keep a copy of the SQL file in a secure location

---

## Next Steps

After successful database connection:
1. Frontend can access student data via API endpoints
2. All analytics and dashboards will use MySQL data
3. Student registrations for events are still saved to `eventRegistrations.json`

For questions or issues, check the server console output for error messages.
