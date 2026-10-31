import fs from 'node:fs';
import path from 'node:path';
import type { Project, Task } from '../../shared/types';
import { addDays, toDateKey, toLocalISO, toLocalMinutes } from '../../shared/date';
import { buildSampleData } from '../../shared/sample';
import { buildExportBundle, eventsFromIcs, eventsToIcs, taskFingerprint, tasksFromCsv, tasksToCsv, tasksToIcs } from '../../shared/importExport';
import { all, getDb, one, run, transaction } from './db';
import * as repo from './repo';
import { getSettings } from './settings';

const IMPORT_TABLES = new Set([
  'projects',
  'tasks',
  'checklist_items',
  'attachments',
  'reminders',
  'tags',
  'filters',
  'task_templates',
  'habits',
  'habit_logs',
  'focus_sessions',
  'countdowns',
  'sticky_notes',
  'calendar_events',
  'settings',
]);

export function exportAllJson(): string {
  const data: Record<string, unknown> = {
    projects: all('SELECT * FROM projects'),
    tasks: all('SELECT * FROM tasks'),
    checklist_items: all('SELECT * FROM checklist_items'),
    attachments: all('SELECT * FROM attachments'),
    reminders: all('SELECT * FROM reminders'),
    tags: all('SELECT * FROM tags'),
    filters: all('SELECT * FROM filters'),
    task_templates: all('SELECT * FROM task_templates'),
    habits: all('SELECT * FROM habits'),
    habit_logs: all('SELECT * FROM habit_logs'),
    focus_sessions: all('SELECT * FROM focus_sessions'),
    countdowns: all('SELECT * FROM countdowns'),
    sticky_notes: all('SELECT * FROM sticky_notes'),
    calendar_events: all('SELECT * FROM calendar_events'),
    settings: all('SELECT * FROM settings'),
  };
  return JSON.stringify(buildExportBundle(data), null, 2);
}

export function exportTasksCsv(): string {
  return tasksToCsv(repo.listTasks(), repo.listProjects());
}

export function exportTasksIcs(): string {
  return tasksToIcs(repo.listTasks(), repo.listProjects());
}

export function exportEventsIcs(): string {
  return eventsToIcs(repo.listEvents());
}

function insertRow(table: string, row: Record<string, unknown>): void {
  if (!IMPORT_TABLES.has(table)) throw new Error(`Import table not allowed: ${table}`);
  const keys = Object.keys(row).filter((k) => row[k] !== undefined);
  if (!keys.length) return;
  const sql = `INSERT OR REPLACE INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
  getDb()
    .prepare(sql)
    .run(...(keys.map((k) => (row[k] ?? null) as string | number | null)));
}

export interface ImportSummary {
  added: number;
  skipped: number;
  errors: string[];
}

export function importTasksCsv(text: string, defaultProjectId?: string): ImportSummary {
  const parsed = tasksFromCsv(text);
  const projects = repo.listProjects();
  const byName = new Map(projects.map((p) => [p.name.trim().toLowerCase(), p]));
  const existing = new Set(repo.listTasks(true).map((t) => taskFingerprint(t, projects.find((p) => p.id === t.project_id)?.name ?? '')));
  const seen = new Set<string>();
  const summary: ImportSummary = { added: 0, skipped: 0, errors: [] };
  for (const row of parsed) {
    if (existing.has(row.fingerprint) || seen.has(row.fingerprint)) {
      summary.skipped += 1;
      continue;
    }
    try {
      let project = row.project ? byName.get(row.project.trim().toLowerCase()) : undefined;
      if (!project && row.project) {
        project = repo.createProject({ name: row.project.trim(), color: '#4f7cff' });
        byName.set(row.project.trim().toLowerCase(), project);
      }
      const target = project ?? (defaultProjectId ? projects.find((p) => p.id === defaultProjectId) : undefined) ?? projects.find((p) => p.is_inbox) ?? projects[0];
      if (!target) throw new Error('No project');
      repo.createTask({
        title: row.title,
        notes: row.notes,
        project_id: target.id,
        tags: JSON.stringify(row.tags),
        priority: row.priority as Task['priority'],
        status: row.status === 'completed' ? 'completed' : row.status === 'abandoned' ? 'abandoned' : 'open',
        due_date: row.due_date,
        start_date: row.start_date,
        duration_min: row.duration_min,
        recurrence: row.recurrence,
        quadrant: row.quadrant,
        completed_at: row.status === 'completed' ? toLocalISO(new Date()) : null,
      });
      seen.add(row.fingerprint);
      summary.added += 1;
    } catch (err) {
      summary.errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return summary;
}

export function importIcs(text: string, asTasks: boolean): ImportSummary {
  const summary: ImportSummary = { added: 0, skipped: 0, errors: [] };
  const events = eventsFromIcs(text);
  for (const ev of events) {
    if (!ev.start) {
      summary.skipped += 1;
      continue;
    }
    const existing = ev.uid ? one<{ id: string }>('SELECT id FROM calendar_events WHERE external_uid=?', [ev.uid]) : undefined;
    if (existing) {
      summary.skipped += 1;
      continue;
    }
    try {
      if (asTasks) {
        const project = repo.listProjects().find((p) => p.is_inbox) ?? repo.listProjects()[0];
        const duplicate = repo
          .listTasks()
          .find((t) => t.title.trim().toLowerCase() === ev.title.trim().toLowerCase() && (t.due_date ?? '').slice(0, 16) === ev.start.slice(0, 16));
        if (duplicate) {
          summary.skipped += 1;
          continue;
        }
        repo.createTask({
          title: ev.title,
          notes: ev.notes,
          project_id: project.id,
          due_date: ev.start,
          end_date: ev.end,
          all_day: ev.all_day,
          recurrence: ev.recurrence,
        });
      } else {
        repo.createEvent({
          title: ev.title,
          start: ev.start,
          end: ev.end,
          all_day: ev.all_day,
          notes: ev.notes,
          location: ev.location,
          recurrence: ev.recurrence,
          source: 'ics',
          external_uid: ev.uid,
        });
      }
      summary.added += 1;
    } catch (err) {
      summary.errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return summary;
}

export function importJson(text: string, mode: 'merge' | 'replace'): ImportSummary {
  const parsed = JSON.parse(text) as { data?: Record<string, unknown[]>; app?: string };
  const data = parsed.data ?? (parsed as unknown as Record<string, unknown[]>);
  const summary: ImportSummary = { added: 0, skipped: 0, errors: [] };
  transaction(() => {
    if (mode === 'replace') {
      for (const table of ['tasks', 'projects', 'habits', 'habit_logs', 'focus_sessions', 'countdowns', 'sticky_notes', 'calendar_events', 'checklist_items', 'attachments', 'reminders', 'filters', 'task_templates', 'tags']) {
        run(`DELETE FROM ${table}`);
      }
    }
    for (const [table, rows] of Object.entries(data)) {
      if (!Array.isArray(rows) || !IMPORT_TABLES.has(table)) continue;
      for (const row of rows) {
        try {
          if (table === 'settings') {
            const r = row as { key?: string; value?: string };
            if (r.key && r.value) run('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', [r.key, r.value]);
            continue;
          }
          const rec = row as Record<string, unknown>;
          if (mode === 'merge' && rec.id && one(`SELECT id FROM ${table} WHERE id=?`, [String(rec.id)])) {
            summary.skipped += 1;
            continue;
          }
          insertRow(table, rec);
          summary.added += 1;
        } catch (err) {
          summary.errors.push(`${table}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  });
  ensureInbox();
  return summary;
}

export function ensureInbox(): void {
  const inbox = one<Project>('SELECT * FROM projects WHERE is_inbox=1');
  if (!inbox) {
    repo.createProject({ name: 'الوارد', color: '#4f7cff', icon: '📥', is_inbox: 1, kind: 'inbox', sort_order: 0 });
  }
}

export function loadSampleData(): void {
  const sample = buildSampleData();
  ensureInbox();
  const existing = one<{ c: number }>("SELECT COUNT(*) as c FROM projects WHERE id LIKE 'sample-%'");
  if ((existing?.c ?? 0) > 0) return;
  const inbox = one<Project>('SELECT * FROM projects WHERE is_inbox=1');
  transaction(() => {
    for (const p of sample.projects) {
      // The sample set carries a placeholder inbox; reuse the real inbox instead of
      // creating a second one (createTask would otherwise pick either one at random).
      if (p.is_inbox) continue;
      repo.createProject({ ...p, kanban_columns: JSON.stringify(repo.defaultColumns()) });
    }
    for (const t of sample.tasks) {
      const projectId = t.project_id === 'sample-inbox' ? inbox?.id : t.project_id;
      repo.createTask({ ...t, project_id: projectId, title: t.title ?? '' } as Partial<Task> & { title: string });
    }
    for (const h of sample.habits) repo.createHabit(h);
    for (const log of sample.habitLogs) {
      run('INSERT OR IGNORE INTO habit_logs (id,habit_id,date,value,done,note,created_at) VALUES (?,?,?,?,?,?,?)', [
        crypto.randomUUID(),
        log.habit_id,
        log.date,
        log.value,
        log.done,
        '',
        toLocalISO(new Date()),
      ]);
    }
    for (const c of sample.countdowns) repo.createCountdown(c);
    for (const s of sample.sessions) {
      repo.saveFocusSession({
        task_id: s.task_id,
        mode: s.mode as 'focus',
        started_at: s.started_at,
        ended_at: toLocalISO(new Date(new Date(s.started_at).getTime() + s.duration_sec * 1000)),
        duration_sec: s.duration_sec,
        completed: s.completed,
        note: '',
      });
    }
    repo.createFilter({ name: sample.filter.name, icon: sample.filter.icon, rule: sample.filter.rule });
    repo.createTemplate(sample.template.name, JSON.parse(sample.template.payload));
    repo.createStickyNote({ content: sample.sticky.content, color: sample.sticky.color });
  });
}

export function clearSampleData(): void {
  transaction(() => {
    const taskIds = all<{ id: string }>("SELECT id FROM tasks WHERE id LIKE 'sample-%'").map((r) => r.id);
    for (const id of taskIds) {
      run('DELETE FROM checklist_items WHERE task_id=?', [id]);
      run('DELETE FROM reminders WHERE entity_type=? AND entity_id=?', ['task', id]);
    }
    run("DELETE FROM tasks WHERE id LIKE 'sample-%'");
    run("DELETE FROM projects WHERE id LIKE 'sample-%' AND is_inbox=0");
    run("DELETE FROM habits WHERE id LIKE 'sample-%'");
    run("DELETE FROM habit_logs WHERE habit_id LIKE 'sample-%'");
    run("DELETE FROM countdowns WHERE id LIKE 'sample-%'");
    run("DELETE FROM focus_sessions WHERE id LIKE 'sample-%' OR task_id LIKE 'sample-%'");
    run("DELETE FROM filters WHERE id LIKE 'sample-%'");
    run("DELETE FROM task_templates WHERE id LIKE 'sample-%'");
    run("DELETE FROM sticky_notes WHERE id LIKE 'sample-%'");
  });
}

export function resetDatabase(): void {
  transaction(() => {
    for (const table of ['tasks', 'projects', 'habits', 'habit_logs', 'focus_sessions', 'countdowns', 'sticky_notes', 'calendar_events', 'checklist_items', 'attachments', 'reminders', 'filters', 'task_templates', 'tags', 'sync_log', 'sync_conflicts', 'undo_log', 'settings']) {
      run(`DELETE FROM ${table}`);
    }
  });
  ensureInbox();
}

export function dbStats(): { counts: Record<string, number>; settings: ReturnType<typeof getSettings> } {
  return { counts: repo.counts(), settings: getSettings() };
}

export function attachmentsDir(userData: string): string {
  const dir = path.join(userData, 'attachments');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function copyAttachment(userData: string, taskId: string, srcPath: string): { ok: boolean; attachment?: unknown; error?: string } {
  try {
    const dir = path.join(attachmentsDir(userData), taskId);
    fs.mkdirSync(dir, { recursive: true });
    const base = path.basename(srcPath);
    const target = path.join(dir, `${Date.now()}-${base}`);
    fs.copyFileSync(srcPath, target);
    const st = fs.statSync(target);
    const attachment = repo.addAttachment({
      id: crypto.randomUUID(),
      task_id: taskId,
      name: base,
      path: target,
      size: st.size,
      mime: guessMime(base),
    });
    return { ok: true, attachment };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function guessMime(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.zip': 'application/zip',
  };
  return map[ext] ?? 'application/octet-stream';
}

export function upcomingWeek(): { date: string; count: number }[] {
  const out: { date: string; count: number }[] = [];
  const tasks = repo.listTasks().filter((t) => t.status === 'open' && t.due_date);
  for (let i = 0; i < 7; i++) {
    const key = toDateKey(addDays(new Date(), i));
    out.push({ date: key, count: tasks.filter((t) => (t.due_date ?? '').startsWith(key)).length });
  }
  return out;
}
