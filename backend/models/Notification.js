const pool = require('../config/database');

// Notification model
class Notification {
  static async create({ userId, userType, message, type = 'info' }) {
    const connection = await pool.getConnection();
    await connection.query(
      'INSERT INTO notifications (user_id, user_type, message, type, created_at) VALUES (?, ?, ?, ?, NOW())',
      [userId, userType, message, type]
    );
    connection.release();
  }

  static async getForUser(userId) {
    const connection = await pool.getConnection();
    const [rows] = await connection.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    connection.release();
    return rows;
  }

  static async getForType(userType) {
    const connection = await pool.getConnection();
    const [rows] = await connection.query(
      'SELECT * FROM notifications WHERE user_type = ? ORDER BY created_at DESC',
      [userType]
    );
    connection.release();
    return rows;
  }
}

module.exports = Notification;
