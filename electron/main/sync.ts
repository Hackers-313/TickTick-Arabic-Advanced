// TickTick Open API integration (official OAuth 2.0 + REST surface only).
// Reference: https://developer.ticktick.com/docs#/openapi
// No session cookies, no private endpoints, no licence manipulation.

import { BrowserWindow, safeStorage, shell } from 'electron';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { addMinutes, parseLocal, toLocalISO } from '../../shared/date';
import type { SyncLogEntry, SyncSettings, Task } from '../../shared/types';
import { all, one, run, transaction } from './db';
import { createProject, createTask, getTask, updateTask, listTasks, listProjects } from './repo';
import { getSettings, saveSettings } from './settings';
import { autoBackup } from './backup';

const AUTH_URL = 'https://ticktick.com/oauth/authorize';
const TOKEN_URL = 'https://ticktick.com/oauth/token';
const API_BASE = 'https://api.ticktick.com/open/v1';

interface StoredTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope?: string;
}

let callbackServer: http.Server | null = null;
let pendingState: string | null = null;
let syncTimer: NodeJS.Timeout | null = null;
let running = false;

export function secretsPath(userData: string): string {
  return path.join(userData, 'secrets', 'ticktick-oauth.bin');
}

export function saveTokens(userData: string, tokens: StoredTokens): void {
  const file = secretsPath(userData);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const json = JSON.stringify(tokens);
  const payload = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(json)
    : Buffer.from(json, 'utf8');
  fs.writeFileSync(file, payload.toString('base64'), { mode: 0o600 });
}

export function loadTokens(userData: string): StoredTokens | null {
  const file = secretsPath(userData);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = Buffer.from(fs.readFileSync(file, 'utf8'), 'base64');
    const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8');
    return JSON.parse(json) as StoredTokens;
  } catch {
    return null;
  }
}

export function clearTokens(userData: string): void {
  const file = secretsPath(userData);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

// ---------------------------------------------------------------- OAuth

export async function connect(userData: string): Promise<{ ok: boolean; error?: string }> {
  const settings = getSettings();
  const { client_id, redirect_uri, scopes } = settings.sync;
  if (!client_id) return { ok: false, error: 'MISSING_CLIENT_ID' };
  const state = randomBytes(12).toString('hex');
  pendingState = state;
  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', client_id);
  url.searchParams.set('redirect_uri', redirect_uri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes || 'tasks:read tasks:write');
  url.searchParams.set('state', state);

  const redirect = new URL(redirect_uri);
  const port = Number(redirect.port || 80);

  await new Promise<void>((resolve) => {
    if (callbackServer) {
      callbackServer.close();
      callbackServer = null;
    }
    callbackServer = http.createServer((req, res) => {
      const reqUrl = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      if (reqUrl.pathname !== redirect.pathname) {
        res.writeHead(404).end('Not found');
        return;
      }
      const code = reqUrl.searchParams.get('code');
      const returnedState = reqUrl.searchParams.get('state');
      const error = reqUrl.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<html dir="rtl"><body style="font-family:system-ui;padding:40px;text-align:center">
        <h2>${error ? 'تعذر ربط الحساب' : 'تم ربط الحساب'}</h2>
        <p>${error ? String(error) : 'يمكنك إغلاق هذه الصفحة والعودة إلى التطبيق.'}</p></body></html>`,
      );
      callbackServer?.close();
      callbackServer = null;
      if (error) return resolve();
      if (!code || returnedState !== pendingState) return resolve();
      void exchangeCode(userData, code, redirect_uri).then(resolve).catch(() => resolve());
    });
    callbackServer.on('error', () => resolve());
    callbackServer.listen(port, '127.0.0.1', () => {
      void shell.openExternal(url.toString());
    });
    // give up after 5 minutes
    setTimeout(() => {
      callbackServer?.close();
      callbackServer = null;
      resolve();
    }, 5 * 60 * 1000);
  });

  const tokens = loadTokens(userData);
  return tokens ? { ok: true } : { ok: false, error: 'AUTH_CANCELLED' };
}

async function exchangeCode(userData: string, code: string, redirectUri: string): Promise<void> {
  const { client_id, client_secret } = getSettings().sync;
  const body = new URLSearchParams({ code, grant_type: 'authorization_code', redirect_uri: redirectUri, scope: 'tasks:read tasks:write' });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${client_id}:${client_secret ?? ''}`).toString('base64')}`,
    },
    body,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
  saveTokens(userData, {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + (json.expires_in ?? 180 * 86400) * 1000,
    scope: json.scope,
  });
}

async function requestWithToken(pathname: string, init: RequestInit, accessToken: string): Promise<Response> {
  return fetch(`${API_BASE}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(25000),
  });
}

async function refreshAccessToken(userData: string): Promise<void> {
  const tokens = loadTokens(userData);
  if (!tokens?.refresh_token) throw new Error('UNAUTHORIZED');
  const { client_id, client_secret } = getSettings().sync;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${client_id}:${client_secret ?? ''}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error('UNAUTHORIZED');
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!json.access_token) throw new Error('UNAUTHORIZED');
  saveTokens(userData, {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? tokens.refresh_token,
    expires_at: Date.now() + (json.expires_in ?? 180 * 86400) * 1000,
    scope: json.scope ?? tokens.scope,
  });
}

async function apiFetch<T>(userData: string, pathname: string, init: RequestInit = {}): Promise<T> {
  const tokens = loadTokens(userData);
  if (!tokens) throw new Error('NOT_CONNECTED');
  let res = await requestWithToken(pathname, init, tokens.access_token);
  if (res.status === 401) {
    // Access tokens expire; refresh once with the stored refresh token and retry.
    await refreshAccessToken(userData);
    const next = loadTokens(userData);
    if (!next) throw new Error('UNAUTHORIZED');
    res = await requestWithToken(pathname, init, next.access_token);
  }
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ---------------------------------------------------------------- mapping

interface RemoteProject {
  id: string;
  name: string;
  color?: string;
  viewMode?: string;
  kind?: string;
  closed?: boolean;
  permission?: string;
}
interface RemoteTask {
  id: string;
  projectId: string;
  title: string;
  content?: string;
  desc?: string;
  isAllDay?: boolean;
  startDate?: string;
  dueDate?: string;
  timeZone?: string;
  reminders?: string[];
  repeatFlag?: string;
  priority?: number;
  status?: number;
  completedTime?: string;
  tags?: string[];
  items?: { id: string; title: string; status: number; sortOrder?: number }[];
  sortOrder?: number;
  etag?: string;
  modifiedTime?: string;
  createdTime?: string;
}

function apiDateToLocal(v?: string | null): string | null {
  if (!v) return null;
  // API returns ISO with offset, e.g. 2019-11-13T03:00:00+0000 (milliseconds optional)
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?([+-]\d{2}:?\d{2}|Z)?$/.exec(v);
  if (!m) return null;
  if (!m[3]) return `${m[1]}T${m[2]}`;
  const d = new Date(v.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return isNaN(d.getTime()) ? `${m[1]}T${m[2]}` : toLocalISO(d);
}

function localDateToApi(v?: string | null): string | undefined {
  if (!v) return undefined;
  const d = parseLocal(v);
  if (!d) return undefined;
  const pad = (n: number) => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(
    Math.floor(abs / 60),
  )}${pad(abs % 60)}`;
}

function remoteToLocalTask(r: RemoteTask, localProjectId: string): Partial<Task> {
  const existing = one<{ id: string; updated_at: string }>('SELECT id, updated_at FROM tasks WHERE ticktick_id=?', [r.id]);
  const reminders = (r.reminders ?? [])
    .map((spec) => {
      const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(spec);
      if (!m) return null;
      const minutes = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
      return minutes;
    })
    .filter((v): v is number => v !== null);
  return {
    id: existing?.id,
    project_id: localProjectId,
    title: r.title,
    notes: r.content ?? r.desc ?? '',
    priority: ([0, 1, 3, 5].includes(Number(r.priority)) ? Number(r.priority) : 0) as Task['priority'],
    status: r.status === 2 ? 'completed' : 'open',
    due_date: apiDateToLocal(r.dueDate),
    start_date: apiDateToLocal(r.startDate),
    all_day: r.isAllDay ? 1 : 0,
    tags: JSON.stringify(r.tags ?? []),
    recurrence: r.repeatFlag ?? null,
    completed_at: apiDateToLocal(r.completedTime),
    ticktick_id: r.id,
    etag: r.etag ?? null,
    sync_status: 'synced',
    last_synced_at: toLocalISO(new Date()),
    timezone: r.timeZone ?? null,
    ...(reminders.length ? { _reminders: reminders } : {}),
  } as Partial<Task>;
}

function localToRemoteTask(t: Task, remoteProjectId: string): Record<string, unknown> {
  return {
    id: t.ticktick_id ?? undefined,
    projectId: remoteProjectId,
    title: t.title,
    content: t.notes,
    isAllDay: !!t.all_day,
    startDate: localDateToApi(t.start_date),
    dueDate: localDateToApi(t.due_date),
    priority: t.priority,
    status: t.status === 'completed' ? 2 : 0,
    completedTime: t.status === 'completed' ? localDateToApi(t.completed_at) : undefined,
    tags: safeTags(t.tags),
    repeatFlag: t.recurrence ?? undefined,
    sortOrder: Math.round(t.sort_order),
  };
}

function safeTags(json: string): string[] {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- sync

export interface SyncResult {
  ok: boolean;
  added: number;
  updated: number;
  conflicts: number;
  deleted: number;
  error?: string;
}

export async function runSync(userData: string, trigger: 'manual' | 'auto' | 'initial' = 'manual'): Promise<SyncResult> {
  if (running) return { ok: false, added: 0, updated: 0, conflicts: 0, deleted: 0, error: 'ALREADY_RUNNING' };
  running = true;
  const started = toLocalISO(new Date());
  const logId = crypto.randomUUID();
  const settings = getSettings();
  run('INSERT INTO sync_log (id,started_at,direction,status,message) VALUES (?,?,?,?,?)', [
    logId,
    started,
    settings.sync.direction,
    'error',
    trigger,
  ]);
  let added = 0;
  let updated = 0;
  let conflicts = 0;
  let deleted = 0;
  try {
    if (!loadTokens(userData)) throw new Error('NOT_CONNECTED');
    // Safety: automatic backup before any bulk sync
    try {
      autoBackup(userData ? path.join(userData, 'ticktick-arabic.db') : '', userData, 'pre-sync');
    } catch {
      /* backup is best effort; the DB path is provided by main */
    }

    const remoteProjects = await apiFetch<RemoteProject[]>(userData, '/project');
    const allowed = settings.sync.project_ids;
    const selected = remoteProjects.filter((p) => !p.closed && (!allowed || allowed.includes(p.id)));

    for (const rp of selected) {
      const localProject =
        one<{ id: string }>('SELECT id FROM projects WHERE ticktick_id=?', [rp.id]) ??
        (createProject({
          name: rp.name,
          color: rp.color ?? '#4f7cff',
          icon: '📁',
          kind: 'list',
          ticktick_id: rp.id,
          sync_status: 'synced',
        }) as { id: string });
      if (!one('SELECT id FROM projects WHERE ticktick_id=?', [rp.id])) {
        run('UPDATE projects SET ticktick_id=?, sync_status=? WHERE id=?', [rp.id, 'synced', localProject.id]);
      } else {
        run('UPDATE projects SET name=?, sync_status=? WHERE id=?', [rp.name, 'synced', localProject.id]);
      }

      const data = await apiFetch<{ project: RemoteProject; tasks: RemoteTask[] }>(userData, `/project/${rp.id}/data`);
      const remoteTasks = data.tasks ?? [];
      const seen = new Set<string>();
      for (const rt of remoteTasks) {
        seen.add(rt.id);
        const mapped = remoteToLocalTask(rt, localProject.id) as Partial<Task> & { _reminders?: number[] };
        const existing = one<Task>('SELECT * FROM tasks WHERE ticktick_id=?', [rt.id]);
        if (!existing) {
          const created = createTask({ ...mapped, title: rt.title || '(بدون عنوان)' });
          added += 1;
          if (mapped._reminders?.length) {
            const due = mapped.due_date;
            if (due) {
              const specs = mapped._reminders.map((min) => ({
                kind: 'relative' as const,
                trigger_at: toLocalISO(addMinutes(parseLocal(due)!, -min)),
                offset_min: min,
              }));
              run('DELETE FROM reminders WHERE entity_type=? AND entity_id=?', ['task', created.id]);
              for (const s of specs) {
                run(
                  'INSERT INTO reminders (id,entity_type,entity_id,trigger_at,kind,offset_min,enabled,label,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
                  [crypto.randomUUID(), 'task', created.id, s.trigger_at, s.kind, s.offset_min, 1, '', toLocalISO(new Date())],
                );
              }
            }
          }
          continue;
        }
        // conflict: local pending edits newer than the last sync
        if (existing.sync_status === 'pending' && existing.updated_at > (existing.last_synced_at ?? '')) {
          run('INSERT INTO sync_conflicts (id,task_id,local_json,remote_json,created_at) VALUES (?,?,?,?,?)', [
            crypto.randomUUID(),
            existing.id,
            JSON.stringify(existing),
            JSON.stringify(rt),
            toLocalISO(new Date()),
          ]);
          conflicts += 1;
          continue;
        }
        updateTask(existing.id, { ...mapped, id: existing.id, sync_status: 'synced' });
        updated += 1;
      }

      // Inbound deletion: a synced task that disappeared from the remote project is removed
      // locally. Tasks with pending local edits are preserved for conflict review.
      const gone = all<Task>(
        "SELECT * FROM tasks WHERE project_id=? AND ticktick_id IS NOT NULL AND deleted_at IS NULL AND sync_status='synced'",
        [localProject.id],
      );
      for (const g of gone) {
        if (g.ticktick_id && !seen.has(g.ticktick_id)) {
          run("UPDATE tasks SET deleted_at=?, sync_status='synced' WHERE id=?", [toLocalISO(new Date()), g.id]);
          deleted += 1;
        }
      }

      if (settings.sync.direction === 'two-way') {
        const locals = all<Task>('SELECT * FROM tasks WHERE project_id=? AND ticktick_id IS NULL AND deleted_at IS NULL', [localProject.id]);
        for (const lt of locals) {
          const payload = localToRemoteTask(lt, rp.id);
          const createdRemote = await apiFetch<RemoteTask>(userData, '/task', { method: 'POST', body: JSON.stringify(payload) });
          run('UPDATE tasks SET ticktick_id=?, etag=?, sync_status=?, last_synced_at=? WHERE id=?', [
            createdRemote.id,
            createdRemote.etag ?? null,
            'synced',
            toLocalISO(new Date()),
            lt.id,
          ]);
          added += 1;
        }
        const pending = all<Task>('SELECT * FROM tasks WHERE project_id=? AND ticktick_id IS NOT NULL AND sync_status=? AND deleted_at IS NULL', [
          localProject.id,
          'pending',
        ]);
        for (const pt of pending) {
          await apiFetch(userData, `/task/${pt.ticktick_id}`, { method: 'POST', body: JSON.stringify(localToRemoteTask(pt, rp.id)) });
          run('UPDATE tasks SET sync_status=?, last_synced_at=? WHERE id=?', ['synced', toLocalISO(new Date()), pt.id]);
          updated += 1;
        }
        if (settings.sync.delete_remote_enabled) {
          const removed = all<Task>('SELECT * FROM tasks WHERE project_id=? AND ticktick_id IS NOT NULL AND deleted_at IS NOT NULL AND sync_status=?', [
            localProject.id,
            'pending',
          ]);
          for (const rt of removed) {
            await apiFetch(userData, `/task/${rp.id}/${rt.ticktick_id}`, { method: 'DELETE' });
            deleted += 1;
            run('UPDATE tasks SET sync_status=? WHERE id=?', ['synced', rt.id]);
          }
        }
      }
    }

    const finished = toLocalISO(new Date());
    run('UPDATE sync_log SET finished_at=?, status=?, added=?, updated=?, deleted=?, conflicts=? WHERE id=?', [
      finished,
      conflicts ? 'partial' : 'ok',
      added,
      updated,
      deleted,
      conflicts,
      logId,
    ]);
    const next: SyncSettings = {
      ...settings.sync,
      last_sync_at: finished,
      last_status: conflicts ? 'error' : 'ok',
      last_error: conflicts ? `${conflicts} تعارض يحتاج مراجعة` : null,
    };
    saveSettings({ sync: next });
    return { ok: true, added, updated, conflicts, deleted };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    run('UPDATE sync_log SET finished_at=?, status=?, message=? WHERE id=?', [toLocalISO(new Date()), 'error', message, logId]);
    const settingsNow = getSettings();
    saveSettings({ sync: { ...settingsNow.sync, last_status: 'error', last_error: message } });
    return { ok: false, added, updated, conflicts, deleted, error: message };
  } finally {
    running = false;
  }
}

export function startAutoSync(userData: string): void {
  stopAutoSync();
  const settings = getSettings();
  if (!settings.sync.enabled || !settings.sync.last_sync_at) return;
  const interval = Math.max(5, settings.sync.interval_min) * 60000;
  syncTimer = setInterval(() => {
    void runSync(userData, 'auto');
  }, interval);
}

export function stopAutoSync(): void {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = null;
}

export function syncLogs(limit = 50): SyncLogEntry[] {
  return all<SyncLogEntry>('SELECT * FROM sync_log ORDER BY started_at DESC LIMIT ?', [limit]);
}

export function listConflicts(): { id: string; task_id: string; local_json: string; remote_json: string; created_at: string }[] {
  return all('SELECT id,task_id,local_json,remote_json,created_at FROM sync_conflicts WHERE resolved=0 ORDER BY created_at DESC');
}

export function resolveConflict(id: string, resolution: 'local' | 'remote'): boolean {
  const row = one<{ task_id: string; local_json: string; remote_json: string }>(
    'SELECT task_id,local_json,remote_json FROM sync_conflicts WHERE id=?',
    [id],
  );
  if (!row) return false;
  if (resolution === 'remote') {
    const remote = JSON.parse(row.remote_json) as RemoteTask;
    const task = getTask(row.task_id);
    if (task) {
      updateTask(task.id, {
        title: remote.title,
        notes: remote.content ?? '',
        due_date: apiDateToLocal(remote.dueDate),
        priority: ([0, 1, 3, 5].includes(Number(remote.priority)) ? Number(remote.priority) : 0) as Task['priority'],
        status: remote.status === 2 ? 'completed' : 'open',
        sync_status: 'synced',
        last_synced_at: toLocalISO(new Date()),
      });
    }
  } else {
    run('UPDATE tasks SET sync_status=? WHERE id=?', ['pending', row.task_id]);
  }
  run('UPDATE sync_conflicts SET resolved=1, resolution=? WHERE id=?', [resolution, id]);
  return true;
}

export function disconnect(userData: string): void {
  clearTokens(userData);
  stopAutoSync();
  const settings = getSettings();
  saveSettings({ sync: { ...settings.sync, account: null, last_status: 'idle', last_error: null, enabled: 0 } });
}

export async function fetchAccount(userData: string): Promise<{ name: string; email: string; userId: string } | null> {
  try {
    const user = await apiFetch<{ username?: string; email?: string; id?: string }>(userData, '/user');
    return { name: user.username ?? '', email: user.email ?? '', userId: user.id ?? '' };
  } catch {
    return null;
  }
}

export function syncRunning(): boolean {
  return running;
}

export function notifyRenderer(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload);
}

export function rebuildFromRemote(userData: string): Promise<SyncResult> {
  // Remove only previously-synced rows; purely local tasks and habits stay untouched.
  transaction(() => {
    const ids = all<{ id: string }>('SELECT id FROM tasks WHERE ticktick_id IS NOT NULL').map((r) => r.id);
    for (const id of ids) {
      run('DELETE FROM checklist_items WHERE task_id=?', [id]);
      run('DELETE FROM reminders WHERE entity_type=? AND entity_id=?', ['task', id]);
      run('DELETE FROM tasks WHERE id=?', [id]);
    }
    for (const p of listProjects().filter((p) => p.ticktick_id)) {
      run('UPDATE projects SET ticktick_id=NULL, sync_status=? WHERE id=?', ['local', p.id]);
    }
  });
  return runSync(userData, 'initial');
}

export { listTasks };
