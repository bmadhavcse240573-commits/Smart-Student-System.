require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const pool = require('./config/database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});
const frontendDistRoot = path.join(__dirname, '../smart-student-system/dist');
const frontendTextExtensions = new Set(['.html', '.js', '.css', '.json', '.map']);

function resolveFrontendFile(requestPath) {
  const normalizedPath = requestPath === '/' ? '/index.html' : requestPath;
  const candidates = [];

  if (path.extname(normalizedPath)) {
    candidates.push(normalizedPath);
  } else {
    candidates.push(`${normalizedPath}.html`);
    candidates.push(path.posix.join(normalizedPath, 'index.html'));
  }

  for (const candidate of candidates) {
    const absolutePath = path.join(frontendDistRoot, candidate);
    if (absolutePath.startsWith(frontendDistRoot) && fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
      return absolutePath;
    }
  }

  return null;
}

function serveFrontendAsset(req, res, next) {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/') || req.path.startsWith('/socket.io/')) {
    return next();
  }

  const filePath = resolveFrontendFile(req.path);
  if (!filePath) {
    return next();
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!frontendTextExtensions.has(ext)) {
    return res.sendFile(filePath);
  }

  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/https?:\/\/localhost:5000/gi, '');

  const contentTypeMap = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8'
  };

  res.setHeader('Content-Type', contentTypeMap[ext] || 'text/plain; charset=utf-8');
  return res.send(content);
}

const PEER_ROOM_CATALOG = [
  { id: 'dsa-problem-solving', name: 'DSA Problem Solving' },
  { id: 'physics-quick-doubts', name: 'Physics Quick Doubts' },
  { id: 'math-weekly-practice', name: 'Math Weekly Practice' },
  { id: 'exam-sprint-group', name: 'Exam Sprint Group' }
];
const PEER_ROOM_IDS = new Set(PEER_ROOM_CATALOG.map((r) => r.id));

async function persistPeerRoomMessage(message) {
  try {
    await pool.query(
      `INSERT INTO peer_room_messages
        (room_id, user_id, user_type, user_name, message_text, system_flag, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        String(message.roomId || ''),
        String(message.userId || ''),
        String(message.userType || 'student'),
        String(message.userName || 'User'),
        String(message.text || ''),
        message.system ? 1 : 0
      ]
    );
  } catch (_e) {
    // Keep realtime flow non-blocking if DB write fails.
  }
}

async function loadPeerRoomMessages(roomId, limit = 50) {
  try {
    const [rows] = await pool.query(
      `SELECT message_id, room_id, user_id, user_type, user_name, message_text, system_flag, created_at
       FROM peer_room_messages
       WHERE room_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [roomId, Math.max(1, Math.min(200, Number(limit) || 50))]
    );
    return (rows || []).reverse().map((row) => ({
      id: String(row.message_id),
      roomId: String(row.room_id),
      userId: String(row.user_id),
      userType: String(row.user_type),
      userName: String(row.user_name),
      text: String(row.message_text || ''),
      createdAt: row.created_at,
      system: !!row.system_flag
    }));
  } catch (_e) {
    return [];
  }
}

function createPeerRoomStore() {
  const roomMap = new Map();
  const socketRoomMap = new Map();
  const socketUserMap = new Map();

  function nowIso() {
    return new Date().toISOString();
  }

  function ensureRoom(roomId) {
    if (!roomMap.has(roomId)) {
      roomMap.set(roomId, {
        socketIds: new Set(),
        participants: new Map(),
        messages: [],
        mutedAll: false,
        closed: false
      });
    }
    return roomMap.get(roomId);
  }

  function leaveBySocket(socketId) {
    const prevRoomId = socketRoomMap.get(socketId);
    if (!prevRoomId) return null;
    const user = socketUserMap.get(socketId);
    const room = roomMap.get(prevRoomId);
    if (room) {
      room.socketIds.delete(socketId);
      if (user && user.userId) {
        const prevParticipant = room.participants.get(user.userId);
        const prevCount = Number(prevParticipant?.count || 0);
        if (prevCount <= 1) {
          room.participants.delete(user.userId);
        } else {
          room.participants.set(user.userId, { ...prevParticipant, count: prevCount - 1 });
        }
      }
      if (!room.socketIds.size) roomMap.delete(prevRoomId);
    }
    socketRoomMap.delete(socketId);
    socketUserMap.delete(socketId);
    return prevRoomId;
  }

  return {
    join(socketId, roomId, user) {
      if (!PEER_ROOM_IDS.has(roomId)) return false;
      if (!user || !user.userId) return false;
      leaveBySocket(socketId);
      const room = ensureRoom(roomId);
      room.socketIds.add(socketId);
      socketUserMap.set(socketId, user);
      const prevParticipant = room.participants.get(user.userId);
      const prevCount = Number(prevParticipant?.count || 0);
      room.participants.set(user.userId, {
        userId: user.userId,
        userType: user.userType || 'student',
        userName: user.userName || user.userId,
        count: prevCount + 1,
        joinedAt: prevParticipant?.joinedAt || nowIso()
      });
      socketRoomMap.set(socketId, roomId);
      return true;
    },
    leave(socketId) {
      return leaveBySocket(socketId);
    },
    status() {
      return PEER_ROOM_CATALOG.map((item) => {
        const room = roomMap.get(item.id);
        const participants = room ? room.participants : new Map();
        const count = participants.size;
        const moderatorsOnline = Array.from(participants.values()).filter((p) => p.userType === 'faculty').length;
        return {
          roomId: item.id,
          name: item.name,
          active: count > 0,
          participants: count,
          moderatorsOnline,
          mutedAll: !!room?.mutedAll,
          closed: !!room?.closed
        };
      });
    },
    listMessages(roomId) {
      const room = roomMap.get(roomId);
      if (!room) return [];
      return room.messages.slice(-50);
    },
    addMessage(socketId, roomId, text) {
      const activeRoomId = socketRoomMap.get(socketId);
      if (!activeRoomId || activeRoomId !== roomId) return null;
      const user = socketUserMap.get(socketId);
      if (!user || !user.userId) return null;
      const trimmed = String(text || '').trim();
      if (!trimmed) return null;

      const room = ensureRoom(roomId);
      if (room.closed && user.userType !== 'faculty') return null;
      if (room.mutedAll && user.userType !== 'faculty') return null;
      const message = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        roomId,
        userId: user.userId,
        userType: user.userType || 'student',
        userName: user.userName || user.userId,
        text: trimmed.slice(0, 1000),
        createdAt: nowIso()
      };
      room.messages.push(message);
      if (room.messages.length > 100) room.messages = room.messages.slice(-100);
      return message;
    },
    addSystemMessage(roomId, text, meta = {}) {
      if (!PEER_ROOM_IDS.has(roomId)) return null;
      const room = ensureRoom(roomId);
      const message = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        roomId,
        userId: String(meta.userId || 'system'),
        userType: String(meta.userType || 'faculty'),
        userName: String(meta.userName || 'Moderator'),
        text: String(text || '').slice(0, 1000),
        createdAt: nowIso(),
        system: true
      };
      room.messages.push(message);
      if (room.messages.length > 100) room.messages = room.messages.slice(-100);
      return message;
    },
    setRoomFlags(roomId, flags = {}) {
      if (!PEER_ROOM_IDS.has(roomId)) return null;
      const room = ensureRoom(roomId);
      if (typeof flags.mutedAll === 'boolean') room.mutedAll = flags.mutedAll;
      if (typeof flags.closed === 'boolean') room.closed = flags.closed;
      return {
        roomId,
        mutedAll: !!room.mutedAll,
        closed: !!room.closed
      };
    },
    getRoomFlags(roomId) {
      const room = roomMap.get(roomId);
      return {
        mutedAll: !!room?.mutedAll,
        closed: !!room?.closed
      };
    }
  };
}

const peerRoomStore = createPeerRoomStore();

app.set('io', io);
app.set('peerRoomStore', peerRoomStore);

function broadcastPeerRoomStatus() {
  io.to('students').emit('peer-room:update', { rooms: peerRoomStore.status() });
  io.to('facultys').emit('peer-room:update', { rooms: peerRoomStore.status() });
}

io.on('connection', (socket) => {
  let socketUserId = null;
  let socketUserType = null;

  socket.on('register', (payload = {}) => {
    const userType = String(payload.userType || '').trim().toLowerCase();
    const userId = String(payload.userId || '').trim();
    if (!userType || !userId) return;
    socketUserId = userId;
    socketUserType = userType;
    socket.join(`${userType}:${userId}`);
    socket.join(`${userType}s`);
  });

  socket.on('peer-room:join', async (payload = {}) => {
    const roomId = String(payload.roomId || '').trim();
    const userId = String(payload.userId || socketUserId || '').trim();
    const userType = String(payload.userType || 'student').trim().toLowerCase();
    const userName = String(payload.userName || userId).trim();
    if (!roomId || !userId) return;
    const flags = peerRoomStore.getRoomFlags(roomId);
    if (flags.closed && userType !== 'faculty') {
      socket.emit('peer-room:error', { roomId, message: 'This room is currently closed by moderator.' });
      return;
    }
    const joined = peerRoomStore.join(socket.id, roomId, { userId, userType, userName });
    if (!joined) return;
    socket.join(`peerroom:${roomId}`);
    socket.emit('peer-room:joined', { roomId });
    const dbHistory = await loadPeerRoomMessages(roomId, 50);
    socket.emit('peer-room:history', { roomId, messages: dbHistory.length ? dbHistory : peerRoomStore.listMessages(roomId) });
    broadcastPeerRoomStatus();
  });

  socket.on('peer-room:message', (payload = {}) => {
    const roomId = String(payload.roomId || '').trim();
    const text = String(payload.text || '').trim();
    if (!roomId || !text) return;
    const message = peerRoomStore.addMessage(socket.id, roomId, text);
    if (!message) {
      socket.emit('peer-room:error', { roomId, message: 'Cannot send message right now. Room may be muted or closed.' });
      return;
    }
    io.to(`peerroom:${roomId}`).emit('peer-room:message', message);
    persistPeerRoomMessage(message);
  });

  socket.on('peer-room:typing', (payload = {}) => {
    const roomId = String(payload.roomId || '').trim();
    const isTyping = !!payload.isTyping;
    const userName = String(payload.userName || '').trim();
    if (!roomId) return;
    // Rely on room broadcasts only for members; sender is excluded.
    socket.to(`peerroom:${roomId}`).emit('peer-room:typing', {
      roomId,
      userId: socketUserId,
      userName,
      isTyping
    });
  });

  socket.on('peer-room:announce', (payload = {}) => {
    if (socketUserType !== 'faculty') return;
    const roomId = String(payload.roomId || '').trim();
    const text = String(payload.text || '').trim();
    if (!roomId || !text || !PEER_ROOM_IDS.has(roomId)) return;
    const message = peerRoomStore.addSystemMessage(roomId, `[Announcement] ${text}`, {
      userId: socketUserId || 'faculty',
      userType: 'faculty',
      userName: 'Moderator'
    });
    if (!message) return;
    io.to(`peerroom:${roomId}`).emit('peer-room:message', message);
    persistPeerRoomMessage(message);
  });

  socket.on('peer-room:mute-all', (payload = {}) => {
    if (socketUserType !== 'faculty') return;
    const roomId = String(payload.roomId || '').trim();
    const muted = !!payload.muted;
    const flags = peerRoomStore.setRoomFlags(roomId, { mutedAll: muted });
    if (!flags) return;
    io.to(`peerroom:${roomId}`).emit('peer-room:flags', { roomId, ...flags });
    broadcastPeerRoomStatus();
  });

  socket.on('peer-room:close', (payload = {}) => {
    if (socketUserType !== 'faculty') return;
    const roomId = String(payload.roomId || '').trim();
    const closed = !!payload.closed;
    const flags = peerRoomStore.setRoomFlags(roomId, { closed });
    if (!flags) return;
    io.to(`peerroom:${roomId}`).emit('peer-room:flags', { roomId, ...flags });
    if (closed) {
      io.to(`peerroom:${roomId}`).emit('peer-room:closed', { roomId, message: 'Room closed by moderator.' });
    }
    broadcastPeerRoomStatus();
  });

  socket.on('peer-room:leave', () => {
    const prevRoomId = peerRoomStore.leave(socket.id);
    if (prevRoomId) socket.leave(`peerroom:${prevRoomId}`);
    broadcastPeerRoomStatus();
  });

  socket.on('disconnect', () => {
    peerRoomStore.leave(socket.id);
    broadcastPeerRoomStatus();
  });
});

// Initialize Database Connection
try {
  const db = require('./config/database');
  console.log('🔗 Database pool initialized');
} catch (err) {
  console.error('⚠️  Database connection will be initialized on first request');
}

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded assessment files
const uploadsRoot = path.join(__dirname, 'uploads');
try {
  if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot, { recursive: true });
} catch (_) {}
app.use('/uploads', express.static(uploadsRoot));

// Using MySQL database for persistent data storage
console.log('✅ Using MySQL database for data persistence');
console.log('📁 Database: engineering_college');
console.log('💾 All data stored in MySQL\n');

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/login', require('./routes/login'));
app.use('/api/student', require('./routes/student'));
app.use('/api/faculty', require('./routes/faculty'));
app.use('/api/admins', require('./routes/admins'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/events', require('./routes/events'));
app.use('/api/assignments', require('./routes/assignments'));
app.use('/api/doubts', require('./routes/doubts'));
app.use('/api/student-success', require('./routes/studentSuccess'));


app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/sections', require('./routes/sections'));
app.use('/api/timetable', require('./routes/timetable'));
app.use('/api/recommendations', require('./routes/recommendations'));
app.use('/api/attendance-analytics', require('./routes/attendance-analytics'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ message: 'Server is running', timestamp: new Date() });
});

app.use(serveFrontendAsset);

// Auto escalation every 30 minutes for stale pending doubts (24h threshold).
setInterval(async () => {
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.query(
      `SELECT doubt_id, student_id, faculty_id, subject
       FROM doubts
       WHERE status IN ('pending', 'in-review')
         AND created_at <= DATE_SUB(NOW(), INTERVAL 24 HOUR)
         AND escalated_at IS NULL`
    );

    for (const row of rows || []) {
      await connection.query('UPDATE doubts SET escalated_at = NOW() WHERE doubt_id = ?', [row.doubt_id]);
      await connection.query(
        'INSERT INTO notifications (user_id, user_type, message, type, created_at) VALUES (?, ?, ?, ?, NOW())',
        [row.student_id, 'student', `Your doubt on ${row.subject} is escalated for quicker response.`, 'warning']
      );
      await connection.query(
        'INSERT INTO notifications (user_id, user_type, message, type, created_at) VALUES (?, ?, ?, ?, NOW())',
        [row.faculty_id, 'faculty', `Doubt #${row.doubt_id} is pending for over 24 hours and has been escalated.`, 'warning']
      );
      io.to(`student:${row.student_id}`).emit('doubt:escalated', { doubtId: row.doubt_id });
      io.to(`faculty:${row.faculty_id}`).emit('doubt:escalated', { doubtId: row.doubt_id });
    }
  } catch (_err) {
    // Keep scheduler non-blocking.
  } finally {
    if (connection) connection.release();
  }
}, 30 * 60 * 1000);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📌 API Health Check: http://localhost:${PORT}/api/health`);
});

