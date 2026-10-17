const fs = require('fs');
const html = fs.readFileSync('src/index.html', 'utf8');

// Find all occurrences of </ inside <script> blocks
const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let count = 0;

while ((match = scriptRegex.exec(html)) !== null) {
  const scriptContent = match[1];
  const scriptStartIndex = match.index;
  
  // Find </ followed by a letter in scriptContent
  const tagRegex = /<\/([a-zA-Z]+)/g;
  let tagMatch;
  while ((tagMatch = tagRegex.exec(scriptContent)) !== null) {
    count++;
    const pos = scriptStartIndex + tagMatch.index;
    const lineNum = html.substring(0, pos).split('\n').length;
    console.log(`Found </${tagMatch[1]} inside <script> at line ${lineNum}: ` + scriptContent.substring(Math.max(0, tagMatch.index - 30), tagMatch.index + 30).replace(/\n/g, ' '));
  }
}

console.log('Total illegal </ inside <script>:', count);
