-- Populate credentials table with students
INSERT INTO credentials (email, password, user_id, user_name, user_type)
SELECT 
  Email,
  CONCAT(SUBSTRING_INDEX(Name, ' ', 1), '@2026'),
  Student_ID,
  Name,
  'student'
FROM students
WHERE Email IS NOT NULL AND Email != ''
ON DUPLICATE KEY UPDATE password = VALUES(password);

-- Populate credentials table with faculty
INSERT INTO credentials (email, password, user_id, user_name, user_type)
SELECT 
  Email,
  CONCAT(SUBSTRING_INDEX(Name, ' ', 1), '@2026'),
  Faculty_ID,
  Name,
  'faculty'
FROM faculty
WHERE Email IS NOT NULL AND Email != ''
ON DUPLICATE KEY UPDATE password = VALUES(password);

-- Verify
SELECT COUNT(*) as total_credentials FROM credentials;
SELECT email, password, user_type FROM credentials LIMIT 10;
