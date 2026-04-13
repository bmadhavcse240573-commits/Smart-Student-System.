# Quick Database Setup for Windows

## Step 1: Open PowerShell as Administrator
Right-click PowerShell and select "Run as administrator"

## Step 2: Verify MySQL is Running
```powershell
# Check if MySQL service is running
Get-Service -Name MySQL80 | Select-Object Status

# If not running, start it:
Start-Service -Name MySQL80
```

## Step 3: Import the SQL Database
Replace the password if your MySQL has one:

```powershell
# Navigate to Downloads folder
cd "C:\Users\B MAdhav\Downloads"

# Import the database (no password):
mysql -u root engineering_college < Engineering_College_4000_Students.sql

# If you have a MySQL password:
mysql -u root -p engineering_college < Engineering_College_4000_Students.sql
```

When prompted for password, enter your MySQL root password (or press Enter if no password).

## Step 4: Verify Import Success
```powershell
# Count total students
mysql -u root engineering_college -e "SELECT COUNT(*) as total_students FROM students;"

# You should see: 4000 (or similar count)
```

## Step 5: Verify Backend Configuration
Check that backend `.env` file has:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=engineering_college
DB_PORT=3306
```

If you have a MySQL password, update `DB_PASSWORD=your_password`

## Step 6: Stop Old Backend Server & Start New One
```powershell
# Kill any running backend processes on port 5000
netstat -ano | findstr :5000
# Note the PID number in the output, then:
taskkill /PID <PID_NUMBER> /F

# Navigate to backend
cd "c:\Users\B MAdhav\OneDrive\Documents\smart\backend"

# Start the server
npm start

# You should see:
# ✅ MySQL Database connected successfully!
# 📊 Database: engineering_college
# 🖥️  Host: localhost
# 🚀 Backend server running on http://localhost:5000
```

## Step 7: Test the Connection
Open a new PowerShell and run:

```powershell
# Get all students
Invoke-WebRequest -Uri http://localhost:5000/api/student/all -UseBasicParsing | Select-Object -ExpandProperty Content

# Get students from CSE branch
Invoke-WebRequest -Uri http://localhost:5000/api/student/branch/CSE -UseBasicParsing | Select-Object -ExpandProperty Content

# Get students with "Placed" status
Invoke-WebRequest -Uri http://localhost:5000/api/student/placement/Placed -UseBasicParsing | Select-Object -ExpandProperty Content
```

---

## Available API Endpoints

### Basic Endpoints
```
GET /api/student/all                          - Get all students (limit: 100)
GET /api/student/:studentId                   - Get specific student by ID
GET /api/student/branch/CSE                   - Get students by branch
GET /api/student/placement/Placed              - Get students by placement
GET /api/student/stats/placement-summary       - Get placement statistics
```

### Example Calls
```powershell
# Get student BT20260001
Invoke-WebRequest -Uri http://localhost:5000/api/student/BT20260001

# Get all ECE branch students  
Invoke-WebRequest -Uri http://localhost:5000/api/student/branch/ECE

# Get students not placed yet
Invoke-WebRequest -Uri http://localhost:5000/api/student/placement/"Not Placed"
```

---

## Troubleshooting

### Port 5000 already in use?
```powershell
netstat -ano | findstr :5000
taskkill /PID <number> /F
```

### MySQL not found?
```powershell
# Check if MySQL is installed:
Get-Service -Name MySQL*

# Start MySQL service:
Start-Service -Name MySQL80
```

### "Access denied for user 'root'@'localhost'"
Your MySQL has a password. Update in backend/.env:
```
DB_PASSWORD=your_actual_password
```

### Database import failed?
Make sure you're in the correct directory:
```powershell
cd "C:\Users\B MAdhav\Downloads"
ls | findstr Engineering_College
```

---

## Connection String if Needed
```
mysql://root@localhost:3306/engineering_college
```

Now your Smart Student System is connected to the real student database! 🎉
