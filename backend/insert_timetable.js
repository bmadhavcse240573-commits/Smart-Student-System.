const mysql = require('mysql2/promise');

const timetableData = [
    // MONDAY
    { day: 'Monday', start: '09:10', end: '11:10', subject: 'OS LAB(B1) / DBMS LAB(B2)', faculty: 'Ms. Naga Sujini / Dr. Ch Ramesh babu', room: 'D-001 / D-202' },
    { day: 'Monday', start: '11:10', end: '11:15', subject: 'WATER BREAK', faculty: '', room: '' },
    { day: 'Monday', start: '11:15', end: '12:15', subject: 'OS', faculty: 'Ms. G. Naga Sujini', room: '' },
    { day: 'Monday', start: '12:15', end: '13:00', subject: 'LUNCH', faculty: '', room: '' },
    { day: 'Monday', start: '13:00', end: '14:00', subject: 'DBMS', faculty: 'Dr. Ch Ramesh babu', room: '' },
    { day: 'Monday', start: '14:00', end: '16:05', subject: 'OS LAB(B2) / DBMS LAB(B1)', faculty: 'Ms. Naga Sujini / Dr. Ch Ramesh babu', room: 'D-001 / D-202' },

    // TUESDAY
    { day: 'Tuesday', start: '09:10', end: '10:10', subject: 'SE', faculty: 'Dr. B. Madhava Rao', room: '' },
    { day: 'Tuesday', start: '10:10', end: '11:10', subject: 'DM', faculty: 'Dr. M Mamatha', room: '' },
    { day: 'Tuesday', start: '11:10', end: '11:15', subject: 'WATER BREAK', faculty: '', room: '' },
    { day: 'Tuesday', start: '11:15', end: '12:15', subject: 'BEFA', faculty: 'Ms. Malbu Rani', room: '' },
    { day: 'Tuesday', start: '12:15', end: '13:00', subject: 'LUNCH', faculty: '', room: '' },
    { day: 'Tuesday', start: '13:00', end: '14:00', subject: 'OS', faculty: 'Ms. G. Naga Sujini', room: '' },
    { day: 'Tuesday', start: '14:00', end: '15:00', subject: 'DM', faculty: 'Dr. M Mamatha', room: '' },
    { day: 'Tuesday', start: '15:00', end: '15:05', subject: 'WATER BREAK', faculty: '', room: '' },
    { day: 'Tuesday', start: '15:05', end: '16:05', subject: 'COI', faculty: 'Dr T Siva Sankar Reddy', room: '' },

    // WEDNESDAY
    { day: 'Wednesday', start: '09:10', end: '10:10', subject: 'OS', faculty: 'Ms. G. Naga Sujini', room: '' },
    { day: 'Wednesday', start: '10:10', end: '11:10', subject: 'DBMS', faculty: 'Dr. Ch Ramesh babu', room: '' },
    { day: 'Wednesday', start: '11:10', end: '11:15', subject: 'WATER BREAK', faculty: '', room: '' },
    { day: 'Wednesday', start: '11:15', end: '12:15', subject: 'DM', faculty: 'Dr. M Mamatha', room: '' },
    { day: 'Wednesday', start: '12:15', end: '13:00', subject: 'LUNCH', faculty: '', room: '' },
    { day: 'Wednesday', start: '13:00', end: '14:00', subject: 'SE', faculty: 'Dr. B. Madhava Rao', room: '' },
    { day: 'Wednesday', start: '14:00', end: '15:00', subject: 'COI', faculty: 'Dr T Siva Sankar Reddy', room: '' },
    { day: 'Wednesday', start: '15:00', end: '15:05', subject: 'WATER BREAK', faculty: '', room: '' },
    { day: 'Wednesday', start: '15:05', end: '16:05', subject: 'MENTORING', faculty: '', room: '' },

    // THURSDAY
    { day: 'Thursday', start: '09:10', end: '10:10', subject: 'DBMS', faculty: 'Dr. Ch Ramesh babu', room: '' },
    { day: 'Thursday', start: '10:10', end: '11:10', subject: 'SE', faculty: 'Dr. B. Madhava Rao', room: '' },
    { day: 'Thursday', start: '11:10', end: '11:15', subject: 'WATER BREAK', faculty: '', room: '' },
    { day: 'Thursday', start: '11:15', end: '12:15', subject: 'BEFA', faculty: 'Ms. Malbu Rani', room: '' },
    { day: 'Thursday', start: '12:15', end: '13:00', subject: 'LUNCH', faculty: '', room: '' },
    { day: 'Thursday', start: '13:00', end: '15:00', subject: 'NODE JS LAB(B1) / RTP(B2)', faculty: 'Ms. S Renuka / Dr. K. Satish Kumar', room: 'D-110 / D-001A' },
    { day: 'Thursday', start: '15:00', end: '15:05', subject: 'WATER BREAK', faculty: '', room: '' },
    { day: 'Thursday', start: '15:05', end: '16:05', subject: 'RTP', faculty: 'Dr. K. Satish Kumar / Mr. N Rama Krishna', room: '' },

    // FRIDAY
    { day: 'Friday', start: '09:10', end: '10:10', subject: 'RTP', faculty: 'Dr. K. Satish Kumar / Mr. N Rama Krishna', room: '' },
    { day: 'Friday', start: '10:10', end: '12:15', subject: 'NODE JS LAB(B2) / RTP(B1)', faculty: 'Ms. S Renuka / Dr. K. Satish Kumar', room: 'D-110 / D-001A' },
    { day: 'Friday', start: '12:15', end: '13:00', subject: 'LUNCH', faculty: '', room: '' },
    { day: 'Friday', start: '13:00', end: '14:00', subject: 'BEFA', faculty: 'Ms. Malbu Rani', room: '' },
    { day: 'Friday', start: '14:00', end: '15:00', subject: 'COI', faculty: 'Dr T Siva Sankar Reddy', room: '' },
    { day: 'Friday', start: '15:00', end: '15:05', subject: 'WATER BREAK', faculty: '', room: '' },
    { day: 'Friday', start: '15:05', end: '16:05', subject: 'SPORTS', faculty: '', room: '' },

    // SATURDAY
    { day: 'Saturday', start: '09:10', end: '11:10', subject: 'CISCO ACTIVITIES', faculty: 'Ms. S Vijaya lakshmi', room: '' },
    { day: 'Saturday', start: '11:10', end: '11:15', subject: 'WATER BREAK', faculty: '', room: '' },
    { day: 'Saturday', start: '11:15', end: '12:15', subject: 'LIBRARY', faculty: '', room: '' },
    { day: 'Saturday', start: '12:15', end: '13:00', subject: 'LUNCH', faculty: '', room: '' },
    { day: 'Saturday', start: '13:00', end: '15:00', subject: 'CO-CURRICULAR', faculty: '', room: '' },
    { day: 'Saturday', start: '15:00', end: '15:05', subject: 'WATER BREAK', faculty: '', room: '' },
    { day: 'Saturday', start: '15:05', end: '16:05', subject: 'EXTRA-CURRICULAR', faculty: '', room: '' },
];

async function run() {
    try {
        const pool = mysql.createPool({ host: 'localhost', user: 'root', password: 'Madhav@05', database: 'engineering_college' });
        
        // Ensure table exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS class_timetables (
                Timetable_ID INT AUTO_INCREMENT PRIMARY KEY,
                Section_ID INT NOT NULL,
                Day_of_Week VARCHAR(20) NOT NULL,
                Start_Time VARCHAR(10) NOT NULL,
                End_Time VARCHAR(10) NOT NULL,
                Subject_Name VARCHAR(150) NOT NULL,
                Faculty_Name VARCHAR(150) NULL,
                Room_No VARCHAR(50) NULL,
                Notes VARCHAR(255) NULL,
                Created_By VARCHAR(80) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_timetable_section_day (Section_ID, Day_of_Week)
            )
        `);

        // Delete existing timetable for section 8 to avoid duplicates when running this multiple times
        await pool.query('DELETE FROM class_timetables WHERE Section_ID = 8');

        // Insert new data
        for (const tm of timetableData) {
            await pool.query(
                `INSERT INTO class_timetables 
                (Section_ID, Day_of_Week, Start_Time, End_Time, Subject_Name, Faculty_Name, Room_No, Created_By)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [8, tm.day, tm.start, tm.end, tm.subject, tm.faculty || null, tm.room || null, 'admin']
            );
        }

        console.log('Inserted timetable successfully.');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
