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
