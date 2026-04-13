# MySQL Database Connection Guide

## Current Status
- ✅ MySQL is installed at: `C:\Program Files\MySQL\MySQL Server 8.0`
- ⚠️ MySQL service is **NOT RUNNING** (requires admin privileges to start)
- ✅ Demo database is working as fallback (showing 5 sample students & faculty)

---

## Option 1: Start MySQL Service (RECOMMENDED - Requires Admin)

### Step 1: Open PowerShell as Administrator
1. Press `Win + X`
2. Click "Windows PowerShell (Admin)"
3. Click "Yes" when prompted

### Step 2: Start MySQL Service
```powershell
Start-Service -Name "MySQL80"
```

Expected output:
```
Status   Name               DisplayName
------   ----               -----------
Running  MySQL80            MySQL80
```

### Step 3: Verify MySQL is Running
```powershell
Get-Service -Name "MySQL80"
```

Should show:
```
Status   Name               DisplayName
------   ----               -----------
Running  MySQL80            MySQL80
```

### Step 4: Import Student Database (4000+ students)
```powershell
cd "C:\Program Files\MySQL\MySQL Server 8.0\bin"

.\mysql.exe -u root < "C:\Users\B MAdhav\Downloads\Engineering_College_4000_Students.sql"
```

### Step 5: Import Faculty Database
```powershell
.\mysql.exe -u root < "C:\Users\B MAdhav\Downloads\Engineering_College_Faculty.sql"
```

### Step 6: Verify Databases
```powershell
.\mysql.exe -u root -e "USE engineering_college; SELECT COUNT(*) as student_count FROM students; SELECT COUNT(*) as faculty_count FROM faculty;"
```

### Step 7: Restart Backend Server
The backend will automatically detect MySQL is running and use real data:

Open a new PowerShell window:
```powershell
cd "c:\Users\B MAdhav\OneDrive\Documents\smart\backend"
npm start
```

---

## Option 2: Start MySQL Manually (Without Service)

If you can't use admin privileges, you can start MySQL directly:

```powershell
cd "C:\Program Files\MySQL\MySQL Server 8.0\bin"

.\mysqld.exe --defaults-file="C:\ProgramData\MySQL\MySQL Server 8.0\my.ini"
```

Then in another PowerShell window, import databases as shown in Option 1, Step 4-5.

---

## Option 3: Use Docker (Alternative)

If you have Docker installed, you can run MySQL in a container:

```powershell
docker run --name mysql-college -e MYSQL_ROOT_PASSWORD=root -p 3306:3306 -d mysql:8.0

# Wait 10 seconds for MySQL to start, then import databases
Start-Sleep -Seconds 10

$sqlFile = Get-Content "C:\Users\B MAdhav\Downloads\Engineering_College_4000_Students.sql" -Raw
docker exec -i mysql-college mysql -u root -proot < "C:\Users\B MAdhav\Downloads\Engineering_College_4000_Students.sql"
```

---

## Verify Connection is Working

### Check Backend Status
```powershell
Invoke-WebRequest -Uri "http://localhost:5000/api/health" -UseBasicParsing
```

Should show connection status.

### Check Admin Dashboard
1. Open browser: `http://localhost:3000/admin-dashboard.html`
2. Login with:
   - Username: `admin`
   - Password: `Admin@123`
3. If MySQL is running, you'll see real data
4. If MySQL is offline, you'll see demo data with note: "Using demo data (MySQL unavailable)"

---

## Current Working Status

### ✅ What's Working NOW (with demo data):
- Admin login system
- Student list view (5 demo students)
- Faculty list view (5 demo faculty)
- Event registration system
- Landing page with events & news

### 🔄 What Will Work After MySQL Connection:
- Real student data (4000+ records)
- Real faculty data  
- Student search functionality
- Branch-wise filtering
- Placement status tracking
- All statistics and dashboards

---

## Troubleshooting

### Error: "Can't connect to MySQL server on 'localhost:3306'"
→ MySQL service is not running. Use Option 1 or 2 above.

### Error: "Unknown database 'engineering_college'"
→ Database doesn't exist. Create it:
```powershell
C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe -u root -e "CREATE DATABASE engineering_college CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### Error: "Access denied for user 'root'@'localhost'"
→ MySQL password issue. Check if root has a password set:
```powershell
C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe -u root -p
```
(Leave password blank if prompted)

### Windows Permission Denied
→ You need to run PowerShell as Administrator for service operations.

---

## Quick Status Check

Run this to see current configuration:
```powershell
# Check service status
Get-Service -Name "MySQL80"

# Check if port 3306 is listening
netstat -ano | findstr :3306

# Check backend connectivity
Invoke-WebRequest -Uri "http://localhost:5000/api/health" -UseBasicParsing | ConvertFrom-Json
```

---

## Support

If you encounter issues:
1. Check the MYSQL_SETUP_GUIDE.md (this file)
2. Verify your Windows user has admin privileges
3. Ensure MySQL is properly installed
4. Check firewall settings (Port 3306 should be open)

The demo database will continue to work even without MySQL!
