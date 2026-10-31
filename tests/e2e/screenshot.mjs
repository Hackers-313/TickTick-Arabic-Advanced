// Captures reference screenshots in the default Arabic/RTL/dark configuration.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tta-shot-'));
const out = path.join(here, 'shots');
fs.mkdirSync(out, { recursive: true });

const app = await electron.launch({
  executablePath: path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'),
  args: [root],
  env: { ...process.env, TTA_USER_DATA: profile, NODE_ENV: 'test' },
  timeout: 60000,
});
const page = await app.firstWindow({ timeout: 60000 });
await page.waitForSelector('.app', { timeout: 30000 });

// Seed a little content so lists are not empty.
await page.evaluate(async () => {
  const projects = (await window.api.invoke('bootstrap')).projects;
  const inbox = projects.find((p) => p.is_inbox)?.id;
  const today = new Date();
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const items = [
    ['مراجعة تقرير المشروع', 5, key(today), 'عمل'],
    ['الاتصال بالعميل', 3, key(today), 'عمل'],
    ['قراءة 20 صفحة', 1, null, 'تطوير'],
    ['تمرين رياضي', 3, key(today), 'صحة'],
  ];
  for (const [title, priority, due, tag] of items) {
    await window.api.invoke('tasks.create', {
      title, notes: '', project_id: inbox, due_date: due ? `${due}T09:00:00` : null,
      all_day: due ? 0 : 1, priority, tags: JSON.stringify([tag]), recurrence: null,
    });
  }
});
await page.evaluate(() => window.api.invoke('bootstrap'));
await page.reload();
await page.waitForSelector('.app', { timeout: 30000 });
await page.locator('[data-testid="smart:all"]').click();
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(out, '01-tasks-ar.png') });

for (const key of ['calendar', 'kanban', 'matrix', 'habits', 'stats', 'focus']) {
  await page.locator(`[data-testid="page:${key}"]`).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, `02-${key}-ar.png`) });
}
await app.close();
console.log('screenshots:', out, 'profile:', profile);
