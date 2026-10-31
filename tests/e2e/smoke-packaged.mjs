// Smoke-tests the packaged Windows build (release/win-unpacked).
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const exe = path.join(root, 'release', 'win-unpacked', 'TickTick Arabic Advanced.exe');
if (!fs.existsSync(exe)) {
  console.error('Packaged exe missing:', exe);
  process.exit(2);
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tta-pkg-'));
const app = await electron.launch({
  executablePath: exe,
  env: { ...process.env, TTA_USER_DATA: profile },
  timeout: 90000,
});
let ok = true;
try {
  const page = await app.firstWindow({ timeout: 90000 });
  await page.waitForSelector('.app', { timeout: 45000 });
  const title = await page.title();
  const dir = await page.getAttribute('html', 'dir');
  const boot = await page.evaluate(async () => {
    const b = await window.api.invoke('bootstrap');
    return { projects: b.projects.length, settings: !!b.settings, version: b.appInfo.version };
  });
  const shot = path.join(here, 'packaged.png');
  await page.screenshot({ path: shot });
  console.log('title:', title, '| dir:', dir, '| bootstrap:', JSON.stringify(boot));
  console.log('screenshot:', shot);
  ok = title.includes('TickTick') && dir === 'rtl' && boot.projects > 0;
} catch (err) {
  ok = false;
  console.error('packaged smoke error:', err);
} finally {
  await app.close().catch(() => {});
}
console.log(ok ? 'PACKAGED SMOKE: PASS' : 'PACKAGED SMOKE: FAIL');
process.exit(ok ? 0 : 1);
