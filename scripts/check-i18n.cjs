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
  const re = /\bt\('([^']+)'\)/g;
  let m;
  while ((m = re.exec(text))) used.add(m[1]);
}

const i18n = fs.readFileSync('shared/i18n.ts', 'utf8');
const defined = new Set();
const reDef = /^\s{2}([A-Za-z0-9_]+)\s*:\s*\{/gm;
let d;
while ((d = reDef.exec(i18n))) defined.add(d[1]);

const missing = [...used].filter((k) => !defined.has(k)).sort();
console.log('used keys:', used.size, '| defined keys:', defined.size, '| missing:', missing.length);
console.log(missing.join('\n'));
