# Smart Student Performance and Skill System

A professional full-stack application for tracking student performance and skill development with separate dashboards for students and faculty.

## Features

✅ **Student Registration & Login** - Secure authentication with JWT  
✅ **Faculty Registration & Login** - Manage student data and performance  
✅ **Student Dashboard** - View academic performance and skills  
✅ **Faculty Dashboard** - Manage students and track performance  
✅ **Performance Analytics** - Real-time performance tracking  
✅ **Responsive Design** - Works on desktop and mobile  

## Tech Stack

### Frontend
- React.js
- React Router v5
- CSS3 with modern styling
- Webpack & Babel

### Backend
- Node.js with Express
- MongoDB 
- JWT Authentication
- Bcrypt for password hashing
- CORS for cross-origin requests

## Project Structure

```
smart-student-system/
├── src/                          # Frontend React app
│   ├── components/               # Reusable components
│   ├── pages/                    # Page components
│   │   ├── Home.js
│   │   ├── Register.js
│   │   ├── Login.js
│   │   ├── StudentDashboard.js
│   │   └── FacultyDashboard.js
│   ├── styles/                   # CSS files
│   ├── App.js                    # Main app component
│   └── index.js                  # Entry point
├── webpack.config.js             # Webpack configuration
└── package.json                  # Frontend dependencies

../backend/                        # Node/Express backend
├── models/                       # Database schemas
│   ├── Student.js
│   └── Faculty.js
├── routes/                       # API routes
│   ├── auth.js
│   ├── student.js
│   └── faculty.js
├── server.js                     # Express server
├── .env                          # Environment variables
└── package.json                  # Backend dependencies
```

## Setup Instructions

### Prerequisites
- Node.js (v14+)
- MongoDB (local or Atlas)
- npm or yarn

### Backend Setup

1. Navigate to backend directory:
   ```bash
   cd ../backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` file with:
   ```
   MONGODB_URI=mongodb://localhost:27017/smart-student
   JWT_SECRET=your_jwt_secret_key_here
   PORT=5000
   ```

4. Start the backend server:
   ```bash
   npm run dev
   # or
   npm start
   ```
   Backend will run on `http://localhost:5000`

### Frontend Setup

1. In the smart-student-system directory:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm start
   ```
   Frontend will run on `http://localhost:3000`

## Usage

### For Students:
1. Click "Get Started" on the home page
2. Select "Student Registration"
3. Fill in your details and register
4. Login with your credentials
5. Access your dashboard to view performance and skills

### For Faculty:
1. Click "Get Started" on the home page
2. Select "Faculty Registration"
3. Fill in your details and register
4. Login with your credentials
5. Access your dashboard to manage students and view their performance

## API Endpoints

### Authentication
- `POST /api/auth/register-student` - Register a student
- `POST /api/auth/register-faculty` - Register faculty
- `POST /api/auth/login` - Login for both students and faculty

### Student Routes
- `GET /api/student/performance` - Get student performance (requires token)

### Faculty Routes
- `GET /api/faculty/students` - Get list of students (requires token)

## Environment Variables

### Backend (.env)
```
MONGODB_URI=mongodb://localhost:27017/smart-student
JWT_SECRET=your_jwt_secret_key_here_change_in_production
PORT=5000
```

## Running Both Frontend & Backend

### Option 1: Two Terminal Windows
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd smart-student-system
npm start
```

### Option 2: Using npm-run-all (recommended)
```bash
npm install -g npm-run-all

# In the root folder, create a package.json:
{
  "scripts": {
    "dev": "npm-run-all --parallel backend frontend",
    "backend": "cd backend && npm run dev",
    "frontend": "cd smart-student-system && npm start"
  }
}

npm run dev
```

## Available Routes

- `/` - Home page
- `/register` - Registration page (choose student or faculty)
- `/login` - Login page
- `/student-dashboard` - Student dashboard (after login)
- `/faculty-dashboard` - Faculty dashboard (after login)

## Demo Credentials (After Registration)

After registering a student or faculty account, you can login with those credentials.

## File Structure

### Frontend Components
- **Navbar.js** - Navigation bar with links
- **Home.js** - Landing page with features
- **Register.js** - Registration form with user type selection
- **Login.js** - Login form with user type selection
- **StudentDashboard.js** - Student profile and performance view
- **FacultyDashboard.js** - Faculty profile and student management

### Backend Models
- **Student.js** - MongoDB schema for students
- **Faculty.js** - MongoDB schema for faculty

### Database Schema

#### Students Collection
```json
{
  "_id": ObjectId,
  "fullName": String,
  "email": String,
  "password": String (hashed),
  "studentId": String,
  "department": String,
  "gpa": Number,
  "credits": Number,
  "semester": Number,
  "status": String,
  "createdAt": Date
}
```

#### Faculty Collection
```json
{
  "_id": ObjectId,
  "fullName": String,
  "email": String,
  "password": String (hashed),
  "facultyId": String,
  "subject": String,
  "qualification": String,
  "students": [ObjectIds],
  "createdAt": Date
}
```

## Security Features

✅ JWT-based authentication  
✅ Bcrypt password hashing  
✅ CORS protection  
✅ Token-based API authorization  
✅ Secure password storage  

## Future Enhancements

- [ ] Email verification
- [ ] Password reset functionality
- [ ] Real-time notifications
- [ ] Advanced analytics and reporting
- [ ] Assignment submission portal
- [ ] Grade management system
- [ ] Attendance tracking
- [ ] Two-factor authentication

## Troubleshooting

### MongoDB connection failed
- Ensure MongoDB is running locally or update `MONGODB_URI` in `.env`

### Port already in use
- Change `PORT` in backend `.env`
- Change port in webpack.config.js devServer

### API calls returning 404
- Ensure backend is running on port 5000
- Check if API endpoints match in both frontend and backend

## Support

For issues or questions, please create an issue in the repository.

## License

MIT License - Feel free to use this project for educational and commercial purposes.

---

**Built with ❤️ for smart education management**
