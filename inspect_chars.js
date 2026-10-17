const fs = require('fs');
const lines = fs.readFileSync('src/index.html', 'utf8').split('\n');

for (let lineNum = 1445; lineNum <= 1456; lineNum++) {
  const line = lines[lineNum - 1];
  console.log(`--- Line ${lineNum} (length: ${line.length}) ---`);
  let charCodes = '';
  for (let c = 0; c < line.length; c++) {
    const code = line.charCodeAt(c);
    const ch = line[c];
    if (code < 32 || code > 126) {
      charCodes += `[${c}:${ch}(0x${code.toString(16)})] `;
    }
  }
  console.log(line);
  if (charCodes) console.log('Special chars:', charCodes);
}
