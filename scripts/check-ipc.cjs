const fs = require('fs');
const path = require('path');

const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(f)) files.push(p);
  }
})('src');

const used = new Set();
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const re = /(?:\b(?:call|mutate|invoke|attempt)\s*(?:<[^>]*>)?\s*\(\s*|window\.api\.invoke\(\s*)'([^']+)'/g;
  let m;
  while ((m = re.exec(text))) used.add(m[1]);
}

const main = fs.readFileSync('electron/main/index.ts', 'utf8');
const cases = new Set();
const reCase = /case\s+'([^']+)'\s*:/g;
let c;
while ((c = reCase.exec(main))) cases.add(c[1]);

const missing = [...used].filter((m) => !cases.has(m)).sort();
const unused = [...cases].filter((m) => !used.has(m)).sort();
console.log('renderer methods:', used.size, '| main handlers:', cases.size);
console.log('missing handlers:', missing.length, missing.join(', '));
console.log('handlers not used by renderer:', unused.length, unused.join(', '));
