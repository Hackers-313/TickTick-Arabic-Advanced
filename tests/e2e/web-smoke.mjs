// Run against an isolated browser profile; never touches the user's browser data.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const executablePath = process.env.CHROME_PATH || (fs.existsSync(edge) ? edge : chrome);
if (!fs.existsSync(executablePath)) throw new Error('Set CHROME_PATH to a Chromium browser');
const vite = path.join(root, 'node_modules/vite/bin/vite.js');
const server = spawn(process.execPath, [vite, 'preview', '--config', 'vite.web.config.ts', '--host', '127.0.0.1', '--port', '4178', '--strictPort'], { cwd: root, stdio: 'ignore' });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) {
    if (server.exitCode !== null) throw new Error('Preview server exited');
    try { ready = (await fetch('http://127.0.0.1:4178/')).ok; } catch { /* starting */ }
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Preview server did not start');
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:4178/');
  await page.waitForSelector('.app');
  const id = await page.evaluate(async () => {
    const b = await window.api.invoke('bootstrap');
    const task = await window.api.invoke('tasks.create', { title: 'Web persistence check', project_id: b.projects[0].id });
    await window.api.invoke('tasks.complete', task.id, true);
    const habit = await window.api.invoke('habits.create', { name: 'Web habit check', frequency: 'daily', goal: 1 });
    await window.api.invoke('habits.checkin', habit.id, '2026-10-31', 1, '');
    return task.id;
  });
  const second = await context.newPage();
  await second.goto('http://127.0.0.1:4178/');
  await second.getByText('التطبيق مفتوح في علامة تبويب أخرى', { exact: false }).waitFor();
  await second.close();
  await page.reload();
  await page.waitForSelector('.app');
  const result = await page.evaluate(async (taskId) => {
    const b = await window.api.invoke('bootstrap');
    const exported = JSON.parse(await window.api.invoke('data.exportJson'));
    return { task: b.tasks.find((x) => x.id === taskId)?.status, habit: b.habits.some((x) => x.name === 'Web habit check'), log: b.habitLogs.length, version: exported.version };
  }, id);
  if (result.task !== 'completed' || !result.habit || result.log < 1 || !result.version || errors.length) throw new Error(JSON.stringify({ result, errors }));
  console.log('WEB SMOKE PASS:', JSON.stringify(result));
} finally {
  await browser?.close();
  server.kill();
}
