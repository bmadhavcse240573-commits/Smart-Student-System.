const fs = require('fs');
const path = 'c:/Users/B MAdhav/Desktop/smart2/smart-student-system/dist/dashboard-faculty.html';
let content = fs.readFileSync(path, 'utf8');

// The block to move
// It usually looks like this:
// <div class="performance-section">
//     <h2>🗓️ Class Timetable</h2>
//     <div id="facultySectionTimetable" class="loading">Loading section timetable...</div>
// </div>

const startMarker = '<div class="performance-section">';
const endMarker = '</div>';
let timetableBlock = '';
let startIndex = content.indexOf('<h2>🗓️ Class Timetable</h2>');

if (startIndex > -1) {
    // Traverse backwards to find its enclosing div
    let blockStart = content.lastIndexOf(startMarker, startIndex);
    if (blockStart > -1) {
        // Find closing div
        let innerDiv = content.indexOf('<div', startIndex);
        let innerDivClose = content.indexOf('</div>', innerDiv) + 6;
        let blockClose = content.indexOf('</div>', innerDivClose) + 6;
        
        timetableBlock = content.substring(blockStart, blockClose);
        
        // Remove from current position
        content = content.replace(timetableBlock, '');
        
        // Find insert destination
        // <div id="classesSection" style="display: none;">
        //     <div class="students-section">
        //         <h2>My Classes</h2>
        //         <p>Your classes appear here</p>
        //     </div>
        // </div>
        
        const destMarker = '<div id="classesSection" style="display: none;">';
        let destStart = content.indexOf(destMarker);
        if (destStart > -1) {
            let destInnerStart = content.indexOf('<div class="students-section">', destStart);
            let destInnerClose = content.indexOf('</div>', destInnerStart) + 6;
            let destBlockClose = content.indexOf('</div>', destInnerClose) + 6;
            
            // Wait, we can just replace the `<p>Your classes appear here</p>` with the timetable 
            // OR just append it inside the classesSection
            const classesInner = content.substring(destInnerStart, destInnerClose);
            const replacedInner = classesInner.replace('<p>Your classes appear here</p>', '') + '\\n' + timetableBlock;
            
            content = content.replace(classesInner, replacedInner);
            console.log("Timetable successfully relocated to My Classes section.");
            fs.writeFileSync(path, content);
        } else {
            console.log("Could not find classesSection destination.");
        }
    } else {
        console.log("Could not find start block.");
    }
} else {
    console.log("Could not find heading.");
}
