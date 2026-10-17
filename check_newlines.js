const fs = require('fs');
const buf = fs.readFileSync('src/index.html');
let crCount = 0;
let lfCount = 0;
let crlfCount = 0;

for (let i = 0; i < buf.length; i++) {
  if (buf[i] === 0x0d) {
    if (i + 1 < buf.length && buf[i + 1] === 0x0a) {
      crlfCount++;
      i++;
    } else {
      crCount++;
    }
  } else if (buf[i] === 0x0a) {
    lfCount++;
  }
}

console.log('CRLF count:', crlfCount);
console.log('LF only count:', lfCount);
console.log('CR only count:', crCount);
