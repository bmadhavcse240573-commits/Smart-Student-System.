
        // Centralized API base + fetch rewrite for student dashboard.
        const STUDENT_LEGACY_API_BASE = 'http://localhost:5000';
        const studentApiBaseFromQuery = new URLSearchParams(window.location.search).get('apiBase');
        if (studentApiBaseFromQuery) {
            localStorage.setItem('studentApiBaseUrl', studentApiBaseFromQuery);
        }
        const STUDENT_API_BASE = (
            localStorage.getItem('studentApiBaseUrl') ||
            localStorage.getItem('adminApiBaseUrl') ||
            STUDENT_LEGACY_API_BASE
        ).replace(/\/+$/, '');

        if (!window.__studentFetchRewriteInstalled) {
            const studentOriginalFetch = window.fetch.bind(window);
            window.fetch = function(input, init) {
                let url = null;
                if (typeof input === 'string') url = input;
                else if (input && typeof input.url === 'string') url = input.url;

                if (url && url.startsWith(STUDENT_LEGACY_API_BASE)) {
                    const rewritten = `${STUDENT_API_BASE}${url.slice(STUDENT_LEGACY_API_BASE.length)}`;
                    if (typeof input === 'string') return studentOriginalFetch(rewritten, init);
                    return studentOriginalFetch(new Request(rewritten, input), init);
                }
                return studentOriginalFetch(input, init);
            };
            window.__studentFetchRewriteInstalled = true;
        }

        async function parseJsonSafe(response) {
            const rawText = await response.text();
            try {
                return rawText ? JSON.parse(rawText) : {};
            } catch (_err) {
                const compact = (rawText || '').replace(/\s+/g, ' ').trim();
                throw new Error((compact || `HTTP ${response.status}`).slice(0, 180));
            }
        }

        // Check authentication
        document.addEventListener('DOMContentLoaded', () => {
            const token = localStorage.getItem('token');
            const userType = localStorage.getItem('userType');
            if (!token || userType !== 'student') {
                window.location.href = 'index.html';
                return;
            }
            const user = JSON.parse(localStorage.getItem('user'));
            document.getElementById('userName').textContent = user.fullName || 'Student';
            loadNotifications(user.studentId || user.id);
            loadPerformanceData();
            loadStudentAdmissionSnapshot();
            loadStudentSectionTimetable();
            initStudentDoubtRealtime();
            initStudentSuccessHub();
        });

        const STUDENT_SUCCESS_KEY = 'studentSuccessHub_v1';
        const STUDENT_SUCCESS_EXTRAS_KEY = 'studentSuccessExtras_v1';
        const STUDENT_FOCUS_LOGS_KEY = 'studentFocusLogs_v1';
        const STUDENT_LAST_PEER_ROOM_KEY = 'studentLastPeerRoom_v1';
        const STUDENT_PEER_ROOMS = [
            { id: 'dsa-problem-solving', name: 'DSA Problem Solving' },
            { id: 'physics-quick-doubts', name: 'Physics Quick Doubts' },
            { id: 'math-weekly-practice', name: 'Math Weekly Practice' },
            { id: 'exam-sprint-group', name: 'Exam Sprint Group' }
        ];
        let studentFocusTimerInterval = null;
        let studentFocusTimerRemaining = 0;
        let studentFocusTimerInitial = 0;
        let studentFocusSubject = '';
        let studentPeerRoomStatuses = {};
        let studentActivePeerRoomId = null;
        let studentPeerRoomMessages = [];
        let studentPeerRoomUnread = {};
        let studentPeerTypingUsers = {};
        let studentPeerTypingTimer = null;

        async function studentSuccessRequest(path, init = {}) {
            const token = localStorage.getItem('token');
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...(init.headers || {})
            };
            const response = await fetch(`${STUDENT_API_BASE}${path}`, { ...init, headers });
            const data = await parseJsonSafe(response);
            if (!response.ok || !data.success) {
                throw new Error(data.message || `Request failed (${response.status})`);
            }
            return data;
        }

        function getStudentSuccessState() {
            try {
                const saved = JSON.parse(localStorage.getItem(STUDENT_SUCCESS_KEY) || '{}');
                return {
                    weeklyGoal: String(saved.weeklyGoal || ''),
                    streak: Number(saved.streak || 0),
                    sessionsDone: Number(saved.sessionsDone || 0),
                    placement: Array.isArray(saved.placement) ? saved.placement : [false, false, false, false]
                };
            } catch (_e) {
                return { weeklyGoal: '', streak: 0, sessionsDone: 0, placement: [false, false, false, false] };
            }
        }

        function saveStudentSuccessState(next) {
            localStorage.setItem(STUDENT_SUCCESS_KEY, JSON.stringify(next));
        }

        function getStudentSuccessExtras() {
            try {
                const saved = JSON.parse(localStorage.getItem(STUDENT_SUCCESS_EXTRAS_KEY) || '{}');
                return {
                    plannerExam: String(saved.plannerExam || ''),
                    revisionTopics: String(saved.revisionTopics || ''),
                    recoveryTopic: String(saved.recoveryTopic || ''),
                    recoveryDays: Math.max(1, Math.min(14, Number(saved.recoveryDays || 2)))
                };
            } catch (_e) {
                return { plannerExam: '', revisionTopics: '', recoveryTopic: '', recoveryDays: 2 };
            }
        }

        function saveStudentSuccessExtras(next) {
            localStorage.setItem(STUDENT_SUCCESS_EXTRAS_KEY, JSON.stringify(next));
        }

        async function syncStudentSuccessExtras(next) {
            saveStudentSuccessExtras(next);
            try {
                await studentSuccessRequest('/api/student-success/extras', {
                    method: 'PUT',
                    body: JSON.stringify(next)
                });
            } catch (_e) {
                // Local fallback already saved.
            }
        }

        async function initStudentSuccessHub() {
            const state = getStudentSuccessState();
            const extras = getStudentSuccessExtras();
            const goalInput = document.getElementById('successGoalInput');
            if (goalInput) goalInput.value = state.weeklyGoal;
            const examInput = document.getElementById('successPlanExamInput');
            const topicsInput = document.getElementById('successRevisionTopics');
            const missedTopicInput = document.getElementById('successMissedTopic');
            const missedDaysInput = document.getElementById('successMissedDays');
            if (examInput) examInput.value = extras.plannerExam;
            if (topicsInput) topicsInput.value = extras.revisionTopics;
            if (missedTopicInput) missedTopicInput.value = extras.recoveryTopic;
            if (missedDaysInput) missedDaysInput.value = extras.recoveryDays;

            try {
                const data = await studentSuccessRequest('/api/student-success/profile');
                const remote = {
                    weeklyGoal: String(data.profile?.weeklyGoal || ''),
                    streak: Number(data.profile?.streak || 0),
                    sessionsDone: Number(data.profile?.sessionsDone || 0),
                    placement: Array.isArray(data.profile?.placement) ? data.profile.placement : [false, false, false, false]
                };
                saveStudentSuccessState(remote);
                if (goalInput) goalInput.value = remote.weeklyGoal;
            } catch (_e) {
                // Keep local fallback when API is unavailable.
            }

            try {
                const data = await studentSuccessRequest('/api/student-success/extras');
                const remoteExtras = {
                    plannerExam: String(data.extras?.plannerExam || ''),
                    revisionTopics: String(data.extras?.revisionTopics || ''),
                    recoveryTopic: String(data.extras?.recoveryTopic || ''),
                    recoveryDays: Math.max(1, Math.min(14, Number(data.extras?.recoveryDays || 2)))
                };
                saveStudentSuccessExtras(remoteExtras);
                if (examInput) examInput.value = remoteExtras.plannerExam;
                if (topicsInput) topicsInput.value = remoteExtras.revisionTopics;
                if (missedTopicInput) missedTopicInput.value = remoteExtras.recoveryTopic;
                if (missedDaysInput) missedDaysInput.value = remoteExtras.recoveryDays;
            } catch (_e) {
                // Keep local fallback when API is unavailable.
            }

            renderStudentProgressSnapshot();
            renderStudentPeerRooms();
            renderStudentPlacementChecklist();
            renderStudentGoalStatus();
            generateStudentStudyPlan();
            generateStudentRevisionCards();
            buildMissedClassRecoveryPlan();
            await loadPeerRoomStatus();

            try {
                const data = await studentSuccessRequest('/api/student-success/focus-sessions?limit=10');
                const logs = Array.isArray(data.sessions) ? data.sessions : [];
                localStorage.setItem(STUDENT_FOCUS_LOGS_KEY, JSON.stringify(logs));
            } catch (_e) {
                // Keep local fallback when API is unavailable.
            }
            renderStudentFocusLogs();
        }

        function generateStudentStudyPlan() {
            const exam = String(document.getElementById('successPlanExamInput')?.value || 'Next Subject');
            const items = [
                `Mon: 45m revision for ${exam}`,
                `Tue: 30m concept recap + 20m quiz for ${exam}`,
                `Wed: Solve 5 previous-year questions`,
                `Thu: 40m weak-topic practice + one doubt`,
                `Fri: Mock test (25m) and error review`,
                `Sat: Group revision or peer-room discussion`,
                `Sun: Light recap and plan next week`
            ];
            const host = document.getElementById('successStudyPlannerList');
            if (host) {
                host.innerHTML = `<ul style="margin:0;padding-left:18px;line-height:1.8;">${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
            }
            const extras = getStudentSuccessExtras();
            syncStudentSuccessExtras({ ...extras, plannerExam: exam });
        }

        function analyzeStudentDoubtDraft() {
            const text = String(document.getElementById('successDoubtDraft')?.value || '').toLowerCase();
            if (!text.trim()) {
                document.getElementById('successDoubtAdvice').textContent = 'Add your draft to get suggestion.';
                return;
            }
            let category = 'other';
            let priority = 'medium';
            if (/(lab|experiment|record)/.test(text)) category = 'lab';
            if (/(assignment|submission|deadline)/.test(text)) category = 'assignment';
            if (/(exam|mid|final|test)/.test(text)) category = 'exam';
            if (/(concept|why|how|understand|theory)/.test(text)) category = 'concept';
            if (/(urgent|tomorrow|today|deadline|asap)/.test(text)) priority = 'high';
            if (/(simple|small|quick)/.test(text)) priority = 'low';
            const hint = category === 'concept'
                ? 'Try adding where exactly you got stuck and one attempted approach.'
                : 'Include subject, topic, and expected output for a faster reply.';
            document.getElementById('successDoubtAdvice').innerHTML = `<strong>Suggested Category:</strong> ${category} &nbsp; <strong>Priority:</strong> ${priority}<br/><span style="color:#64748b;">${hint}</span>`;
        }

        function renderStudentProgressSnapshot() {
            const gpa = Number((document.getElementById('gpaValue')?.textContent || '0').replace(/[^0-9.]/g, '')) || 0;
            const atRisk = gpa < 7.5 ? 'High' : gpa < 8.5 ? 'Medium' : 'Low';
            const readiness = Math.max(55, Math.min(96, Math.round(60 + (gpa * 4))));
            const assignment = Math.max(45, Math.min(98, readiness - 6));
            const cards = [
                { label: 'At-Risk Level', value: atRisk, bg: '#fee2e2', color: '#991b1b' },
                { label: 'Exam Readiness', value: `${readiness}%`, bg: '#dcfce7', color: '#14532d' },
                { label: 'Assignment Pace', value: `${assignment}%`, bg: '#dbeafe', color: '#1e3a8a' }
            ];
            const host = document.getElementById('successProgressSnapshot');
            if (host) {
                host.innerHTML = cards.map((c) => `
                    <div style="background:${c.bg};padding:10px;border-radius:10px;">
                        <div style="font-size:11px;color:#64748b;">${c.label}</div>
                        <div style="font-size:20px;font-weight:800;color:${c.color};">${c.value}</div>
                    </div>
                `).join('');
            }
        }

        function generateStudentRevisionCards() {
            const raw = String(document.getElementById('successRevisionTopics')?.value || '');
            const topics = raw.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 6);
            const host = document.getElementById('successRevisionCards');
            if (!host) return;
            if (!topics.length) {
                host.innerHTML = '<div style="color:#64748b;">Add topics to generate cards.</div>';
                const extras = getStudentSuccessExtras();
                syncStudentSuccessExtras({ ...extras, revisionTopics: raw });
                return;
            }
            host.innerHTML = topics.map((topic) => `
                <div style="border:1px solid #d1d5db;border-radius:10px;padding:10px;background:#f8fafc;">
                    <div style="font-weight:700;color:#0f172a;">${topic}</div>
                    <div style="font-size:12px;color:#475569;margin-top:4px;">10-min sprint: 4 min recap, 4 min questions, 2 min summary notes.</div>
                </div>
            `).join('');
            const extras = getStudentSuccessExtras();
            syncStudentSuccessExtras({ ...extras, revisionTopics: raw });
        }

        function renderStudentPeerRooms() {
            const host = document.getElementById('successPeerRooms');
            if (!host) return;
            host.innerHTML = STUDENT_PEER_ROOMS.map((room) => {
                const status = studentPeerRoomStatuses[room.id] || { active: false, participants: 0 };
                const active = !!status.active;
                const participants = Number(status.participants || 0);
                const isCurrent = room.id === studentActivePeerRoomId;
                const closed = !!status.closed;
                const badgeBg = active ? '#dcfce7' : '#e5e7eb';
                const badgeFg = active ? '#166534' : '#374151';
                const unread = Number(studentPeerRoomUnread[room.id] || 0);
                return `
                    <div style="display:flex;justify-content:space-between;align-items:center;border:1px solid #d1d5db;border-radius:8px;padding:9px;gap:8px;flex-wrap:wrap;">
                        <div>
                            <div style="font-size:13px;color:#334155;font-weight:700;">${room.name}</div>
                            <div style="font-size:12px;color:#64748b;">${participants} student(s) online</div>
                        </div>
                        <div style="display:flex;gap:8px;align-items:center;">
                            ${unread > 0 ? `<span style="padding:2px 8px;border-radius:999px;background:#fee2e2;color:#991b1b;font-size:11px;font-weight:800;">${unread} new</span>` : ''}
                            ${closed ? `<span style="padding:2px 8px;border-radius:999px;background:#111827;color:#fff;font-size:11px;font-weight:800;">CLOSED</span>` : ''}
                            <span style="padding:2px 8px;border-radius:999px;background:${badgeBg};color:${badgeFg};font-size:11px;font-weight:800;">${active ? 'ACTIVE' : 'INACTIVE'}</span>
                            <button type="button" onclick="joinStudentPeerRoom('${room.id}')" ${closed && !isCurrent ? 'disabled' : ''} style="background:${isCurrent ? '#bfdbfe' : '#e2e8f0'};color:#0f172a;border:none;border-radius:6px;padding:6px 9px;cursor:${closed && !isCurrent ? 'not-allowed' : 'pointer'};font-weight:700;opacity:${closed && !isCurrent ? '0.65' : '1'};">${isCurrent ? 'In Room' : (closed ? 'Closed' : 'Join')}</button>
                        </div>
                    </div>
                `;
            }).join('');
            updatePeerRoomPanelMeta();
        }

        function updatePeerRoomPanelMeta() {
            if (!studentActivePeerRoomId) return;
            const room = STUDENT_PEER_ROOMS.find((r) => r.id === studentActivePeerRoomId);
            const status = studentPeerRoomStatuses[studentActivePeerRoomId] || { active: false, participants: 0 };
            const titleEl = document.getElementById('successPeerRoomTitle');
            const metaEl = document.getElementById('successPeerRoomMeta');
            const modBadge = document.getElementById('successPeerModeratorBadge');
            if (titleEl) titleEl.textContent = room ? room.name : 'Peer Room';
            if (metaEl) {
                const muted = status.mutedAll ? ' | chat muted' : '';
                const closed = status.closed ? ' | closed' : '';
                metaEl.textContent = `Status: ${status.active ? 'active' : 'inactive'} | ${Number(status.participants || 0)} student(s) online${muted}${closed}`;
            }
            if (modBadge) {
                const mods = Number(status.moderatorsOnline || 0);
                const online = mods > 0;
                modBadge.textContent = online ? `Moderator Online (${mods})` : 'Moderator Offline';
                modBadge.style.background = online ? '#dcfce7' : '#e5e7eb';
                modBadge.style.color = online ? '#166534' : '#374151';
            }
        }

        function applyPeerRoomStatus(rooms) {
            const next = {};
            (Array.isArray(rooms) ? rooms : []).forEach((room) => {
                const id = String(room.roomId || '').trim();
                if (!id) return;
                next[id] = {
                    active: !!room.active,
                    participants: Number(room.participants || 0),
                    moderatorsOnline: Number(room.moderatorsOnline || 0),
                    mutedAll: !!room.mutedAll,
                    closed: !!room.closed
                };
            });
            studentPeerRoomStatuses = next;
            renderStudentPeerRooms();
        }

        async function loadPeerRoomStatus() {
            try {
                const data = await studentSuccessRequest('/api/student-success/peer-rooms/status');
                applyPeerRoomStatus(data.rooms || []);
            } catch (_e) {
                renderStudentPeerRooms();
            }
        }

        function openStudentPeerRoomDashboard(roomId) {
            const panel = document.getElementById('successPeerRoomPanel');
            const iframe = document.getElementById('successPeerRoomIframe');
            if (!panel || !iframe) return;
            panel.style.display = 'block';
            if (!iframe.dataset.roomId || iframe.dataset.roomId !== roomId) {
                iframe.src = `https://meet.jit.si/${encodeURIComponent(`smart2-${roomId}`)}`;
                iframe.dataset.roomId = roomId;
            }
            studentPeerRoomUnread[roomId] = 0;
            bindStudentPeerRoomChatInput();
            updatePeerRoomPanelMeta();
            renderStudentPeerRoomMessages();
        }

        function bindStudentPeerRoomChatInput() {
            const input = document.getElementById('successPeerRoomChatInput');
            if (!input || input.dataset.bound === '1') return;
            input.dataset.bound = '1';
            input.addEventListener('input', () => {
                if (!studentActivePeerRoomId || !studentDoubtSocket) return;
                const user = JSON.parse(localStorage.getItem('user') || '{}');
                studentDoubtSocket.emit('peer-room:typing', {
                    roomId: studentActivePeerRoomId,
                    userName: String(user.fullName || user.Name || 'Student'),
                    isTyping: true
                });
            });
        }

        function renderStudentPeerRoomMessages() {
            const chatLog = document.getElementById('successPeerRoomChatLog');
            if (!chatLog) return;
            if (!studentPeerRoomMessages.length) {
                chatLog.textContent = 'No messages yet.';
                return;
            }
            const typingLine = Object.values(studentPeerTypingUsers).filter(Boolean).slice(0, 2).join(', ');
            chatLog.innerHTML = studentPeerRoomMessages.map((m) => {
                const who = escapeStudentText(m.userName || m.userId || 'User');
                const text = escapeStudentText(m.text || '');
                const at = m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                const tone = String(m.userType || '').toLowerCase() === 'faculty' ? '#1d4ed8' : '#0f766e';
                return `<div style="margin-bottom:7px;"><span style="font-weight:700;color:${tone};">${who}</span> <span style="color:#94a3b8;font-size:11px;">${at}</span><div style="color:#334155;">${text}</div></div>`;
            }).join('') + (typingLine ? `<div style="color:#64748b;font-style:italic;margin-top:6px;">${escapeStudentText(typingLine)} typing...</div>` : '');
            chatLog.scrollTop = chatLog.scrollHeight;
        }

        function sendStudentPeerRoomMessage() {
            if (!studentActivePeerRoomId || !studentDoubtSocket) return;
            const input = document.getElementById('successPeerRoomChatInput');
            const text = String(input?.value || '').trim();
            if (!text) return;
            const status = studentPeerRoomStatuses[studentActivePeerRoomId] || {};
            if (status.closed) {
                alert('This room is closed by moderator.');
                return;
            }
            if (status.mutedAll) {
                alert('Room chat is muted by moderator.');
                return;
            }
            studentDoubtSocket.emit('peer-room:message', {
                roomId: studentActivePeerRoomId,
                text
            });
            if (input) input.value = '';
        }

        async function loadPeerRoomHistory(roomId) {
            try {
                const data = await studentSuccessRequest(`/api/student-success/peer-rooms/${encodeURIComponent(roomId)}/messages`);
                studentPeerRoomMessages = Array.isArray(data.messages) ? data.messages.slice(-50) : [];
                renderStudentPeerRoomMessages();
            } catch (_e) {
                studentPeerRoomMessages = [];
                renderStudentPeerRoomMessages();
            }
        }

        function joinStudentPeerRoom(roomId) {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const userId = String(user.studentId || user.Student_ID || user.id || '').trim();
            if (!roomId || !userId) return;
            const flags = studentPeerRoomStatuses[roomId] || {};
            if (flags.closed && roomId !== studentActivePeerRoomId) {
                alert('This room is currently closed by moderator.');
                return;
            }

            studentActivePeerRoomId = roomId;
            openStudentPeerRoomDashboard(roomId);

            if (studentDoubtSocket) {
                studentDoubtSocket.emit('peer-room:join', {
                    roomId,
                    userId,
                    userType: 'student',
                    userName: String(user.fullName || user.Name || 'Student')
                });
            }
            localStorage.setItem(STUDENT_LAST_PEER_ROOM_KEY, roomId);
            loadPeerRoomHistory(roomId);
            renderStudentPeerRooms();
        }

        function leaveStudentPeerRoom() {
            if (studentDoubtSocket) {
                studentDoubtSocket.emit('peer-room:leave');
            }
            studentActivePeerRoomId = null;
            studentPeerRoomMessages = [];
            studentPeerTypingUsers = {};
            const panel = document.getElementById('successPeerRoomPanel');
            const iframe = document.getElementById('successPeerRoomIframe');
            if (panel) panel.style.display = 'none';
            if (iframe) {
                iframe.src = 'about:blank';
                iframe.dataset.roomId = '';
            }
            localStorage.removeItem(STUDENT_LAST_PEER_ROOM_KEY);
            renderStudentPeerRooms();
        }

        function openStudentPeerRoomInNewTab() {
            if (!studentActivePeerRoomId) return;
            window.open(`https://meet.jit.si/${encodeURIComponent(`smart2-${studentActivePeerRoomId}`)}`, '_blank', 'noopener');
        }

        function buildMissedClassRecoveryPlan() {
            const topic = String(document.getElementById('successMissedTopic')?.value || 'last class');
            const days = Math.max(1, Number(document.getElementById('successMissedDays')?.value || 2));
            const plan = [
                `Day 1: 25 minutes on ${topic} notes + highlight unknown terms.`,
                `Day ${Math.min(2, days)}: Watch one recap source and solve 3 problems.`,
                `Before next class: ask one focused doubt and review summary.`
            ];
            document.getElementById('successRecoveryPlan').innerHTML = `<ul style="margin:0;padding-left:18px;line-height:1.7;">${plan.map((p) => `<li>${p}</li>`).join('')}</ul>`;
            const extras = getStudentSuccessExtras();
            syncStudentSuccessExtras({ ...extras, recoveryTopic: topic, recoveryDays: days });
        }

        async function saveStudentWeeklyGoal() {
            const state = getStudentSuccessState();
            state.weeklyGoal = String(document.getElementById('successGoalInput')?.value || '').trim();
            saveStudentSuccessState(state);
            try {
                await studentSuccessRequest('/api/student-success/profile', {
                    method: 'PUT',
                    body: JSON.stringify(state)
                });
            } catch (_e) {
                // Local state already saved.
            }
            renderStudentGoalStatus();
        }

        async function markStudentGoalDone() {
            const state = getStudentSuccessState();
            state.streak += 1;
            state.sessionsDone += 1;
            saveStudentSuccessState(state);
            try {
                await studentSuccessRequest('/api/student-success/profile', {
                    method: 'PUT',
                    body: JSON.stringify(state)
                });
            } catch (_e) {
                // Local state already saved.
            }
            renderStudentGoalStatus();
        }

        function renderStudentGoalStatus() {
            const state = getStudentSuccessState();
            const text = state.weeklyGoal || 'No weekly goal set yet.';
            const host = document.getElementById('successGoalStatus');
            if (host) host.innerHTML = `<strong>Goal:</strong> ${text}<br/><strong>Streak:</strong> ${state.streak} day(s) &nbsp; <strong>Completed Sessions:</strong> ${state.sessionsDone}`;
        }

        function renderStudentPlacementChecklist() {
            const labels = ['Resume updated', 'Aptitude set solved', 'Mock interview done', 'Applications tracked'];
            const state = getStudentSuccessState();
            const host = document.getElementById('successPlacementChecklist');
            if (!host) return;
            host.innerHTML = labels.map((label, i) => {
                const checked = !!state.placement[i];
                return `
                    <label style="display:flex;gap:8px;align-items:center;font-size:13px;color:#334155;">
                        <input type="checkbox" ${checked ? 'checked' : ''} onchange="togglePlacementItem(${i}, this.checked)">
                        ${label}
                    </label>
                `;
            }).join('');
            updatePlacementProgress();
        }

        async function togglePlacementItem(index, checked) {
            const state = getStudentSuccessState();
            state.placement[index] = !!checked;
            saveStudentSuccessState(state);
            try {
                await studentSuccessRequest('/api/student-success/profile', {
                    method: 'PUT',
                    body: JSON.stringify(state)
                });
            } catch (_e) {
                // Local state already saved.
            }
            updatePlacementProgress();
        }

        function updatePlacementProgress() {
            const state = getStudentSuccessState();
            const total = state.placement.length;
            const done = state.placement.filter(Boolean).length;
            const pct = Math.round((done / total) * 100);
            const host = document.getElementById('successPlacementProgress');
            if (host) host.innerHTML = `<strong>Progress:</strong> ${done}/${total} tasks (${pct}%)`;
        }

        function formatStudentSeconds(totalSec) {
            const minutes = Math.floor(totalSec / 60);
            const seconds = totalSec % 60;
            return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

        function startStudentFocusTimer() {
            if (studentFocusTimerInterval) return;
            const mins = Math.max(5, Number(document.getElementById('successFocusMinutes')?.value || 25));
            studentFocusSubject = String(document.getElementById('successFocusSubject')?.value || 'Study Session').trim() || 'Study Session';
            studentFocusTimerInitial = mins * 60;
            studentFocusTimerRemaining = studentFocusTimerInitial;
            const status = document.getElementById('successFocusStatus');
            if (status) status.textContent = `Running ${studentFocusSubject}: ${formatStudentSeconds(studentFocusTimerRemaining)}`;

            studentFocusTimerInterval = setInterval(() => {
                studentFocusTimerRemaining -= 1;
                const live = document.getElementById('successFocusStatus');
                if (live) live.textContent = `Running ${studentFocusSubject}: ${formatStudentSeconds(Math.max(0, studentFocusTimerRemaining))}`;
                if (studentFocusTimerRemaining <= 0) {
                    stopStudentFocusTimer(true);
                }
            }, 1000);
        }

        function stopStudentFocusTimer(completed = false) {
            if (studentFocusTimerInterval) {
                clearInterval(studentFocusTimerInterval);
                studentFocusTimerInterval = null;
            }

            if (studentFocusTimerInitial > 0 && studentFocusSubject) {
                const elapsed = completed ? studentFocusTimerInitial : Math.max(0, studentFocusTimerInitial - studentFocusTimerRemaining);
                if (elapsed >= 60) {
                    const logs = JSON.parse(localStorage.getItem(STUDENT_FOCUS_LOGS_KEY) || '[]');
                    logs.unshift({
                        subject: studentFocusSubject,
                        minutes: Math.round(elapsed / 60),
                        at: new Date().toISOString()
                    });
                    localStorage.setItem(STUDENT_FOCUS_LOGS_KEY, JSON.stringify(logs.slice(0, 10)));

                    studentSuccessRequest('/api/student-success/focus-sessions', {
                        method: 'POST',
                        body: JSON.stringify({
                            subject: studentFocusSubject,
                            minutes: Math.round(elapsed / 60),
                            completedAt: new Date().toISOString()
                        })
                    }).catch(() => {
                        // Local fallback is already persisted.
                    });
                }
            }

            const status = document.getElementById('successFocusStatus');
            if (status) status.textContent = completed ? 'Session completed. Great work.' : 'Timer stopped.';

            studentFocusTimerInitial = 0;
            studentFocusTimerRemaining = 0;
            studentFocusSubject = '';
            renderStudentFocusLogs();
        }

        function renderStudentFocusLogs() {
            const host = document.getElementById('successFocusLogs');
            if (!host) return;
            const logs = JSON.parse(localStorage.getItem(STUDENT_FOCUS_LOGS_KEY) || '[]');
            if (!logs.length) {
                host.textContent = 'No sessions logged yet.';
                return;
            }
            host.innerHTML = logs.map((log) => {
                const when = new Date(log.at).toLocaleString();
                return `<div style="padding:6px 0;border-bottom:1px dashed #cbd5e1;">${log.subject} - ${log.minutes} min (${when})</div>`;
            }).join('');
        }

        function explainStudentTextSimply() {
            const input = String(document.getElementById('successExplainInput')?.value || '').trim();
            const out = document.getElementById('successExplainOutput');
            if (!out) return;
            if (!input) {
                out.textContent = 'Paste text to simplify.';
                return;
            }
            const cleaned = input.replace(/\s+/g, ' ').trim();
            const chunks = cleaned.split(/[.?!]/).map((s) => s.trim()).filter(Boolean).slice(0, 3);
            const bullets = chunks.map((line, idx) => `${idx + 1}. ${line.length > 90 ? `${line.slice(0, 90)}...` : line}`);
            const summary = bullets.length
                ? bullets.join('<br/>')
                : `1. ${cleaned.slice(0, 120)}${cleaned.length > 120 ? '...' : ''}`;
            out.innerHTML = `<strong>Simple version:</strong><br/>${summary}<br/><span style="color:#64748b;">Tip: ask what, why, and one example for deeper clarity.</span>`;
        }

        async function loadNotifications(userId) {
            const token = localStorage.getItem('token');
            try {
                const res = await fetch(`http://localhost:5000/api/notifications/user/${userId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                const section = document.getElementById('notificationsSection');
                if (data.success && data.notifications.length > 0) {
                    section.innerHTML = data.notifications.map(n => `
                        <div class="notification-card" style="background: #f3f4f6; border-left: 4px solid ${n.type === 'info' ? '#3b82f6' : n.type === 'warning' ? '#f59e0b' : '#ef4444'}; padding: 16px; border-radius: 8px; margin-bottom: 8px;">
                            <div style="font-weight:600;">${n.type.charAt(0).toUpperCase() + n.type.slice(1)}:</div>
                            <div>${n.message}</div>
                            <div style="font-size:12px; color:#6b7280; margin-top:4px;">${new Date(n.created_at).toLocaleString()}</div>
                        </div>
                    `).join('');
                } else {
                    section.innerHTML = '';
                }
            } catch (err) {
                document.getElementById('notificationsSection').innerHTML = '';
            }
        }

        async function loadPerformanceData() {
            const token = localStorage.getItem('token');

            try {
                const response = await fetch('http://localhost:5000/api/student/performance', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    document.getElementById('gpaValue').textContent = data.gpa || '3.8';
                    document.getElementById('creditsValue').textContent = data.credits || '45';
                    document.getElementById('semesterValue').textContent = data.semester || '4th';
                    document.getElementById('statusValue').textContent = data.status || 'Active';

                    // Load sample courses
                    loadSampleCourses();
                }
            } catch (error) {
                console.error('Error loading performance:', error);
                loadSampleCourses();
            }
        }

        function loadSampleCourses() {
            const courses = [
                { name: 'Data Science 101', progress: 85 },
                { name: 'Web Development', progress: 60 },
                { name: 'Mathematics', progress: 90 },
                { name: 'Python Basics', progress: 75 }
            ];

            const coursesList = document.getElementById('coursesList');
            coursesList.innerHTML = '';

            courses.forEach(course => {
                const courseHtml = `
                    <div class="course-item">
                        <div class="course-info">
                            <div class="course-name">${course.name}</div>
                            <div class="course-progress">
                                <div class="course-progress-bar" style="width: ${course.progress}%"></div>
                            </div>
                        </div>
                        <div class="course-percentage">${course.progress}%</div>
                    </div>
                `;
                coursesList.innerHTML += courseHtml;
            });
        }

        function admissionEscapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function admissionValue(value, fallback = '-') {
            if (value === null || value === undefined) return fallback;
            const text = String(value).trim();
            return text ? text : fallback;
        }

        function renderStudentAdmissionSnapshot(student) {
            const container = document.getElementById('studentAdmissionFormContent');
            if (!container) return;

            const name = admissionValue(student.Name || student.fullName);
            const studentId = admissionValue(student.Student_ID || student.studentId || student.id);
            const department = admissionValue(student.Branch || student.department);
            const program = admissionValue(student.Program || student.program || 'B.Tech');
            const year = admissionValue(student.Year || student.year);
            const section = admissionValue(student.Section || student.section || 'N/A');
            const email = admissionValue(student.Email || student.email);
            const phone = admissionValue(student.Phone || student.phone || student.mobile);
            const gender = admissionValue(student.Gender || student.gender);
            const dob = admissionValue(student.Date_of_Birth || student.dateOfBirth || student.dob);
            const category = admissionValue(student.Category || student.category);
            const fatherName = admissionValue(student.Father_Name || student.fatherName);
            const motherName = admissionValue(student.Mother_Name || student.motherName);
            const fatherOccupation = admissionValue(student.Father_Occupation || student.fatherOccupation);
            const motherOccupation = admissionValue(student.Mother_Occupation || student.motherOccupation);
            const aadhaar = admissionValue(student.Aadhaar || student.aadhaarNumber || student.aadhaar);
            const scholarship = admissionValue(student.Scholarship_Eligible || student.scholarshipEligible);
            const photo = admissionValue(student.Photo || student.photo || student.profileImage || 'https://via.placeholder.com/84x104.png?text=Photo', 'https://via.placeholder.com/84x104.png?text=Photo');
            const presentAddress = admissionValue(student.Present_Address || student.presentAddress || student.address);
            const permanentAddress = admissionValue(student.Permanent_Address || student.permanentAddress || student.address);
            const district = admissionValue(student.District || student.district);
            const state = admissionValue(student.State || student.state);
            const country = admissionValue(student.Country || student.country || 'India');
            const fatherMobile = admissionValue(student.Father_Mobile || student.fatherMobile);
            const motherMobile = admissionValue(student.Mother_Mobile || student.motherMobile);
            const guardianMobile = admissionValue(student.Guardian_Mobile || student.guardianMobile);
            const guardianEmail = admissionValue(student.Guardian_Email || student.guardianEmail);
            const admissionYear = admissionValue(student.Admission_Year || student.admissionYear || student.batch || 'N/A');

            const cgpa = parseFloat(student.CGPA ?? student.cgpa ?? 0);
            const cgpaText = Number.isFinite(cgpa) && cgpa > 0 ? cgpa.toFixed(2) : '-';

            container.innerHTML = `
                <div class="admission-form-header">Admission Form</div>
                <div class="admission-meta-grid">
                    <div class="admission-meta-item">Department: ${admissionEscapeHtml(department)}</div>
                    <div class="admission-meta-item">Program: ${admissionEscapeHtml(program)}</div>
                    <div class="admission-meta-item">Admission Year: ${admissionEscapeHtml(admissionYear)}</div>
                    <div class="admission-meta-item">Section: ${admissionEscapeHtml(section)}</div>
                </div>

                <div class="admission-card">
                    <div class="admission-card-title">Personal Details</div>
                    <div class="admission-two-col">
                        <div>
                            <div class="admission-line"><strong>Name of the Candidate:</strong> ${admissionEscapeHtml(name)}</div>
                            <div class="admission-line"><strong>Roll Number:</strong> ${admissionEscapeHtml(studentId)}</div>
                            <div class="admission-line"><strong>Date of Birth:</strong> ${admissionEscapeHtml(dob)}</div>
                            <div class="admission-line"><strong>Gender:</strong> ${admissionEscapeHtml(gender)}</div>
                            <div class="admission-line"><strong>Category:</strong> ${admissionEscapeHtml(category)}</div>
                            <div class="admission-line"><strong>Father Name:</strong> ${admissionEscapeHtml(fatherName)}</div>
                            <div class="admission-line"><strong>Mother Name:</strong> ${admissionEscapeHtml(motherName)}</div>
                            <div class="admission-line"><strong>Father Occupation:</strong> ${admissionEscapeHtml(fatherOccupation)}</div>
                            <div class="admission-line"><strong>Mother Occupation:</strong> ${admissionEscapeHtml(motherOccupation)}</div>
                            <div class="admission-line"><strong>Aadhaar Number:</strong> ${admissionEscapeHtml(aadhaar)}</div>
                            <div class="admission-line"><strong>Scholarship Eligible:</strong> ${admissionEscapeHtml(scholarship)}</div>
                        </div>
                        <div class="admission-photo-box">
                            <div class="admission-line"><strong>Photo</strong></div>
                            <img src="${admissionEscapeHtml(photo)}" alt="Student Photo" onerror="this.src='https://via.placeholder.com/84x104.png?text=Photo'">
                        </div>
                    </div>
                </div>

                <div class="admission-card">
                    <div class="admission-card-title">Address</div>
                    <div class="admission-two-col">
                        <div>
                            <div class="admission-line"><strong>Present Address:</strong> ${admissionEscapeHtml(presentAddress)}</div>
                            <div class="admission-line"><strong>District:</strong> ${admissionEscapeHtml(district)}</div>
                            <div class="admission-line"><strong>State:</strong> ${admissionEscapeHtml(state)}</div>
                            <div class="admission-line"><strong>Country:</strong> ${admissionEscapeHtml(country)}</div>
                        </div>
                        <div>
                            <div class="admission-line"><strong>Permanent Address:</strong> ${admissionEscapeHtml(permanentAddress)}</div>
                            <div class="admission-line"><strong>District:</strong> ${admissionEscapeHtml(district)}</div>
                            <div class="admission-line"><strong>State:</strong> ${admissionEscapeHtml(state)}</div>
                            <div class="admission-line"><strong>Country:</strong> ${admissionEscapeHtml(country)}</div>
                        </div>
                    </div>
                </div>

                <div class="admission-card">
                    <div class="admission-card-title">Contact Details</div>
                    <div class="admission-two-col">
                        <div>
                            <div class="admission-line"><strong>Father Mobile:</strong> ${admissionEscapeHtml(fatherMobile)}</div>
                            <div class="admission-line"><strong>Student Mobile:</strong> ${admissionEscapeHtml(phone)}</div>
                            <div class="admission-line"><strong>Student Email:</strong> ${admissionEscapeHtml(email)}</div>
                        </div>
                        <div>
                            <div class="admission-line"><strong>Mother Mobile:</strong> ${admissionEscapeHtml(motherMobile)}</div>
                            <div class="admission-line"><strong>Guardian Mobile:</strong> ${admissionEscapeHtml(guardianMobile)}</div>
                            <div class="admission-line"><strong>Guardian Email:</strong> ${admissionEscapeHtml(guardianEmail)}</div>
                        </div>
                    </div>
                </div>

                <div class="admission-card">
                    <div class="admission-card-title">Education Details</div>
                    <div class="admission-table-wrap">
                        <table class="admission-table">
                            <thead>
                                <tr>
                                    <th>Details</th>
                                    <th>SSC / Equivalent</th>
                                    <th>Intermediate / Equivalent</th>
                                    <th>Under Graduation</th>
                                    <th>Post Graduation</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>Name of Institution</td>
                                    <td>${admissionEscapeHtml(admissionValue(student.SSC_School || student.sscSchool))}</td>
                                    <td>${admissionEscapeHtml(admissionValue(student.Inter_College || student.interCollege))}</td>
                                    <td>${admissionEscapeHtml(admissionValue(student.UG_College || student.ugCollege || 'MGIT'))}</td>
                                    <td>${admissionEscapeHtml(admissionValue(student.PG_College || student.pgCollege))}</td>
                                </tr>
                                <tr>
                                    <td>Board / University</td>
                                    <td>${admissionEscapeHtml(admissionValue(student.SSC_Board || student.sscBoard))}</td>
                                    <td>${admissionEscapeHtml(admissionValue(student.Inter_Board || student.interBoard))}</td>
                                    <td>${admissionEscapeHtml(admissionValue(student.UG_Board || student.ugBoard))}</td>
                                    <td>${admissionEscapeHtml(admissionValue(student.PG_Board || student.pgBoard))}</td>
                                </tr>
                                <tr>
                                    <td>Year of Passing</td>
                                    <td>${admissionEscapeHtml(admissionValue(student.SSC_Year || student.sscYear))}</td>
                                    <td>${admissionEscapeHtml(admissionValue(student.Inter_Year || student.interYear))}</td>
                                    <td>${admissionEscapeHtml(admissionValue(year))}</td>
                                    <td>${admissionEscapeHtml(admissionValue(student.PG_Year || student.pgYear))}</td>
                                </tr>
                                <tr>
                                    <td>Marks / CGPA</td>
                                    <td>${admissionEscapeHtml(admissionValue(student.SSC_Marks || student.sscMarks))}</td>
                                    <td>${admissionEscapeHtml(admissionValue(student.Inter_Marks || student.interMarks))}</td>
                                    <td>${admissionEscapeHtml(cgpaText)}</td>
                                    <td>${admissionEscapeHtml(admissionValue(student.PG_Marks || student.pgMarks))}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        async function loadStudentAdmissionSnapshot() {
            const container = document.getElementById('studentAdmissionFormContent');
            if (!container) return;

            const token = localStorage.getItem('token');
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const studentId = user.studentId || user.Student_ID || user.id;
            let merged = { ...user };

            if (!studentId) {
                renderStudentAdmissionSnapshot(merged);
                return;
            }

            try {
                const res = await fetch(`http://localhost:5000/api/student/${studentId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data?.success) {
                        merged = { ...merged, ...(data.student || data.user || data.profile || {}) };
                    }
                } else {
                    const fallbackRes = await fetch(`http://localhost:5000/api/student/profile/${studentId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (fallbackRes.ok) {
                        const fallbackData = await fallbackRes.json();
                        if (fallbackData?.success) {
                            merged = { ...merged, ...(fallbackData.student || fallbackData.user || fallbackData.profile || {}) };
                        }
                    }
                }
            } catch (_err) {
                // Keep local profile data when API is unavailable.
            }

            renderStudentAdmissionSnapshot(merged);
        }

        function renderStudentTimetableRows(entries) {
            if (!entries.length) return '<p style="color:#6b7280;">No timetable entries available for your section.</p>';
            let html = '<table class="students-table"><thead><tr><th>Day</th><th>Time</th><th>Subject</th><th>Faculty</th><th>Room</th></tr></thead><tbody>';
            entries.forEach((e) => {
                const timeRange = `${e.Start_Time || '-'} - ${e.End_Time || '-'}`;
                html += `<tr>
                    <td>${e.Day_of_Week || '-'}</td>
                    <td>${timeRange}</td>
                    <td>${e.Subject_Name || '-'}</td>
                    <td>${e.Faculty_Name || '-'}</td>
                    <td>${e.Room_No || '-'}</td>
                </tr>`;
            });
            html += '</tbody></table>';
            return html;
        }

        async function loadStudentSectionTimetable() {
            const el = document.getElementById('studentSectionTimetable');
            if (!el) return;

            const token = localStorage.getItem('token');
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const primaryStudentId = user.studentId || user.Student_ID || user.id;
            if (!primaryStudentId) {
                el.innerHTML = '<p style="color:#ef4444;">Student session not found.</p>';
                return;
            }

            el.innerHTML = '<div class="loading">Loading section timetable...</div>';
            try {
                let res = await fetch(`http://localhost:5000/api/timetable/student/${encodeURIComponent(primaryStudentId)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                let data = await parseJsonSafe(res);

                const altStudentId = user.id;
                if ((!res.ok || !data.success) && res.status === 403 && altStudentId && String(altStudentId) !== String(primaryStudentId)) {
                    res = await fetch(`http://localhost:5000/api/timetable/student/${encodeURIComponent(altStudentId)}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    data = await parseJsonSafe(res);
                }

                if (!res.ok || !data.success) {
                    el.innerHTML = `<p style="color:#ef4444;">${(data && data.message) || 'Failed to load timetable.'}</p>`;
                    return;
                }

                const sections = Array.isArray(data.sections) ? data.sections : [];
                const entries = Array.isArray(data.entries) ? data.entries : [];
                const sectionLabel = sections.length
                    ? sections.map((s) => `${s.Branch || ''} Year ${s.Year || '-'} ${s.Section_Name || ''}`.trim()).join(', ')
                    : 'Unassigned Section';

                el.innerHTML = `<div style="margin-bottom:10px;color:#334155;font-weight:600;">Section: ${sectionLabel}</div>${renderStudentTimetableRows(entries)}`;
            } catch (err) {
                el.innerHTML = `<p style="color:#ef4444;">${err.message || 'Error loading timetable.'}</p>`;
            }
        }

        function showSection(section) {
            // Hide all sections
            document.querySelectorAll('[id$="Section"]').forEach(el => {
                el.style.display = 'none';
            });

            // Show selected section (with animation)
            const targetEl = document.getElementById(section + 'Section');
            if (targetEl) {
                targetEl.style.display = 'block';
                targetEl.classList.remove('section-animate');
                // Restart the animation (important when switching back and forth)
                void targetEl.offsetWidth;
                targetEl.classList.add('section-animate');
            }

            // Update active menu (avoid relying on global `event`)
            document.querySelectorAll('.sidebar-menu a').forEach(link => link.classList.remove('active'));
            document.querySelectorAll('.sidebar-menu a').forEach(link => {
                const onclickAttr = link.getAttribute('onclick') || '';
                if (onclickAttr.includes(`showSection('${section}')`)) {
                    link.classList.add('active');
                }
            });

            if (section === 'profile') {
                loadProfileData();
            } else if (section === 'aianalysis') {
                loadAIAnalysis();
            } else if (section === 'courses') {
                loadCourses();
            } else if (section === 'doubts') {
                bindStudentDoubtForm();
                loadStudentDoubtContacts();
                loadStudentDoubtThreads();
            } else if (section === 'assignments') {
                loadAssessments();
            } else if (section === 'attendance') {
                loadAttendanceRecords();
            } else if (section === 'results') {
                loadResults();
            } else if (section === 'studentsuccess') {
                initStudentSuccessHub();
            } else if (section === 'dashboard') {
                loadStudentSectionTimetable();
            }
        }

        async function loadResults() {
            const token = localStorage.getItem('token');
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const studentId = user.studentId || user.id;
            const summaryEl = document.getElementById('resultsSummary');
            const tableWrap = document.getElementById('resultsTableWrap');

            if (!studentId) {
                summaryEl.textContent = 'Student not found in session. Please login again.';
                summaryEl.style.color = '#ef4444';
                tableWrap.innerHTML = '';
                return;
            }

            summaryEl.textContent = 'Loading results...';
            summaryEl.style.color = '#475569';
            tableWrap.innerHTML = '<div class="loading">Loading subject-wise results...</div>';

            try {
                const res = await fetch(`http://localhost:5000/api/student/results/${studentId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                const data = await res.json();

                if (!res.ok || !data.success) {
                    summaryEl.textContent = data.message || 'Failed to load results.';
                    summaryEl.style.color = '#ef4444';
                    tableWrap.innerHTML = '';
                    return;
                }

                const student = data.student || {};
                const summary = data.summary || {};
                const subjects = Array.isArray(data.subjects) ? data.subjects : [];

                summaryEl.textContent = `Semester ${student.semester || '-'} | SGPA: ${student.latestSgpa ?? '-'} | CGPA: ${student.cgpa ?? '-'} | ${student.resultStatus || 'Published'} | Passed: ${summary.passedSubjects || 0}/${summary.totalSubjects || 0}`;
                summaryEl.style.color = '#334155';

                if (subjects.length === 0) {
                    tableWrap.innerHTML = '<div style="color:#64748b;">No subject-wise results available.</div>';
                    return;
                }

                let html = '<table class="students-table">';
                html += '<thead><tr><th>Subject</th><th>Semester</th><th>Exam</th><th>Marks</th><th>Grade</th><th>Status</th></tr></thead><tbody>';

                subjects.forEach((item) => {
                    const statusColor = item.status === 'Pass' ? '#16a34a' : '#dc2626';
                    html += `<tr>
                        <td>${item.subject || '-'}</td>
                        <td>${item.semester ?? '-'}</td>
                        <td>${item.examType || '-'}</td>
                        <td>${item.marksObtained ?? '-'} / ${item.maxMarks ?? '-'}</td>
                        <td>${item.grade || '-'}</td>
                        <td style="font-weight:700;color:${statusColor};">${item.status || '-'}</td>
                    </tr>`;
                });

                html += '</tbody></table>';
                tableWrap.innerHTML = html;
            } catch (err) {
                summaryEl.textContent = 'Error loading results.';
                summaryEl.style.color = '#ef4444';
                tableWrap.innerHTML = '';
            }
        }

        async function loadAttendanceRecords() {
            const user = JSON.parse(localStorage.getItem('user'));
            const studentId = user.studentId || user.id;
            const recordsDiv = document.getElementById('attendanceRecords');
            recordsDiv.innerHTML = '<div class="loading">Loading attendance...</div>';

            try {
                const res = await fetch(`http://localhost:5000/api/attendance/student/${studentId}`);
                const data = await res.json();
                if (!res.ok) {
                    recordsDiv.innerHTML = '<div style="color:#ef4444;">Error loading attendance: ' + (data.error || res.statusText) + '</div>';
                    return;
                }
                if (!Array.isArray(data) || data.length === 0) {
                    recordsDiv.innerHTML = '<div style="color:#6b7280;padding:16px;">No attendance records found. Your attendance will appear here once marked by faculty.</div>';
                    return;
                }
                let html = '<table class="students-table"><thead><tr><th>Date</th><th>Period</th><th>Subject</th><th>Status</th><th>Marked By</th></tr></thead><tbody>';
                data.forEach(a => {
                    html += `<tr><td>${a.Date || a.date}</td><td>${a.Period ?? a.period ?? '-'}</td><td>${a.Subject || a.subject}</td><td>${a.Status || a.status}</td><td>${a.Faculty_ID || a.facultyId || '-'}</td></tr>`;
                });
                html += '</tbody></table>';
                recordsDiv.innerHTML = html;

            } catch (err) {
                recordsDiv.innerHTML = '<div style="color:#ef4444;">Error loading attendance records.</div>';
            }
        }

        function getStudentContext() {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            return {
                studentId: user.studentId || user.id,
                branch: user.department || user.Branch || '',
                year: user.year || user.Year || ''
            };
        }

        let studentDoubtContacts = [];
        let studentDoubtThreads = [];
        let studentDoubtSocket = null;

        function escapeStudentText(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function studentStatusBadge(statusRaw) {
            const status = String(statusRaw || 'pending').toLowerCase();
            const map = {
                pending: { bg: '#fef3c7', fg: '#92400e', text: 'PENDING' },
                'in-review': { bg: '#dbeafe', fg: '#1e40af', text: 'IN REVIEW' },
                replied: { bg: '#dcfce7', fg: '#166534', text: 'REPLIED' },
                closed: { bg: '#e5e7eb', fg: '#374151', text: 'CLOSED' }
            };
            const c = map[status] || map.pending;
            return `<span style="display:inline-block;padding:3px 8px;border-radius:999px;background:${c.bg};color:${c.fg};font-size:11px;font-weight:800;letter-spacing:0.02em;">${c.text}</span>`;
        }

        function studentPriorityBadge(priorityRaw) {
            const p = String(priorityRaw || 'medium').toLowerCase();
            const map = {
                high: { bg: '#fee2e2', fg: '#991b1b', text: 'HIGH' },
                medium: { bg: '#fef3c7', fg: '#92400e', text: 'MEDIUM' },
                low: { bg: '#dcfce7', fg: '#166534', text: 'LOW' }
            };
            const c = map[p] || map.medium;
            return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${c.bg};color:${c.fg};font-size:10px;font-weight:800;">${c.text}</span>`;
        }

        function studentCategoryBadge(categoryRaw) {
            const text = String(categoryRaw || 'concept').toUpperCase();
            return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:10px;font-weight:800;">${escapeStudentText(text)}</span>`;
        }

        function bindStudentDoubtForm() {
            const form = document.getElementById('studentDoubtForm');
            const subjectSel = document.getElementById('studentDoubtSubject');
            if (!form || form.dataset.bound === '1') return;

            form.dataset.bound = '1';
            form.addEventListener('submit', submitStudentDoubt);
            if (subjectSel) {
                subjectSel.addEventListener('change', () => {
                    populateStudentDoubtFacultyOptions(subjectSel.value || '');
                });
            }
        }

        function populateStudentDoubtSubjectOptions() {
            const subjectSel = document.getElementById('studentDoubtSubject');
            if (!subjectSel) return;

            const subjects = new Set();
            studentDoubtContacts.forEach((c) => {
                const items = getContactSubjectList(c);
                items.forEach((s) => {
                    const val = String(s || '').trim();
                    if (val) subjects.add(val);
                });
            });

            const selected = subjectSel.value || '';
            const sortedSubjects = Array.from(subjects).sort((a, b) => a.localeCompare(b));
            subjectSel.innerHTML = '<option value="">Select subject</option>' +
                sortedSubjects.map((s) => `<option value="${escapeStudentText(s)}">${escapeStudentText(s)}</option>`).join('');

            if (selected && sortedSubjects.includes(selected)) {
                subjectSel.value = selected;
            } else if (sortedSubjects.length === 1) {
                subjectSel.value = sortedSubjects[0];
            } else {
                subjectSel.value = '';
            }
        }

        function populateStudentDoubtFacultyOptions(subjectFilter = '') {
            const facultySel = document.getElementById('studentDoubtFaculty');
            if (!facultySel) return;

            const selected = facultySel.value || '';
            const rows = studentDoubtContacts.filter((c) => {
                if (!subjectFilter) return true;
                const items = getContactSubjectList(c);
                return items.some((s) => String(s || '').trim().toLowerCase() === String(subjectFilter).trim().toLowerCase());
            });

            facultySel.innerHTML = '<option value="">Select faculty</option>' + rows.map((c) => {
                const label = `${c.facultyName} (${c.facultyId}) - ${c.primarySubject || 'General'}`;
                return `<option value="${escapeStudentText(c.facultyId)}">${escapeStudentText(label)}</option>`;
            }).join('');

            if (selected && rows.some((r) => String(r.facultyId) === String(selected))) {
                facultySel.value = selected;
            } else if (rows.length === 1) {
                facultySel.value = String(rows[0].facultyId || '');
            } else {
                facultySel.value = '';
            }
        }

        function getContactSubjectList(contact) {
            const direct = contact && Array.isArray(contact.subjects) ? contact.subjects : [];
            if (direct.length) return direct;

            const asText = String((contact && contact.subjects) || '').trim();
            if (asText) {
                return asText.split(',').map((s) => s.trim()).filter(Boolean);
            }

            const primary = String((contact && contact.primarySubject) || '').trim();
            return primary ? [primary] : [];
        }

        function renderStudentDoubtFacultyCards() {
            const host = document.getElementById('studentDoubtFacultyCards');
            if (!host) return;

            if (!studentDoubtContacts.length) {
                host.innerHTML = '<div style="color:#6b7280;">No faculty contacts found for your section/branch. Ask admin to assign section faculty.</div>';
                return;
            }

            host.innerHTML = studentDoubtContacts.map((c) => {
                const subjects = getContactSubjectList(c)
                    .filter(Boolean)
                    .slice(0, 4)
                    .map((s) => `<span style="display:inline-block;background:#eff6ff;color:#1d4ed8;padding:2px 8px;border-radius:999px;font-size:11px;margin-right:6px;margin-top:6px;">${escapeStudentText(s)}</span>`)
                    .join('');

                return `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-bottom:10px;background:#fff;">
                    <div style="font-weight:700;color:#0f172a;">${escapeStudentText(c.facultyName)} <span style="font-size:12px;color:#64748b;">(${escapeStudentText(c.facultyId)})</span></div>
                    <div style="font-size:12px;color:#64748b;margin-top:4px;">${escapeStudentText(c.email || 'Email not available')}</div>
                    <div style="font-size:12px;color:#64748b;margin-top:2px;">${escapeStudentText((c.branch || '-') + ' • Year ' + (c.year || '-') + ' • Section ' + (c.sectionName || '-'))}</div>
                    <div style="margin-top:6px;">${subjects}</div>
                </div>`;
            }).join('');
        }

        async function buildDoubtContactsFromAssignments() {
            const { branch, year } = getStudentContext();
            const params = new URLSearchParams();
            if (branch) params.append('branch', branch);
            if (year) params.append('year', year);

            const res = await fetch(`http://localhost:5000/api/assignments?${params.toString()}`);
            const data = await parseJsonSafe(res);
            const rows = Array.isArray(data?.assignments) ? data.assignments : [];
            if (!rows.length) return [];

            const map = new Map();
            rows.forEach((a) => {
                const facultyId = String(a.facultyId || '').trim();
                const facultyName = String(a.facultyName || '').trim();
                const subject = String(a.title || '').trim();
                if (!facultyId || !facultyName) return;

                if (!map.has(facultyId)) {
                    map.set(facultyId, {
                        facultyId,
                        facultyName,
                        email: null,
                        branch: branch || a.branch || null,
                        sectionName: null,
                        year: year || a.year || null,
                        specialization: null,
                        subjects: new Set(),
                        primarySubject: subject || 'General'
                    });
                }
                if (subject) map.get(facultyId).subjects.add(subject);
            });

            return Array.from(map.values()).map((v) => ({
                ...v,
                subjects: Array.from(v.subjects),
                primarySubject: v.primarySubject || (Array.from(v.subjects)[0] || 'General')
            }));
        }

        async function loadStudentDoubtContacts() {
            const token = localStorage.getItem('token');
            const statusEl = document.getElementById('studentDoubtStatus');
            const cardsEl = document.getElementById('studentDoubtFacultyCards');

            if (cardsEl) cardsEl.innerHTML = '<div class="loading">Loading faculty contacts...</div>';
            if (statusEl) {
                statusEl.textContent = 'Loading contacts...';
                statusEl.style.color = '#64748b';
            }

            try {
                const res = await fetch('http://localhost:5000/api/student/faculty-contacts', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await parseJsonSafe(res);
                if (!res.ok || !data.success) {
                    throw new Error((data && data.message) || 'Failed to load faculty contacts');
                }

                studentDoubtContacts = Array.isArray(data.contacts) ? data.contacts : [];
                populateStudentDoubtSubjectOptions();
                const subjectSel = document.getElementById('studentDoubtSubject');
                const activeSubject = subjectSel ? subjectSel.value : '';
                populateStudentDoubtFacultyOptions(activeSubject);
                renderStudentDoubtFacultyCards();

                if (statusEl) {
                    statusEl.textContent = `${studentDoubtContacts.length} faculty contact(s) loaded`;
                    statusEl.style.color = '#16a34a';
                }
            } catch (err) {
                // Fallback: derive faculty-subject contacts from available assignments.
                try {
                    const fallbackContacts = await buildDoubtContactsFromAssignments();
                    if (fallbackContacts.length) {
                        studentDoubtContacts = fallbackContacts;
                        populateStudentDoubtSubjectOptions();
                        const subjectSel = document.getElementById('studentDoubtSubject');
                        populateStudentDoubtFacultyOptions(subjectSel ? subjectSel.value : '');
                        renderStudentDoubtFacultyCards();
                        if (statusEl) {
                            statusEl.textContent = 'Loaded faculty/subjects from course assignments (fallback mode).';
                            statusEl.style.color = '#b45309';
                        }
                        return;
                    }
                } catch (_fallbackErr) {
                    // Continue to hard error rendering below.
                }

                studentDoubtContacts = [];
                populateStudentDoubtSubjectOptions();
                populateStudentDoubtFacultyOptions('');
                if (cardsEl) cardsEl.innerHTML = `<div style="color:#ef4444;">${escapeStudentText(err.message || 'Error loading faculty contacts')}</div>`;
                if (statusEl) {
                    statusEl.textContent = err.message || 'Error loading contacts';
                    statusEl.style.color = '#ef4444';
                }
            }
        }

        async function submitStudentDoubt(e) {
            e.preventDefault();
            const token = localStorage.getItem('token');
            const subject = String(document.getElementById('studentDoubtSubject')?.value || '').trim();
            const facultyId = String(document.getElementById('studentDoubtFaculty')?.value || '').trim();
            const category = String(document.getElementById('studentDoubtCategory')?.value || 'concept').trim();
            const priority = String(document.getElementById('studentDoubtPriority')?.value || 'medium').trim();
            const doubtText = String(document.getElementById('studentDoubtText')?.value || '').trim();
            const attachmentEl = document.getElementById('studentDoubtAttachment');
            const attachmentFile = attachmentEl && attachmentEl.files ? attachmentEl.files[0] : null;
            const statusEl = document.getElementById('studentDoubtStatus');

            if (!subject || !facultyId || !doubtText) {
                if (statusEl) {
                    statusEl.textContent = 'Please choose subject, faculty, and write your doubt.';
                    statusEl.style.color = '#ef4444';
                }
                return;
            }

            if (statusEl) {
                statusEl.textContent = 'Sending doubt...';
                statusEl.style.color = '#64748b';
            }

            try {
                const formData = new FormData();
                formData.append('facultyId', facultyId);
                formData.append('subject', subject);
                formData.append('category', category);
                formData.append('priority', priority);
                formData.append('doubtText', doubtText);
                if (attachmentFile) formData.append('attachment', attachmentFile);

                const res = await fetch('http://localhost:5000/api/doubts/student', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    body: formData
                });
                const data = await parseJsonSafe(res);
                if (!res.ok || !data.success) {
                    throw new Error((data && data.message) || 'Failed to send doubt');
                }

                const textEl = document.getElementById('studentDoubtText');
                if (textEl) textEl.value = '';
                if (attachmentEl) attachmentEl.value = '';
                if (statusEl) {
                    statusEl.textContent = 'Doubt sent successfully to faculty.';
                    statusEl.style.color = '#16a34a';
                }

                const ctx = getStudentContext();
                loadNotifications(ctx.studentId);
                loadStudentDoubtThreads();
            } catch (err) {
                if (statusEl) {
                    statusEl.textContent = err.message || 'Failed to send doubt';
                    statusEl.style.color = '#ef4444';
                }
            }
        }

        function renderStudentDoubtThreads() {
            const host = document.getElementById('studentDoubtThreads');
            if (!host) return;

            if (!studentDoubtThreads.length) {
                host.innerHTML = '<div style="color:#6b7280;">No doubts submitted yet.</div>';
                return;
            }

            host.innerHTML = studentDoubtThreads.map((d) => {
                const statusBadge = studentStatusBadge(d.status);
                const createdAt = d.created_at ? new Date(d.created_at).toLocaleString() : '-';
                const repliedAt = d.replied_at ? new Date(d.replied_at).toLocaleString() : null;
                const seenByFaculty = d.seen_by_faculty_at ? `Faculty seen: ${new Date(d.seen_by_faculty_at).toLocaleString()}` : 'Faculty not seen yet';
                const category = String(d.category || 'concept');
                const priority = String(d.priority || 'medium');

                return `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-bottom:10px;background:#fff;">
                    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;">
                        <div>
                            <div style="font-weight:700;color:#0f172a;">${escapeStudentText(d.subject || '-')}</div>
                            <div style="font-size:12px;color:#64748b;margin-top:3px;">Faculty: ${escapeStudentText(d.faculty_name || d.faculty_id || '-')}</div>
                            <div style="font-size:11px;color:#64748b;margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">${studentCategoryBadge(category)} ${studentPriorityBadge(priority)}</div>
                        </div>
                        ${statusBadge}
                    </div>
                    <div style="margin-top:8px;font-size:13px;color:#1f2937;line-height:1.5;">${escapeStudentText(d.doubt_text || '')}</div>
                    <div style="margin-top:8px;font-size:11px;color:#64748b;">Asked on ${escapeStudentText(createdAt)}</div>
                    <div style="margin-top:4px;font-size:11px;color:#64748b;">${escapeStudentText(seenByFaculty)}</div>
                    ${d.student_attachment_url ? `<div style="margin-top:8px;"><a href="${escapeStudentText(d.student_attachment_url)}" target="_blank" rel="noopener" style="font-size:12px;color:#1d4ed8;font-weight:600;">View my attachment</a></div>` : ''}
                    ${d.faculty_reply ? `<div style="margin-top:10px;padding:10px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;">
                        <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:4px;">Faculty Reply</div>
                        <div style="font-size:13px;color:#1f2937;line-height:1.5;">${escapeStudentText(d.faculty_reply)}</div>
                        ${d.faculty_attachment_url ? `<div style="margin-top:8px;"><a href="${escapeStudentText(d.faculty_attachment_url)}" target="_blank" rel="noopener" style="font-size:12px;color:#1d4ed8;font-weight:600;">View faculty attachment</a></div>` : ''}
                        ${repliedAt ? `<div style="margin-top:6px;font-size:11px;color:#64748b;">Replied on ${escapeStudentText(repliedAt)}</div>` : ''}
                    </div>` : ''}
                    <details style="margin-top:10px;">
                        <summary style="cursor:pointer;font-size:12px;font-weight:700;color:#334155;">Thread & Follow-up</summary>
                        <div id="studentThread_${Number(d.doubt_id)}" style="margin-top:8px;font-size:12px;color:#334155;">Loading thread...</div>
                        <form onsubmit="submitStudentFollowUp(event, ${Number(d.doubt_id)})" style="margin-top:8px;display:grid;gap:8px;">
                            <textarea id="studentFollowText_${Number(d.doubt_id)}" rows="2" placeholder="Add follow-up message..." style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:8px;"></textarea>
                            <input id="studentFollowFile_${Number(d.doubt_id)}" type="file" accept="image/*,.pdf,.doc,.docx,.txt" style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:8px;background:#fff;">
                            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                                <button type="button" onclick="loadStudentThread(${Number(d.doubt_id)})" style="background:#e2e8f0;color:#0f172a;border:none;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer;">Refresh Thread</button>
                                <button type="submit" style="background:#2563eb;color:#fff;border:none;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer;">Send Follow-up</button>
                                <span id="studentFollowStatus_${Number(d.doubt_id)}" style="font-size:11px;color:#64748b;"></span>
                            </div>
                        </form>
                    </details>
                </div>`;
            }).join('');

            studentDoubtThreads.forEach((d) => {
                if (d && d.doubt_id) loadStudentThread(Number(d.doubt_id));
            });
        }

        async function loadStudentDoubtThreads() {
            const token = localStorage.getItem('token');
            const host = document.getElementById('studentDoubtThreads');
            if (host) host.innerHTML = '<div class="loading">Loading your doubts...</div>';

            try {
                const res = await fetch('http://localhost:5000/api/doubts/student/my', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await parseJsonSafe(res);
                if (!res.ok || !data.success) {
                    throw new Error((data && data.message) || 'Failed to load doubts');
                }
                studentDoubtThreads = Array.isArray(data.doubts) ? data.doubts : [];
                renderStudentDoubtThreads();
            } catch (err) {
                studentDoubtThreads = [];
                if (host) host.innerHTML = `<div style="color:#ef4444;">${escapeStudentText(err.message || 'Error loading doubts')}</div>`;
            }
        }

        async function loadStudentThread(doubtId) {
            const token = localStorage.getItem('token');
            const host = document.getElementById(`studentThread_${doubtId}`);
            if (!host) return;
            host.textContent = 'Loading thread...';
            try {
                const res = await fetch(`http://localhost:5000/api/doubts/${doubtId}/messages`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await parseJsonSafe(res);
                if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load thread');
                const list = Array.isArray(data.messages) ? data.messages : [];
                if (!list.length) {
                    host.innerHTML = '<div style="color:#64748b;">No thread messages yet.</div>';
                    return;
                }
                host.innerHTML = list.map((m) => {
                    const who = String(m.sender_type || '').toLowerCase() === 'faculty' ? 'Faculty' : 'You';
                    const at = m.created_at ? new Date(m.created_at).toLocaleString() : '-';
                    return `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px;margin-bottom:6px;background:#fff;">
                        <div style="font-size:11px;color:#64748b;">${who} • ${escapeStudentText(at)}</div>
                        <div style="font-size:12px;color:#0f172a;margin-top:3px;">${escapeStudentText(m.message_text || '')}</div>
                        ${m.attachment_url ? `<div style="margin-top:4px;"><a href="${escapeStudentText(m.attachment_url)}" target="_blank" rel="noopener" style="font-size:11px;color:#1d4ed8;">View attachment</a></div>` : ''}
                    </div>`;
                }).join('');
            } catch (err) {
                host.innerHTML = `<div style="color:#ef4444;">${escapeStudentText(err.message || 'Error loading thread')}</div>`;
            }
        }

        async function submitStudentFollowUp(event, doubtId) {
            event.preventDefault();
            const token = localStorage.getItem('token');
            const textEl = document.getElementById(`studentFollowText_${doubtId}`);
            const fileEl = document.getElementById(`studentFollowFile_${doubtId}`);
            const statusEl = document.getElementById(`studentFollowStatus_${doubtId}`);
            const messageText = String(textEl ? textEl.value : '').trim();
            const file = fileEl && fileEl.files ? fileEl.files[0] : null;
            if (!messageText && !file) {
                if (statusEl) {
                    statusEl.textContent = 'Type message or attach file.';
                    statusEl.style.color = '#ef4444';
                }
                return;
            }
            if (statusEl) {
                statusEl.textContent = 'Sending...';
                statusEl.style.color = '#64748b';
            }
            try {
                const formData = new FormData();
                formData.append('messageText', messageText);
                if (file) formData.append('attachment', file);
                const res = await fetch(`http://localhost:5000/api/doubts/${doubtId}/messages`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
                const data = await parseJsonSafe(res);
                if (!res.ok || !data.success) throw new Error(data.message || 'Failed to send follow-up');
                if (textEl) textEl.value = '';
                if (fileEl) fileEl.value = '';
                if (statusEl) {
                    statusEl.textContent = 'Sent.';
                    statusEl.style.color = '#16a34a';
                }
                loadStudentThread(doubtId);
                loadStudentDoubtThreads();
            } catch (err) {
                if (statusEl) {
                    statusEl.textContent = err.message || 'Failed';
                    statusEl.style.color = '#ef4444';
                }
            }
        }

        function initStudentDoubtRealtime() {
            try {
                if (studentDoubtSocket || typeof io !== 'function') return;
                const user = JSON.parse(localStorage.getItem('user') || '{}');
                const studentId = user.studentId || user.id;
                if (!studentId) return;
                studentDoubtSocket = io('http://localhost:5000');
                studentDoubtSocket.on('connect', () => {
                    studentDoubtSocket.emit('register', { userType: 'student', userId: studentId });
                });
                const refresh = () => {
                    loadStudentDoubtThreads();
                    loadNotifications(studentId);
                };
                studentDoubtSocket.on('doubt:new', refresh);
                studentDoubtSocket.on('doubt:updated', refresh);
                studentDoubtSocket.on('doubt:escalated', refresh);
                studentDoubtSocket.on('student-success:updated', () => {
                    const sectionVisible = document.getElementById('studentsuccessSection')?.style.display === 'block';
                    if (sectionVisible) {
                        initStudentSuccessHub();
                    }
                });
                studentDoubtSocket.on('peer-room:update', (payload = {}) => {
                    applyPeerRoomStatus(payload.rooms || []);
                });
                studentDoubtSocket.on('peer-room:joined', (payload = {}) => {
                    const roomId = String(payload.roomId || '').trim();
                    if (!roomId) return;
                    studentActivePeerRoomId = roomId;
                    openStudentPeerRoomDashboard(roomId);
                    loadPeerRoomHistory(roomId);
                    renderStudentPeerRooms();
                });
                studentDoubtSocket.on('peer-room:history', (payload = {}) => {
                    const roomId = String(payload.roomId || '').trim();
                    if (!roomId || roomId !== studentActivePeerRoomId) return;
                    studentPeerRoomMessages = Array.isArray(payload.messages) ? payload.messages.slice(-50) : [];
                    studentPeerRoomUnread[roomId] = 0;
                    renderStudentPeerRoomMessages();
                });
                studentDoubtSocket.on('peer-room:message', (message = {}) => {
                    const roomId = String(message.roomId || '').trim();
                    if (!roomId) return;
                    if (roomId === studentActivePeerRoomId) {
                        studentPeerRoomMessages.push(message);
                        if (studentPeerRoomMessages.length > 80) studentPeerRoomMessages = studentPeerRoomMessages.slice(-80);
                        renderStudentPeerRoomMessages();
                    } else {
                        studentPeerRoomUnread[roomId] = Number(studentPeerRoomUnread[roomId] || 0) + 1;
                        renderStudentPeerRooms();
                    }
                });
                studentDoubtSocket.on('peer-room:typing', (payload = {}) => {
                    const roomId = String(payload.roomId || '').trim();
                    if (!roomId || roomId !== studentActivePeerRoomId) return;
                    const userId = String(payload.userId || '').trim();
                    const userName = String(payload.userName || 'Someone').trim();
                    if (!userId) return;
                    if (payload.isTyping) {
                        studentPeerTypingUsers[userId] = userName;
                    } else {
                        delete studentPeerTypingUsers[userId];
                    }
                    if (studentPeerTypingTimer) clearTimeout(studentPeerTypingTimer);
                    studentPeerTypingTimer = setTimeout(() => {
                        studentPeerTypingUsers = {};
                        renderStudentPeerRoomMessages();
                    }, 1800);
                    renderStudentPeerRoomMessages();
                });
                studentDoubtSocket.on('peer-room:flags', (payload = {}) => {
                    const roomId = String(payload.roomId || '').trim();
                    if (!roomId) return;
                    const prev = studentPeerRoomStatuses[roomId] || {};
                    studentPeerRoomStatuses[roomId] = {
                        ...prev,
                        mutedAll: !!payload.mutedAll,
                        closed: !!payload.closed
                    };
                    renderStudentPeerRooms();
                    if (roomId === studentActivePeerRoomId) updatePeerRoomPanelMeta();
                });
                studentDoubtSocket.on('peer-room:closed', (payload = {}) => {
                    const roomId = String(payload.roomId || '').trim();
                    if (!roomId || roomId !== studentActivePeerRoomId) return;
                    alert(payload.message || 'Room was closed by moderator.');
                    leaveStudentPeerRoom();
                });
                studentDoubtSocket.on('peer-room:error', (payload = {}) => {
                    const msg = String(payload.message || 'Peer room action failed');
                    alert(msg);
                });

                const savedRoom = String(localStorage.getItem(STUDENT_LAST_PEER_ROOM_KEY) || '').trim();
                if (savedRoom) {
                    setTimeout(() => {
                        joinStudentPeerRoom(savedRoom);
                    }, 300);
                }
            } catch (_e) {
                // Realtime optional.
            }
        }

        async function loadCourses() {
            const { studentId, branch, year } = getStudentContext();
            const availableEl = document.getElementById('coursesAvailableList');
            const enrolledEl = document.getElementById('coursesEnrolledList');
            const statusEl = document.getElementById('coursesStatus');
            statusEl.textContent = '';

            if (!studentId) {
                availableEl.innerHTML = '<div style="color:#ef4444;">Student not found in session. Please login again.</div>';
                enrolledEl.innerHTML = '';
                return;
            }

            availableEl.className = 'loading';
            enrolledEl.className = 'loading';
            availableEl.innerHTML = 'Loading available courses...';
            enrolledEl.innerHTML = 'Loading your courses...';

            try {
                // 1) My enrolled courses
                const enrolledRes = await fetch(`http://localhost:5000/api/assignments/enrolled?student_id=${studentId}`);
                const enrolledData = await enrolledRes.json();

                const enrollments = enrolledData && enrolledData.enrollments ? enrolledData.enrollments : [];
                const enrolledIds = new Set(enrollments.map(e => e.assignment_id));
                if (enrollments.length === 0) {
                    enrolledEl.innerHTML = '<div style="color:#6b7280;">No assignments yet. When faculty assigns work for your branch and year, it appears here automatically.</div>';
                } else {
                    enrolledEl.innerHTML = enrollments.map(a => `
                        <div style="margin-bottom:12px;padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;">
                            <div style="font-weight:700;margin-bottom:6px;">${a.title}${a.assignment_kind === 'workshop' ? ' <span style="font-size:11px;background:#ede9fe;color:#5b21b6;padding:2px 8px;border-radius:6px;">Workshop</span>' : ''}</div>
                            <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">${a.assignment_kind === 'workshop' ? 'Admin workshop' : 'Faculty: ' + (a.facultyName || a.facultyId)}</div>
                            <div style="font-size:12px;color:#6b7280;">${a.branch === 'ALL' ? 'All branches' : 'Branch: ' + a.branch} • Year: ${a.year === 0 ? '—' : a.year}</div>
                        </div>
                    `).join('');
                }

                // 2) Available courses (assignments) for student's branch/year
                const params = new URLSearchParams();
                if (branch) params.append('branch', branch);
                if (year) params.append('year', year);
                const availRes = await fetch(`http://localhost:5000/api/assignments?${params.toString()}`);
                const availData = await availRes.json();
                const assignments = (availData && availData.assignments ? availData.assignments : []).filter(a => !enrolledIds.has(a.id));

                if (assignments.length === 0) {
                    availableEl.innerHTML = '<div style="color:#6b7280;">No additional courses to enroll in for your branch/year right now.</div>';
                } else {
                    availableEl.innerHTML = assignments.map(a => `
                        <div style="margin-bottom:12px;padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;">
                            <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
                                <div>
                                    <div style="font-weight:700;margin-bottom:6px;">${a.title}</div>
                                    <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">Faculty: ${a.facultyName || a.facultyId}</div>
                                    <div style="font-size:12px;color:#6b7280;">Branch: ${a.branch} • Year: ${a.year}</div>
                                </div>
                                <button type="button" onclick="enrollCourse(${a.id})" style="background:#6366f1;color:#fff;border:none;border-radius:10px;padding:10px 14px;font-weight:700;cursor:pointer;white-space:nowrap;">
                                    Enroll
                                </button>
                            </div>
                        </div>
                    `).join('');
                }
            } catch (err) {
                availableEl.innerHTML = '<div style="color:#ef4444;">Error loading courses.</div>';
                enrolledEl.innerHTML = '';
            }
        }

        async function enrollCourse(assignmentId) {
            const { studentId } = getStudentContext();
            const statusEl = document.getElementById('coursesStatus');
            if (!studentId) {
                statusEl.textContent = 'Student not found. Please login again.';
                statusEl.style.color = '#ef4444';
                return;
            }
            statusEl.textContent = 'Enrolling...';
            statusEl.style.color = '#6b7280';
            try {
                const res = await fetch(`http://localhost:5000/api/assignments/${assignmentId}/enroll`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ student_id: studentId })
                });
                const data = await res.json();
                if (res.ok) {
                    statusEl.textContent = 'Enrolled successfully!';
                    statusEl.style.color = '#10b981';
                    loadCourses();
                } else {
                    statusEl.textContent = data.error || 'Enroll failed.';
                    statusEl.style.color = '#ef4444';
                }
            } catch (err) {
                statusEl.textContent = 'Enroll failed: ' + (err.message || String(err));
                statusEl.style.color = '#ef4444';
            }
        }

        async function loadAssessments() {
            const { studentId } = getStudentContext();
            const listEl = document.getElementById('myAssessmentsList');
            const statusEl = document.getElementById('assessmentsStatus');
            statusEl.textContent = '';

            if (!studentId) {
                listEl.innerHTML = '<div style="color:#ef4444;">Student not found. Please login again.</div>';
                return;
            }

            listEl.innerHTML = 'Loading assessments...';
            try {
                const res = await fetch(`http://localhost:5000/api/assignments/enrolled?student_id=${studentId}`);
                const data = await res.json();
                const enrollments = data && data.enrollments ? data.enrollments : [];

                if (enrollments.length === 0) {
                    listEl.innerHTML = '<div style="color:#6b7280;">No assignments yet. Faculty and admin assignments for your cohort appear here automatically when they are created.</div>';
                    return;
                }

                listEl.innerHTML = enrollments.map(a => `
                    <div style="margin-bottom:18px;padding:18px;border:1px solid #e5e7eb;border-radius:16px;background:#fff;">
                        <div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-start;">
                            <div>
                                <div style="font-weight:800;margin-bottom:6px;">${a.title}${a.assignment_kind === 'workshop' ? ' <span style="font-size:11px;background:#ede9fe;color:#5b21b6;padding:2px 8px;border-radius:6px;">Workshop</span>' : ''}</div>
                                <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">${a.assignment_kind === 'workshop' ? 'Offered by admin' : 'Faculty: ' + (a.facultyName || a.facultyId)}</div>
                                <div style="font-size:12px;color:#6b7280;">${a.branch === 'ALL' ? 'Open to eligible students' : 'Branch: ' + a.branch} • ${a.year === 0 ? 'Year: —' : 'Year: ' + a.year}</div>
                            </div>
                            <div style="font-size:12px;color:#6b7280;white-space:nowrap;">Due: ${a.dueDate || '-'}</div>
                        </div>

                        <div style="margin-top:14px;display:grid;grid-template-columns:1fr;gap:10px;">
                            <label style="font-size:12px;color:#6b7280;font-weight:600;">Submission Text</label>
                            <textarea id="submissionText_${a.id}" rows="3" style="width:100%;padding:10px;border-radius:12px;border:1px solid #e5e7eb;" placeholder="Write your assessment here..."></textarea>

                            <label style="font-size:12px;color:#6b7280;font-weight:600;">Assessment File (optional)</label>
                            <input type="file" id="submissionFile_${a.id}" style="width:100%;padding:6px 0;">

                            <button type="button" onclick="submitAssessment(${a.id})" style="background:#6366f1;color:#fff;border:none;border-radius:12px;padding:12px 16px;font-weight:800;cursor:pointer;">
                                Upload & Submit Assessment
                            </button>
                        </div>
                    </div>
                `).join('');
            } catch (err) {
                listEl.innerHTML = '<div style="color:#ef4444;">Error loading assessments.</div>';
            }
        }

        async function submitAssessment(assignmentId) {
            const { studentId } = getStudentContext();
            const statusEl = document.getElementById('assessmentsStatus');
            const textEl = document.getElementById(`submissionText_${assignmentId}`);
            const fileEl = document.getElementById(`submissionFile_${assignmentId}`);

            const submission_text = textEl ? textEl.value : '';
            const file = fileEl ? fileEl.files[0] : null;

            if (!studentId) {
                statusEl.textContent = 'Student not found. Please login again.';
                statusEl.style.color = '#ef4444';
                return;
            }

            // Allow file-only uploads; require at least one of (text or file)
            if ((!submission_text || submission_text.trim().length === 0) && !file) {
                statusEl.textContent = 'Please enter submission text or select a file.';
                statusEl.style.color = '#f59e0b';
                return;
            }

            statusEl.textContent = 'Submitting...';
            statusEl.style.color = '#6b7280';
            try {
                const formData = new FormData();
                formData.append('student_id', studentId);
                formData.append('submission_text', submission_text ? submission_text.trim() : '');
                if (file) formData.append('assessmentFile', file);

                const res = await fetch(`http://localhost:5000/api/assignments/${assignmentId}/submit-upload`, {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                if (res.ok) {
                    statusEl.textContent = 'Assessment submitted successfully!';
                    statusEl.style.color = '#10b981';
                    loadAssessments();
                } else {
                    statusEl.textContent = data.error || 'Submission failed.';
                    statusEl.style.color = '#ef4444';
                }
            } catch (err) {
                statusEl.textContent = 'Submission failed: ' + (err.message || String(err));
                statusEl.style.color = '#ef4444';
            }
        }

        function loadProfileData() {
            const user = JSON.parse(localStorage.getItem('user'));
            const profileContent = document.getElementById('profileContent');
            profileContent.innerHTML = `
                <form id="editProfileForm" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
                    <div>
                        <label style="color: #6b7280; font-size: 12px;">Full Name</label>
                        <input type="text" name="fullName" value="${user.fullName}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ddd;">
                    </div>
                    <div>
                        <label style="color: #6b7280; font-size: 12px;">Student ID</label>
                        <input type="text" name="studentId" value="${user.studentId}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ddd;" disabled>
                    </div>
                    <div>
                        <label style="color: #6b7280; font-size: 12px;">Email</label>
                        <input type="email" name="email" value="${user.email}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ddd;">
                    </div>
                    <div>
                        <label style="color: #6b7280; font-size: 12px;">Department</label>
                        <input type="text" name="department" value="${user.department}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ddd;">
                    </div>
                    <div style="grid-column: span 2; text-align:right;">
                        <button type="submit" style="background:#9333ea;color:white;padding:10px 24px;border:none;border-radius:8px;font-weight:600;">Save Changes</button>
                    </div>
                </form>
                <div id="profileStatus" style="grid-column: span 2; margin-top: 12px;"></div>
            `;

            document.getElementById('editProfileForm').addEventListener('submit', async function(e) {
                e.preventDefault();
                const form = e.target;
                const formData = new FormData(form);
                const updatedProfile = Object.fromEntries(formData);
                const token = localStorage.getItem('token');
                try {
                    const res = await fetch(`http://localhost:5000/api/student/profile/${user.studentId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(updatedProfile)
                    });
                    const data = await res.json();
                    if (data.success) {
                        document.getElementById('profileStatus').innerHTML = '<span style="color:green;font-weight:600;">Profile updated successfully!</span>';
                        // Update localStorage
                        localStorage.setItem('user', JSON.stringify(data.user));
                        loadProfileData();
                    } else {
                        document.getElementById('profileStatus').innerHTML = '<span style="color:red;">Error: ' + (data.error || 'Failed to update profile') + '</span>';
                    }
                } catch (err) {
                    document.getElementById('profileStatus').innerHTML = '<span style="color:red;">Error: ' + err.message + '</span>';
                }
            });
        }

        let studentAiBaseline = null;
        let studentAiContext = {
            prediction: 'N/A',
            confidence: 'N/A',
            risk: 'N/A',
            attendance: 'N/A',
            trend: 'N/A',
            report: 'N/A',
            recommendations: []
        };

        function renderStudentWhatIf() {
            const attEl = document.getElementById('simAttendance');
            const gpaEl = document.getElementById('simGpa');
            const skillEl = document.getElementById('simSkillBoost');
            const outEl = document.getElementById('studentWhatIfOutput');
            if (!attEl || !gpaEl || !skillEl || !outEl || !studentAiBaseline) return;

            const attLift = Number(attEl.value || 0);
            const gpaLift = Number(gpaEl.value || 0) / 100;
            const skillLift = Number(skillEl.value || 0);

            document.getElementById('simAttendanceLabel').textContent = `+${attLift}%`;
            document.getElementById('simGpaLabel').textContent = `+${gpaLift.toFixed(2)}`;
            document.getElementById('simSkillLabel').textContent = `+${skillLift}%`;

            const projectedAttendance = Math.min(100, studentAiBaseline.attendance + attLift);
            const projectedGpa = Math.min(4, studentAiBaseline.gpa + gpaLift);
            const projectedPlacement = Math.min(99, Math.round(
                studentAiBaseline.placement
                + (attLift * 0.9)
                + (gpaLift * 20)
                + (skillLift * 0.5)
            ));

            const projectedRisk = projectedPlacement < 45 || projectedAttendance < 70 || projectedGpa < 2.5
                ? 'HIGH'
                : projectedPlacement < 70 || projectedAttendance < 80 || projectedGpa < 3.2
                    ? 'MEDIUM'
                    : 'LOW';

            outEl.innerHTML = `Projected placement probability: <strong>${projectedPlacement}%</strong><br>` +
                `Projected attendance: <strong>${projectedAttendance.toFixed(1)}%</strong> | ` +
                `Projected GPA: <strong>${projectedGpa.toFixed(2)}</strong><br>` +
                `Projected risk band: <strong>${projectedRisk}</strong>`;
        }

        async function loadAIAnalysis() {
            const token = localStorage.getItem('token');
            const focusMode = document.getElementById('aiFocusMode')?.value || 'placement';

            try {
                const user = JSON.parse(localStorage.getItem('user') || '{}');
                const studentId = user.studentId || user.Student_ID || user.id;
                if (!studentId) return;

                const headers = { 'Authorization': `Bearer ${token}` };
                let student = null;

                const primaryRes = await fetch(`http://localhost:5000/api/student/${encodeURIComponent(studentId)}`, { headers });
                const primaryData = await parseJsonSafe(primaryRes);
                if (primaryRes.ok && primaryData?.success) {
                    student = primaryData.student || primaryData.user || primaryData.profile || null;
                }

                if (!student) {
                    const fallbackRes = await fetch(`http://localhost:5000/api/student/profile/${encodeURIComponent(studentId)}`, { headers });
                    const fallbackData = await parseJsonSafe(fallbackRes);
                    if (fallbackRes.ok && fallbackData?.success) {
                        student = fallbackData.student || fallbackData.user || fallbackData.profile || null;
                    }
                }

                if (!student) {
                    throw new Error('Unable to load AI analysis profile');
                }

                const attendance = Number(student.Attendance_Percentage ?? student.attendance ?? 0) || 0;
                const gpa = Number(student.CGPA ?? student.gpa ?? 0) || 0;
                const performance = Math.max(0, Math.min(100, Math.round((attendance * 0.45) + (gpa * 15))));
                const placementProb = Math.max(5, Math.min(99, Math.round((performance * 0.75) + (gpa * 6))));
                const risk = attendance < 70 || gpa < 2.5 ? 'HIGH' : (attendance < 80 || gpa < 3.2 ? 'MEDIUM' : 'LOW');
                const velocity = performance >= 85 ? 'Fast' : (performance >= 70 ? 'Steady' : 'Needs Support');

                const skillsRaw = Array.isArray(student.skills)
                    ? student.skills
                    : String(student.Skills || student.skills || '').split(',').map((s) => s.trim()).filter(Boolean);
                const skills = skillsRaw.length
                    ? skillsRaw.slice(0, 8).map((name, i) => ({ name, proficiency: Math.max(45, Math.min(95, performance - 15 + (i * 4))) }))
                    : [
                        { name: 'Problem Solving', proficiency: Math.max(40, performance - 10) },
                        { name: 'Communication', proficiency: Math.max(40, performance - 14) },
                        { name: 'Technical Depth', proficiency: Math.max(40, performance - 8) }
                    ];

                const workshops = Array.isArray(student.workshops) ? student.workshops : [];
                const recommendations = [];
                if (attendance < 80) recommendations.push({ type: 'warning', message: 'Attendance is below target.', action: 'Aim for 85%+ by attending all classes this week.' });
                if (gpa < 3.0) recommendations.push({ type: 'critical', message: 'GPA trend needs recovery.', action: 'Schedule 45 minutes daily for weakest subject revision.' });
                if (focusMode === 'skills') recommendations.push({ type: 'info', message: 'Skill acceleration mode enabled.', action: 'Complete one project demo and one mock interview this week.' });
                if (!recommendations.length) recommendations.push({ type: 'info', message: 'You are on track.', action: 'Maintain consistency and submit all work on time.' });

                const peerAvg = 76;
                const peerDelta = Math.round(performance - peerAvg);
                const sign = peerDelta >= 0 ? '+' : '';

                const setText = (id, value) => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = value;
                };
                const setWidth = (id, value) => {
                    const el = document.getElementById(id);
                    if (el) el.style.width = `${Math.max(0, Math.min(100, Number(value) || 0))}%`;
                };

                setText('aiPlacementProb', `${placementProb}%`);
                setText('aiRiskBadge', risk);
                setText('aiVelocity', velocity);
                setText('aiPeerDelta', `${sign}${peerDelta}%`);
                setText('attendanceValue', `${attendance}%`);
                setText('performanceValue', `${performance}%`);
                setText('aiGpaValue', `${gpa.toFixed(2)}/4.0`);
                setWidth('attendanceBar', attendance);
                setWidth('performanceBar', performance);
                setWidth('gpaBar', (gpa / 4) * 100);

                const divisionBadge = risk === 'HIGH' ? 'C' : (risk === 'MEDIUM' ? 'B' : 'A');
                const divisionName = risk === 'HIGH' ? 'Recovery Zone' : (risk === 'MEDIUM' ? 'Progressing' : 'Distinguished');
                const divisionDesc = risk === 'HIGH' ? 'Focused support needed' : (risk === 'MEDIUM' ? 'Steady upward path' : 'Top performer band');
                setText('divisionBadge', divisionBadge);
                setText('divisionName', divisionName);
                setText('divisionDesc', divisionDesc);

                const peerBox = document.getElementById('aiPeerBenchmark');
                if (peerBox) {
                    peerBox.innerHTML = `You are <strong>${sign}${peerDelta}%</strong> compared to similar peers (avg ${peerAvg}%).`;
                }

                studentAiBaseline = {
                    attendance,
                    gpa,
                    placement: placementProb
                };

                loadWorkshops(workshops);
                loadSkillsProficiency(skills);
                loadRecommendations(recommendations);
                await renderStudentInnovationFeatures({
                    attendance,
                    gpa,
                    performanceScore: performance,
                    placementProbability: placementProb,
                    workshops,
                    skills
                }, recommendations);

                studentAiContext = {
                    prediction: placementProb >= 70 ? 'Likely to excel if consistency is maintained' : 'Needs focused improvement in next 2 weeks',
                    confidence: `${Math.max(60, Math.min(95, performance))}%`,
                    risk,
                    attendance: `${attendance}%`,
                    trend: velocity === 'Fast' ? 'Positive momentum' : (velocity === 'Steady' ? 'Stable trajectory' : 'Downward trend detected'),
                    report: `${divisionName} profile. Placement probability ${placementProb}%. Primary risk band: ${risk}.`,
                    recommendations: recommendations.slice(0, 3).map((r) => r.message)
                };

                if (focusMode === 'placement') {
                    setStudentAiTab('overview');
                } else if (focusMode === 'academics') {
                    setStudentAiTab('actions');
                } else {
                    setStudentAiTab('benchmark');
                }

                renderStudentWhatIf();
            } catch (error) {
                console.error('Error loading AI analysis:', error);
            }
        }

        function setStudentAiTab(tabKey) {
            document.querySelectorAll('.ai-tab-btn').forEach((btn) => {
                const isActive = btn.getAttribute('data-ai-tab') === tabKey;
                btn.classList.toggle('active', isActive);
            });

            const show = (id, active) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.classList.toggle('active', !!active);
            };

            if (tabKey === 'overview') {
                show('studentAiTabOverview', true);
                show('studentAiTabActions', false);
                show('studentAiTabSkills', false);
                show('studentAiTabRecommendations', false);
                show('studentAiTabActionPlan', false);
                show('studentAiTabAdvanced', false);
                show('studentAiTabBenchmark', false);
            } else if (tabKey === 'actions') {
                show('studentAiTabOverview', false);
                show('studentAiTabActions', true);
                show('studentAiTabSkills', true);
                show('studentAiTabRecommendations', true);
                show('studentAiTabActionPlan', true);
                show('studentAiTabAdvanced', true);
                show('studentAiTabBenchmark', false);
            } else {
                show('studentAiTabOverview', false);
                show('studentAiTabActions', false);
                show('studentAiTabSkills', false);
                show('studentAiTabRecommendations', false);
                show('studentAiTabActionPlan', false);
                show('studentAiTabAdvanced', false);
                show('studentAiTabBenchmark', true);
            }
        }

        async function renderStudentInnovationFeatures(student, recommendations) {
            const token = localStorage.getItem('token');
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const studentId = user.studentId || user.id;

            let attendancePatternText = 'Attendance pattern data unavailable.';
            let trendText = 'Trend data unavailable.';
            let confidence = 60;

            const attendance = Number(student.attendance ?? 0) || 0;
            const gpa = Number(student.gpa ?? 0) || 0;
            const performance = Number(student.performanceScore ?? 0) || 0;
            const placement = Number(student.placementProbability ?? 0) || 0;

            try {
                if (studentId) {
                    const commonHeaders = { 'Authorization': `Bearer ${token}` };
                    const [predictionRes, riskRes, trendRes, patternRes, reportRes] = await Promise.all([
                        fetch(`http://localhost:5000/api/ai/predict?studentId=${encodeURIComponent(studentId)}`, { headers: commonHeaders }),
                        fetch(`http://localhost:5000/api/ai/risk?studentId=${encodeURIComponent(studentId)}`, { headers: commonHeaders }),
                        fetch(`http://localhost:5000/api/ai/trend?studentId=${encodeURIComponent(studentId)}`, { headers: commonHeaders }),
                        fetch(`http://localhost:5000/api/ai/attendance-pattern?studentId=${encodeURIComponent(studentId)}`, { headers: commonHeaders }),
                        fetch(`http://localhost:5000/api/ai/report?scope=student&studentId=${encodeURIComponent(studentId)}`, { headers: commonHeaders })
                    ]);

                    const predictionData = predictionRes.ok ? await predictionRes.json() : null;
                    const riskData = riskRes.ok ? await riskRes.json() : null;
                    const trendData = trendRes.ok ? await trendRes.json() : null;
                    const patternData = patternRes.ok ? await patternRes.json() : null;
                    const reportData = reportRes.ok ? await reportRes.json() : null;

                    if (trendData && trendData.success && trendData.text) {
                        trendText = trendData.text;
                    }
                    if (patternData && patternData.success && patternData.text) {
                        attendancePatternText = patternData.text;
                    }

                    const predictionEl = document.getElementById('studentPredictionOutput');
                    const riskEl = document.getElementById('studentRiskOutput');
                    const trendEl = document.getElementById('studentTrendOutput');
                    const patternEl = document.getElementById('studentAttendancePatternOutput');
                    const reportEl = document.getElementById('studentAutoReportOutput');

                    if (predictionEl) {
                        const predictionText = predictionData?.prediction || 'Prediction unavailable';
                        const predictionConfidence = predictionData?.confidence || confidence;
                        predictionEl.innerHTML = `Prediction: <strong>${predictionText}</strong><br>Confidence: <strong>${predictionConfidence}%</strong>`;
                    }

                    if (riskEl) {
                        const riskLabel = riskData?.risk || 'N/A';
                        const reasons = Array.isArray(riskData?.reasons) ? riskData.reasons : [];
                        const reasonText = reasons.length ? reasons.join(', ') : `attendance ${attendance}% and score index ${Math.round((attendance * 0.35) + (gpa * 20) + (performance * 0.25) + (placement * 0.2))}`;
                        riskEl.innerHTML = `⚠️ Risk Level: <strong>${riskLabel}</strong><br>Reason: ${reasonText}.`;
                    }

                    if (trendEl) trendEl.textContent = trendText;
                    if (patternEl) patternEl.textContent = attendancePatternText;

                    const autoReport = reportData?.report || `${user.fullName || 'Student'} trajectory update: ${trendText} Recommended focus: ${(recommendations[0]?.action || 'follow weekly AI plan')}.`;
                    if (reportEl) reportEl.textContent = autoReport;

                    studentAiContext = {
                        prediction: predictionData?.prediction || 'Prediction unavailable',
                        confidence: `${predictionData?.confidence || confidence}%`,
                        risk: riskData?.risk || 'N/A',
                        attendance: `${riskData?.attendance ?? attendance}%`,
                        trend: trendText,
                        report: autoReport,
                        recommendations: recommendations.slice(0, 3).map((r) => r.title || r.message || r.action)
                    };

                    return;
                }
            } catch (_e) {
                // Keep graceful fallbacks.
            }

            const predictionScore = Math.round((attendance * 0.35) + (gpa * 20) + (performance * 0.25) + (placement * 0.2));
            const prediction = predictionScore < 50 ? 'Likely to FAIL' : predictionScore < 70 ? 'Borderline PASS' : 'Likely to PASS';
            const risk = predictionScore < 50 || attendance < 70 ? 'High' : predictionScore < 70 ? 'Medium' : 'Low';

            const predictionEl = document.getElementById('studentPredictionOutput');
            const riskEl = document.getElementById('studentRiskOutput');
            const trendEl = document.getElementById('studentTrendOutput');
            const patternEl = document.getElementById('studentAttendancePatternOutput');
            const reportEl = document.getElementById('studentAutoReportOutput');

            if (predictionEl) predictionEl.innerHTML = `Prediction: <strong>${prediction}</strong><br>Confidence: <strong>${confidence}%</strong>`;
            if (riskEl) riskEl.innerHTML = `⚠️ Risk Level: <strong>${risk}</strong><br>Reason: attendance ${attendance}% and score index ${predictionScore}.`;
            if (trendEl) trendEl.textContent = trendText;
            if (patternEl) patternEl.textContent = attendancePatternText;

            const autoReport = `${user.fullName || 'Student'} shows ${prediction.toLowerCase()} trajectory. Current attendance is ${attendance}%, GPA is ${gpa.toFixed(2)}, and performance score is ${performance}%. ${trendText} Recommended focus: ${(recommendations[0]?.action || 'follow weekly AI plan')}.`;
            if (reportEl) reportEl.textContent = autoReport;

            studentAiContext = {
                prediction,
                confidence: `${confidence}%`,
                risk,
                attendance: `${attendance}%`,
                trend: trendText,
                report: autoReport,
                recommendations: recommendations.slice(0, 3).map((r) => r.title || r.message || r.action)
            };
        }

        async function sendStudentAiChat() {
            const input = document.getElementById('studentAiChatInput');
            const log = document.getElementById('studentAiChatLog');
            if (!input || !log) return;
            const q = (input.value || '').trim();
            if (!q) return;

            const token = localStorage.getItem('token');
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const studentId = user.studentId || user.id;

            log.innerHTML += `<div><strong>You:</strong> ${q}</div>`;

            try {
                const res = await fetch('http://localhost:5000/api/ai/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        scope: 'student',
                        studentId,
                        message: q
                    })
                });

                if (res.ok) {
                    const data = await res.json();
                    const ans = data.answer || 'No response available.';
                    log.innerHTML += `<div style="margin-bottom:6px;"><strong>AI:</strong> ${ans}</div>`;
                    log.scrollTop = log.scrollHeight;
                    input.value = '';
                    return;
                }
            } catch (_e) {
                // Fallback below if backend chat is unavailable.
            }

            const lower = q.toLowerCase();
            let ans = 'Try asking about attendance, marks, risk, prediction, trend, or report.';
            if (lower.includes('attendance')) ans = `Your current attendance signal is ${studentAiContext.attendance}.`;
            else if (lower.includes('risk')) ans = `Current AI risk level: ${studentAiContext.risk}.`;
            else if (lower.includes('predict') || lower.includes('pass') || lower.includes('fail')) ans = `${studentAiContext.prediction} with confidence ${studentAiContext.confidence}.`;
            else if (lower.includes('trend') || lower.includes('improv')) ans = studentAiContext.trend;
            else if (lower.includes('report')) ans = studentAiContext.report;
            else if (lower.includes('recommend')) ans = studentAiContext.recommendations.length ? `Top recommendations: ${studentAiContext.recommendations.join(' | ')}` : 'No recommendation available right now.';
            log.innerHTML += `<div style="margin-bottom:6px;"><strong>AI:</strong> ${ans}</div>`;
            log.scrollTop = log.scrollHeight;
            input.value = '';
        }

        function loadWorkshops(workshops) {
            const workshopsList = document.getElementById('workshopsList');
            workshopsList.innerHTML = '';

            if (workshops.length === 0) {
                workshopsList.innerHTML = '<div style="grid-column: 1/-1; padding: 20px; text-align: center; color: #6b7280;">No workshops completed yet</div>';
                return;
            }

            workshops.forEach(ws => {
                const card = `
                    <div class="workshop-card">
                        <div class="workshop-title">${ws.name}</div>
                        <div class="workshop-date">📅 ${ws.completedDate}</div>
                        <div class="certificate-badge">✓ Certificate</div>
                    </div>
                `;
                workshopsList.innerHTML += card;
            });
        }

        function loadSkillsProficiency(skills) {
            const skillsProficiency = document.getElementById('skillsProficiency');
            skillsProficiency.innerHTML = '';

            if (skills.length === 0) {
                skillsProficiency.innerHTML = '<div style="padding: 20px; text-align: center; color: #6b7280;">No skills data available</div>';
                return;
            }

            skills.forEach(skill => {
                const skillHtml = `
                    <div class="skill-proficiency">
                        <div class="skill-row">
                            <div class="skill-name">${skill.name}</div>
                            <div class="skill-bar">
                                <div class="skill-bar-fill" style="width: ${skill.proficiency}%"></div>
                            </div>
                            <div class="skill-percentage">${skill.proficiency}%</div>
                        </div>
                    </div>
                `;
                skillsProficiency.innerHTML += skillHtml;
            });
        }

        function loadRecommendations(recommendations) {
            const recommendationsList = document.getElementById('recommendationsList');
            recommendationsList.innerHTML = '';

            if (recommendations.length === 0) {
                recommendationsList.innerHTML = '<div style="padding: 20px; text-align: center; color: #6b7280;">✓ No critical recommendations at this time</div>';
                return;
            }

            recommendations.forEach(rec => {
                const className = `recommendation-${rec.type}`;
                const recHtml = `
                    <div class="recommendation-item ${className}">
                        <div class="recommendation-title">${rec.message}</div>
                        <div class="recommendation-action">💡 ${rec.action}</div>
                    </div>
                `;
                recommendationsList.innerHTML += recHtml;
            });
        }

        function logout() {
            localStorage.removeItem('token');
            localStorage.removeItem('userType');
            localStorage.removeItem('user');
            window.location.href = 'landing.html';
        }

    
