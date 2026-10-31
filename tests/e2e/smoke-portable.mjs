// Smoke-tests the portable self-extracting EXE without Playwright:
// the NSIS stub re-launches the app, so we verify startup by watching for
// the database it creates in an isolated profile, then close the process tree.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const exe = path.join(root, 'release', 'TickTick-Arabic-Advanced-1.0.0-portable.exe');
if (!fs.existsSync(exe)) {
  console.error('Portable exe missing:', exe);
  process.exit(2);
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tta-portable-'));
const dbPath = path.join(profile, 'ticktick-arabic.db');
const child = spawn(exe, [], {
  env: { ...process.env, TTA_USER_DATA: profile, PORTABLE_EXECUTABLE_DIR: path.dirname(exe) },
  detached: true,
  stdio: 'ignore',
});

const deadline = Date.now() + 90000;
let created = false;
while (Date.now() < deadline) {
  if (fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0) {
    created = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 1000));
}

// Give SQLite a moment to finish writing the schema.
if (created) await new Promise((r) => setTimeout(r, 3000));

try {
  execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
} catch {
  /* already exited */
}
// Do not kill processes by image name: they may belong to the user.

console.log('portable db created:', created, '| size:', created ? fs.statSync(dbPath).size : 0);
console.log(created ? 'PORTABLE SMOKE: PASS' : 'PORTABLE SMOKE: FAIL');
process.exit(created ? 0 : 1);
