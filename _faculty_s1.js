                <script>
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
