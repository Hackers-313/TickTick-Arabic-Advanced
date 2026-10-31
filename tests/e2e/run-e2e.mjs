// End-to-end smoke test: launches the real Electron app with a throwaway profile,
// drives the UI through Playwright, and verifies that data survives in SQLite.
//
// Usage: npm run build && node tests/e2e/run-e2e.mjs
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tta-e2e-'));
const screenshot = path.join(here, 'screenshot.png');
const electronBinary = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');

const results = [];
function check(name, condition, detail = '') {
  results.push({ name, ok: !!condition, detail });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

if (!fs.existsSync(electronBinary)) {
  console.error(`Electron binary missing: ${electronBinary}`);
  process.exit(2);
}

const app = await electron.launch({
  executablePath: electronBinary,
  args: [root],
  env: { ...process.env, TTA_USER_DATA: profile, NODE_ENV: 'test' },
  timeout: 60000,
});

let failed = false;
try {
  const page = await app.firstWindow({ timeout: 60000 });
  await page.waitForSelector('.app', { timeout: 30000 });
  await page.waitForSelector('.sidebar', { timeout: 30000 });

  // 1. Arabic RTL defaults.
  check('window title', (await page.title()).includes('TickTick'), await page.title());
  check('RTL direction', (await page.getAttribute('html', 'dir')) === 'rtl');
  check('Arabic language', (await page.getAttribute('html', 'lang')) === 'ar');
  const heading = await page.locator('.toolbar h1').first().innerText();
  check('Arabic heading', heading.length > 0 && /[\u0600-\u06FF]/.test(heading), heading);

  // 2. Quick add with natural-language parsing (use All so tomorrow's task is visible).
  await page.locator('[data-testid="smart:all"]').click();
  await page.waitForTimeout(250);
  const quick = page.locator('[data-testid="quick-add"]').first();
  await quick.fill('مهمة اختبار E2E غدا !high #اختبار');
  await quick.press('Enter');
  await page.waitForFunction(
    () => document.body.innerText.includes('مهمة اختبار E2E'),
    undefined,
    { timeout: 15000 },
  );
  check('quick-add task appears', await page.locator('.main').innerText().then((t) => t.includes('مهمة اختبار E2E')));

  const created = await page.evaluate(async () => {
    const boot = await window.api.invoke('bootstrap');
    return boot.tasks.find((t) => t.title.includes('مهمة اختبار E2E'));
  });
  check('task persisted in SQLite', !!created);
  check('parsed high priority', created?.priority === 5, String(created?.priority));
  check('parsed tag', JSON.parse(created?.tags ?? '[]').includes('اختبار'));
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const key = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  check('parsed tomorrow due date', (created?.due_date ?? '').startsWith(key), created?.due_date ?? '');

  // 3. Complete the task through the row checkbox.
  const row = page.locator('.task', { hasText: 'مهمة اختبار E2E' }).first();
  const checkbox = row.locator('.checkbox').first();
  await checkbox.click();
  await page.waitForFunction(
    async () => {
      const boot = await window.api.invoke('bootstrap');
      const t = boot.tasks.find((x) => x.title.includes('مهمة اختبار E2E'));
      return t?.status === 'completed';
    },
    undefined,
    { timeout: 15000 },
  );
  check('task completed via UI', true);

  // 4. Undo / redo through the keyboard shortcut.
  await page.keyboard.press('Control+z');
  await page.waitForFunction(
    async () => {
      const boot = await window.api.invoke('bootstrap');
      const t = boot.tasks.find((x) => x.title.includes('مهمة اختبار E2E'));
      return t?.status === 'open';
    },
    undefined,
    { timeout: 15000 },
  );
  check('undo restores task', true);

  // 5. Switch to English + light theme and verify direction/theme.
  await page.evaluate(() => window.api.invoke('settings.update', { language: 'en', direction: 'ltr', theme: 'daylight' }));
  await page.waitForFunction(() => document.documentElement.dir === 'ltr' && document.documentElement.dataset.theme === 'daylight', undefined, {
    timeout: 15000,
  });
  check('English LTR toggle', true);
  check('light theme applied', (await page.getAttribute('html', 'data-theme')) === 'daylight');

  // 6. Create and check in a habit through IPC (data layer exercised end to end).
  const habit = await page.evaluate(async () => {
    const h = await window.api.invoke('habits.create', { name: 'E2E habit', frequency: 'daily', goal: 2 });
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await window.api.invoke('habits.checkin', h.id, date, 2);
    const boot = await window.api.invoke('bootstrap');
    return boot.habitLogs.find((l) => l.habit_id === h.id);
  });
  check('habit check-in stored', habit?.done === 1 && habit?.value === 2);

  // 7. Backup + export.
  const exported = await page.evaluate(() => window.api.invoke('data.exportJson'));
  check('JSON export contains data', exported.length > 1000 && exported.includes('"tasks"'));
  const backup = await page.evaluate(() => window.api.invoke('data.backup'));
  check('manual backup created', fs.existsSync(backup), backup);

  // 8. Every page renders without a crash.
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  const pages = ['calendar', 'kanban', 'timeline', 'matrix', 'habits', 'focus', 'stats', 'countdowns', 'sticky', 'settings', 'sync'];
  for (const key of pages) {
    await page.locator(`[data-testid="page:${key}"]`).click();
    await page.waitForTimeout(300);
    const body = await page.locator('.main, .page').first().innerText().catch(() => '');
    check(`page renders: ${key}`, body.length > 0);
  }
  check('no renderer errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  // Back to the task list for the screenshot.
  await page.locator('[data-testid="smart:today"]').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: screenshot, fullPage: false });
  check('screenshot captured', fs.existsSync(screenshot));

  // 9. Relaunch with the same profile to prove persistence.
  await app.close();
  const app2 = await electron.launch({
    executablePath: electronBinary,
    args: [root],
    env: { ...process.env, TTA_USER_DATA: profile, NODE_ENV: 'test' },
    timeout: 60000,
  });
  const page2 = await app2.firstWindow({ timeout: 60000 });
  await page2.waitForSelector('.app', { timeout: 30000 });
  const persisted = await page2.evaluate(async () => {
    const boot = await window.api.invoke('bootstrap');
    return boot.tasks.some((t) => t.title.includes('مهمة اختبار E2E'));
  });
  check('data survives app restart', persisted);
  await app2.close();
} catch (err) {
  failed = true;
  console.error('E2E error:', err);
} finally {
  try {
    await app.close();
  } catch {
    /* already closed */
  }
}

const failedChecks = results.filter((r) => !r.ok);
console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed`);
console.log(`Profile: ${profile}`);
if (failed || failedChecks.length) process.exit(1);
