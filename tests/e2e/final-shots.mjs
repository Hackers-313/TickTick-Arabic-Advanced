// Reference screenshots with the shipped seed database (Arabic/RTL/Midnight).
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tta-final-shot-'));
fs.copyFileSync(path.join(root, 'seed', 'ticktick-arabic.db'), path.join(profile, 'ticktick-arabic.db'));
const out = path.join(here, 'shots');
fs.mkdirSync(out, { recursive: true });

const app = await electron.launch({
  executablePath: path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'),
  args: [root],
  env: { ...process.env, TTA_USER_DATA: profile, NODE_ENV: 'test' },
  timeout: 60000,
});
try {
  const page = await app.firstWindow({ timeout: 60000 });
  await page.waitForSelector('.app', { timeout: 30000 });
  await page.locator('[data-testid="smart:today"]').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(out, '10-today-seed.png') });

  for (const key of ['calendar', 'habits', 'stats', 'settings', 'sync']) {
    await page.locator(`[data-testid="page:${key}"]`).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(out, `11-${key}-seed.png`) });
  }

  // Task editor with a real task.
  await page.locator('[data-testid="smart:today"]').click();
  await page.waitForTimeout(400);
  await page.locator('.task .task-title').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, '12-editor-seed.png') });
} finally {
  await app.close();
}
console.log('final screenshots written to', out);
