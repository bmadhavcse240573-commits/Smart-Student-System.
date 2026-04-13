const fs = require('fs');

// PART 1: Remove from dashboard-admin.html (Rollback)
const wrongAdminPath = 'c:/Users/B MAdhav/Desktop/smart2/smart-student-system/dist/dashboard-admin.html';
if (fs.existsSync(wrongAdminPath)) {
    let wrongContent = fs.readFileSync(wrongAdminPath, 'utf8');
    
    // Remove Tab Button
    const tabsMarker = '<button class="tab" onclick="switchTab(\\\'admins\\\')">Admins</button>\\n            <button class="tab" onclick="switchTab(\\\'timetables\\\')">Timetables</button>';
    wrongContent = wrongContent.replace(
        '<button class="tab" onclick="switchTab(\'admins\')">Admins</button>\n            <button class="tab" onclick="switchTab(\'timetables\')">Timetables</button>',
        '<button class="tab" onclick="switchTab(\'admins\')">Admins</button>'
    );
    
    // Remove the timetablesTab content section entirely (regex to remove block)
    wrongContent = wrongContent.replace(/<div id="timetablesTab" class="tab-content">[\s\S]*?<p style="color:#64748b; text-align:center;">Select a section to view its timetable.<\/p>\r?\n\s*<\/div>\r?\n\s*<\/div>\r?\n\s*<\/div>/g, '');
    
    // Remove the JS logic
    wrongContent = wrongContent.replace(/async function loadAdminTimetableSections\(\) \{[\s\S]*?return html;\r?\n\s*\}/g, '');
    wrongContent = wrongContent.replace('loadAdminTimetableSections();', '');
    
    fs.writeFileSync(wrongAdminPath, wrongContent);
}

// PART 2: Inject to admin-dashboard.html
const correctAdminPath = 'c:/Users/B MAdhav/Desktop/smart2/smart-student-system/dist/admin-dashboard.html';
let content = fs.readFileSync(correctAdminPath, 'utf8');

// A. Inject Tab Link
const navInsertMarker = '<li class="nav-item">\\n                    <a class="nav-link" onclick="showSection(\\\'timetable-section\\\')">';
const navSearchMarker = '<li class="nav-item">\n                    <a class="nav-link" onclick="showSection(\'timetable-section\')">\n                        <i class="fas fa-calendar-alt"></i> Class Timetable\n                    </a>\n                </li>';

const newNavTab = `
                <li class="nav-item">
                    <a class="nav-link" onclick="showSection('timetable-viewer-section')">
                        <i class="fas fa-calendar-week"></i> Timetables
                    </a>
                </li>`;

if (!content.includes("showSection('timetable-viewer-section')")) {
    content = content.replace(navSearchMarker, navSearchMarker + newNavTab);
}

// B. Inject Section Content
const sectionInsertMarker = '<!-- All Student & Faculty Credentials Section -->';
const newSectionContent = `
            <!-- AI or Class Timetable Viewer Section -->
            <div id="timetable-viewer-section" class="section hidden">
                <div class="header">
                    <h1><i class="fas fa-calendar-week"></i> Class Timetables</h1>
                    <p>View visual representation of published timetables</p>
                </div>
                <div class="data-section">
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
if (!content.includes('id="timetable-viewer-section"')) {
    content = content.replace(sectionInsertMarker, newSectionContent + '\n            ' + sectionInsertMarker);
}

// C. Add showSection integration
// If sectionId is 'timetable-viewer-section', load sections dropdown.
const showSectionHooks = 'if (sectionId === \\\'timetable-section\\\') {\\n                loadAdminTimetableManager();\\n            }';
const showSectionHooksActual = "if (sectionId === 'timetable-section') {\n                loadAdminTimetableManager();\n            }";
const newHook = `\n            if (sectionId === 'timetable-viewer-section') {\n                loadAdminTimetableViewerSections();\n            }`;
if (content.includes(showSectionHooksActual) && !content.includes("loadAdminTimetableViewerSections();")) {
    content = content.replace(showSectionHooksActual, showSectionHooksActual + newHook);
}

// D. Add JS Implementation
const jsLogicActual = `
        async function loadAdminTimetableViewerSections() {
            const token = localStorage.getItem('adminToken');
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
                const token = localStorage.getItem('adminToken');
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
// Inject logic somewhere safe, e.g. at EOF right before </script>
const endScriptMarker = '</body>';
if (!content.includes('loadAdminTimetableViewerSections() {')) {
    content = content.replace(endScriptMarker, jsLogicActual + '\n' + endScriptMarker);
}

fs.writeFileSync(correctAdminPath, content);
console.log("Migration successful!");
