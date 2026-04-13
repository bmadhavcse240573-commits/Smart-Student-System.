const fs = require('fs');
const { JSDOM } = require('jsdom');

const htmlPath = 'smart-student-system/dist/dashboard-faculty.html';
let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/<script[^>]*src=["']http:\/\/localhost:5000\/socket\.io\/socket\.io\.js["'][^>]*><\/script>/i, '');

const dom = new JSDOM(html, {
  url: 'http://localhost:8080/dashboard-faculty.html',
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.localStorage.setItem('token', 'test-token');
    window.localStorage.setItem('userType', 'faculty');
    window.localStorage.setItem('user', JSON.stringify({ fullName: 'Test Faculty', facultyId: 'F001', id: 'F001' }));
    window.fetch = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, students: [], notifications: [], entries: [], sections: [], doubts: [], templates: [], rooms: [], topSkills: [], statistics: {} }),
      json: async () => ({ success: true, students: [], notifications: [], entries: [], sections: [], doubts: [], templates: [], rooms: [], topSkills: [], statistics: {} })
    });
    window.io = function(){
      return { on(){}, emit(){}, disconnect(){} };
    };
    window.console.error = (...args) => process.stdout.write('[console.error] ' + args.join(' ') + '\n');
  }
});

function assertSidebar(sectionName) {
  const document = dom.window.document;
  const link = document.querySelector(`.sidebar-menu a[data-section="${sectionName}"]`);
  if (!link) {
    console.log(`FAIL: Missing sidebar link for ${sectionName}`);
    return false;
  }
  link.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const target = document.getElementById(sectionName + 'Section');
  if (!target) {
    console.log(`FAIL: Missing target section for ${sectionName}`);
    return false;
  }
  const visible = target.style.display === 'block';
  console.log(`${sectionName}: ${visible ? 'PASS' : 'FAIL'} (display=${target.style.display || '(empty)'})`);
  return visible;
}

setTimeout(() => {
  const tests = ['dashboard', 'students', 'assignments', 'attendance', 'doubts', 'profile', 'aianalytics'];
  let allPass = true;
  for (const t of tests) {
    if (!assertSidebar(t)) allPass = false;
  }
  console.log(allPass ? 'ALL_SIDEBAR_TESTS_PASS' : 'SIDEBAR_TESTS_FAILED');
  process.exit(allPass ? 0 : 1);
}, 500);
