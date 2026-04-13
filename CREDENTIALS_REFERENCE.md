# Smart Student System - Login Credentials Reference

## ✅ System Overview

| Component | Count | Status |
|-----------|-------|--------|
| **Total Users** | 4,258 | ✅ Created |
| **Student Credentials** | 3,997 | ✅ Generated |
| **Faculty Credentials** | 280 | ✅ Generated |
| **Admin Accounts** | 1 | ✅ Pre-configured |

---

## 🔐 Login URLs

- **Student/Faculty Login Page**: `http://localhost:3000/login.html`
- **Admin Dashboard**: `http://localhost:3000/admin-dashboard.html`
- **Landing Page**: `http://localhost:3000`

---

## 👥 User Account Types & Formats

### Student Account Format
- **Email**: `firstname.number@engineeringcollege.edu`
- **Password**: `FirstName@2026`
- **Example**:
  - Email: `pooja.1@engineeringcollege.edu`
  - Password: `Pooja@2026`

### Faculty Account Format
- **Email**: `firstname.number@engineeringcollege.edu`
- **Password**: `FirstName@2026`
- **Example**:
  - Email: `arjun.1@engineeringcollege.edu`
  - Password: `Arjun@2026`

### Admin Account (Super Admin)
- **Username**: `admin`
- **Password**: `Admin@123`
- **Access**: Full admin dashboard with all controls

---

## 📋 Sample Student Credentials

### Computer Science Students
```
Email: pooja.1@engineeringcollege.edu
Password: Pooja@2026

Email: meghana.2@engineeringcollege.edu
Password: Meghana@2026

Email: karthik.3@engineeringcollege.edu
Password: Karthik@2026

Email: aarav.7@engineeringcollege.edu
Password: Aarav@2026

Email: aditya.8@engineeringcollege.edu
Password: Aditya@2026
```

### Electronics Students
```
Email: keerthi.6@engineeringcollege.edu
Password: Keerthi@2026

Email: ananya.10@engineeringcollege.edu
Password: Ananya@2026
```

---

## 📋 Sample Faculty Credentials

### Computer Science Faculty
```
Email: arjun.1@engineeringcollege.edu
Password: Arjun@2026
Name: Arjun Verma
Designation: Professor

Email: rahul.2@engineeringcollege.edu
Password: Rahul@2026
Name: Rahul Gupta
Designation: Associate Professor

Email: divya.3@engineeringcollege.edu
Password: Divya@2026
Name: Divya Gupta
Designation: Professor
```

### Electronics Faculty
```
Email: sneha.4@engineeringcollege.edu
Password: Sneha@2026
Name: Sneha Sharma
Designation: Associate Professor
```

---

## 🔍 Finding More Credentials

### Option 1: Admin Dashboard
1. Login to Admin Dashboard: `http://localhost:3000/admin-dashboard.html`
2. Use credentials: `admin` / `Admin@123`
3. Go to "All Credentials (4K+)" section
4. Search by:
   - Email address
   - Name
   - User ID
   - Student/Faculty type

### Option 2: MySQL Direct Query
```bash
# Get all student credentials
mysql -u root engineering_college -e "SELECT email, password, user_name FROM credentials WHERE user_type='student' LIMIT 20;"

# Get all faculty credentials
mysql -u root engineering_college -e "SELECT email, password, user_name FROM credentials WHERE user_type='faculty';"

# Search by name
mysql -u root engineering_college -e "SELECT email, password, user_type FROM credentials WHERE user_name LIKE '%Rajesh%';"

# Count by type
mysql -u root engineering_college -e "SELECT user_type, COUNT(*) FROM credentials GROUP BY user_type;"
```

---

## 🎯 Password Pattern Reference

All passwords follow this simple pattern:
- **Format**: `FirstName@2026`
- **First Name**: Extracted from the full name (first word)
- **Year**: 2026 (consistent across all users)

**Examples**:
| Full Name | First Name | Password |
|-----------|-----------|----------|
| Pooja Reddy | Pooja | Pooja@2026 |
| Arjun Verma | Arjun | Arjun@2026 |
| Rahul Gupta | Rahul | Rahul@2026 |
| Divya Gupta | Divya | Divya@2026 |
| Meghana Naidu | Meghana | Meghana@2026 |

---

## 🚀 Login Flow

### For Students/Faculty:
1. Go to: `http://localhost:3000/login.html`
2. Enter your email (from credentials table)
3. Enter your password (FirstName@2026)
4. Click "Login"
5. Get redirected to your student/faculty dashboard

### For Admin:
1. Go to: `http://localhost:3000/admin-dashboard.html`
2. Enter username: `admin`
3. Enter password: `Admin@123`
4. Access admin dashboard with full controls

---

## 📊 Admin Dashboard Features

**Dashboard Tab**:
- View statistics (total students, faculty, placement status)
- Branch-wise distribution
- Placement analytics

**All Students Tab**:
- View all 3,997 student records
- Search and filter
- View CGPA, attendance, placement status

**All Faculty Tab**:
- View all 280 faculty members
- Search by name or ID
- View designations and branches

**All Credentials Tab** (New!):
- View all 4,258 login credentials
- Search by email, name, or ID
- Filter by student/faculty type
- Export for reference

**Admin Credentials Tab**:
- View super admin accounts
- Manage admin access

---

## ⚡ Quick Access

### Most Common Test Credentials

**Student**:
- Email: `pooja.1@engineeringcollege.edu`
- Password: `Pooja@2026`

**Faculty**:
- Email: `arjun.1@engineeringcollege.edu`
- Password: `Arjun@2026`

**Admin**:
- Username: `admin`
- Password: `Admin@123`

---

## 🔧 Database Details

### Credentials Table Structure
```sql
CREATE TABLE credentials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  user_name VARCHAR(100),
  user_type ENUM('student', 'faculty') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Total Records: 4,258
- Students: 3,997 ✅
- Faculty: 280 ✅
- Admin accounts synced

---

## 📱 Features Available After Login

### For Students:
- View personal academic information
- Check placement status
- View CGPA and attendance
- Register for events
- View news and updates

### For Faculty:
- View faculty profile
- Check assigned students
- View departmental updates
- Register for events

### For Admin:
- Manage all student records
- Manage all faculty records
- View all login credentials
- Export data
- System statistics
- Search and filter functionality

---

## 🆘 Troubleshooting

### "Invalid email or password"
- Check that email is correct (case-sensitive)
- Password format is: FirstName@2026
- Verify user exists in database

### "Backend not responding"
- Make sure backend server is running on port 5000
- Check command: MySQL port 3306 is accessible

### "Database connection error"
- Verify MySQL is running
- Check database `engineering_college` exists
- Verify credentials table has data: `SELECT COUNT(*) FROM credentials;`

---

## 📝 Notes

- All passwords are in plaintext for demo/testing purposes
- In production, passwords should be hashed
- Consider implementing two-factor authentication
- Add password reset functionality
- Implement role-based access control (RBAC)

---

Generated: February 21, 2026
Total Credentials: 4,258
Database: engineering_college
