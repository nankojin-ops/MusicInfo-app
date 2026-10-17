const fs = require('fs');
const lines = fs.readFileSync('src/index.html', 'utf8').split('\n');

for (let i = 1400; i <= 1465; i++) {
  console.log(`${i}: ${lines[i - 1]}`);
}
