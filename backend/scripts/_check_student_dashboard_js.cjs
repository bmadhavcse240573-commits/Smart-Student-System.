const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const m = html.match(/<script src="http:\/\/localhost:5000\/socket\.io\/socket\.io\.js"><\/script>\s*<script>([\s\S]*)<\/script>\s*<\/body>/i);
if (!m) {
  console.error('extract_failed');
  process.exit(1);
}
try {
  new Function(m[1]);
  console.log('js_syntax_ok');
} catch (e) {
  console.log('js_syntax_error');
  console.log(e && e.message ? e.message : String(e));
}
