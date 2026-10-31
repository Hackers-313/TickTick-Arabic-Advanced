// Optional localhost integration API. Off by default, bound to 127.0.0.1 and protected by a
// per-install token so other machines cannot reach it.

import http from 'node:http';
import type { LocalApiStatus } from '../../shared/types';
import * as repo from './repo';
import { getSettings, saveSettings } from './settings';

let server: http.Server | null = null;
let current: LocalApiStatus = { running: false, port: 0, token: '', url: '' };

export function localApiStatus(): LocalApiStatus {
  return current;
}

export function stopLocalApi(): void {
  if (server) server.close();
  server = null;
  current = { running: false, port: 0, token: getSettings().local_api.token, url: '' };
}

export function startLocalApi(): LocalApiStatus {
  const settings = getSettings();
  stopLocalApi();
  if (!settings.local_api.enabled) return current;
  const port = settings.local_api.port || 45998;
  const token = settings.local_api.token;
  server = http.createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      });
      res.end();
      return;
    }
    const auth = req.headers.authorization ?? '';
    if (auth !== `Bearer ${token}`) return send(401, { error: 'unauthorized' });
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    if (req.method === 'GET' && url.pathname === '/api/health') return send(200, { ok: true, version: 1 });
    if (req.method === 'GET' && url.pathname === '/api/tasks') {
      const tasks = repo.listTasks();
      return send(200, { tasks });
    }
    if (req.method === 'GET' && url.pathname === '/api/projects') {
      return send(200, { projects: repo.listProjects() });
    }
    if (req.method === 'GET' && url.pathname === '/api/habits') {
      return send(200, { habits: repo.listHabits(), logs: repo.listHabitLogs() });
    }
    if (req.method === 'POST' && url.pathname === '/api/tasks') {
      let body = '';
      req.on('data', (c) => {
        body += c;
        if (body.length > 1_000_000) req.destroy();
      });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}') as Record<string, unknown>;
          if (!payload.title) return send(400, { error: 'title is required' });
          const task = repo.createTask({
            title: String(payload.title),
            notes: payload.notes ? String(payload.notes) : '',
            priority: ([0, 1, 3, 5].includes(Number(payload.priority)) ? Number(payload.priority) : 0) as 0 | 1 | 3 | 5,
            due_date: payload.due_date ? String(payload.due_date) : null,
            project_id: payload.project_id ? String(payload.project_id) : undefined,
            tags: JSON.stringify(Array.isArray(payload.tags) ? payload.tags : []),
          });
          send(201, { task });
        } catch (err) {
          send(400, { error: err instanceof Error ? err.message : 'invalid payload' });
        }
      });
      return;
    }
    send(404, { error: 'not found' });
  });
  server.on('error', () => {
    current = { running: false, port, token, url: `http://127.0.0.1:${port}` };
  });
  server.listen(port, '127.0.0.1', () => {
    current = { running: true, port, token, url: `http://127.0.0.1:${port}` };
  });
  saveSettings({ local_api: { ...settings.local_api, port, token } });
  return current;
}
