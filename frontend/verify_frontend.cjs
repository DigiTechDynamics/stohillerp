const fs = require('fs');
const path = require('path');
const appJsx = fs.readFileSync('src/App.jsx', 'utf8');
const imports = [...appJsx.matchAll(/import\s+[a-zA-Z0-9_]+\s+from\s+['\"]@\/pages\/([^'\"]+)['\"]/g)];
let missing = 0;
for (const match of imports) {
  const relPath = match[1];
  let fullPath = path.join('src/pages', relPath);
  if (!fs.existsSync(fullPath) && !fs.existsSync(fullPath + '.jsx') && !fs.existsSync(fullPath + '.js') && !fs.existsSync(fullPath + '/index.jsx')) {
    console.log('Missing component:', fullPath);
    missing++;
  }
}
if (missing === 0) {
  console.log('SUCCESS: All imported frontend pages exist.');
} else {
  console.log('FAILED: Found ' + missing + ' missing page imports.');
}
