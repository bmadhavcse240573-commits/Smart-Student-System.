const fs = require('fs');
const path = 'c:/Users/B MAdhav/Desktop/smart2/smart-student-system/dist/dashboard-admin.html';
let content = fs.readFileSync(path, 'utf8');

// 1. Add Tab Button
const tabsMarker = '<button class="tab" onclick="switchTab(\'admins\')">Admins</button>';
if (content.includes(tabsMarker) && !content.includes('switchTab(\'timetables\')')) {
    content = content.replace(tabsMarker, tabsMarker + '\n            <button class="tab" onclick="switchTab(\'timetables\')">Timetables</button>');
}

// 2. Add Tab Content Section
const tabContentInsertPoint = '<div id="studentsTab" class="tab-content active">';
const timetableTabContent = `
        <div id="timetablesTab" class="tab-content" style="display:none;">
            <div class="management-section">
                <div class="section-header">
                    <h3><i class="fas fa-calendar-alt"></i> Class Timetables</h3>
                </div>
                <div style="margin-bottom: 20px;">
                    <label for="adminTimetableSection" style="font-weight:600; font-size: 14px; margin-right: 10px;">Select Section:</label>
                    <select id="adminTimetableSection" style="padding: 10px; border-radius: 6px; border: 1px solid #ccc; font-size: 14px; min-width: 250px;">
                        <option value="">Loading sections...</option>
                    </select>
                </div>
                <div id="adminTimetableDisplay" style="background:#fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
                    <p style="color:#64748b; text-align:center;">Select a section to view its timetable.</p>
                </div>
            </div>
        </div>
`;
if (!content.includes('id="timetablesTab"')) {
    content = content.replace(tabContentInsertPoint, timetableTabContent + '\n' + tabContentInsertPoint);
}

// 3. Add Script Logic
const scriptInsertMarker = '        function loadAdminProfile() {';

// Need to make sure switchTab handles display properly. `dashboard-admin.html` switchTab uses .active class.
// But my new tab is hidden originally. The existing switchTab handles .active, but `tab-content.active` has `display: block` in CSS?
// Looking at CSS from before: `.tab-content { display: none; } .tab-content.active { display: block; }`
// So my inline `style="display:none;"` should be removed, or CSS handles it. I will rely on the CSS `.tab-content`. Let's strip the inline style just in case.

content = content.replace('<div id="timetablesTab" class="tab-content" style="display:none;">', '<div id="timetablesTab" class="tab-content">');

const jsLogic = `
        async function loadAdminTimetableSections() {
            const token = localStorage.getItem('token');
            try {
                const res = await fetch('http://localhost:5000/api/timetable/sections', {
                    headers: { 'Authorization': \`Bearer \${token}\` }
                });
                const data = await res.json();
                const sel = document.getElementById('adminTimetableSection');
                if (data.success && data.sections) {
                    sel.innerHTML = '<option value="">-- Choose a Section --</option>' + data.sections.map(s => 
                        \`<option value="\${s.Section_ID}">\${s.Branch || ''} Year \${s.Year || ''} - \${s.Section_Name || ''}</option>\`
                    ).join('');
                } else {
                    sel.innerHTML = '<option value="">Failed to load sections</option>';
                }
            } catch (err) {
                console.error(err);
                document.getElementById('adminTimetableSection').innerHTML = '<option value="">Error loading</option>';
            }
        }

        document.getElementById('adminTimetableSection')?.addEventListener('change', async function() {
            const display = document.getElementById('adminTimetableDisplay');
            const sectionId = this.value;
            if (!sectionId) {
                display.innerHTML = '<p style="color:#64748b; text-align:center;">Select a section to view its timetable.</p>';
                return;
            }
            display.innerHTML = '<div style="text-align:center;color:#6b7280;">Loading timetable...</div>';
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(\`http://localhost:5000/api/timetable/section/\${encodeURIComponent(sectionId)}\`, {
                    headers: { 'Authorization': \`Bearer \${token}\` }
                });
                const data = await res.json();
                if (data.success && data.entries) {
                    display.innerHTML = renderAdminTimetableRows(data.entries);
                } else {
                    display.innerHTML = \`<p style="color:red;text-align:center;">\${data.message || 'No timetable available for this section.'}</p>\`;
                }
            } catch (err) {
                display.innerHTML = '<p style="color:red;text-align:center;">Error fetching timetable.</p>';
            }
        });

        function renderAdminTimetableRows(entries) {
            if (!entries.length) return '<p style="color:#6b7280;text-align:center;padding:20px;">No timetable configured for this section yet.</p>';
            
            // Group by Day
            const days = {};
            entries.forEach(e => {
                const d = e.Day_of_Week;
                if (!days[d]) days[d] = [];
                days[d].push(e);
            });
            
            let html = '<div style="display:flex;flex-direction:column;gap:12px;">';
            ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].forEach(day => {
                if (days[day]) {
                    html += \`<div style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
                        <div style="background:#f8fafc;padding:10px 14px;font-weight:700;border-bottom:1px solid #e2e8f0;">\${day}</div>
                        <div style="padding:10px 14px;display:flex;flex-wrap:wrap;gap:8px;">\`;
                    days[day].forEach(c => {
                        const style = c.Subject_Name.toLowerCase().includes('break') || c.Subject_Name.toLowerCase().includes('lunch')
                            ? 'background:#f1f5f9;color:#64748b;' 
                            : 'background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;';
                        html += \`
                            <div style="padding:8px 12px;border-radius:6px;font-size:13px;\${style}">
                                <div style="font-weight:700;margin-bottom:4px;">\${c.Start_Time} - \${c.End_Time}</div>
                                <div style="font-weight:600;">\${c.Subject_Name}</div>
                                \${c.Faculty_Name ? \`<div style="font-size:11px;opacity:0.8;margin-top:2px;">\${c.Faculty_Name}</div>\` : ''}
                                \${c.Room_No ? \`<div style="font-size:11px;opacity:0.8;">\${c.Room_No}</div>\` : ''}
                            </div>
                        \`;
                    });
                    html += '</div></div>';
                }
            });
            html += '</div>';
            return html;
        }
`;

if (!content.includes('loadAdminTimetableSections')) {
    content = content.replace(scriptInsertMarker, jsLogic + '\n' + scriptInsertMarker);
}

// 4. Also call the loader logic during checkAuth or DOMContentLoaded
const initInsertPoint = 'loadAdminProfile();';
if (content.includes(initInsertPoint) && !content.includes('loadAdminTimetableSections();')) {
    content = content.replace(initInsertPoint, initInsertPoint + '\n            loadAdminTimetableSections();');
}

fs.writeFileSync(path, content);
console.log('Admin Dashboard Timetable Integration Complete!');
