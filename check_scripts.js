const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('src/index.html', 'utf8');
const scriptMatches = [...html.matchAll(/<script[\s\S]*?<\/script>/gi)];
console.log('Script tag count:', scriptMatches.length);

scriptMatches.forEach((sm, idx) => {
  const content = sm[0].replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
  if (!content.trim()) {
    console.log(`Script ${idx} is external or empty`);
    return;
  }
  try {
    new vm.Script(content);
    console.log(`Script ${idx} valid, length ${content.length}`);
  } catch (err) {
    console.error(`Script ${idx} syntax error:`, err);
  }
});
