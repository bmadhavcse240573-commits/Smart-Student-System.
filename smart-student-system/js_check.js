const fs = require('fs');
const html = fs.readFileSync('dist/dashboard-faculty.html', 'utf8');
const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let count = 0;
while ((match = scriptRegex.exec(html)) !== null) {
  count++;
  const code = match[1];
  if (!code.trim()) continue;
  try {
    new Function(code);
    console.log(`Script ${count} syntax OK`);
  } catch (e) {
    console.log(`Script ${count} syntax error:`, e.message);
  }
}
