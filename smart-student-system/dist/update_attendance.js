const fs = require('fs');
const file = 'c:/Users/B MAdhav/Desktop/smart2/smart-student-system/dist/dashboard-faculty.html';
let content = fs.readFileSync(file, 'utf8');

const oldHtml = `<div style="margin-bottom:1em;">
                            <label>Subject:</label><br>
                            <input type="text" id="attendanceSubject" required style="padding:8px;border-radius:6px;border:1px solid #ddd;">
                        </div>
                    <div style="margin-bottom:1em;">
                        <label>Period:</label><br>
                        <select id="attendancePeriod" required style="padding:8px;border-radius:6px;border:1px solid #ddd;">
                            <option value="1" selected>Period 1</option>
                            <option value="2">Period 2</option>
                            <option value="3">Period 3</option>
                            <option value="4">Period 4</option>
                            <option value="5">Period 5</option>
                            <option value="6">Period 6</option>
                        </select>
                    </div>`;

const newHtml = `<div style="margin-bottom:1em;">
                        <label>Timetable Slot (from your schedule):</label><br>
                        <select id="attendanceTimetableSlot" required style="padding:8px;border-radius:6px;border:1px solid #ddd; width: 100%; font-weight: 600;">
                            <option value="">Select a class...</option>
                        </select>
                        <input type="hidden" id="attendanceSubject">
                        <input type="hidden" id="attendancePeriod" value="1">
                        <input type="hidden" id="attendanceSectionId">
                    </div>`;

content = content.replace(oldHtml, newHtml);

// Now finding `async function loadAttendanceStudents()`
const funcIndex = content.indexOf('async function loadAttendanceStudents() {');
if (funcIndex > -1) {
    const endHeader = content.indexOf('const user = JSON.parse', funcIndex);
    
    // We will inject the timetable fetch right before loading students
    const timetableInjector = `
                    // Injecting timetable load for today into the dropdown
                    const user = JSON.parse(localStorage.getItem('user') || '{}');
                    const facultyId = user.facultyId || user.id || '1';
                    const token = localStorage.getItem('token');
                    try {
                        const slotSel = document.getElementById('attendanceTimetableSlot');
                        if (slotSel) {
                            slotSel.innerHTML = '<option value="">Loading schedule...</option>';
                            const tRes = await fetch(\`http://localhost:5000/api/timetable/faculty/\${encodeURIComponent(facultyId)}\`, {
                                headers: { 'Authorization': \`Bearer \${token}\` }
                            });
                            const tData = await parseJsonSafe(tRes);
                            if (tRes.ok && tData.entries && tData.entries.length) {
                                // Filter to today
                                const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                                // Allow faculty to select from date input instead of strictly today if they are backdating
                                const dObj = new Date(dateInput.value);
                                const currentDay = days[dObj.getDay()];
                                
                                const todaysClasses = tData.entries.filter(e => e.Day_of_Week === currentDay);
                                if (todaysClasses.length) {
                                    slotSel.innerHTML = '<option value="">-- Select Class --</option>' + todaysClasses.map(c => 
                                        \`<option value="\${c.Subject_Name}" data-section="\${c.Section_ID}" data-start="\${c.Start_Time}">\${c.Start_Time} - \${c.End_Time} : \${c.Subject_Name}</option>\`
                                    ).join('');
                                    
                                    // bind event to set hidden inputs
                                    slotSel.onchange = function() {
                                        document.getElementById('attendanceSubject').value = this.value;
                                        if (this.options[this.selectedIndex]) {
                                            document.getElementById('attendanceSectionId').value = this.options[this.selectedIndex].getAttribute('data-section') || '';
                                        }
                                    };
                                } else {
                                    slotSel.innerHTML = '<option value="">No classes scheduled for ' + currentDay + '</option>';
                                }
                            } else {
                                slotSel.innerHTML = '<option value="">No timetable found (Type manually)</option>';
                                slotSel.outerHTML = '<input type="text" id="attendanceSubject" placeholder="Enter Subject Name manually" required style="padding:8px;border-radius:6px;border:1px solid #ddd;width:100%;">';
                            }
                        }
                    } catch(e) { console.error('Error fetching timetable', e); }

`;
    // Insert the injector right after the date setting logic
    const injectionPoint = content.indexOf('if (dateInput && !dateInput.value) {', funcIndex) + 120; // rough estimation after that block ends
    // Wait, let's safely replace using string boundary:
    const safeBoundary = `if (dateInput && !dateInput.value) {
                        dateInput.value = new Date().toISOString().split('T')[0];
                    }`;
    if (content.indexOf(safeBoundary) > -1) {
        content = content.replace(safeBoundary, safeBoundary + "\n" + timetableInjector);
    }
}

fs.writeFileSync(file, content);
console.log('Attendance form patched in dashboard-faculty.html');
