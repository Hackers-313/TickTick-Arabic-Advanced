import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

export const SCHEMA_VERSION = 1;

export type Row = Record<string, unknown>;

let db: DatabaseSync | null = null;
let txDepth = 0;
let savepointSeq = 0;

export function openDatabase(dbPath: string): DatabaseSync {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const database = new DatabaseSync(dbPath);
  database.exec('PRAGMA journal_mode = WAL;');
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec('PRAGMA busy_timeout = 5000;');
  database.exec('PRAGMA synchronous = NORMAL;');
  migrate(database);
  db = database;
  return database;
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('Database is not open');
  return db;
}

export function closeDatabase(): void {
  if (db) {
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      db.close();
    } catch {
      /* ignore */
    }
    db = null;
  }
}

const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#4f7cff',
  icon TEXT NOT NULL DEFAULT '📁',
  kind TEXT NOT NULL DEFAULT 'list',
  is_inbox INTEGER NOT NULL DEFAULT 0,
  sort_order REAL NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  view_mode TEXT NOT NULL DEFAULT 'list',
  kanban_columns TEXT NOT NULL DEFAULT '[]',
  settings TEXT NOT NULL DEFAULT '{}',
  ticktick_id TEXT,
  sync_status TEXT NOT NULL DEFAULT 'local',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_ticktick ON projects(ticktick_id) WHERE ticktick_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  parent_id TEXT,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  due_date TEXT,
  start_date TEXT,
  end_date TEXT,
  all_day INTEGER NOT NULL DEFAULT 0,
  duration_min INTEGER,
  tags TEXT NOT NULL DEFAULT '[]',
  recurrence TEXT,
  recurrence_until TEXT,
  recurrence_count INTEGER,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sort_order REAL NOT NULL DEFAULT 0,
  kanban_column TEXT,
  quadrant INTEGER,
  ticktick_id TEXT,
  etag TEXT,
  sync_status TEXT NOT NULL DEFAULT 'local',
  last_synced_at TEXT,
  timezone TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_ticktick ON tasks(ticktick_id) WHERE ticktick_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS checklist_items (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  sort_order REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_checklist_task ON checklist_items(task_id);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  mime TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_task ON attachments(task_id);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  trigger_at TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'absolute',
  repeat_rule TEXT,
  offset_min INTEGER,
  snoozed_until TEXT,
  fired_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminders_trigger ON reminders(trigger_at);
CREATE INDEX IF NOT EXISTS idx_reminders_entity ON reminders(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#8892a6',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS filters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🔎',
  rule TEXT NOT NULL,
  sort_order REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '✅',
  color TEXT NOT NULL DEFAULT '#4f7cff',
  frequency TEXT NOT NULL DEFAULT 'daily',
  target_days INTEGER NOT NULL DEFAULT 7,
  weekdays TEXT NOT NULL DEFAULT '[]',
  goal REAL NOT NULL DEFAULT 1,
  step REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT '',
  reminder_time TEXT,
  notes TEXT NOT NULL DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0,
  sort_order REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  date TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(habit_id, date)
);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit ON habit_logs(habit_id, date);

CREATE TABLE IF NOT EXISTS focus_sessions (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  mode TEXT NOT NULL DEFAULT 'focus',
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_focus_started ON focus_sessions(started_at);

CREATE TABLE IF NOT EXISTS countdowns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#4f7cff',
  icon TEXT NOT NULL DEFAULT '⏳',
  repeat_yearly INTEGER NOT NULL DEFAULT 0,
  remind_days_before INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sticky_notes (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#ffd66b',
  x REAL NOT NULL DEFAULT 120,
  y REAL NOT NULL DEFAULT 120,
  width REAL NOT NULL DEFAULT 260,
  height REAL NOT NULL DEFAULT 220,
  always_on_top INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  start TEXT NOT NULL,
  end TEXT,
  all_day INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#4f7cff',
  project_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  recurrence TEXT,
  source TEXT NOT NULL DEFAULT 'local',
  external_uid TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_uid ON calendar_events(external_uid) WHERE external_uid IS NOT NULL;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_log (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  direction TEXT NOT NULL,
  status TEXT NOT NULL,
  added INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  conflicts INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  local_json TEXT NOT NULL,
  remote_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  resolution TEXT
);

CREATE TABLE IF NOT EXISTS undo_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  undo_json TEXT NOT NULL,
  redo_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`,
  },
];

export function migrate(database: DatabaseSync): void {
  const row = database.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
  const current = Number(row?.user_version ?? 0);
  for (const migration of MIGRATIONS) {
    if (migration.version > current) {
      database.exec('BEGIN');
      try {
        database.exec(migration.sql);
        database.exec(`PRAGMA user_version = ${migration.version}`);
        database.exec('COMMIT');
      } catch (err) {
        database.exec('ROLLBACK');
        throw err;
      }
    }
  }
}

export function schemaVersion(database: DatabaseSync = getDb()): number {
  const row = database.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
  return Number(row?.user_version ?? 0);
}

export function all<T = Row>(sql: string, params: (string | number | null)[] = []): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function one<T = Row>(sql: string, params: (string | number | null)[] = []): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, params: (string | number | null)[] = []): void {
  getDb().prepare(sql).run(...params);
}

export function transaction<T>(fn: () => T): T {
  const database = getDb();
  if (txDepth > 0) {
    // Nested call: use a savepoint so callers can compose transactions safely.
    const name = `sp_${++savepointSeq}`;
    database.exec(`SAVEPOINT ${name}`);
    txDepth += 1;
    try {
      const result = fn();
      database.exec(`RELEASE SAVEPOINT ${name}`);
      return result;
    } catch (err) {
      database.exec(`ROLLBACK TO SAVEPOINT ${name}`);
      database.exec(`RELEASE SAVEPOINT ${name}`);
      throw err;
    } finally {
      txDepth -= 1;
    }
  }
  database.exec('BEGIN');
  txDepth += 1;
  try {
    const result = fn();
    database.exec('COMMIT');
    return result;
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  } finally {
    txDepth -= 1;
  }
}
