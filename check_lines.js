const fs = require('fs');
const lines = fs.readFileSync('src/index.html', 'utf8').split('\n');
console.log('Total lines in index.html:', lines.length);

for (let i = 1430; i < 1470; i++) {
  if (lines[i] !== undefined) {
    console.log((i + 1) + ': ' + lines[i]);
  }
}
