
                // Attendance UI logic
                let attendanceStudentsCache = [];
                let attendanceSectionMetaCache = [];

                function normalizeSectionKey(v) {
                    return String(v || '').trim().toUpperCase().replace(/\s+/g, '');
                }

                function buildSectionFilterValue(id, name) {
                    const sid = String(id || '').trim();
                    if (sid) return `id:${sid}`;
                    const n = normalizeSectionKey(name);
                    return n ? `name:${n}` : '';
                }

                function parseSectionLabel(label) {
                    const raw = String(label || '').trim();
                    const match = raw.match(/^([A-Za-z]+)\s+Year\s+(\d+)\s+([A-Za-z0-9-]+)$/i);
                    if (!match) return null;
                    return {
                        branch: normalizeSectionKey(match[1]),
                        year: String(match[2] || '').trim(),
                        section: normalizeSectionKey(match[3])
                    };
                }

                function normalizeYearValue(v) {
                    const raw = String(v || '').trim();
                    if (!raw) return '';
                    const m = raw.match(/\d+/);
                    return m ? String(m[0]) : raw;
                }

                function refreshAttendanceSectionFilterOptions(preferredValue = '') {
                    const sectionFilterEl = document.getElementById('attendanceSectionFilter');
                    if (!sectionFilterEl) return;

                    const merged = new Map();

                    (attendanceSectionMetaCache || []).forEach((s) => {
                        const id = String(s.Section_ID || '').trim();
                        const name = s.Section_Name || '';
                        const key = buildSectionFilterValue(id, name);
                        if (!key) return;
                        const label = `${s.Branch || ''} Year ${s.Year || '-'} ${name || ''}`.trim();
                        merged.set(key, { key, label: label || name || key, sortLabel: label || name || key });
                    });

                    (attendanceStudentsCache || []).forEach((s) => {
                        const id = String(s.sectionId || s.Section_ID || '').trim();
                        const name = s.sectionName || s.Section_Name || s.Section || '';
                        const key = buildSectionFilterValue(id, name);
                        if (!key || merged.has(key)) return;
                        const branch = String(s.Branch || s.branch || '').trim();
                        const year = String(s.Year || s.year || '').trim();
                        const plain = String(name || '').trim();
                        const rich = branch && year && plain ? `${branch} Year ${year} ${plain}` : plain;
                        merged.set(key, { key, label: rich || (id ? `Section ${id}` : key), sortLabel: rich || key });
                    });

                    const selected = preferredValue || sectionFilterEl.value || '';
                    const options = Array.from(merged.values())
                        .sort((a, b) => String(a.sortLabel).localeCompare(String(b.sortLabel)))
                        .map((o) => `<option value="${o.key}">${o.label}</option>`)
                        .join('');
                    sectionFilterEl.innerHTML = '<option value="">All Assigned Sections</option>' + options;
                    sectionFilterEl.value = selected;
                }

                function normalizeAttendanceDayName(day) {
                    const raw = String(day || '').trim().toLowerCase();
                    if (!raw) return '';
                    if (raw.startsWith('mon')) return 'Monday';
                    if (raw.startsWith('tue')) return 'Tuesday';
                    if (raw.startsWith('wed')) return 'Wednesday';
                    if (raw.startsWith('thu')) return 'Thursday';
                    if (raw.startsWith('fri')) return 'Friday';
                    if (raw.startsWith('sat')) return 'Saturday';
                    if (raw.startsWith('sun')) return 'Sunday';
                    return raw.charAt(0).toUpperCase() + raw.slice(1);
                }

                function getAttendanceDayFromDate(dateValue) {
                    const d = new Date((dateValue || '') + 'T00:00:00');
                    if (Number.isNaN(d.getTime())) return '';
                    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    return days[d.getDay()];
                }

                async function loadAttendanceTimetableSlots(facultyId, token, dateValue) {
                    const slotSel = document.getElementById('attendanceTimetableSlot');
                    const hintEl = document.getElementById('attendanceSlotHint');
                    const sectionFilterEl = document.getElementById('attendanceSectionFilter');
                    if (!slotSel) return;

                    slotSel.innerHTML = '<option value="">Loading schedule...</option>';
                    if (hintEl) hintEl.textContent = '';

                    try {
                        const tRes = await fetch(`http://localhost:5000/api/timetable/faculty/${encodeURIComponent(facultyId)}`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        const tData = await parseJsonSafe(tRes);

                        if (!tRes.ok || !tData.success || !Array.isArray(tData.entries) || !tData.entries.length) {
                            slotSel.innerHTML = '<option value="">No timetable entries found</option>';
                            if (sectionFilterEl) {
                                sectionFilterEl.innerHTML = '<option value="">All Assigned Sections</option>';
                            }
                            if (hintEl) hintEl.textContent = 'Tip: Create timetable entries in Admin > Class Timetable.';
                            return;
                        }

                        attendanceSectionMetaCache = Array.isArray(tData.sections) ? tData.sections : [];
                        if (sectionFilterEl) {
                            refreshAttendanceSectionFilterOptions(sectionFilterEl.value || '');
                        }

                        const selectedDay = normalizeAttendanceDayName(getAttendanceDayFromDate(dateValue));
                        const normalized = tData.entries.map((e) => ({
                            ...e,
                            _day: normalizeAttendanceDayName(e.Day_of_Week)
                        }));

                        let visible = normalized.filter((e) => e._day === selectedDay);
                        let usedFallback = false;
                        if (!visible.length) {
                            usedFallback = true;
                            visible = normalized;
                        }

                        const options = visible.map((c) => {
                            const label = `${c._day} | ${c.Start_Time || '-'} - ${c.End_Time || '-'} : ${c.Subject_Name || 'Untitled Subject'}`;
                            return `<option value="${(c.Subject_Name || '').replace(/"/g, '&quot;')}" data-start="${c.Start_Time || ''}" data-section="${c.Section_ID || ''}" data-section-name="${(c.Section_Name || '').replace(/"/g, '&quot;')}">${label}</option>`;
                        }).join('');

                        slotSel.innerHTML = '<option value="">Select a class...</option>' + options;
                        slotSel.onchange = function() {
                            const subjectInput = document.getElementById('attendanceSubject');
                            if (subjectInput && this.value) subjectInput.value = this.value;
                            const selectedOpt = this.options[this.selectedIndex] || null;
                            const selectedSectionId = selectedOpt ? (selectedOpt.getAttribute('data-section') || '') : '';
                            const selectedSectionName = selectedOpt ? (selectedOpt.getAttribute('data-section-name') || '') : '';
                            const filterValue = buildSectionFilterValue(selectedSectionId, selectedSectionName);
                            if (sectionFilterEl && filterValue) {
                                sectionFilterEl.value = filterValue;
                                renderAttendanceStudentsTable(filterValue);
                            }
                        };

                        if (hintEl) {
                            hintEl.textContent = usedFallback
                                ? `No class scheduled on ${selectedDay || 'selected day'}. Showing all your timetable classes.`
                                : `Showing classes scheduled on ${selectedDay}.`;
                        }
                    } catch (e) {
                        console.error('Error fetching timetable', e);
                        slotSel.innerHTML = '<option value="">Error loading timetable</option>';
                        if (hintEl) hintEl.textContent = 'You can still enter Subject manually below.';
                    }
                }

                function renderAttendanceStudentsTable(sectionIdFilter = '') {
                    const sectionFilterEl = document.getElementById('attendanceSectionFilter');
                    const selectedOption = sectionFilterEl && sectionFilterEl.selectedIndex >= 0
                        ? sectionFilterEl.options[sectionFilterEl.selectedIndex]
                        : null;
                    const selectedLabel = selectedOption ? String(selectedOption.text || '').trim() : '';
                    const parsedSelectedLabel = parseSectionLabel(selectedLabel);

                    const students = (attendanceStudentsCache || []).filter((s) => {
                        if (!sectionIdFilter) return true;
                        const raw = String(sectionIdFilter || '');
                        const sid = String(s.sectionId || s.Section_ID || '').trim();
                        const sname = normalizeSectionKey(s.sectionName || s.Section_Name || s.Section || '');
                        const sbranch = normalizeSectionKey(s.Branch || s.branch || s.department || '');
                        const syear = normalizeYearValue(s.Year || s.year || '');
                        if (raw.startsWith('id:')) {
                            if (sid && sid === raw.slice(3)) return true;
                            if (parsedSelectedLabel) {
                                const sectionMatches = !parsedSelectedLabel.section || !sname || sname === parsedSelectedLabel.section;
                                return (
                                    sectionMatches &&
                                    (!parsedSelectedLabel.year || syear === normalizeYearValue(parsedSelectedLabel.year)) &&
                                    (!parsedSelectedLabel.branch || sbranch === parsedSelectedLabel.branch)
                                );
                            }
                            return false;
                        }
                        if (raw.startsWith('name:')) {
                            if (sname && sname === raw.slice(5)) return true;
                            if (parsedSelectedLabel) {
                                const sectionMatches = !parsedSelectedLabel.section || !sname || sname === parsedSelectedLabel.section;
                                return (
                                    sectionMatches &&
                                    (!parsedSelectedLabel.year || syear === normalizeYearValue(parsedSelectedLabel.year)) &&
                                    (!parsedSelectedLabel.branch || sbranch === parsedSelectedLabel.branch)
                                );
                            }
                            return false;
                        }
                        return sid === raw || sname === normalizeSectionKey(raw);
                    });

                    let html = '<table class="students-table"><thead><tr><th>Name</th><th>Student ID</th><th>Section</th><th>Status</th></tr></thead><tbody>';
                    students.forEach((s) => {
                        const sid = s.studentId || s.Student_ID;
                        const sectionText = s.sectionName || s.Section_Name || s.Section || '-';
                        html += `<tr><td>${s.fullName || s.Name}</td><td>${sid}</td><td>${sectionText}</td><td>
                            <label><input type='radio' name='status_${sid}' value='Present' checked> Present</label>
                            <label style='margin-left:10px;'><input type='radio' name='status_${sid}' value='Absent'> Absent</label>
                            <label style='margin-left:10px;'><input type='radio' name='status_${sid}' value='Leave'> Leave</label>
                        </td></tr>`;
                    });
                    html += '</tbody></table>';

                    const box = document.getElementById('attendanceStudentsTable');
                    if (box) {
                        box.innerHTML = html;
                        if (students.length === 0) {
                            box.innerHTML += '<div style="color:#6b7280;padding:12px;margin-top:8px;">No students match the selected section filter.</div>';
                        }
                    }
                }

                async function loadAttendanceStudents() {
                    const dateInput = document.getElementById('attendanceDate');
                    if (dateInput && !dateInput.value) {
                        dateInput.value = new Date().toISOString().split('T')[0];
                    }
                    const user = JSON.parse(localStorage.getItem('user') || '{}');
                    const facultyId = user.facultyId || user.id || '1';
                    const token = localStorage.getItem('token');

                    await loadAttendanceTimetableSlots(facultyId, token, dateInput ? dateInput.value : '');

                    // Load students for attendance table
                    try {
                        const res = await fetch(`http://localhost:5000/api/faculty/${facultyId}/students`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        const data = await parseJsonSafe(res);
                        const students = Array.isArray(data.students) ? data.students : [];
                        attendanceStudentsCache = students;
                        const sectionFilterEl = document.getElementById('attendanceSectionFilter');
                        refreshAttendanceSectionFilterOptions(sectionFilterEl ? sectionFilterEl.value : '');
                        renderAttendanceStudentsTable(sectionFilterEl ? sectionFilterEl.value : '');
                        if (students.length === 0) {
                            document.getElementById('attendanceStudentsTable').innerHTML += '<div style="color:#6b7280;padding:12px;margin-top:8px;">No students in your sections. Ask admin to assign you to sections in Manage Sections.</div>';
                        }
                    } catch (err) {
                        document.getElementById('attendanceStudentsTable').innerHTML = '<div style="color:#ef4444;">Error loading students: ' + (err.message || 'Unknown error') + '</div>';
                    }
                }

                document.getElementById('attendanceForm').addEventListener('submit', async function(e) {
                    e.preventDefault();
                    const user = JSON.parse(localStorage.getItem('user'));
                    const facultyId = user.facultyId || user.id || '1';
                    const date = document.getElementById('attendanceDate').value;
                    const period = document.getElementById('attendancePeriod').value;
                    const slotSel = document.getElementById('attendanceTimetableSlot');
                    if (slotSel && slotSel.value && !document.getElementById('attendanceSubject').value) {
                        document.getElementById('attendanceSubject').value = slotSel.value;
                    }
                    const subject = String(document.getElementById('attendanceSubject').value || '').trim();

                    if (!subject) {
                        document.getElementById('attendanceStatus').innerHTML = "<span style='color:#ef4444;font-weight:600;'>Please choose a class slot or enter Subject manually.</span>";
                        return;
                    }

                    // Client-side guard: block Sunday markings
                    const parsedDate = new Date(date + 'T00:00:00');
                    if (!Number.isNaN(parsedDate.getTime()) && parsedDate.getDay() === 0) {
                        document.getElementById('attendanceStatus').innerHTML = "<span style='color:#ef4444;font-weight:600;'>Attendance can only be marked Monday to Saturday.</span>";
                        return;
                    }

                    const studentsTable = document.getElementById('attendanceStudentsTable');
                    const rows = studentsTable.querySelectorAll('tbody tr');
                    if (rows.length === 0) {
                        document.getElementById('attendanceStatus').innerHTML = "<span style='color:#f59e0b;font-weight:600;'>No students to mark. Ensure you're assigned to sections in Manage Sections (Admin), or add students to your branch.</span>";
                        return;
                    }
                    let successCount = 0, failCount = 0;
                    const failMessages = [];
                    for (let row of rows) {
                        const studentId = row.children[1].textContent;
                        const status = row.querySelector('input[type=radio]:checked').value;
                        try {
                            const res = await fetch('http://localhost:5000/api/attendance/mark', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
                                },
                                body: JSON.stringify({ studentId, facultyId, date, period, status, subject })
                            });
                            const data = await parseJsonSafe(res);
                            if (res.ok && data.message) {
                                successCount++;
                            } else {
                                failCount++;
                                failMessages.push(`${studentId}: ${(data && (data.error || data.message)) || 'Failed'}`);
                            }
                        } catch (e) {
                            failCount++;
                            failMessages.push(`${studentId}: ${(e && e.message) || 'Request failed'}`);
                        }
                    }
                    const statusEl = document.getElementById('attendanceStatus');
                    if (failCount > 0) {
                        const preview = failMessages.slice(0, 3).map((m) => `<div>• ${m}</div>`).join('');
                        statusEl.innerHTML = `<span style='color:#f59e0b;font-weight:700;'>Attendance submitted: ${successCount} success, ${failCount} failed.</span><div style='margin-top:8px;color:#dc2626;font-size:12px;'>${preview}${failMessages.length > 3 ? `<div>...and ${failMessages.length - 3} more</div>` : ''}</div>`;
                    } else {
                        statusEl.innerHTML = `<span style='color:green;font-weight:700;'>Attendance submitted successfully for ${successCount} students.</span>`;
                    }
                });

                const attendanceDateEl = document.getElementById('attendanceDate');
                if (attendanceDateEl) {
                    attendanceDateEl.addEventListener('change', () => {
                        const user = JSON.parse(localStorage.getItem('user') || '{}');
                        const facultyId = user.facultyId || user.id || '1';
                        const token = localStorage.getItem('token');
                        loadAttendanceTimetableSlots(facultyId, token, attendanceDateEl.value);
                    });
                }

                const attendanceSectionFilterEl = document.getElementById('attendanceSectionFilter');
                if (attendanceSectionFilterEl) {
                    attendanceSectionFilterEl.addEventListener('change', function() {
                        renderAttendanceStudentsTable(this.value);
                    });
                }
                </script>
            <script>
            // Assignment creation and load faculty assignments
            async function loadFacultyAssignments() {
                const user = JSON.parse(localStorage.getItem('user'));
                const facultyId = user.facultyId || user.id || '1';
                const listDiv = document.getElementById('facultyAssignmentsList');
                listDiv.innerHTML = '<div class="loading">Loading assignments...</div>';
                try {
                    const res = await fetch(`http://localhost:5000/api/assignments?facultyId=${encodeURIComponent(facultyId)}`);
                    const data = await res.json();
                    if (!data.success || !data.assignments || data.assignments.length === 0) {
                        listDiv.innerHTML = '<div style="color:#6b7280;">No assignments yet. Create one above; students in that branch and year will see it on their dashboard.</div>';
                        return;
                    }
                    let html = '<table class="students-table"><thead><tr><th>Title</th><th>Due Date</th><th>Branch</th><th>Year</th><th>Submissions</th></tr></thead><tbody>';
                    data.assignments.forEach(a => {
                        const safeTitle = String(a.title || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                        html += `<tr><td>${a.title}</td><td>${a.dueDate || '-'}</td><td>${a.branch}</td><td>${a.year}</td><td><button type="button" onclick="showAssignmentSubmissions(${a.id}, '${safeTitle}')" style="background:#6366f1;color:white;padding:6px 14px;border:none;border-radius:6px;font-weight:600;cursor:pointer;">View Submissions</button></td></tr>`;
                    });
                    html += '</tbody></table>';
                    listDiv.innerHTML = html;
                } catch (err) {
                    console.error('Error loading assignments:', err);
                    listDiv.innerHTML = '<div style="color:#ef4444;">Error loading assignments.</div>';
                }
            }

            async function showAssignmentSubmissions(assignmentId, title) {
                document.getElementById('assignmentSubmissionsModal').style.display = 'flex';
                document.getElementById('modalAssignmentTitle').textContent = `Submissions for: ${title}`;
                const contentDiv = document.getElementById('modalSubmissionsContent');
                contentDiv.innerHTML = '<div class="loading">Loading submissions...</div>';
                try {
                    const res = await fetch(`http://localhost:5000/api/assignments/${assignmentId}/submissions`);
                    const data = await res.json();
                    if (!data.success || !data.submissions || data.submissions.length === 0) {
                        contentDiv.innerHTML = '<div style="color:#ef4444;">No submissions found.</div>';
                        return;
                    }
                    let html = '<table class="students-table"><thead><tr><th>Student ID</th><th>Name</th><th>Email</th><th>File</th><th>Comment</th><th>Submitted At</th></tr></thead><tbody>';
                    data.submissions.forEach(s => {
                        html += `<tr>
                            <td>${s.Student_ID || '-'}</td>
                            <td>${s.student_name || '-'}</td>
                            <td>${s.student_email || '-'}</td>
                            <td>${s.file_path ? `<a href='${s.file_path}' target='_blank'>View File</a>` : '-'}</td>
                            <td>${s.submission_text || '-'}</td>
                            <td>${s.submission_date ? new Date(s.submission_date).toLocaleString() : '-'}</td>
                        </tr>`;
                    });
                    html += '</tbody></table>';
                    contentDiv.innerHTML = html;
                } catch (err) {
                    contentDiv.innerHTML = '<div style="color:#ef4444;">Error loading submissions.</div>';
                }
            }

            // Assignment form submit
            document.getElementById('assignmentForm').addEventListener('submit', async function(e) {
                e.preventDefault();
                const title = document.getElementById('assignmentTitle').value;
                const description = document.getElementById('assignmentDescription').value;
                const dueDate = document.getElementById('assignmentDueDate').value;
                const branch = document.getElementById('assignmentBranch').value;
                const year = document.getElementById('assignmentYear').value;
                const user = JSON.parse(localStorage.getItem('user'));
                const facultyId = user.facultyId || user.id || '1';
                const body = { title, description, dueDate, branch, year, facultyId };
                try {
                    const res = await fetch('http://localhost:5000/api/assignments', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });
                    const data = await res.json();
                    if (data.success) {
                        document.getElementById('assignmentStatus').innerHTML = '<span style="color:green;font-weight:600;">Assignment created successfully! Students in this branch and year can see it on their dashboard.</span>';
                        document.getElementById('assignmentForm').reset();
                        loadFacultyAssignments();
                    } else {
                        document.getElementById('assignmentStatus').innerHTML = '<span style="color:red;">Error: ' + (data.error || 'Failed to create assignment') + '</span>';
                    }
                } catch (err) {
                    document.getElementById('assignmentStatus').innerHTML = '<span style="color:red;">Error: ' + err.message + '</span>';
                }
            });
            </script>

            <div id="studentsSection" style="display: none;">
                <div class="students-section">
                    <h2>Manage Students</h2>
                    <div id="studentsListFull">
                        <div class="loading">Loading students...</div>
                    </div>
                </div>
            </div>

            <div id="classesSection" style="display: none;">
                <div class="students-section">
                    <h2>My Classes</h2>
                    <p>Your classes appear here</p>
                </div>
            </div>

            <div id="profileSection" style="display: none;">
                <div class="students-section">
                    <h2>Your Profile</h2>
                    <div id="profileContent"></div>
                </div>
            </div>

            <div id="aianalyticsSection" style="display: none;">
                <div class="students-section" style="margin-bottom: 24px;">
                    <div class="faculty-ai-toolbar">
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <label for="facultyAiYearFilter" style="font-size:13px;font-weight:700;color:#4c1d95;">Year</label>
                            <select id="facultyAiYearFilter">
                                <option value="all">All Years</option>
                                <option value="1">1st Year</option>
                                <option value="2">2nd Year</option>
                                <option value="3">3rd Year</option>
                                <option value="4">4th Year</option>
                            </select>
                            <label for="facultyAiRiskFilter" style="font-size:13px;font-weight:700;color:#4c1d95;">Risk</label>
                            <select id="facultyAiRiskFilter">
                                <option value="all">All</option>
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                            </select>
                            <label for="facultyAiPerformanceFilter" style="font-size:13px;font-weight:700;color:#4c1d95;">Performance</label>
                            <select id="facultyAiPerformanceFilter">
                                <option value="all">All</option>
                                <option value="excellent">Excellent</option>
                                <option value="average">Average</option>
                                <option value="lower">Lower</option>
                            </select>
                            <button onclick="loadAIAnalytics()"><i class="fas fa-rotate"></i> Refresh</button>
                        </div>
                        <div style="font-size:12px;color:#334155;font-weight:700;">Classroom Copilot AI</div>
                    </div>

                    <h3 style="font-size:16px;color:#1e293b;margin-bottom:12px;">Priority Intervention Queue</h3>
                    <div id="interventionQueueList" style="color:#64748b;">Loading intervention queue...</div>

                    <div class="faculty-ai-summary-grid" id="facultyAiSummaryCards">
                        <div class="faculty-ai-summary-card"><div class="faculty-ai-summary-label">Students Analyzed</div><div class="faculty-ai-summary-value">-</div></div>
                        <div class="faculty-ai-summary-card"><div class="faculty-ai-summary-label">Avg CGPA</div><div class="faculty-ai-summary-value">-</div></div>
                        <div class="faculty-ai-summary-card"><div class="faculty-ai-summary-label">Avg Attendance</div><div class="faculty-ai-summary-value">-</div></div>
                        <div class="faculty-ai-summary-card"><div class="faculty-ai-summary-label">Placement Readiness</div><div class="faculty-ai-summary-value">-</div></div>
                    </div>
                </div>

                <div class="students-section" style="margin-bottom: 24px;">
                    <h2>🧠 Student AI Insight Cards</h2>
                    <div id="facultyAiStudentCards" class="faculty-ai-student-grid">
                        <div style="color:#64748b;">Loading AI student cards...</div>
                    </div>
                </div>

                <!-- Students by Division Section -->
                <div class="students-section" style="margin-bottom: 32px;">
                    <h2>📍 All Students by Division</h2>
                    <p style="color: #64748b; font-size: 14px; margin: -8px 0 16px 0;">View all students organized by their branch/division.</p>
                    <div id="studentsByDivisionContainer" style="display: grid; gap: 20px;">
                        <div style="text-align: center; color: #64748b; padding: 20px;">Loading divisions...</div>
                    </div>
                </div>

                <div class="students-section" style="margin-bottom: 24px;">
                    <h2>🔮 Strategy Simulator Lab</h2>
                    <div class="faculty-sim-grid">
                        <div class="faculty-sim-card">
                            <label style="font-size:12px;color:#64748b;">Attendance Program Lift</label>
                            <div style="font-size:22px;font-weight:800;color:#0f172a;" id="simFacultyAttendanceLabel">+0%</div>
                            <input id="simFacultyAttendance" type="range" min="0" max="20" value="0" oninput="renderFacultyWhatIf()">
                        </div>
                        <div class="faculty-sim-card">
                            <label style="font-size:12px;color:#64748b;">CGPA Uplift Plan</label>
                            <div style="font-size:22px;font-weight:800;color:#0f172a;" id="simFacultyCgpaLabel">+0.00</div>
                            <input id="simFacultyCgpa" type="range" min="0" max="150" value="0" oninput="renderFacultyWhatIf()">
                        </div>
                        <div class="faculty-sim-card">
                            <label style="font-size:12px;color:#64748b;">Mentoring Coverage</label>
                            <div style="font-size:22px;font-weight:800;color:#0f172a;" id="simFacultyMentorLabel">0%</div>
                            <input id="simFacultyMentoring" type="range" min="0" max="100" value="0" oninput="renderFacultyWhatIf()">
                        </div>
                    </div>
                    <div class="faculty-sim-output" id="facultyWhatIfOutput">Adjust levers to estimate class-level AI impact.</div>
                </div>

                <div class="students-section" style="margin-bottom: 24px;">
                    <h2>🚀 AI Innovation Studio</h2>
                    <div class="faculty-ai-innovation-grid">
                        <div class="faculty-ai-innovation-card">
                            <h4>🎯 Student Performance Prediction</h4>
                            <div id="facultyPredictionOutput">Computing pass/fail forecast...</div>
                        </div>
                        <div class="faculty-ai-innovation-card">
                            <h4>📊 Smart AI Insight</h4>
                            <div id="facultySmartInsightOutput">Loading smart insight...</div>
                        </div>
                        <div class="faculty-ai-innovation-card">
                            <h4>⚠️ Risk Detection</h4>
                            <div id="facultyRiskOutput">Scanning at-risk students...</div>
                        </div>
                        <div class="faculty-ai-innovation-card">
                            <h4>🧠 Attendance Pattern Analysis</h4>
                            <div id="facultyAttendancePatternOutput">Analyzing attendance behavior...</div>
                        </div>
                        <div class="faculty-ai-innovation-card">
                            <h4>📈 Trend Analysis</h4>
                            <div id="facultyTrendOutput">Evaluating trend direction...</div>
                        </div>
                        <div class="faculty-ai-innovation-card" style="grid-column: 1 / -1;">
                            <h4>📝 Auto Class Report</h4>
                            <div id="facultyAutoReportOutput">Generating class report...</div>
                        </div>
                        <div class="faculty-ai-innovation-card" style="grid-column: 1 / -1;">
                            <h4>🤖 Faculty AI Chatbot</h4>
                            <div id="facultyAiChatLog" class="faculty-ai-chat-log">AI Assistant: Ask about class risk, prediction, trend, attendance, and report.</div>
                            <div class="faculty-ai-chat-row">
                                <input id="facultyAiChatInput" type="text" placeholder="Ask: How many students are at risk?" onkeydown="if(event.key==='Enter'){sendFacultyAiChat();}">
                                <button onclick="sendFacultyAiChat()">Send</button>
                            </div>
                        </div>
                        <div class="faculty-ai-innovation-card">
                            <h4>🔍 Face Recognition Attendance</h4>
                            <div>Advanced module placeholder: integrate camera-based attendance tracking.</div>
                        </div>
                        <div class="faculty-ai-innovation-card">
                            <h4>🧪 AI Cheating Detection</h4>
                            <div>Advanced module placeholder: anomaly alerts for sudden score jumps.</div>
                        </div>
                    </div>
                </div>

                <!-- Division Distribution -->
                <div class="students-section" style="margin-bottom: 32px;">
                    <h2>🤖 AI analysis — performance by CGPA</h2>
                    <p style="color: #64748b; font-size: 14px; margin: -8px 0 16px 0;">Your students (sections or branch) are grouped on the <strong>10-point</strong> scale: <strong>Lower</strong> (&lt; 6.5), <strong>Average</strong> (6.5–7.99), <strong>Excellent</strong> (≥ 8.0).</p>
                    <div class="faculty-ai-cgpa-grid" style="margin: 20px 0;">
                        <div style="background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); color: white; padding: 24px; border-radius: 12px; text-align: center;">
                            <div style="font-size: 32px; font-weight: 700; margin-bottom: 8px;" id="facultyCgpaLowerCount">0</div>
                            <div style="font-size: 18px; font-weight: 600; margin-bottom: 4px;">Lower performance</div>
                            <div style="font-size: 14px; opacity: 0.9;">CGPA &lt; 6.5</div>
                            <div style="font-size: 12px; margin-top: 8px;" id="facultyCgpaLowerPercent">0%</div>
                        </div>
                        <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 24px; border-radius: 12px; text-align: center;">
                            <div style="font-size: 32px; font-weight: 700; margin-bottom: 8px;" id="facultyCgpaAverageCount">0</div>
                            <div style="font-size: 18px; font-weight: 600; margin-bottom: 4px;">Average performance</div>
                            <div style="font-size: 14px; opacity: 0.9;">6.5 ≤ CGPA &lt; 8.0</div>
                            <div style="font-size: 12px; margin-top: 8px;" id="facultyCgpaAveragePercent">0%</div>
                        </div>
                        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 24px; border-radius: 12px; text-align: center;">
                            <div style="font-size: 32px; font-weight: 700; margin-bottom: 8px;" id="facultyCgpaExcellentCount">0</div>
                            <div style="font-size: 18px; font-weight: 600; margin-bottom: 4px;">Excellent performance</div>
                            <div style="font-size: 14px; opacity: 0.9;">CGPA ≥ 8.0</div>
                            <div style="font-size: 12px; margin-top: 8px;" id="facultyCgpaExcellentPercent">0%</div>
                        </div>
                    </div>

                    <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                        <div style="display: flex; justify-content: space-around; flex-wrap: wrap; gap: 16px;">
                            <div>
                                <div style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">Average CGPA (your students)</div>
                                <div style="font-size: 28px; font-weight: 700; color: #9333ea;" id="avgGPA">—</div>
                            </div>
                            <div>
                                <div style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">Average attendance</div>
                                <div style="font-size: 28px; font-weight: 700; color: #9333ea;" id="avgAttendance">—</div>
                            </div>
                            <div>
                                <div style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">Total students</div>
                                <div style="font-size: 28px; font-weight: 700; color: #9333ea;" id="totalStudentsAI">0</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Excellent -->
                <div class="students-section" style="margin-bottom: 32px;">
                    <h2>⭐ Excellent performance (CGPA ≥ 8.0)</h2>
                    <div id="topPerformersList">
                        <div style="padding: 20px; text-align: center; color: #6b7280;">Loading...</div>
                    </div>
                </div>

                <!-- Average -->
                <div class="students-section" style="margin-bottom: 32px;">
                    <h2>📈 Average performance (6.5 ≤ CGPA &lt; 8.0)</h2>
                    <div id="averagePerformersList">
                        <div style="padding: 20px; text-align: center; color: #6b7280;">Loading...</div>
                    </div>
                </div>

                <!-- Lower -->
                <div class="students-section" style="margin-bottom: 32px;">
                    <h2>⚠️ Lower performance (CGPA &lt; 6.5)</h2>
                    <div id="needsAttentionList">
                        <div style="padding: 20px; text-align: center; color: #6b7280;">Loading...</div>
                    </div>
                </div>

                <!-- Attendance Analytics -->
                <div class="students-section" style="margin-bottom: 32px;">
                    <h2>📊 Attendance Analytics</h2>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 20px 0;">
                        <div style="background: #dbeafe; padding: 16px; border-radius: 8px; border-left: 4px solid #3b82f6;">
                            <div style="color: #6b7280; font-size: 12px;">Excellent (≥90%)</div>
                            <div style="font-size: 24px; font-weight: 700; color: #1e40af; margin-top: 8px;" id="excellentAttendance">0</div>
                        </div>
                        <div style="background: #fef3c7; padding: 16px; border-radius: 8px; border-left: 4px solid #f59e0b;">
                            <div style="color: #6b7280; font-size: 12px;">Good (75-89%)</div>
                            <div style="font-size: 24px; font-weight: 700; color: #92400e; margin-top: 8px;" id="goodAttendance">0</div>
                        </div>
                        <div style="background: #fee2e2; padding: 16px; border-radius: 8px; border-left: 4px solid #ef4444;">
                            <div style="color: #6b7280; font-size: 12px;">Needs Improvement (<75%)</div>
                            <div style="font-size: 24px; font-weight: 700; color: #991b1b; margin-top: 8px;" id="needsAttendance">0</div>
                        </div>
                    </div>
                </div>

                <!-- Skills Distribution -->
                <div class="students-section">
                    <h2>🛠️ Top Skills Across Class</h2>
                    <div id="topSkillsList">
                        <div style="padding: 20px; text-align: center; color: #6b7280;">Loading...</div>
                    </div>
                </div>
            </div>
        </main>
    </div>

    <script>
        // Centralized API base + fetch rewrite for faculty dashboard.
        const FACULTY_LEGACY_API_BASE = 'http://localhost:5000';
        const facultyApiBaseFromQuery = new URLSearchParams(window.location.search).get('apiBase');
        if (facultyApiBaseFromQuery) {
            localStorage.setItem('facultyApiBaseUrl', facultyApiBaseFromQuery);
        }
        const FACULTY_API_BASE = (
            localStorage.getItem('facultyApiBaseUrl') ||
            localStorage.getItem('adminApiBaseUrl') ||
            FACULTY_LEGACY_API_BASE
        ).replace(/\/+$/, '');

        if (!window.__facultyFetchRewriteInstalled) {
            const facultyOriginalFetch = window.fetch.bind(window);
            window.fetch = function(input, init) {
                let url = null;
                if (typeof input === 'string') url = input;
                else if (input && typeof input.url === 'string') url = input.url;

                if (url && url.startsWith(FACULTY_LEGACY_API_BASE)) {
                    const rewritten = `${FACULTY_API_BASE}${url.slice(FACULTY_LEGACY_API_BASE.length)}`;
                    if (typeof input === 'string') return facultyOriginalFetch(rewritten, init);
                    return facultyOriginalFetch(new Request(rewritten, input), init);
                }
                return facultyOriginalFetch(input, init);
            };
            window.__facultyFetchRewriteInstalled = true;
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

        function setupFacultySidebarHandlers() {
            const links = document.querySelectorAll('.sidebar-menu a[onclick*="showSection("]');
            links.forEach((link) => {
                const attr = link.getAttribute('onclick') || '';
                const match = attr.match(/showSection\('([^']+)'\)/);
                if (!match || !match[1]) return;
                const targetSection = match[1];

                link.setAttribute('href', '#');
                link.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    showSection(targetSection);
                });
            });
        }

        const FACULTY_CGPA_MINI_LIMIT = 60;

        // Check authentication
        document.addEventListener('DOMContentLoaded', () => {
            const token = localStorage.getItem('token');
            const userType = localStorage.getItem('userType');

            if (!token || userType !== 'faculty') {
                window.location.href = 'index.html';
                return;
            }

            const user = JSON.parse(localStorage.getItem('user'));
            document.getElementById('userName').textContent = user.fullName || 'Faculty';
            setupFacultySidebarHandlers();
            loadNotifications(user.facultyId || user.id);
            initFacultyDoubtRealtime();
            loadFacultyDoubtTemplates();
            loadFacultyDoubtAnalytics();
            bindFacultyDoubtFilters();
            initFacultyPeerControls();
            // Fast first paint: dashboard widgets first, skip full students table until Students tab is opened.
            loadStudents({ renderFullList: false });
        });

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

        function escapeFacultyText(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function facultyStatusBadge(statusRaw) {
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

        function facultyPriorityBadge(priorityRaw) {
            const p = String(priorityRaw || 'medium').toLowerCase();
            const map = {
                high: { bg: '#fee2e2', fg: '#991b1b', text: 'HIGH' },
                medium: { bg: '#fef3c7', fg: '#92400e', text: 'MEDIUM' },
                low: { bg: '#dcfce7', fg: '#166534', text: 'LOW' }
            };
            const c = map[p] || map.medium;
            return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${c.bg};color:${c.fg};font-size:10px;font-weight:800;">${c.text}</span>`;
        }

        function facultyCategoryBadge(categoryRaw) {
            const text = String(categoryRaw || 'concept').toUpperCase();
            return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:10px;font-weight:800;">${escapeFacultyText(text)}</span>`;
        }

        let facultyDoubtTemplates = [];
        let facultyDoubtSocket = null;
        const FACULTY_DOUBT_FILTERS_KEY = 'facultyDoubtFilters_v1';
        const FACULTY_PEER_ROOMS = [
            { id: 'dsa-problem-solving', name: 'DSA Problem Solving' },
            { id: 'physics-quick-doubts', name: 'Physics Quick Doubts' },
            { id: 'math-weekly-practice', name: 'Math Weekly Practice' },
            { id: 'exam-sprint-group', name: 'Exam Sprint Group' }
        ];
        let facultyPeerRoomStatuses = {};

        function getSelectedFacultyPeerRoomId() {
            return String(document.getElementById('facultyPeerRoomSelect')?.value || '').trim();
        }

        function updateFacultyPeerControlUi() {
            const roomId = getSelectedFacultyPeerRoomId();
            const status = facultyPeerRoomStatuses[roomId] || {};
            const muteBtn = document.getElementById('facultyPeerMuteBtn');
            const closeBtn = document.getElementById('facultyPeerCloseBtn');
            if (muteBtn) {
                muteBtn.textContent = status.mutedAll ? 'Unmute All' : 'Mute All';
                muteBtn.style.background = status.mutedAll ? '#dcfce7' : '#fef3c7';
                muteBtn.style.color = status.mutedAll ? '#166534' : '#92400e';
            }
            if (closeBtn) {
                closeBtn.textContent = status.closed ? 'Reopen Room' : 'Close Room';
                closeBtn.style.background = status.closed ? '#dcfce7' : '#fee2e2';
                closeBtn.style.color = status.closed ? '#166534' : '#991b1b';
            }
        }

        function applyFacultyPeerRoomStatus(rooms) {
            const next = {};
            (Array.isArray(rooms) ? rooms : []).forEach((r) => {
                const id = String(r.roomId || '').trim();
                if (!id) return;
                next[id] = {
                    active: !!r.active,
                    participants: Number(r.participants || 0),
                    mutedAll: !!r.mutedAll,
                    closed: !!r.closed,
                    moderatorsOnline: Number(r.moderatorsOnline || 0)
                };
            });
            facultyPeerRoomStatuses = next;
            updateFacultyPeerControlUi();
        }

        async function loadFacultyPeerRoomStatus() {
            const token = localStorage.getItem('token');
            try {
                const res = await fetch('http://localhost:5000/api/student-success/peer-rooms/status', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await parseJsonSafe(res);
                if (!res.ok || !data.success) return;
                applyFacultyPeerRoomStatus(data.rooms || []);
            } catch (_e) {
                // Non-blocking.
            }
        }

        function peerControlStatus(message, color = '#64748b') {
            const el = document.getElementById('facultyPeerControlStatus');
            if (!el) return;
            el.textContent = message;
            el.style.color = color;
        }

        function sendFacultyPeerAnnouncement() {
            const roomId = getSelectedFacultyPeerRoomId();
            const input = document.getElementById('facultyPeerAnnouncement');
            const text = String(input?.value || '').trim();
            if (!roomId || !text || !facultyDoubtSocket) return;
            facultyDoubtSocket.emit('peer-room:announce', { roomId, text });
            if (input) input.value = '';
            peerControlStatus('Announcement sent.', '#166534');
        }

        function toggleFacultyPeerMute() {
            const roomId = getSelectedFacultyPeerRoomId();
            if (!roomId || !facultyDoubtSocket) return;
            const muted = !(facultyPeerRoomStatuses[roomId]?.mutedAll);
            facultyDoubtSocket.emit('peer-room:mute-all', { roomId, muted });
            peerControlStatus(muted ? 'Muting room chat...' : 'Unmuting room chat...');
        }

        function toggleFacultyPeerClose() {
            const roomId = getSelectedFacultyPeerRoomId();
            if (!roomId || !facultyDoubtSocket) return;
            const closed = !(facultyPeerRoomStatuses[roomId]?.closed);
            facultyDoubtSocket.emit('peer-room:close', { roomId, closed });
            peerControlStatus(closed ? 'Closing room...' : 'Reopening room...');
        }

        function initFacultyPeerControls() {
            const selectEl = document.getElementById('facultyPeerRoomSelect');
            if (selectEl && selectEl.dataset.bound !== '1') {
                selectEl.dataset.bound = '1';
                selectEl.addEventListener('change', updateFacultyPeerControlUi);
            }
            updateFacultyPeerControlUi();
            loadFacultyPeerRoomStatus();
        }

        function saveFacultyDoubtFilters() {
            try {
                const payload = {
                    status: String(document.getElementById('doubtFilterStatus')?.value || ''),
                    priority: String(document.getElementById('doubtFilterPriority')?.value || ''),
                    category: String(document.getElementById('doubtFilterCategory')?.value || ''),
                    branch: String(document.getElementById('doubtFilterBranch')?.value || ''),
                    year: String(document.getElementById('doubtFilterYear')?.value || ''),
                    q: String(document.getElementById('doubtFilterQuery')?.value || '')
                };
                localStorage.setItem(FACULTY_DOUBT_FILTERS_KEY, JSON.stringify(payload));
            } catch (_e) {
                // Non-blocking persistence.
            }
        }

        function restoreFacultyDoubtFilters() {
            try {
                const raw = localStorage.getItem(FACULTY_DOUBT_FILTERS_KEY);
                if (!raw) return;
                const payload = JSON.parse(raw);
                const map = [
                    ['doubtFilterStatus', payload.status],
                    ['doubtFilterPriority', payload.priority],
                    ['doubtFilterCategory', payload.category],
                    ['doubtFilterBranch', payload.branch],
                    ['doubtFilterYear', payload.year],
                    ['doubtFilterQuery', payload.q]
                ];
                map.forEach(([id, value]) => {
                    const el = document.getElementById(id);
                    if (el && value != null) el.value = String(value);
                });
            } catch (_e) {
                // Ignore malformed saved state.
            }
        }

        function facultyDoubtQueryParams() {
            const params = new URLSearchParams();
            const map = [
                ['status', 'doubtFilterStatus'],
                ['priority', 'doubtFilterPriority'],
                ['category', 'doubtFilterCategory'],
                ['branch', 'doubtFilterBranch'],
                ['year', 'doubtFilterYear'],
                ['q', 'doubtFilterQuery']
            ];
            map.forEach(([k, id]) => {
                const el = document.getElementById(id);
                const val = String(el ? el.value : '').trim();
                if (val) params.append(k, val);
            });
            return params.toString();
        }

        async function loadFacultyDoubtTemplates() {
            const token = localStorage.getItem('token');
            try {
                const res = await fetch('http://localhost:5000/api/doubts/templates', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await parseJsonSafe(res);
                if (res.ok && data.success && Array.isArray(data.templates)) {
                    facultyDoubtTemplates = data.templates;
                }
            } catch (_e) {
                facultyDoubtTemplates = [];
            }
        }

        async function loadFacultyDoubtInbox() {
            const token = localStorage.getItem('token');
            const statusEl = document.getElementById('facultyDoubtStatus');
            const host = document.getElementById('facultyDoubtsInbox');
            if (host) host.innerHTML = '<div class="loading">Loading doubts...</div>';
            if (statusEl) {
                statusEl.textContent = 'Loading doubts...';
                statusEl.style.color = '#64748b';
            }

            try {
                const query = facultyDoubtQueryParams();
                const res = await fetch(`http://localhost:5000/api/doubts/faculty/inbox${query ? `?${query}` : ''}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await parseJsonSafe(res);
                if (!res.ok || !data.success) {
                    throw new Error((data && data.message) || 'Failed to load doubts');
                }

                const doubts = Array.isArray(data.doubts) ? data.doubts : [];
                if (!doubts.length) {
                    if (host) host.innerHTML = '<div style="color:#6b7280;">No doubts in your inbox right now.</div>';
                    if (statusEl) {
                        statusEl.textContent = 'No doubts available.';
                        statusEl.style.color = '#64748b';
                    }
                    return;
                }

                if (host) {
                    host.innerHTML = doubts.map((d) => {
                        const isReplied = String(d.status || '').toLowerCase() === 'replied';
                        const createdAt = d.created_at ? new Date(d.created_at).toLocaleString() : '-';
                        const repliedAt = d.replied_at ? new Date(d.replied_at).toLocaleString() : null;
                        const seenByStudent = d.seen_by_student_at ? `Student seen: ${new Date(d.seen_by_student_at).toLocaleString()}` : 'Student not seen';
                        const statusBadge = facultyStatusBadge(d.status);
                        const templates = (facultyDoubtTemplates || []).map((t, idx) => `<button type="button" onclick="fillFacultyTemplate(${Number(d.doubt_id)}, ${idx})" style="background:#eef2ff;color:#3730a3;border:none;border-radius:7px;padding:4px 8px;font-size:11px;cursor:pointer;">T${idx + 1}</button>`).join(' ');
                        return `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:12px;background:#fff;">
                            <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start;">
                                <div>
                                    <div style="font-weight:700;color:#0f172a;">${escapeFacultyText(d.subject || '-')}</div>
                                    <div style="font-size:12px;color:#64748b;margin-top:3px;">Student: ${escapeFacultyText(d.student_name || d.student_id || '-')} (${escapeFacultyText(d.student_id || '-')})</div>
                                    <div style="font-size:12px;color:#64748b;margin-top:2px;">${escapeFacultyText(d.student_branch || '-')} • Year ${escapeFacultyText(d.student_year || '-')}</div>
                                    <div style="font-size:11px;color:#64748b;margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">${facultyCategoryBadge(d.category)} ${facultyPriorityBadge(d.priority)}</div>
                                </div>
                                ${statusBadge}
                            </div>
                            <div style="margin-top:8px;font-size:13px;color:#1f2937;line-height:1.5;">${escapeFacultyText(d.doubt_text || '')}</div>
                            <div style="margin-top:6px;font-size:11px;color:#64748b;">Asked on ${escapeFacultyText(createdAt)}</div>
                            <div style="margin-top:4px;font-size:11px;color:#64748b;">${escapeFacultyText(seenByStudent)}</div>
                            ${d.student_attachment_url ? `<div style="margin-top:8px;"><a href="${escapeFacultyText(d.student_attachment_url)}" target="_blank" rel="noopener" style="font-size:12px;color:#1d4ed8;font-weight:600;">View student attachment</a></div>` : ''}
                            ${d.faculty_reply ? `<div style="margin-top:10px;padding:10px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;">
                                <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:4px;">Your Reply</div>
                                <div style="font-size:13px;color:#1f2937;line-height:1.5;">${escapeFacultyText(d.faculty_reply)}</div>
                                ${d.faculty_attachment_url ? `<div style="margin-top:8px;"><a href="${escapeFacultyText(d.faculty_attachment_url)}" target="_blank" rel="noopener" style="font-size:12px;color:#1d4ed8;font-weight:600;">View your attachment</a></div>` : ''}
                                ${repliedAt ? `<div style="margin-top:6px;font-size:11px;color:#64748b;">Replied on ${escapeFacultyText(repliedAt)}</div>` : ''}
                            </div>` : ''}
                            <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                                <select id="facultyStatus_${Number(d.doubt_id)}" style="padding:6px;border:1px solid #d1d5db;border-radius:8px;">
                                    <option value="pending" ${String(d.status)==='pending'?'selected':''}>Pending</option>
                                    <option value="in-review" ${String(d.status)==='in-review'?'selected':''}>In Review</option>
                                    <option value="replied" ${String(d.status)==='replied'?'selected':''}>Replied</option>
                                    <option value="closed" ${String(d.status)==='closed'?'selected':''}>Closed</option>
                                </select>
                                <button type="button" onclick="updateFacultyDoubtStatus(${Number(d.doubt_id)})" style="background:#e2e8f0;color:#0f172a;border:none;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer;">Update Status</button>
                                <button type="button" onclick="loadFacultyThread(${Number(d.doubt_id)})" style="background:#e2e8f0;color:#0f172a;border:none;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer;">Thread</button>
                            </div>
                            <div id="facultyThread_${Number(d.doubt_id)}" style="margin-top:8px;font-size:12px;color:#334155;"></div>
                            <form onsubmit="replyFacultyDoubt(event, ${Number(d.doubt_id)})" style="margin-top:12px;display:grid;grid-template-columns:1fr;gap:8px;">
                                <textarea id="facultyReplyText_${Number(d.doubt_id)}" rows="3" placeholder="Type clarification for student..." style="width:100%;padding:10px;border-radius:10px;border:1px solid #d1d5db;">${isReplied ? escapeFacultyText(d.faculty_reply || '') : ''}</textarea>
                                <input id="facultyReplyAttachment_${Number(d.doubt_id)}" type="file" accept="image/*,.pdf,.doc,.docx,.txt" style="width:100%;padding:8px;border-radius:10px;border:1px solid #d1d5db;background:#fff;">
                                <div style="display:flex;gap:6px;flex-wrap:wrap;">${templates}</div>
                                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                                    <button type="submit" style="background:#2563eb;color:#fff;border:none;border-radius:10px;padding:8px 14px;font-weight:700;cursor:pointer;">${isReplied ? 'Update Reply' : 'Send Reply'}</button>
                                    <button type="button" onclick="sendFacultyThreadMessage(${Number(d.doubt_id)})" style="background:#334155;color:#fff;border:none;border-radius:10px;padding:8px 14px;font-weight:700;cursor:pointer;">Send Follow-up</button>
                                    <span id="facultyReplyStatus_${Number(d.doubt_id)}" style="font-size:12px;color:#64748b;"></span>
                                </div>
                            </form>
                        </div>`;
                    }).join('');
                }

                if (statusEl) {
                    statusEl.textContent = `${doubts.length} doubt(s) loaded.`;
                    statusEl.style.color = '#16a34a';
                }
                doubts.forEach((d) => {
                    if (d && d.doubt_id) loadFacultyThread(Number(d.doubt_id));
                });
            } catch (err) {
                if (host) host.innerHTML = `<div style="color:#ef4444;">${escapeFacultyText(err.message || 'Error loading doubts')}</div>`;
                if (statusEl) {
                    statusEl.textContent = err.message || 'Error loading doubts';
                    statusEl.style.color = '#ef4444';
                }
            }
        }

        async function replyFacultyDoubt(event, doubtId) {
            event.preventDefault();
            const token = localStorage.getItem('token');
            const textEl = document.getElementById(`facultyReplyText_${doubtId}`);
            const attachmentEl = document.getElementById(`facultyReplyAttachment_${doubtId}`);
            const statusEl = document.getElementById(`facultyReplyStatus_${doubtId}`);

            const replyText = String(textEl ? textEl.value : '').trim();
            const attachmentFile = attachmentEl && attachmentEl.files ? attachmentEl.files[0] : null;
            if (!replyText && !attachmentFile) {
                if (statusEl) {
                    statusEl.textContent = 'Please add reply text or an attachment.';
                    statusEl.style.color = '#ef4444';
                }
                return;
            }

            if (statusEl) {
                statusEl.textContent = 'Sending reply...';
                statusEl.style.color = '#64748b';
            }

            try {
                const formData = new FormData();
                formData.append('replyText', replyText);
                if (attachmentFile) formData.append('attachment', attachmentFile);

                const res = await fetch(`http://localhost:5000/api/doubts/faculty/${doubtId}/reply`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
                const data = await parseJsonSafe(res);
                if (!res.ok || !data.success) {
                    throw new Error((data && data.message) || 'Failed to send reply');
                }

                if (statusEl) {
                    statusEl.textContent = 'Reply sent to student.';
                    statusEl.style.color = '#16a34a';
                }
                const user = JSON.parse(localStorage.getItem('user') || '{}');
                loadNotifications(user.facultyId || user.id);
                loadFacultyDoubtInbox();
            } catch (err) {
                if (statusEl) {
                    statusEl.textContent = err.message || 'Failed to send reply';
                    statusEl.style.color = '#ef4444';
                }
            }
        }

        function fillFacultyTemplate(doubtId, index) {
            const tpl = (facultyDoubtTemplates || [])[index];
            const textEl = document.getElementById(`facultyReplyText_${doubtId}`);
            if (textEl && tpl) textEl.value = tpl;
        }

        async function updateFacultyDoubtStatus(doubtId) {
            const token = localStorage.getItem('token');
            const statusEl = document.getElementById(`facultyReplyStatus_${doubtId}`);
            const statusSelect = document.getElementById(`facultyStatus_${doubtId}`);
            const status = String(statusSelect ? statusSelect.value : '').trim();
            if (!status) return;
            try {
                const res = await fetch(`http://localhost:5000/api/doubts/${doubtId}/status`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ status })
                });
                const data = await parseJsonSafe(res);
                if (!res.ok || !data.success) throw new Error(data.message || 'Failed status update');
                if (statusEl) {
                    statusEl.textContent = 'Status updated.';
                    statusEl.style.color = '#16a34a';
                }
                loadFacultyDoubtInbox();
            } catch (err) {
                if (statusEl) {
                    statusEl.textContent = err.message || 'Failed status update';
                    statusEl.style.color = '#ef4444';
                }
            }
        }

        async function loadFacultyThread(doubtId) {
            const token = localStorage.getItem('token');
            const host = document.getElementById(`facultyThread_${doubtId}`);
            if (!host) return;
            try {
                const res = await fetch(`http://localhost:5000/api/doubts/${doubtId}/messages`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await parseJsonSafe(res);
                if (!res.ok || !data.success) throw new Error(data.message || 'Failed loading thread');
                const list = Array.isArray(data.messages) ? data.messages : [];
                host.innerHTML = list.length ? list.map((m) => {
                    const who = String(m.sender_type || '').toLowerCase() === 'faculty' ? 'You' : 'Student';
                    const at = m.created_at ? new Date(m.created_at).toLocaleString() : '-';
                    return `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px;margin-bottom:6px;background:#fff;">
                        <div style="font-size:11px;color:#64748b;">${who} • ${escapeFacultyText(at)}</div>
                        <div style="font-size:12px;color:#0f172a;margin-top:3px;">${escapeFacultyText(m.message_text || '')}</div>
                        ${m.attachment_url ? `<div style="margin-top:4px;"><a href="${escapeFacultyText(m.attachment_url)}" target="_blank" rel="noopener" style="font-size:11px;color:#1d4ed8;">View attachment</a></div>` : ''}
                    </div>`;
                }).join('') : '<div style="color:#64748b;">No thread messages yet.</div>';
            } catch (err) {
                host.innerHTML = `<div style="color:#ef4444;">${escapeFacultyText(err.message || 'Error loading thread')}</div>`;
            }
        }

        async function sendFacultyThreadMessage(doubtId) {
            const token = localStorage.getItem('token');
            const textEl = document.getElementById(`facultyReplyText_${doubtId}`);
            const attachmentEl = document.getElementById(`facultyReplyAttachment_${doubtId}`);
            const statusEl = document.getElementById(`facultyReplyStatus_${doubtId}`);
            const messageText = String(textEl ? textEl.value : '').trim();
            const file = attachmentEl && attachmentEl.files ? attachmentEl.files[0] : null;
            if (!messageText && !file) {
                if (statusEl) {
                    statusEl.textContent = 'Type message or attach file.';
                    statusEl.style.color = '#ef4444';
                }
                return;
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
                if (!res.ok || !data.success) throw new Error(data.message || 'Failed follow-up');
                if (textEl) textEl.value = '';
                if (attachmentEl) attachmentEl.value = '';
                if (statusEl) {
                    statusEl.textContent = 'Follow-up sent.';
                    statusEl.style.color = '#16a34a';
                }
                loadFacultyThread(doubtId);
                loadFacultyDoubtInbox();
            } catch (err) {
                if (statusEl) {
                    statusEl.textContent = err.message || 'Failed follow-up';
                    statusEl.style.color = '#ef4444';
                }
            }
        }

        async function loadFacultyDoubtAnalytics() {
            const token = localStorage.getItem('token');
            const host = document.getElementById('facultyDoubtAnalytics');
            if (!host) return;
            host.textContent = 'Loading analytics...';
            try {
                const res = await fetch('http://localhost:5000/api/doubts/faculty/analytics/summary', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await parseJsonSafe(res);
                if (!res.ok || !data.success) throw new Error(data.message || 'Failed analytics');
                const s = data.summary || {};
                const top = Array.isArray(data.topSubjects) ? data.topSubjects.map((x) => `${x.subject}: ${x.count}`).join(' | ') : '';
                host.textContent = `Total: ${s.total || 0} | Pending: ${s.pending || 0} | In Review: ${s.inReview || 0} | Replied: ${s.replied || 0} | Closed: ${s.closed || 0} | Avg Reply: ${s.avgReplyMinutes == null ? '-' : s.avgReplyMinutes + ' min'}${top ? ' | Top: ' + top : ''}`;
            } catch (err) {
                host.textContent = err.message || 'Failed to load analytics';
            }
        }

        function downloadTextFile(fileName, text, mimeType = 'text/plain') {
            const blob = new Blob([text], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        }

        async function exportFacultyDoubtAnalyticsCsv() {
            const token = localStorage.getItem('token');
            const statusEl = document.getElementById('facultyDoubtStatus');
            if (statusEl) {
                statusEl.textContent = 'Preparing CSV...';
                statusEl.style.color = '#64748b';
            }
            try {
                const res = await fetch('http://localhost:5000/api/doubts/faculty/analytics/export.csv', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) throw new Error('Failed exporting CSV');
                const csv = await res.text();
                downloadTextFile(`doubt-analytics-${Date.now()}.csv`, csv, 'text/csv');
                if (statusEl) {
                    statusEl.textContent = 'CSV downloaded.';
                    statusEl.style.color = '#16a34a';
                }
            } catch (err) {
                if (statusEl) {
                    statusEl.textContent = err.message || 'CSV export failed';
                    statusEl.style.color = '#ef4444';
                }
            }
        }

        async function escalatePendingDoubts() {
            const token = localStorage.getItem('token');
            const statusEl = document.getElementById('facultyDoubtStatus');
            try {
                const res = await fetch('http://localhost:5000/api/doubts/faculty/escalate-pending', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ thresholdHours: 24 })
                });
                const data = await parseJsonSafe(res);
                if (!res.ok || !data.success) throw new Error(data.message || 'Failed escalation');
                if (statusEl) {
                    statusEl.textContent = `Escalated ${data.escalated || 0} doubt(s).`;
                    statusEl.style.color = '#16a34a';
                }
                loadFacultyDoubtInbox();
            } catch (err) {
                if (statusEl) {
                    statusEl.textContent = err.message || 'Escalation failed';
                    statusEl.style.color = '#ef4444';
                }
            }
        }

        function initFacultyDoubtRealtime() {
            try {
                if (facultyDoubtSocket || typeof io !== 'function') return;
                const user = JSON.parse(localStorage.getItem('user') || '{}');
                const facultyId = user.facultyId || user.id;
                if (!facultyId) return;
                facultyDoubtSocket = io('http://localhost:5000');
                facultyDoubtSocket.on('connect', () => {
                    facultyDoubtSocket.emit('register', { userType: 'faculty', userId: facultyId });
                });
                const refresh = () => {
                    loadFacultyDoubtInbox();
                    loadFacultyDoubtAnalytics();
                    loadNotifications(facultyId);
                };
                facultyDoubtSocket.on('doubt:new', refresh);
                facultyDoubtSocket.on('doubt:updated', refresh);
                facultyDoubtSocket.on('doubt:escalated', refresh);
                facultyDoubtSocket.on('peer-room:update', (payload = {}) => {
                    applyFacultyPeerRoomStatus(payload.rooms || []);
                });
                facultyDoubtSocket.on('peer-room:error', (payload = {}) => {
                    peerControlStatus(String(payload.message || 'Peer room action failed'), '#991b1b');
                });
                facultyDoubtSocket.on('peer-room:flags', (payload = {}) => {
                    const roomId = String(payload.roomId || '').trim();
                    if (!roomId) return;
                    const prev = facultyPeerRoomStatuses[roomId] || {};
                    facultyPeerRoomStatuses[roomId] = {
                        ...prev,
                        mutedAll: !!payload.mutedAll,
                        closed: !!payload.closed
                    };
                    updateFacultyPeerControlUi();
                });
            } catch (_e) {
                // Realtime optional.
            }
        }

        let facultyDoubtFilterDebounce = null;
        function bindFacultyDoubtFilters() {
            const ids = ['doubtFilterStatus', 'doubtFilterPriority', 'doubtFilterCategory', 'doubtFilterBranch', 'doubtFilterYear', 'doubtFilterQuery'];
            ids.forEach((id) => {
                const el = document.getElementById(id);
                if (!el || el.dataset.bound === '1') return;
                el.dataset.bound = '1';
                const handler = () => {
                    saveFacultyDoubtFilters();
                    if (facultyDoubtFilterDebounce) clearTimeout(facultyDoubtFilterDebounce);
                    facultyDoubtFilterDebounce = setTimeout(() => {
                        loadFacultyDoubtInbox();
                    }, 350);
                };
                el.addEventListener('input', handler);
                el.addEventListener('change', handler);
            });
            restoreFacultyDoubtFilters();
        }

        function resetFacultyDoubtFilters() {
            const ids = ['doubtFilterStatus', 'doubtFilterPriority', 'doubtFilterCategory', 'doubtFilterBranch', 'doubtFilterYear', 'doubtFilterQuery'];
            ids.forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            try {
                localStorage.removeItem(FACULTY_DOUBT_FILTERS_KEY);
            } catch (_e) {
                // Non-blocking clear.
            }
            loadFacultyDoubtInbox();
        }

        async function loadStudents(options = {}) {
            const renderFullList = !!options.renderFullList;
            const token = localStorage.getItem('token');
            const user = JSON.parse(localStorage.getItem('user'));
            const facultyId = user.facultyId || user.id || 'TEST';

            try {
                const response = await fetch(`http://localhost:5000/api/faculty/${facultyId}/students`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    // Extract students from the API response
                    const students = data.students || [];
                    facultyStudentsCache = students;
                    queueFacultyAdmissionSnapshotAutoLoad();
                    if (renderFullList) {
                        displayStudents(students);
                    }
                    loadStudentsByCgpa(students);
                    if (facultyAdmissionRendered) {
                        renderFacultyAdmissionSnapshot(students);
                    }
                    loadFacultySectionTimetable(facultyId);
                } else {
                    facultyStudentsCache = [];
                    if (renderFullList) {
                        displayStudents([]);
                    }
                    loadStudentsByCgpa([]);
                    if (facultyAdmissionRendered) {
                        renderFacultyAdmissionSnapshot([]);
                    }
                    loadFacultySectionTimetable(facultyId);
                }
            } catch (error) {
                console.error('Error loading students:', error);
                facultyStudentsCache = [];
                if (renderFullList) {
                    displayStudents([]);
                }
                loadStudentsByCgpa([]);
                if (facultyAdmissionRendered) {
                    renderFacultyAdmissionSnapshot([]);
                }
                loadFacultySectionTimetable(facultyId);
            }
        }

        function renderFacultyTimetableRows(entries) {
            if (!entries.length) return '<p style="color:#6b7280;">No timetable entries available for your sections.</p>';
            let html = '<table class="students-table"><thead><tr><th>Section</th><th>Day</th><th>Time</th><th>Subject</th><th>Room</th></tr></thead><tbody>';
            entries.forEach((e) => {
                const sec = `${e.Branch || ''} Y${e.Year || '-'}-${e.Section_Name || ''}`;
                const timeRange = `${e.Start_Time || '-'} - ${e.End_Time || '-'}`;
                html += `<tr>
                    <td>${sec}</td>
                    <td>${e.Day_of_Week || '-'}</td>
                    <td>${timeRange}</td>
                    <td>${e.Subject_Name || '-'}</td>
                    <td>${e.Room_No || '-'}</td>
                </tr>`;
            });
            html += '</tbody></table>';
            return html;
        }

        async function loadFacultySectionTimetable(facultyIdInput) {
            const el = document.getElementById('facultySectionTimetable');
            if (!el) return;

            const token = localStorage.getItem('token');
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const facultyId = facultyIdInput || user.facultyId || user.id;
            if (!facultyId) {
                el.innerHTML = '<p style="color:#ef4444;">Faculty session not found.</p>';
                return;
            }

            el.innerHTML = '<div class="loading">Loading timetable...</div>';
            try {
                const res = await fetch(`http://localhost:5000/api/timetable/faculty/${encodeURIComponent(facultyId)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await parseJsonSafe(res);
                if (!res.ok || !data.success) {
                    el.innerHTML = `<p style="color:#ef4444;">${(data && data.message) || 'Failed to load timetable.'}</p>`;
                    return;
                }

                const sections = Array.isArray(data.sections) ? data.sections : [];
                const entries = Array.isArray(data.entries) ? data.entries : [];
                const sectionLabel = sections.length
                    ? sections.map((s) => `${s.Branch || ''} Year ${s.Year || '-'} ${s.Section_Name || ''}`.trim()).join(', ')
                    : 'No assigned sections';

                el.innerHTML = `<div style="margin-bottom:10px;color:#334155;font-weight:600;">Assigned Sections: ${sectionLabel}</div>${renderFacultyTimetableRows(entries)}`;
            } catch (err) {
                el.innerHTML = `<p style="color:#ef4444;">${err.message || 'Error loading timetable.'}</p>`;
            }
        }

        let facultyStudentsCache = [];
        let facultyAdmissionSelectedId = '';
        let facultyAdmissionRendered = false;
        let facultyAdmissionAutoLoadQueued = false;
        const facultyAdmissionDetailsById = {};

        function queueFacultyAdmissionSnapshotAutoLoad() {
            if (facultyAdmissionRendered || facultyAdmissionAutoLoadQueued) return;
            if (!Array.isArray(facultyStudentsCache) || facultyStudentsCache.length === 0) return;

            facultyAdmissionAutoLoadQueued = true;
            const run = () => {
                try {
                    if (!facultyAdmissionRendered) {
                        ensureFacultyAdmissionSnapshotLoaded();
                    }
                } catch (err) {
                    console.error('Error in queueFacultyAdmissionSnapshotAutoLoad:', err);
                }
                facultyAdmissionAutoLoadQueued = false;
            };

            if (typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(run, { timeout: 1500 });
            } else {
                setTimeout(run, 700);
            }
        }

        function ensureFacultyAdmissionSnapshotLoaded() {
            try {
                if (!facultyAdmissionRendered) {
                    facultyAdmissionRendered = true;
                    const btn = document.getElementById('loadFacultyAdmissionBtn');
                    if (btn) {
                        btn.disabled = true;
                        btn.style.opacity = '0.7';
                        btn.innerHTML = '<i class="fas fa-check"></i> Snapshot Loaded';
                    }
                }

                if (Array.isArray(facultyStudentsCache) && facultyStudentsCache.length > 0) {
                    renderFacultyAdmissionSnapshot(facultyStudentsCache);
                    return;
                }

                const container = document.getElementById('facultyAdmissionFormContent');
                if (container) {
                    container.innerHTML = '<div class="loading">Loading admission details...</div>';
                }
            } catch (err) {
                console.error('Error in ensureFacultyAdmissionSnapshotLoaded:', err);
                const container = document.getElementById('facultyAdmissionFormContent');
                if (container) {
                    container.innerHTML = '<div style="color:#ef4444;">Error loading admission snapshot. Please refresh the page.</div>';
                }
            }
        }

        function facultyAdmissionEscapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function facultyAdmissionValue(value, fallback = '-') {
            if (value === null || value === undefined) return fallback;
            const text = String(value).trim();
            return text ? text : fallback;
        }

        async function onFacultyAdmissionStudentChange(studentId) {
            try {
                facultyAdmissionSelectedId = studentId || '';
                await fetchFacultyAdmissionDetailsById(facultyAdmissionSelectedId);
                if (Array.isArray(facultyStudentsCache) && facultyStudentsCache.length > 0) {
                    renderFacultyAdmissionSnapshot(facultyStudentsCache);
                }
            } catch (err) {
                console.error('Error changing student selection:', err);
            }
        }

        async function fetchFacultyAdmissionDetailsById(studentId) {
            if (!studentId || facultyAdmissionDetailsById[studentId]) return;
            const token = localStorage.getItem('token');
            try {
                const res = await fetch(`http://localhost:5000/api/student/${encodeURIComponent(studentId)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data?.success && data.student) {
                        facultyAdmissionDetailsById[studentId] = data.student;
                    }
                }
            } catch (fetchErr) {
                console.warn('Error fetching student details:', fetchErr);
                // Leave cache empty and keep base faculty payload.
            }
        }

        function renderFacultyAdmissionSnapshot(students) {
            try {
                const container = document.getElementById('facultyAdmissionFormContent');
                if (!container) return;

                if (!Array.isArray(students) || students.length === 0) {
                    container.innerHTML = '<div class="loading">No student records available for admission snapshot.</div>';
                    return;
                }

                const selected = students.find((s) => String(s.Student_ID || s.studentId || '') === String(facultyAdmissionSelectedId)) || students[0];
                facultyAdmissionSelectedId = String(selected.Student_ID || selected.studentId || '');
                const hydrated = facultyAdmissionDetailsById[facultyAdmissionSelectedId]
                    ? { ...selected, ...facultyAdmissionDetailsById[facultyAdmissionSelectedId] }
                    : selected;

            const name = facultyAdmissionValue(hydrated.Name || hydrated.fullName);
            const studentId = facultyAdmissionValue(hydrated.Student_ID || hydrated.studentId || hydrated.id);
            const department = facultyAdmissionValue(hydrated.Branch || hydrated.department);
            const program = facultyAdmissionValue(hydrated.Program || hydrated.program || 'B.Tech');
            const year = facultyAdmissionValue(hydrated.Year || hydrated.year);
            const section = facultyAdmissionValue(hydrated.Section || hydrated.section || 'N/A');
            const email = facultyAdmissionValue(hydrated.Email || hydrated.email);
            const phone = facultyAdmissionValue(hydrated.Phone || hydrated.phone || hydrated.mobile);
            const gender = facultyAdmissionValue(hydrated.Gender || hydrated.gender);
            const dob = facultyAdmissionValue(hydrated.Date_of_Birth || hydrated.dateOfBirth || hydrated.dob);
            const category = facultyAdmissionValue(hydrated.Category || hydrated.category);
            const fatherName = facultyAdmissionValue(hydrated.Father_Name || hydrated.fatherName);
            const motherName = facultyAdmissionValue(hydrated.Mother_Name || hydrated.motherName);
            const fatherOccupation = facultyAdmissionValue(hydrated.Father_Occupation || hydrated.fatherOccupation);
            const motherOccupation = facultyAdmissionValue(hydrated.Mother_Occupation || hydrated.motherOccupation);
            const aadhaar = facultyAdmissionValue(hydrated.Aadhaar || hydrated.aadhaarNumber || hydrated.aadhaar);
            const scholarship = facultyAdmissionValue(hydrated.Scholarship_Eligible || hydrated.scholarshipEligible);
            const photo = facultyAdmissionValue(hydrated.Photo || hydrated.photo || hydrated.profileImage || 'https://via.placeholder.com/84x104.png?text=Photo', 'https://via.placeholder.com/84x104.png?text=Photo');
            const presentAddress = facultyAdmissionValue(hydrated.Present_Address || hydrated.presentAddress || hydrated.address);
            const permanentAddress = facultyAdmissionValue(hydrated.Permanent_Address || hydrated.permanentAddress || hydrated.address);
            const district = facultyAdmissionValue(hydrated.District || hydrated.district);
            const state = facultyAdmissionValue(hydrated.State || hydrated.state);
            const country = facultyAdmissionValue(hydrated.Country || hydrated.country || 'India');
            const fatherMobile = facultyAdmissionValue(hydrated.Father_Mobile || hydrated.fatherMobile);
            const motherMobile = facultyAdmissionValue(hydrated.Mother_Mobile || hydrated.motherMobile);
            const guardianMobile = facultyAdmissionValue(hydrated.Guardian_Mobile || hydrated.guardianMobile);
            const guardianEmail = facultyAdmissionValue(hydrated.Guardian_Email || hydrated.guardianEmail);
            const admissionYear = facultyAdmissionValue(hydrated.Admission_Year || hydrated.admissionYear || hydrated.batch || 'N/A');
            const cgpa = parseFloat(hydrated.CGPA ?? hydrated.cgpa ?? 0);
            const cgpaText = Number.isFinite(cgpa) && cgpa > 0 ? cgpa.toFixed(2) : '-';

            const options = students.map((s) => {
                const sid = facultyAdmissionValue(s.Student_ID || s.studentId || '');
                const sname = facultyAdmissionValue(s.Name || s.fullName || 'Student');
                const selectedFlag = sid === facultyAdmissionSelectedId ? 'selected' : '';
                return `<option value="${facultyAdmissionEscapeHtml(sid)}" ${selectedFlag}>${facultyAdmissionEscapeHtml(sid)} - ${facultyAdmissionEscapeHtml(sname)}</option>`;
            }).join('');

            container.innerHTML = `
                <div class="admission-form-header">Admission Form</div>
                <div style="padding: 12px 16px; border-bottom: 1px solid #d1d5db; background: #f9fafb;">
                    <label style="font-size: 12px; color: #374151; font-weight: 700; margin-right: 8px;">Select Student:</label>
                    <select onchange="onFacultyAdmissionStudentChange(this.value)" style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; font-size: 12px; font-weight: 600; color: #1f2937; max-width: 100%;">
                        ${options}
                    </select>
                </div>
                <div class="admission-meta-grid">
                    <div class="admission-meta-item">Department: ${facultyAdmissionEscapeHtml(department)}</div>
                    <div class="admission-meta-item">Program: ${facultyAdmissionEscapeHtml(program)}</div>
                    <div class="admission-meta-item">Admission Year: ${facultyAdmissionEscapeHtml(admissionYear)}</div>
                    <div class="admission-meta-item">Section: ${facultyAdmissionEscapeHtml(section)}</div>
                </div>

                <div class="admission-card">
                    <div class="admission-card-title">Personal Details</div>
                    <div class="admission-two-col">
                        <div>
                            <div class="admission-line"><strong>Name of the Candidate:</strong> ${facultyAdmissionEscapeHtml(name)}</div>
                            <div class="admission-line"><strong>Roll Number:</strong> ${facultyAdmissionEscapeHtml(studentId)}</div>
                            <div class="admission-line"><strong>Date of Birth:</strong> ${facultyAdmissionEscapeHtml(dob)}</div>
                            <div class="admission-line"><strong>Gender:</strong> ${facultyAdmissionEscapeHtml(gender)}</div>
                            <div class="admission-line"><strong>Category:</strong> ${facultyAdmissionEscapeHtml(category)}</div>
                            <div class="admission-line"><strong>Father Name:</strong> ${facultyAdmissionEscapeHtml(fatherName)}</div>
                            <div class="admission-line"><strong>Mother Name:</strong> ${facultyAdmissionEscapeHtml(motherName)}</div>
                            <div class="admission-line"><strong>Father Occupation:</strong> ${facultyAdmissionEscapeHtml(fatherOccupation)}</div>
                            <div class="admission-line"><strong>Mother Occupation:</strong> ${facultyAdmissionEscapeHtml(motherOccupation)}</div>
                            <div class="admission-line"><strong>Aadhaar Number:</strong> ${facultyAdmissionEscapeHtml(aadhaar)}</div>
                            <div class="admission-line"><strong>Scholarship Eligible:</strong> ${facultyAdmissionEscapeHtml(scholarship)}</div>
                        </div>
                        <div class="admission-photo-box">
                            <div class="admission-line"><strong>Photo</strong></div>
                            <img src="${facultyAdmissionEscapeHtml(photo)}" alt="Student Photo" onerror="this.src='https://via.placeholder.com/84x104.png?text=Photo'">
                        </div>
                    </div>
                </div>

                <div class="admission-card">
                    <div class="admission-card-title">Address</div>
                    <div class="admission-two-col">
                        <div>
                            <div class="admission-line"><strong>Present Address:</strong> ${facultyAdmissionEscapeHtml(presentAddress)}</div>
                            <div class="admission-line"><strong>District:</strong> ${facultyAdmissionEscapeHtml(district)}</div>
                            <div class="admission-line"><strong>State:</strong> ${facultyAdmissionEscapeHtml(state)}</div>
                            <div class="admission-line"><strong>Country:</strong> ${facultyAdmissionEscapeHtml(country)}</div>
                        </div>
                        <div>
                            <div class="admission-line"><strong>Permanent Address:</strong> ${facultyAdmissionEscapeHtml(permanentAddress)}</div>
                            <div class="admission-line"><strong>District:</strong> ${facultyAdmissionEscapeHtml(district)}</div>
                            <div class="admission-line"><strong>State:</strong> ${facultyAdmissionEscapeHtml(state)}</div>
                            <div class="admission-line"><strong>Country:</strong> ${facultyAdmissionEscapeHtml(country)}</div>
                        </div>
                    </div>
                </div>

                <div class="admission-card">
                    <div class="admission-card-title">Contact Details</div>
                    <div class="admission-two-col">
                        <div>
                            <div class="admission-line"><strong>Father Mobile:</strong> ${facultyAdmissionEscapeHtml(fatherMobile)}</div>
                            <div class="admission-line"><strong>Student Mobile:</strong> ${facultyAdmissionEscapeHtml(phone)}</div>
                            <div class="admission-line"><strong>Student Email:</strong> ${facultyAdmissionEscapeHtml(email)}</div>
                        </div>
                        <div>
                            <div class="admission-line"><strong>Mother Mobile:</strong> ${facultyAdmissionEscapeHtml(motherMobile)}</div>
                            <div class="admission-line"><strong>Guardian Mobile:</strong> ${facultyAdmissionEscapeHtml(guardianMobile)}</div>
                            <div class="admission-line"><strong>Guardian Email:</strong> ${facultyAdmissionEscapeHtml(guardianEmail)}</div>
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
                                    <td>${facultyAdmissionEscapeHtml(facultyAdmissionValue(hydrated.SSC_School || hydrated.sscSchool))}</td>
                                    <td>${facultyAdmissionEscapeHtml(facultyAdmissionValue(hydrated.Inter_College || hydrated.interCollege))}</td>
                                    <td>${facultyAdmissionEscapeHtml(facultyAdmissionValue(hydrated.UG_College || hydrated.ugCollege || 'MGIT'))}</td>
                                    <td>${facultyAdmissionEscapeHtml(facultyAdmissionValue(hydrated.PG_College || hydrated.pgCollege))}</td>
                                </tr>
                                <tr>
                                    <td>Board / University</td>
                                    <td>${facultyAdmissionEscapeHtml(facultyAdmissionValue(hydrated.SSC_Board || hydrated.sscBoard))}</td>
                                    <td>${facultyAdmissionEscapeHtml(facultyAdmissionValue(hydrated.Inter_Board || hydrated.interBoard))}</td>
                                    <td>${facultyAdmissionEscapeHtml(facultyAdmissionValue(hydrated.UG_Board || hydrated.ugBoard))}</td>
                                    <td>${facultyAdmissionEscapeHtml(facultyAdmissionValue(hydrated.PG_Board || hydrated.pgBoard))}</td>
                                </tr>
                                <tr>
                                    <td>Year of Passing</td>
                                    <td>${facultyAdmissionEscapeHtml(facultyAdmissionValue(hydrated.SSC_Year || hydrated.sscYear))}</td>
                                    <td>${facultyAdmissionEscapeHtml(facultyAdmissionValue(hydrated.Inter_Year || hydrated.interYear))}</td>
                                    <td>${facultyAdmissionEscapeHtml(facultyAdmissionValue(year))}</td>
                                    <td>${facultyAdmissionEscapeHtml(facultyAdmissionValue(hydrated.PG_Year || hydrated.pgYear))}</td>
                                </tr>
                                <tr>
                                    <td>Marks / CGPA</td>
                                    <td>${facultyAdmissionEscapeHtml(facultyAdmissionValue(hydrated.SSC_Marks || hydrated.sscMarks))}</td>
                                    <td>${facultyAdmissionEscapeHtml(facultyAdmissionValue(hydrated.Inter_Marks || hydrated.interMarks))}</td>
                                    <td>${facultyAdmissionEscapeHtml(cgpaText)}</td>
                                    <td>${facultyAdmissionEscapeHtml(facultyAdmissionValue(hydrated.PG_Marks || hydrated.pgMarks))}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            fetchFacultyAdmissionDetailsById(facultyAdmissionSelectedId)
                .then(() => {
                    if (facultyAdmissionDetailsById[facultyAdmissionSelectedId]) {
                        const refreshed = students.find((s) => String(s.Student_ID || s.studentId || '') === String(facultyAdmissionSelectedId)) || selected;
                        const merged = { ...refreshed, ...facultyAdmissionDetailsById[facultyAdmissionSelectedId] };
                        if ((merged.Father_Name || merged.fatherName || merged.Present_Address || merged.presentAddress || merged.Date_of_Birth || merged.dateOfBirth) && !container.dataset.hydrated) {
                            container.dataset.hydrated = '1';
                            renderFacultyAdmissionSnapshot(students);
                            delete container.dataset.hydrated;
                        }
                    }
                })
                .catch(() => {});
            } catch (err) {
                console.error('Error rendering admission snapshot:', err);
                const container = document.getElementById('facultyAdmissionFormContent');
                if (container) {
                    container.innerHTML = '<div style="color:#ef4444; padding:16px;">Error loading admission details. Please try again.</div>';
                }
            }
        }

        function studentCgpa10(s) {
            return parseFloat(s.CGPA ?? s.cgpa ?? s.gpa ?? 0) || 0;
        }

        /** 10-point scale: Lower < 6.5, Average [6.5, 8), Excellent >= 8 */
        const CGPA_LOWER_MAX = 6.5;
        const CGPA_EXCELLENT_MIN = 8.0;

        function facultyCgpaTier(s) {
            const c = studentCgpa10(s);
            if (c >= CGPA_EXCELLENT_MIN) return 'excellent';
            if (c >= CGPA_LOWER_MAX) return 'average';
            return 'lower';
        }

        const FACULTY_YEAR_CARD_ORDER = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

        /** Map DB / UI year to one of 1st–4th Year; returns null if unrecognized */
        function normalizeFacultyYearKey(student) {
            const raw = student.Year ?? student.year;
            if (raw === undefined || raw === null) return null;
            const s = String(raw).trim().toLowerCase();
            if (!s || s === '—' || s === '-') return null;
            const n = parseInt(s.replace(/\D/g, ''), 10);
            if (n === 1 || /\b1\s*st\b|^i\b|first|year\s*1/.test(s)) return '1st Year';
            if (n === 2 || /\b2\s*nd\b|^ii\b|second|year\s*2|sophomore/.test(s)) return '2nd Year';
            if (n === 3 || /\b3\s*rd\b|^iii\b|third|year\s*3|junior/.test(s)) return '3rd Year';
            if (n === 4 || /\b4\s*th\b|^iv\b|fourth|year\s*4|senior/.test(s)) return '4th Year';
            if (n >= 1 && n <= 4) return FACULTY_YEAR_CARD_ORDER[n - 1];
            return null;
        }

        function bucketStudentsIntoFourYears(students) {
            const byYear = { '1st Year': [], '2nd Year': [], '3rd Year': [], '4th Year': [] };
            const unknown = [];
            (students || []).forEach(s => {
                const k = normalizeFacultyYearKey(s);
                if (k && byYear[k]) byYear[k].push(s);
                else unknown.push(s);
            });
            if (unknown.length) {
                byYear['1st Year'].push(...unknown);
            }
            return { byYear, unknownCount: unknown.length };
        }

        async function loadStudentsByCgpa(students) {
            if (!students || students.length === 0) {
                document.getElementById('studentsList').innerHTML = '<p style="padding: 20px; text-align: center; color: #6b7280;">No students enrolled yet</p>';
                return;
            }

            const { byYear } = bucketStudentsIntoFourYears(students);

            let html = '<div style="padding: 20px;">';
            FACULTY_YEAR_CARD_ORDER.forEach(year => {
                const yearStudents = byYear[year];
                const lower = yearStudents.filter(s => facultyCgpaTier(s) === 'lower');
                const average = yearStudents.filter(s => facultyCgpaTier(s) === 'average');
                const excellent = yearStudents.filter(s => facultyCgpaTier(s) === 'excellent');
                const mini = (arr) => {
                    if (!arr.length) return '';
                    const visible = arr.slice(0, FACULTY_CGPA_MINI_LIMIT);
                    const moreCount = arr.length - visible.length;
                    return `<div style="margin-top: 12px; font-size: 12px; max-height: 300px; overflow-y: auto; border-top: 1px solid rgba(255,255,255,0.25); padding-top: 8px;">
                        ${visible.map(s => `<div>• ${s.Name || s.fullName || 'Student'} (${studentCgpa10(s).toFixed(2)})</div>`).join('')}
                        ${moreCount > 0 ? `<div style="margin-top:6px;opacity:0.9;font-weight:700;">+${moreCount} more students</div>` : ''}
                    </div>`;
                };
                html += `
                    <div style="margin-bottom: 32px;">
                        <h3 style="color: #1f2937; margin-bottom: 16px; font-size: 18px; font-weight: 600;">Year ${year}</h3>
                        <div class="faculty-year-cgpa-split" style="gap: 20px;">
                            <div style="background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); color: white; padding: 20px; border-radius: 12px;">
                                <div style="font-size: 14px; opacity: 0.9; margin-bottom: 12px;">Lower (&lt; 6.5)</div>
                                <div style="font-size: 28px; font-weight: 700;">${lower.length}</div>
                                ${mini(lower)}
                            </div>
                            <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 20px; border-radius: 12px;">
                                <div style="font-size: 14px; opacity: 0.9; margin-bottom: 12px;">Average (6.5–7.99)</div>
                                <div style="font-size: 28px; font-weight: 700;">${average.length}</div>
                                ${mini(average)}
                            </div>
                            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 20px; border-radius: 12px;">
                                <div style="font-size: 14px; opacity: 0.9; margin-bottom: 12px;">Excellent (≥ 8.0)</div>
                                <div style="font-size: 28px; font-weight: 700;">${excellent.length}</div>
                                ${mini(excellent)}
                            </div>
                        </div>
                    </div>`;
            });
            html += '</div>';
            document.getElementById('studentsList').innerHTML = html;
        }

        function displayStudents(students) {
            const studentsListFull = document.getElementById('studentsListFull');
            document.getElementById('studentCountValue').textContent = students.length;

            if (students.length === 0) {
                studentsListFull.innerHTML = '<p style="padding: 20px; text-align: center; color: #6b7280;">No students enrolled yet</p>';
                return;
            }

            const { byYear, unknownCount } = bucketStudentsIntoFourYears(students);

            const rowHtml = (student) => {
                const cgpa = studentCgpa10(student);
                const cgpaLabel = cgpa > 0 ? cgpa.toFixed(2) : (student.gpa != null ? String(student.gpa) : 'N/A');
                const tier = facultyCgpaTier(student);
                const badge = tier === 'excellent'
                    ? '<span style="font-size:11px;background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:6px;font-weight:600;">Excellent</span>'
                    : tier === 'average'
                    ? '<span style="font-size:11px;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:6px;font-weight:600;">Average</span>'
                    : '<span style="font-size:11px;background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:6px;font-weight:600;">Lower</span>';
                return `<tr>
                    <td class="student-name">${student.fullName || student.Name || '—'}</td>
                    <td>${student.studentId || student.Student_ID || '—'}</td>
                    <td>${student.email || student.Email || '—'}</td>
                    <td>${student.department || student.Branch || '—'}</td>
                    <td>${cgpaLabel} ${badge}</td>
                    <td><span class="status-badge">${student.status || student.Placement_Status || 'Active'}</span></td>
                </tr>`;
            };

            const unknownNote = unknownCount > 0
                ? `<p style="margin: 0 0 16px 0; padding: 10px 14px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; font-size: 13px; color: #92400e;">${unknownCount} student(s) had a missing or unclear year in the database and are listed under <strong>1st Year</strong>.</p>`
                : '';

            studentsListFull.innerHTML = unknownNote + FACULTY_YEAR_CARD_ORDER.map(year => {
                const list = byYear[year];
                const sorted = [...list].sort((a, b) => {
                    const na = studentCgpa10(b) - studentCgpa10(a);
                    if (na !== 0) return na;
                    return String(a.fullName || a.Name || '').localeCompare(String(b.fullName || b.Name || ''));
                });
                const bodyRows = sorted.length
                    ? sorted.map(rowHtml).join('')
                    : `<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--dash-muted);">No students in this year.</td></tr>`;
                return `
                <div class="students-section" style="margin-bottom: 24px; padding: 0; box-shadow: var(--dash-shadow); border: 1px solid var(--dash-border); border-radius: 12px; overflow: hidden;">
                    <div style="background: linear-gradient(90deg, var(--dash-primary-soft), transparent); padding: 16px 20px; border-bottom: 1px solid var(--dash-border); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                        <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: var(--dash-text);">${year}</h3>
                        <span style="font-size: 13px; color: var(--dash-muted); font-weight: 600;">${list.length} student(s)</span>
                    </div>
                    <div style="padding: 0 0 8px 0; overflow-x: auto;">
                        <table class="students-table">
                            <thead>
                                <tr>
                                    <th>Student Name</th>
                                    <th>Student ID</th>
                                    <th>Email</th>
                                    <th>Department</th>
                                    <th>CGPA / Division</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${bodyRows}
                            </tbody>
                        </table>
                    </div>
                </div>`;
            }).join('');
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
            } else if (section === 'aianalytics') {
                loadAIAnalytics();
            } else if (section === 'students') {
                if (facultyStudentsCache.length) {
                    displayStudents(facultyStudentsCache);
                } else {
                    loadStudents({ renderFullList: true });
                }
            } else if (section === 'assignments') {
                loadFacultyAssignments();
            } else if (section === 'attendance') {
                loadAttendanceStudents();
            } else if (section === 'doubts') {
                loadFacultyDoubtTemplates();
                bindFacultyDoubtFilters();
                loadFacultyDoubtInbox();
                loadFacultyDoubtAnalytics();
                initFacultyPeerControls();
            } else if (section === 'results') {
                populateResultStudents();
            } else if (section === 'dashboard') {
                const user = JSON.parse(localStorage.getItem('user') || '{}');
                loadFacultySectionTimetable(user.facultyId || user.id);
            }
            // (targetEl already shown above; keep display safety for pages that render later)
            if (targetEl) targetEl.style.display = 'block';
        }

        async function populateResultStudents() {
            const studentSelect = document.getElementById('resultStudentId');
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const facultyId = user.facultyId || user.id;
            const token = localStorage.getItem('token');
            if (!studentSelect) return;
            studentSelect.innerHTML = '<option value="">Loading students...</option>';
            try {
                const response = await fetch(`http://localhost:5000/api/faculty/${facultyId}/students`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();
                if (!data.success || !Array.isArray(data.students) || data.students.length === 0) {
                    studentSelect.innerHTML = '<option value="">No students found</option>';
                    return;
                }
                let html = '<option value="">Select Student</option>';
                data.students.forEach((student) => {
                    html += `<option value="${student.Student_ID || student.studentId}">${student.Student_ID || student.studentId} - ${student.Name || student.fullName}</option>`;
                });
                studentSelect.innerHTML = html;
            } catch (err) {
                studentSelect.innerHTML = '<option value="">Error loading students</option>';
            }
        }

        const resultPublishFormEl = document.getElementById('resultPublishForm');
        if (resultPublishFormEl) {
            resultPublishFormEl.addEventListener('submit', async function(e) {
                e.preventDefault();
                const statusSpan = document.getElementById('resultPublishStatus');
                const token = localStorage.getItem('token');
                const payload = {
                    studentId: document.getElementById('resultStudentId').value,
                    subjectName: document.getElementById('resultSubject').value.trim(),
                    marksObtained: Number(document.getElementById('resultMarks').value),
                    maxMarks: Number(document.getElementById('resultMaxMarks').value),
                    semester: Number(document.getElementById('resultSemester').value),
                    examType: document.getElementById('resultExamType').value
                };

                statusSpan.textContent = 'Publishing...';
                statusSpan.style.color = '#6b7280';

                try {
                    const response = await fetch('http://localhost:5000/api/faculty/results', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(payload)
                    });
                    const data = await response.json();
                    if (!response.ok || !data.success) {
                        statusSpan.textContent = data.message || 'Failed to publish result';
                        statusSpan.style.color = '#ef4444';
                        return;
                    }
                    statusSpan.textContent = data.message || 'Result published successfully';
                    statusSpan.style.color = '#10b981';
                    resultPublishFormEl.reset();
                    populateResultStudents();
                } catch (err) {
                    statusSpan.textContent = 'Error publishing result';
                    statusSpan.style.color = '#ef4444';
                }
            });
        }

        function mapFacultyStudentForAiList(s) {
            const cgpa = studentCgpa10(s);
            const att = parseFloat(s.Attendance_Percentage ?? s.attendance ?? 0) || 0;
            const safeText = (v, fallback = '—') => {
                if (v === null || v === undefined) return fallback;
                const t = String(v).trim();
                if (!t || t.toLowerCase() === 'null' || t.toLowerCase() === 'undefined') return fallback;
                return t;
            };
            return {
                fullName: safeText(s.fullName || s.Name || 'Student', 'Student'),
                studentId: safeText(s.studentId || s.Student_ID || '-', '-'),
                email: safeText(s.email || s.Email || '-', '-'),
                gpa: cgpa.toFixed(2),
                attendance: att,
                performanceScore: Math.min(100, Math.round((cgpa / 10) * 70 + (att / 100) * 30))
            };
        }

        let facultyAiSnapshot = null;
        let facultyAiContext = {
            prediction: 'N/A',
            confidence: 'N/A',
            riskCount: 0,
            trend: 'N/A',
            report: 'N/A'
        };

        function renderFacultyWhatIf() {
            const aEl = document.getElementById('simFacultyAttendance');
            const cEl = document.getElementById('simFacultyCgpa');
            const mEl = document.getElementById('simFacultyMentoring');
            const outEl = document.getElementById('facultyWhatIfOutput');
            if (!aEl || !cEl || !mEl || !outEl || !facultyAiSnapshot) return;

            const attendanceLift = Number(aEl.value || 0);
            const cgpaLift = Number(cEl.value || 0) / 100;
            const mentoringCoverage = Number(mEl.value || 0);

            document.getElementById('simFacultyAttendanceLabel').textContent = `+${attendanceLift}%`;
            document.getElementById('simFacultyCgpaLabel').textContent = `+${cgpaLift.toFixed(2)}`;
            document.getElementById('simFacultyMentorLabel').textContent = `${mentoringCoverage}%`;

            const total = facultyAiSnapshot.total || 0;
            const baseHigh = facultyAiSnapshot.high || 0;
            const basePlacement = facultyAiSnapshot.placementReadiness || 0;

            const highRiskReductionPct = Math.min(75, Math.round(
                (attendanceLift * 1.6) +
                (cgpaLift * 20) +
                (mentoringCoverage * 0.4)
            ));
            const projectedHighRisk = Math.max(0, Math.round(baseHigh * (1 - highRiskReductionPct / 100)));
            const projectedPlacement = Math.min(99, Math.round(basePlacement + attendanceLift * 0.7 + cgpaLift * 12 + mentoringCoverage * 0.15));

            outEl.innerHTML = `Projected high-risk students: <strong>${projectedHighRisk}</strong> (from ${baseHigh})<br>` +
                `Estimated reduction: <strong>${highRiskReductionPct}%</strong><br>` +
                `Projected placement readiness: <strong>${projectedPlacement}%</strong> across ${total} students.`;
        }

        async function loadAIAnalytics() {
            const token = localStorage.getItem('token');
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const facultyId = user.facultyId || user.id;
            const selectedYear = document.getElementById('facultyAiYearFilter')?.value || 'all';
            const selectedRisk = document.getElementById('facultyAiRiskFilter')?.value || 'all';
            const selectedPerformance = document.getElementById('facultyAiPerformanceFilter')?.value || 'all';
            let backendSummary = null;

            try {
                let facultyStudents = [];
                if (facultyId) {
                    const res = await fetch(`http://localhost:5000/api/faculty/${facultyId}/students`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        facultyStudents = data.students || [];
                    }

                    const summaryRes = await fetch(`http://localhost:5000/api/ai/faculty-summary?facultyId=${encodeURIComponent(facultyId)}&year=${encodeURIComponent(selectedYear)}&risk=${encodeURIComponent(selectedRisk)}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (summaryRes.ok) {
                        backendSummary = await summaryRes.json();
                    }
                }

                const riskOf = (s) => {
                    const cgpa = studentCgpa10(s);
                    const att = parseFloat(s.Attendance_Percentage ?? s.attendance ?? 0) || 0;
                    if (cgpa < 6.5 || att < 70) return 'high';
                    if (cgpa < 8.0 || att < 80) return 'medium';
                    return 'low';
                };

                const matchesSelectedYear = (s, yearFilter) => {
                    if (yearFilter === 'all') return true;
                    const normalized = normalizeFacultyYearKey(s);
                    if (!normalized) return false;
                    const wanted = `${yearFilter}st Year`;
                    if (yearFilter === '2') return normalized === '2nd Year';
                    if (yearFilter === '3') return normalized === '3rd Year';
                    if (yearFilter === '4') return normalized === '4th Year';
                    return normalized === wanted;
                };

                if (selectedYear !== 'all') {
                    facultyStudents = facultyStudents.filter((s) => matchesSelectedYear(s, selectedYear));
                }
                if (selectedRisk !== 'all') {
                    facultyStudents = facultyStudents.filter((s) => riskOf(s) === selectedRisk);
                }
                if (selectedPerformance !== 'all') {
                    facultyStudents = facultyStudents.filter((s) => facultyCgpaTier(s) === selectedPerformance);
                }

                const lower = facultyStudents.filter(s => facultyCgpaTier(s) === 'lower');
                const average = facultyStudents.filter(s => facultyCgpaTier(s) === 'average');
                const excellent = facultyStudents.filter(s => facultyCgpaTier(s) === 'excellent');
                const total = facultyStudents.length;
                const pct = (n) => (total ? ((n / total) * 100).toFixed(1) : '0.0');
                const highRiskCount = facultyStudents.filter((s) => riskOf(s) === 'high').length;

                const avgCgpaForCards = total ? (facultyStudents.reduce((a, s) => a + studentCgpa10(s), 0) / total) : 0;
                const withAttForCards = facultyStudents.filter(s => s.Attendance_Percentage != null || s.attendance != null);
                const avgAttForCards = withAttForCards.length
                    ? (withAttForCards.reduce((a, s) => a + (parseFloat(s.Attendance_Percentage ?? s.attendance) || 0), 0) / withAttForCards.length)
                    : 0;

                document.getElementById('facultyCgpaLowerCount').textContent = lower.length;
                document.getElementById('facultyCgpaLowerPercent').textContent = pct(lower.length) + '% of your students';
                document.getElementById('facultyCgpaAverageCount').textContent = average.length;
                document.getElementById('facultyCgpaAveragePercent').textContent = pct(average.length) + '% of your students';
                document.getElementById('facultyCgpaExcellentCount').textContent = excellent.length;
                document.getElementById('facultyCgpaExcellentPercent').textContent = pct(excellent.length) + '% of your students';

                document.getElementById('totalStudentsAI').textContent = total;
                if (total > 0) {
                    const avgCgpa = (facultyStudents.reduce((a, s) => a + studentCgpa10(s), 0) / total).toFixed(2);
                    const withAtt = facultyStudents.filter(s => s.Attendance_Percentage != null || s.attendance != null);
                    const avgAtt = withAtt.length
                        ? (withAtt.reduce((a, s) => a + (parseFloat(s.Attendance_Percentage ?? s.attendance) || 0), 0) / withAtt.length).toFixed(1)
                        : null;
                    document.getElementById('avgGPA').textContent = avgCgpa + ' / 10';
                    document.getElementById('avgAttendance').textContent = avgAtt != null ? avgAtt + '%' : '—';
                } else {
                    document.getElementById('avgGPA').textContent = '—';
                    document.getElementById('avgAttendance').textContent = '—';
                }

                const summaryCardsEl = document.getElementById('facultyAiSummaryCards');
                if (summaryCardsEl) {
                    const placementReadiness = total ? Math.round(Math.min(100, (avgCgpaForCards / 10) * 70 + (avgAttForCards / 100) * 30)) : 0;
                    facultyAiSnapshot = {
                        total,
                        high: highRiskCount,
                        placementReadiness
                    };
                    summaryCardsEl.innerHTML = `
                        <div class="faculty-ai-summary-card"><div class="faculty-ai-summary-label">Students Analyzed</div><div class="faculty-ai-summary-value">${total}</div></div>
                        <div class="faculty-ai-summary-card"><div class="faculty-ai-summary-label">Avg CGPA</div><div class="faculty-ai-summary-value">${total ? avgCgpaForCards.toFixed(2) : '—'}</div></div>
                        <div class="faculty-ai-summary-card"><div class="faculty-ai-summary-label">Avg Attendance</div><div class="faculty-ai-summary-value">${withAttForCards.length ? avgAttForCards.toFixed(1) + '%' : '—'}</div></div>
                        <div class="faculty-ai-summary-card"><div class="faculty-ai-summary-label">Placement Readiness</div><div class="faculty-ai-summary-value">${placementReadiness}%</div></div>
                    `;
                    renderFacultyWhatIf();
                }

                const likelyFailCount = facultyStudents.filter((s) => {
                    const cg = studentCgpa10(s);
                    const at = parseFloat(s.Attendance_Percentage ?? s.attendance ?? 0) || 0;
                    return cg < 6.5 || at < 70;
                }).length;
                const likelyPassCount = Math.max(0, total - likelyFailCount);
                const predictionConfidence = total ? Math.round((likelyPassCount / total) * 100) : 0;

                const predEl = document.getElementById('facultyPredictionOutput');
                if (predEl) {
                    if (backendSummary && backendSummary.success && backendSummary.prediction) {
                        predEl.innerHTML = `Likely PASS: <strong>${backendSummary.prediction.likelyPass}</strong> | Likely FAIL: <strong>${backendSummary.prediction.likelyFail}</strong><br>` +
                            `Confidence: <strong>${backendSummary.prediction.confidence}%</strong>`;
                    } else {
                        predEl.innerHTML = `Likely PASS: <strong>${likelyPassCount}</strong> | Likely FAIL: <strong>${likelyFailCount}</strong><br>` +
                            `Confidence: <strong>${predictionConfidence}%</strong>`;
                    }
                }

                const riskEl = document.getElementById('facultyRiskOutput');
                if (riskEl) {
                    if (backendSummary && backendSummary.success && backendSummary.risk) {
                        riskEl.innerHTML = `⚠️ At-risk students detected: <strong>${backendSummary.risk.high}</strong> out of ${backendSummary.total}.`;
                    } else {
                        riskEl.innerHTML = `⚠️ At-risk students detected: <strong>${highRiskCount}</strong> out of ${total}.`;
                    }
                }

                const smartEl = document.getElementById('facultySmartInsightOutput');
                if (smartEl) {
                    const topCount = excellent.length;
                    const weakCount = lower.length;
                    smartEl.innerHTML = `Top performers: <strong>${topCount}</strong> | Needs attention: <strong>${weakCount}</strong><br>` +
                        `${weakCount > topCount ? 'Class needs intervention focus this month.' : 'Class performance is stable with strong top segment.'}`;
                }

                const attendancePatternEl = document.getElementById('facultyAttendancePatternOutput');
                if (attendancePatternEl) {
                    if (backendSummary && backendSummary.success && backendSummary.attendancePattern?.text) {
                        attendancePatternEl.textContent = backendSummary.attendancePattern.text;
                    } else {
                        if (avgAttForCards < 75) {
                            attendancePatternEl.textContent = `Attendance trend is weak (${avgAttForCards.toFixed(1)}%). Consider weekday reminder and mentoring nudges.`;
                        } else if (avgAttForCards < 85) {
                            attendancePatternEl.textContent = `Attendance is moderate (${avgAttForCards.toFixed(1)}%). Target 5% lift for medium-risk students.`;
                        } else {
                            attendancePatternEl.textContent = `Attendance pattern is healthy (${avgAttForCards.toFixed(1)}%). Sustain engagement with advanced workshops.`;
                        }
                    }
                }

                const yearBuckets = { 1: [], 2: [], 3: [], 4: [] };
                facultyStudents.forEach((s) => {
                    const y = Number(s.Year ?? s.year ?? 0);
                    if (yearBuckets[y]) yearBuckets[y].push(studentCgpa10(s));
                });
                const yearAvg = Object.entries(yearBuckets)
                    .filter(([, arr]) => arr.length)
                    .map(([y, arr]) => ({ y: Number(y), avg: arr.reduce((a, n) => a + n, 0) / arr.length }))
                    .sort((a, b) => a.y - b.y);

                let trendText = 'Insufficient year-wise data for trend analysis.';
                if (backendSummary && backendSummary.success && backendSummary.trend?.text) {
                    trendText = backendSummary.trend.text;
                } else if (yearAvg.length >= 2) {
                    const delta = yearAvg[yearAvg.length - 1].avg - yearAvg[0].avg;
                    trendText = delta >= 0
                        ? `CGPA trend improved by ${delta.toFixed(2)} points from Year ${yearAvg[0].y} to Year ${yearAvg[yearAvg.length - 1].y}.`
                        : `CGPA trend dropped by ${Math.abs(delta).toFixed(2)} points from Year ${yearAvg[0].y} to Year ${yearAvg[yearAvg.length - 1].y}.`;
                }
                const trendEl = document.getElementById('facultyTrendOutput');
                if (trendEl) trendEl.textContent = trendText;

                const reportText = (backendSummary && backendSummary.success && backendSummary.report?.text)
                    ? backendSummary.report.text
                    : `Class summary: ${total} students analyzed. ${likelyPassCount} likely to pass and ${likelyFailCount} likely to fail based on attendance and CGPA signals. ${trendText} High-risk students currently: ${highRiskCount}.`;
                const reportEl = document.getElementById('facultyAutoReportOutput');
                if (reportEl) reportEl.textContent = reportText;

                facultyAiContext = {
                    prediction: (backendSummary && backendSummary.success && backendSummary.prediction?.text)
                        ? backendSummary.prediction.text
                        : `Likely PASS ${likelyPassCount}, Likely FAIL ${likelyFailCount}`,
                    confidence: (backendSummary && backendSummary.success && backendSummary.prediction)
                        ? `${backendSummary.prediction.confidence}%`
                        : `${predictionConfidence}%`,
                    riskCount: (backendSummary && backendSummary.success && backendSummary.risk)
                        ? backendSummary.risk.high
                        : highRiskCount,
                    trend: trendText,
                    report: reportText
                };

                const topRaw = [...excellent].sort((a, b) => studentCgpa10(b) - studentCgpa10(a)).slice(0, 5);
                const averageRaw = [...average].sort((a, b) => studentCgpa10(b) - studentCgpa10(a)).slice(0, 8);
                const needsRaw = [...lower].sort((a, b) => studentCgpa10(a) - studentCgpa10(b)).slice(0, 8);
                displayTopPerformers(topRaw.map(mapFacultyStudentForAiList));
                displayAveragePerformers(averageRaw.map(mapFacultyStudentForAiList));
                displayNeedsAttention(needsRaw.map(mapFacultyStudentForAiList));

                const interventionQueue = [...facultyStudents]
                    .map((s) => {
                        const cgpa = studentCgpa10(s);
                        const att = parseFloat(s.Attendance_Percentage ?? s.attendance ?? 0) || 0;
                        const risk = riskOf(s);
                        const score = (10 - cgpa) * 10 + (100 - att);
                        return {
                            fullName: s.fullName || s.Name || 'Student',
                            studentId: s.studentId || s.Student_ID || '-',
                            cgpa: cgpa.toFixed(2),
                            attendance: att.toFixed(1),
                            risk,
                            score,
                            branch: s.Branch || s.branch || 'Other'
                        };
                    })
                    .sort((a, b) => b.score - a.score);

                const queueEl = document.getElementById('interventionQueueList');
                if (queueEl) {
                    if (!interventionQueue.length) {
                        queueEl.textContent = 'No students match the selected year/risk filters.';
                    } else {
                        // Group by branch
                        const branchGroups = {};
                        interventionQueue.forEach((s) => {
                            if (!branchGroups[s.branch]) {
                                branchGroups[s.branch] = [];
                            }
                            branchGroups[s.branch].push(s);
                        });

                        // Render grouped by branch
                        let html = '';
                        Object.keys(branchGroups).sort().forEach((branch) => {
                            const students = branchGroups[branch];
                            html += `<div style="margin-bottom: 24px;">`;
                            html += `<h4 style="color: #1e293b; font-weight: 700; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb;">${branch} (${students.length} students)</h4>`;
                            html += students.map((s) => {
                                const riskColor = s.risk === 'high' ? '#b91c1c' : (s.risk === 'medium' ? '#92400e' : '#166534');
                                const riskBg = s.risk === 'high' ? '#fee2e2' : (s.risk === 'medium' ? '#fef3c7' : '#dcfce7');
                                return `
                                    <div class="intervention-item">
                                        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
                                            <div>
                                                <div style="font-weight:700;color:#1e293b;">${s.fullName || 'Student'} (${s.studentId || '-'})</div>
                                                <div style="font-size:12px;color:#64748b;">CGPA ${s.cgpa} • Attendance ${s.attendance}%</div>
                                            </div>
                                            <span style="padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:${riskBg};color:${riskColor};">${s.risk.toUpperCase()}</span>
                                        </div>
                                    </div>
                                `;
                            }).join('');
                            html += `</div>`;
                        });
                        queueEl.innerHTML = html;
                    }
                }

                const aiCardsEl = document.getElementById('facultyAiStudentCards');
                if (aiCardsEl) {
                    const sampleStudents = facultyStudents.slice(0, 12);
                    const aiProfiles = await Promise.all(sampleStudents.map(async (s) => {
                        try {
                            const sid = s.Student_ID || s.studentId;
                            const aiRes = await fetch(`http://localhost:5000/api/ai/profile?studentId=${sid}`, {
                                headers: { 'Authorization': `Bearer ${token}` }
                            });
                            if (!aiRes.ok) return null;
                            const aiData = await aiRes.json();
                            if (!aiData.success || !aiData.student) return null;
                            return {
                                base: s,
                                student: aiData.student,
                                recs: Array.isArray(aiData.recommendations) ? aiData.recommendations : []
                            };
                        } catch (_e) {
                            return null;
                        }
                    }));

                    const valid = aiProfiles.filter(Boolean);
                    if (!valid.length) {
                        aiCardsEl.innerHTML = '<div style="color:#64748b;">AI profile cards are unavailable right now.</div>';
                    } else {
                        const safeText = (v, fallback = '—') => {
                            if (v === null || v === undefined) return fallback;
                            const t = String(v).trim();
                            if (!t || t.toLowerCase() === 'null' || t.toLowerCase() === 'undefined') return fallback;
                            return t;
                        };
                        aiCardsEl.innerHTML = valid.map((entry) => {
                            const st = entry.student;
                            const cgpa = Number(st.CGPA ?? studentCgpa10(entry.base)) || 0;
                            const att = Number(st.Attendance_Percentage ?? entry.base.Attendance_Percentage ?? entry.base.attendance ?? 0) || 0;
                            const placement = Number(st.placementProbability ?? 0) || 0;
                            const risk = (cgpa < 6.5 || att < 70 || placement < 45)
                                ? { label: 'HIGH', bg: '#fee2e2', fg: '#b91c1c' }
                                : (cgpa < 8 || att < 80 || placement < 65)
                                    ? { label: 'MEDIUM', bg: '#fef3c7', fg: '#92400e' }
                                    : { label: 'LOW', bg: '#dcfce7', fg: '#166534' };
                            return `
                                <div class="faculty-ai-student-card">
                                    <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
                                        <div>
                                            <div style="font-weight:800;color:#1e293b;">${safeText(st.Name || entry.base.Name || entry.base.fullName, 'Student')}</div>
                                            <div style="font-size:12px;color:#64748b;">${safeText(st.Student_ID || entry.base.Student_ID || entry.base.studentId, '-')}</div>
                                        </div>
                                        <span style="padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:${risk.bg};color:${risk.fg};">${risk.label}</span>
                                    </div>
                                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px;">
                                        <div style="background:#f8fafc;border-radius:6px;padding:6px;text-align:center;"><div style="font-size:10px;color:#64748b;">CGPA</div><div style="font-weight:700;color:#1e40af;">${cgpa.toFixed(2)}</div></div>
                                        <div style="background:#f8fafc;border-radius:6px;padding:6px;text-align:center;"><div style="font-size:10px;color:#64748b;">Attendance</div><div style="font-weight:700;color:#1e40af;">${att.toFixed(1)}%</div></div>
                                        <div style="background:#f8fafc;border-radius:6px;padding:6px;text-align:center;"><div style="font-size:10px;color:#64748b;">Placement</div><div style="font-weight:700;color:#1e40af;">${placement.toFixed(0)}%</div></div>
                                    </div>
                                    <div style="margin-top:8px;font-size:12px;color:#334155;line-height:1.4;">
                                        <strong>Top Advice:</strong> ${safeText(entry.recs[0]?.title || entry.recs[0]?.message, 'No recommendation available.')}
                                    </div>
                                </div>
                            `;
                        }).join('');
                    }
                }

                if (backendSummary && backendSummary.success) {
                    document.getElementById('excellentAttendance').textContent = backendSummary.excellentAttendance ?? 0;
                    document.getElementById('goodAttendance').textContent = backendSummary.goodAttendance ?? 0;
                    document.getElementById('needsAttendance').textContent = backendSummary.needsImprovement ?? 0;
                } else {
                    const attendanceResponse = await fetch('http://localhost:5000/api/ai/attendance', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (attendanceResponse.ok) {
                        const attData = await attendanceResponse.json();
                        const stats = attData.statistics || {};
                        document.getElementById('excellentAttendance').textContent = stats.excellentAttendance ?? attData.excellentAttendance ?? 0;
                        document.getElementById('goodAttendance').textContent = stats.goodAttendance ?? attData.goodAttendance ?? 0;
                        document.getElementById('needsAttendance').textContent = stats.poorAttendance ?? attData.needsImprovement ?? 0;
                    }
                }

                // Load skills
                const skillsResponse = await fetch('http://localhost:5000/api/ai/skills', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (skillsResponse.ok) {
                    const skillsData = await skillsResponse.json();
                    displayTopSkills(skillsData.topSkills);
                }
            } catch (error) {
                console.error('Error loading AI analytics:', error);
            }

            // Load students by division
            loadStudentsByDivision(token, facultyId);
        }

        async function loadStudentsByDivision(token, facultyId) {
            const container = document.getElementById('studentsByDivisionContainer');
            if (!container) return;

            try {
                let facultyStudents = [];
                if (facultyId) {
                    const res = await fetch(`http://localhost:5000/api/faculty/${facultyId}/students`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        facultyStudents = data.students || [];
                    }
                }

                // Group students by division (Branch)
                const divisions = {};
                facultyStudents.forEach((student) => {
                    const branch = student.Branch || student.branch || 'Other';
                    if (!divisions[branch]) {
                        divisions[branch] = [];
                    }
                    divisions[branch].push(student);
                });

                // Sort divisions alphabetically
                const sortedDivisions = Object.keys(divisions).sort();

                if (sortedDivisions.length === 0) {
                    container.innerHTML = '<div style="padding: 20px; text-align: center; color: #6b7280;">No divisions found</div>';
                    return;
                }

                // Generate division cards
                let html = '';
                const colors = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#00f2fe', '#43e97b', '#fa709a', '#fee140'];

                sortedDivisions.forEach((division, colorIndex) => {
                    const students = divisions[division];
                    const color = colors[colorIndex % colors.length];
                    const borderColor = `hsl(${(colorIndex * 45) % 360}, 80%, 60%)`;

                    html += `
                        <div class="division-card">
                            <div class="division-card-header" style="border-left: 6px solid ${borderColor};">
                                <div class="division-card-title">
                                    <span style="font-size: 24px;">📚</span>
                                    ${division}
                                </div>
                                <div class="division-card-count" style="background: linear-gradient(135deg, ${borderColor} 0%, ${borderColor}dd 100%);">
                                    ${students.length} students
                                </div>
                            </div>
                            <div class="division-students-list">
                    `;

                    // Add each student
                    students.forEach((student) => {
                        const cgpa = parseFloat(student.CGPA || student.cgpa || 0);
                        let cgpaBadgeClass = 'badge-cgpa-medium';
                        if (cgpa >= 8.0) cgpaBadgeClass = 'badge-cgpa-high';
                        else if (cgpa < 6.5) cgpaBadgeClass = 'badge-cgpa-low';

                        const placementStatus = student.Placement_Status || student.placementStatus || 'Not Placed';
                        const placementBadge = placementStatus === 'Placed' ? 'badge-placed' : 'badge-not-placed';

                        const year = student.Year || student.year || '-';
                        const studentId = student.Student_ID || student.studentId || '-';

                        html += `
                            <div class="division-student-item" style="border-left-color: ${borderColor};">
                                <div class="division-student-info">
                                    <div class="division-student-name">${student.Name || student.fullName || 'N/A'}</div>
                                    <div class="division-student-details">
                                        ${studentId} • Year ${year} • ${student.Email || student.email || 'N/A'}
                                    </div>
                                </div>
                                <div class="division-student-badge">
                                    <span class="student-badge ${cgpaBadgeClass}">CGPA: ${cgpa.toFixed(2)}</span>
                                    <span class="student-badge ${placementBadge}">${placementStatus}</span>
                                </div>
                            </div>
                        `;
                    });

                    html += `
                            </div>
                        </div>
                    `;
                });

                container.innerHTML = html;
            } catch (error) {
                console.error('Error loading students by division:', error);
                container.innerHTML = '<div style="padding: 20px; text-align: center; color: #ef4444;">Error loading divisions</div>';
            }
        }

        function displayTopPerformers(performers) {
            const list = document.getElementById('topPerformersList');
            list.innerHTML = '';

            if (performers.length === 0) {
                list.innerHTML = '<div style="padding: 20px; text-align: center; color: #6b7280;">No students in the excellent band yet</div>';
                return;
            }

            performers.forEach((student, index) => {
                const html = `
                    <div style="padding: 16px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; background: #f0fdf4;">
                        <div>
                            <div style="font-weight: 600; margin-bottom: 4px;">🏆 #${index + 1} - ${student.fullName}</div>
                            <div style="font-size: 12px; color: #6b7280;">${student.studentId} • ${student.email}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-weight: 700; color: #10b981; font-size: 18px;">${student.performanceScore}%</div>
                            <div style="font-size: 12px; color: #6b7280;">GPA: ${student.gpa}</div>
                        </div>
                    </div>
                `;
                list.innerHTML += html;
            });
        }

        function displayAveragePerformers(students) {
            const list = document.getElementById('averagePerformersList');
            if (!list) return;
            list.innerHTML = '';

            if (students.length === 0) {
                list.innerHTML = '<div style="padding: 20px; text-align: center; color: #6b7280;">No students in the average band</div>';
                return;
            }

            students.forEach((student, index) => {
                const html = `
                    <div style="padding: 16px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; background: #fffbeb;">
                        <div>
                            <div style="font-weight: 600; margin-bottom: 4px;">📈 #${index + 1} - ${student.fullName}</div>
                            <div style="font-size: 12px; color: #6b7280;">${student.studentId} • ${student.email}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-weight: 700; color: #d97706; font-size: 18px;">${student.performanceScore}%</div>
                            <div style="font-size: 12px; color: #6b7280;">CGPA: ${student.gpa}</div>
                        </div>
                    </div>
                `;
                list.innerHTML += html;
            });
        }

        function displayNeedsAttention(students) {
            const list = document.getElementById('needsAttentionList');
            list.innerHTML = '';

            if (students.length === 0) {
                list.innerHTML = '<div style="padding: 20px; text-align: center; color: #6b7280;">✓ No students in the lower band</div>';
                return;
            }

            students.forEach((student) => {
                const html = `
                    <div style="padding: 16px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; background: #fef2f2;">
                        <div>
                            <div style="font-weight: 600; margin-bottom: 4px;">⚠️ ${student.fullName}</div>
                            <div style="font-size: 12px; color: #6b7280;">${student.studentId} • Attendance: ${student.attendance}%</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-weight: 700; color: #ef4444; font-size: 18px;">${student.performanceScore}%</div>
                            <div style="font-size: 12px; color: #6b7280;">GPA: ${student.gpa}</div>
                        </div>
                    </div>
                `;
                list.innerHTML += html;
            });
        }

        function displayTopSkills(skills) {
            const list = document.getElementById('topSkillsList');
            list.innerHTML = '';

            if (skills.length === 0) {
                list.innerHTML = '<div style="padding: 20px; text-align: center; color: #6b7280;">No skills data</div>';
                return;
            }

            skills.forEach(skill => {
                const proficiency = Number(skill.percentage || skill.avgProficiency || 0).toFixed(0);
                const studentCount = skill.count || skill.studentCount || 0;
                
                const html = `
                    <div style="padding: 16px; border-bottom: 1px solid #e5e7eb;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <div style="font-weight: 600;">${skill.name}</div>
                            <div style="color: #9333ea; font-weight: 600;">${proficiency}%</div>
                        </div>
                        <div style="background: #e5e7eb; height: 6px; border-radius: 3px; overflow: hidden;">
                            <div style="background: linear-gradient(135deg, #5b21b6 0%, #9333ea 100%); height: 100%; width: ${proficiency}%;"></div>
                        </div>
                        <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">${studentCount} students proficient</div>
                    </div>
                `;
                list.innerHTML += html;
            });
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
                        <label style="color: #6b7280; font-size: 12px;">Faculty ID</label>
                        <input type="text" name="facultyId" value="${user.facultyId}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ddd;" disabled>
                    </div>
                    <div>
                        <label style="color: #6b7280; font-size: 12px;">Email</label>
                        <input type="email" name="email" value="${user.email}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ddd;">
                    </div>
                    <div>
                        <label style="color: #6b7280; font-size: 12px;">Subject</label>
                        <input type="text" name="subject" value="${user.subject}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ddd;">
                    </div>
                    <div>
                        <label style="color: #6b7280; font-size: 12px;">Qualification</label>
                        <input type="text" name="qualification" value="${user.qualification}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ddd;">
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
                    const res = await fetch(`http://localhost:5000/api/faculty/profile/${user.facultyId}`, {
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

        function logout() {
            localStorage.removeItem('token');
            localStorage.removeItem('userType');
            localStorage.removeItem('user');
            window.location.href = 'landing.html';
        }

        const facultyAiYearFilterEl = document.getElementById('facultyAiYearFilter');
        const facultyAiRiskFilterEl = document.getElementById('facultyAiRiskFilter');
        if (facultyAiYearFilterEl) facultyAiYearFilterEl.addEventListener('change', () => loadAIAnalytics());
        if (facultyAiRiskFilterEl) facultyAiRiskFilterEl.addEventListener('change', () => loadAIAnalytics());

        async function sendFacultyAiChat() {
            const input = document.getElementById('facultyAiChatInput');
            const log = document.getElementById('facultyAiChatLog');
            if (!input || !log) return;
            const q = (input.value || '').trim();
            if (!q) return;

            const token = localStorage.getItem('token');
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const facultyId = user.facultyId || user.id;
            const selectedYear = document.getElementById('facultyAiYearFilter')?.value || 'all';
            const selectedRisk = document.getElementById('facultyAiRiskFilter')?.value || 'all';

            log.innerHTML += `<div><strong>You:</strong> ${q}</div>`;

            try {
                const res = await fetch('http://localhost:5000/api/ai/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        scope: 'faculty',
                        facultyId,
                        year: selectedYear,
                        risk: selectedRisk,
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
            let ans = 'Try asking about prediction, risk, trend, attendance, or report.';
            if (lower.includes('risk')) ans = `Current high-risk count: ${facultyAiContext.riskCount}.`;
            else if (lower.includes('predict') || lower.includes('pass') || lower.includes('fail')) ans = `${facultyAiContext.prediction} (confidence ${facultyAiContext.confidence}).`;
            else if (lower.includes('trend')) ans = facultyAiContext.trend;
            else if (lower.includes('report')) ans = facultyAiContext.report;
            else if (lower.includes('attendance')) ans = `Attendance impact is included in current class prediction model. High-risk signal uses low attendance + low CGPA.`;

            log.innerHTML += `<div style="margin-bottom:6px;"><strong>AI:</strong> ${ans}</div>`;
            log.scrollTop = log.scrollHeight;
            input.value = '';
        }
    
