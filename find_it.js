const fs = require('fs');
const content = fs.readFileSync('c:/Users/B MAdhav/Desktop/smart2/smart-student-system/dist/admin-dashboard.html', 'utf8');
const lines = content.split('\n');
let start = -1;
for(let i=0; i<lines.length; i++) {
    if(lines[i].includes('id="timetable-section"')) {
        start = i;
        break;
    }
}
if(start !== -1) {
    for(let j=start; j<start+20; j++) {
        console.log(lines[j]);
    }
}
