const jwt = require('jsonwebtoken');

function authAnyRole(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.userId = String(decoded.id || '').trim();
    req.userEmail = String(decoded.email || '').trim();
    req.userName = String(decoded.name || '').trim();
    req.userType = decoded.user_type || decoded.userType || decoded.role || null;
    return next();
  } catch (_err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

async function resolveStudentForRequest(connection, req) {
  const directId = String(req.userId || '').trim();
  const email = String(req.userEmail || '').trim();

  if (directId) {
    const [rows] = await connection.query(
      'SELECT Student_ID, Name, Branch, Year, Email FROM students WHERE Student_ID = ? LIMIT 1',
      [directId]
    );
    if (rows.length) return rows[0];
  }

  if (email) {
    const [rows] = await connection.query(
      'SELECT Student_ID, Name, Branch, Year, Email FROM students WHERE Email = ? LIMIT 1',
      [email]
    );
    if (rows.length) return rows[0];
  }

  try {
    const numericId = Number(directId);
    const idForQuery = Number.isFinite(numericId) ? numericId : -1;
    const [credRows] = await connection.query(
      `SELECT user_id
       FROM credentials
       WHERE user_type = 'student'
         AND (user_id = ? OR email = ? OR id = ?)
       LIMIT 1`,
      [directId || '', email || '', idForQuery]
    );

    if (credRows.length) {
      const mappedId = String(credRows[0].user_id || '').trim();
      if (mappedId) {
        const [rows] = await connection.query(
          'SELECT Student_ID, Name, Branch, Year, Email FROM students WHERE Student_ID = ? LIMIT 1',
          [mappedId]
        );
        if (rows.length) return rows[0];
      }
    }
  } catch (_ignore) {}

  return null;
}

async function resolveFacultyForRequest(connection, req) {
  const directId = String(req.userId || '').trim();
  const email = String(req.userEmail || '').trim();

  if (directId) {
    const [rows] = await connection.query(
      'SELECT Faculty_ID, Name, Branch, Email FROM faculty WHERE Faculty_ID = ? LIMIT 1',
      [directId]
    );
    if (rows.length) return rows[0];
  }

  if (email) {
    const [rows] = await connection.query(
      'SELECT Faculty_ID, Name, Branch, Email FROM faculty WHERE Email = ? LIMIT 1',
      [email]
    );
    if (rows.length) return rows[0];
  }

  try {
    const numericId = Number(directId);
    const idForQuery = Number.isFinite(numericId) ? numericId : -1;
    const [credRows] = await connection.query(
      `SELECT user_id
       FROM credentials
       WHERE user_type = 'faculty'
         AND (user_id = ? OR email = ? OR id = ?)
       LIMIT 1`,
      [directId || '', email || '', idForQuery]
    );

    if (credRows.length) {
      const mappedId = String(credRows[0].user_id || '').trim();
      if (mappedId) {
        const [rows] = await connection.query(
          'SELECT Faculty_ID, Name, Branch, Email FROM faculty WHERE Faculty_ID = ? LIMIT 1',
          [mappedId]
        );
        if (rows.length) return rows[0];
      }
    }
  } catch (_ignore) {}

  return null;
}

module.exports = {
  authAnyRole,
  resolveStudentForRequest,
  resolveFacultyForRequest
};
