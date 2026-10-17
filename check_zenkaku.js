const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const files = fs.readdirSync(srcDir);

files.forEach(file => {
  const filePath = path.join(srcDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Check for fullwidth space \u3000
  let idx = content.indexOf('\u3000');
  if (idx !== -1) {
    const lineNum = content.substring(0, idx).split('\n').length;
    console.log(`[ZENKAKU SPACE] ${file} at line ${lineNum}`);
  }
  
  // Check for BOM \uFEFF
  if (content.charCodeAt(0) === 0xFEFF) {
    console.log(`[BOM DETECTED] ${file}`);
  }
});
console.log('Zenkaku / BOM check completed.');
