CREATE TABLE assignment_submissions (
    submission_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    assignment_id INT NOT NULL,
    Student_ID VARCHAR(20) NOT NULL,
    submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    file_path VARCHAR(500) NULL,
    submission_text TEXT NULL,
    marks_obtained DECIMAL(5, 2) NULL,
    feedback TEXT NULL,
    graded_by VARCHAR(20) NULL,
    graded_date TIMESTAMP NULL DEFAULT NULL,
    status ENUM('submitted', 'graded', 'late', 'resubmit') DEFAULT 'submitted',
    
    CONSTRAINT fk_submission_assignment 
        FOREIGN KEY (assignment_id) 
        REFERENCES assignments(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_submission_student 
        FOREIGN KEY (Student_ID) 
        REFERENCES students(Student_ID) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_submission_grader 
        FOREIGN KEY (graded_by) 
        REFERENCES faculty(Faculty_ID) 
        ON DELETE SET NULL 
        ON UPDATE CASCADE,
    
    CONSTRAINT unique_submission UNIQUE (assignment_id, Student_ID),
    
    INDEX idx_assignment (assignment_id),
    INDEX idx_student (Student_ID),
    INDEX idx_status (status),
    INDEX idx_submission_date (submission_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;