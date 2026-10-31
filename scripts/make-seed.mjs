// Builds seed/ticktick-arabic.db from the app's own sample-data generator.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tta-seed-'));
const app = await electron.launch({
  executablePath: path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'),
  args: [root],
  env: { ...process.env, TTA_USER_DATA: profile, NODE_ENV: 'test' },
  timeout: 60000,
});
try {
  const page = await app.firstWindow({ timeout: 60000 });
  await page.waitForSelector('.app', { timeout: 30000 });
  await page.evaluate(() => window.api.invoke('data.loadSample'));
  await page.waitForTimeout(500);
} finally {
  await app.close();
}

const dbPath = path.join(profile, 'ticktick-arabic.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
const counts = {
  projects: db.prepare('SELECT count(*) c FROM projects').get().c,
  tasks: db.prepare('SELECT count(*) c FROM tasks').get().c,
  habits: db.prepare('SELECT count(*) c FROM habits').get().c,
  events: db.prepare('SELECT count(*) c FROM calendar_events').get().c,
  countdowns: db.prepare('SELECT count(*) c FROM countdowns').get().c,
};
db.close();

fs.mkdirSync(path.join(root, 'seed'), { recursive: true });
fs.copyFileSync(dbPath, path.join(root, 'seed', 'ticktick-arabic.db'));
console.log('seed counts:', JSON.stringify(counts));
console.log('written:', path.join(root, 'seed', 'ticktick-arabic.db'));
