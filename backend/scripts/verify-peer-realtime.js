/* eslint-disable no-console */
const { io } = require('socket.io-client');

const BASE = process.env.API_BASE || 'http://localhost:5000';
const ROOM_ID = 'dsa-problem-solving';

function waitForEvent(socket, event, timeoutMs = 5000, filter = null) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);

    const handler = (payload) => {
      try {
        if (filter && !filter(payload)) return;
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(payload);
      } catch (e) {
        clearTimeout(timer);
        socket.off(event, handler);
        reject(e);
      }
    };

    socket.on(event, handler);
  });
}

async function login(payload) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(`Login failed for ${payload.userType}: ${data.message || res.status}`);
  }
  return data;
}

async function roomStatus(token) {
  const res = await fetch(`${BASE}/api/student-success/peer-rooms/status`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || 'status failed');
  return data.rooms || [];
}

async function run() {
  const student = await login({
    email: process.env.TEST_STUDENT_EMAIL || 'pooja.1@engineeringcollege.edu',
    password: process.env.TEST_STUDENT_PASSWORD || 'Pooja@2026',
    userType: 'student'
  });
  const faculty = await login({
    email: process.env.TEST_FACULTY_EMAIL || 'arjun.1@engineeringcollege.edu',
    password: process.env.TEST_FACULTY_PASSWORD || 'Arjun@2026',
    userType: 'faculty'
  });

  const studentId = String(student.user.studentId || student.user.Student_ID || student.user.id);
  const studentName = String(student.user.fullName || student.user.Name || 'Student');
  const facultyId = String(faculty.user.facultyId || faculty.user.Faculty_ID || faculty.user.id);
  const facultyName = String(faculty.user.fullName || faculty.user.Name || 'Faculty');

  const s1 = io(BASE, { transports: ['websocket'], forceNew: true });
  const f1 = io(BASE, { transports: ['websocket'], forceNew: true });

  const cleanup = () => {
    try { s1.disconnect(); } catch (_) {}
    try { f1.disconnect(); } catch (_) {}
  };

  try {
    await Promise.all([
      waitForEvent(s1, 'connect', 8000),
      waitForEvent(f1, 'connect', 8000)
    ]);

    s1.emit('register', { userType: 'student', userId: studentId });
    f1.emit('register', { userType: 'faculty', userId: facultyId });

    const sJoined = waitForEvent(s1, 'peer-room:joined', 5000, (p) => p && p.roomId === ROOM_ID);
    s1.emit('peer-room:join', { roomId: ROOM_ID, userId: studentId, userType: 'student', userName: studentName });
    await sJoined;

    const fJoined = waitForEvent(f1, 'peer-room:joined', 5000, (p) => p && p.roomId === ROOM_ID);
    f1.emit('peer-room:join', { roomId: ROOM_ID, userId: facultyId, userType: 'faculty', userName: facultyName });
    await fJoined;

    const typingSeen = waitForEvent(f1, 'peer-room:typing', 5000, (p) => p && p.roomId === ROOM_ID && p.isTyping === true);
    s1.emit('peer-room:typing', { roomId: ROOM_ID, userName: studentName, isTyping: true });
    await typingSeen;

    const announcementSeen = waitForEvent(s1, 'peer-room:message', 5000, (m) => m && m.roomId === ROOM_ID && String(m.text || '').includes('[Announcement]'));
    f1.emit('peer-room:announce', { roomId: ROOM_ID, text: 'Realtime test announcement' });
    await announcementSeen;

    const muteFlagSeen = waitForEvent(s1, 'peer-room:flags', 5000, (p) => p && p.roomId === ROOM_ID && p.mutedAll === true);
    f1.emit('peer-room:mute-all', { roomId: ROOM_ID, muted: true });
    await muteFlagSeen;

    const mutedErrorSeen = waitForEvent(s1, 'peer-room:error', 5000, (p) => p && String(p.message || '').toLowerCase().includes('muted'));
    s1.emit('peer-room:message', { roomId: ROOM_ID, text: 'Should fail due to mute' });
    await mutedErrorSeen;

    const unmuteSeen = waitForEvent(s1, 'peer-room:flags', 5000, (p) => p && p.roomId === ROOM_ID && p.mutedAll === false);
    f1.emit('peer-room:mute-all', { roomId: ROOM_ID, muted: false });
    await unmuteSeen;

    const closeSeen = waitForEvent(s1, 'peer-room:closed', 5000, (p) => p && p.roomId === ROOM_ID);
    f1.emit('peer-room:close', { roomId: ROOM_ID, closed: true });
    await closeSeen;

    const reopenSeen = waitForEvent(s1, 'peer-room:flags', 5000, (p) => p && p.roomId === ROOM_ID && p.closed === false);
    f1.emit('peer-room:close', { roomId: ROOM_ID, closed: false });
    await reopenSeen;

    const statusRows = await roomStatus(student.token);
    const room = statusRows.find((r) => String(r.roomId) === ROOM_ID) || {};

    console.log(JSON.stringify({
      success: true,
      checks: {
        typing: true,
        announcement: true,
        muteEnforced: true,
        unmute: true,
        closeBroadcast: true,
        reopenBroadcast: true
      },
      statusSnapshot: {
        roomId: room.roomId,
        active: room.active,
        participants: room.participants,
        moderatorsOnline: room.moderatorsOnline,
        mutedAll: room.mutedAll,
        closed: room.closed
      }
    }, null, 2));
  } finally {
    cleanup();
  }
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
