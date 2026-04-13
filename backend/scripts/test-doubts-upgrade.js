/* eslint-disable no-console */

async function run() {
  const base = process.env.API_BASE || 'http://localhost:5000';
  const studentCred = {
    email: process.env.TEST_STUDENT_EMAIL || 'pooja.1@engineeringcollege.edu',
    password: process.env.TEST_STUDENT_PASSWORD || 'Pooja@2026',
    userType: 'student'
  };
  const facultyCred = {
    email: process.env.TEST_FACULTY_EMAIL || 'arjun.1@engineeringcollege.edu',
    password: process.env.TEST_FACULTY_PASSWORD || 'Arjun@2026',
    userType: 'faculty'
  };

  const toJson = async (res) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch (_e) {
      throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 180)}`);
    }
  };

  const login = async (payload) => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await toJson(res);
    if (!res.ok || !data.success) {
      throw new Error(`Login failed for ${payload.userType}: ${data.message || res.status}`);
    }
    return data;
  };

  const student = await login(studentCred);
  const faculty = await login(facultyCred);
  const sTok = student.token;
  const fTok = faculty.token;
  const facultyId = String(faculty.user.facultyId || faculty.user.id);

  const createRes = await fetch(`${base}/api/doubts/student`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sTok}`
    },
    body: JSON.stringify({
      facultyId,
      subject: 'Automated Testing',
      category: 'concept',
      priority: 'high',
      doubtText: `Automated test doubt ${new Date().toISOString()}`
    })
  });
  const createData = await toJson(createRes);
  if (!createRes.ok || !createData.success) {
    throw new Error(`Create doubt failed: ${createData.message || createRes.status}`);
  }
  const doubtId = Number(createData.doubt?.doubtId || 0);
  if (!doubtId) throw new Error('Create doubt returned invalid id');

  const inboxRes = await fetch(`${base}/api/doubts/faculty/inbox?status=pending&priority=high&category=concept`, {
    headers: { Authorization: `Bearer ${fTok}` }
  });
  const inboxData = await toJson(inboxRes);
  if (!inboxRes.ok || !inboxData.success) throw new Error(`Faculty inbox failed: ${inboxData.message || inboxRes.status}`);
  const found = (inboxData.doubts || []).find((d) => Number(d.doubt_id) === doubtId);
  if (!found) throw new Error('Created doubt missing in filtered faculty inbox');

  const threadRes = await fetch(`${base}/api/doubts/${doubtId}/messages`, {
    headers: { Authorization: `Bearer ${fTok}` }
  });
  const threadData = await toJson(threadRes);
  if (!threadRes.ok || !threadData.success || !(threadData.messages || []).length) {
    throw new Error('Thread list failed or empty after doubt creation');
  }

  const followRes = await fetch(`${base}/api/doubts/${doubtId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${fTok}`
    },
    body: JSON.stringify({ messageText: 'Follow-up from automated test' })
  });
  const followData = await toJson(followRes);
  if (!followRes.ok || !followData.success) {
    throw new Error(`Faculty follow-up failed: ${followData.message || followRes.status}`);
  }

  const statusRes = await fetch(`${base}/api/doubts/${doubtId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${fTok}`
    },
    body: JSON.stringify({ status: 'in-review' })
  });
  const statusData = await toJson(statusRes);
  if (!statusRes.ok || !statusData.success) {
    throw new Error(`Status update failed: ${statusData.message || statusRes.status}`);
  }

  const replyRes = await fetch(`${base}/api/doubts/faculty/${doubtId}/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${fTok}`
    },
    body: JSON.stringify({ replyText: 'Automated reply complete' })
  });
  const replyData = await toJson(replyRes);
  if (!replyRes.ok || !replyData.success) {
    throw new Error(`Reply failed: ${replyData.message || replyRes.status}`);
  }

  const studentListRes = await fetch(`${base}/api/doubts/student/my`, {
    headers: { Authorization: `Bearer ${sTok}` }
  });
  const studentListData = await toJson(studentListRes);
  const myDoubt = (studentListData.doubts || []).find((d) => Number(d.doubt_id) === doubtId);
  if (!myDoubt || String(myDoubt.status || '').toLowerCase() !== 'replied') {
    throw new Error('Student list does not reflect replied status');
  }

  const analyticsRes = await fetch(`${base}/api/doubts/faculty/analytics/summary`, {
    headers: { Authorization: `Bearer ${fTok}` }
  });
  const analyticsData = await toJson(analyticsRes);
  if (!analyticsRes.ok || !analyticsData.success) {
    throw new Error(`Analytics failed: ${analyticsData.message || analyticsRes.status}`);
  }

  const escalateRes = await fetch(`${base}/api/doubts/faculty/escalate-pending`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${fTok}`
    },
    body: JSON.stringify({ thresholdHours: 1 })
  });
  const escalateData = await toJson(escalateRes);
  if (!escalateRes.ok || !escalateData.success) {
    throw new Error(`Escalation endpoint failed: ${escalateData.message || escalateRes.status}`);
  }

  console.log(JSON.stringify({
    success: true,
    doubtId,
    status: myDoubt.status,
    threadMessages: threadData.messages.length,
    analyticsTotal: analyticsData.summary?.total,
    escalatedNow: escalateData.escalated
  }, null, 2));
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
