import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, openDatabase } from '../electron/main/db';
import * as repo from '../electron/main/repo';
import { autoBackup, backupDatabase, listBackups, restoreDatabase } from '../electron/main/backup';
import { ensureInbox } from '../electron/main/dataService';

let root: string;
let dbPath: string;
let userData: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tta-backup-'));
  userData = path.join(root, 'userData');
  dbPath = path.join(root, 'ticktick-arabic.db');
  fs.mkdirSync(userData, { recursive: true });
  openDatabase(dbPath);
  ensureInbox();
});

afterAll(() => {
  closeDatabase();
  try {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // Windows may keep a transient handle on the temp folder; it is safe to leave it.
  }
});

describe('backup and restore', () => {
  it('creates a database snapshot and lists it', () => {
    repo.createTask({ title: 'قبل النسخ' });
    const dest = path.join(userData, 'backups', 'snapshot.db');
    const out = backupDatabase(dbPath, dest);
    expect(out).toBe(dest);
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.statSync(dest).size).toBeGreaterThan(0);
    expect(listBackups(userData).some((b) => b.name === 'snapshot.db')).toBe(true);
  });

  it('auto-backups with a timestamped name', () => {
    const out = autoBackup(dbPath, userData, 'test');
    expect(path.basename(out)).toMatch(/^backup-test-\d{8}-\d{6}\.db$/);
    expect(listBackups(userData).length).toBeGreaterThanOrEqual(2);
  });

  it('restores a snapshot and keeps a pre-restore backup', () => {
    const snapshot = path.join(userData, 'backups', 'snapshot.db');
    repo.createTask({ title: 'بعد النسخ' });
    expect(repo.listTasks().some((t) => t.title === 'بعد النسخ')).toBe(true);

    const ok = restoreDatabase(dbPath, snapshot, userData);
    expect(ok).toBe(true);

    const titles = repo.listTasks().map((t) => t.title);
    expect(titles).toContain('قبل النسخ');
    expect(titles).not.toContain('بعد النسخ');
    expect(listBackups(userData).some((b) => b.name.startsWith('backup-pre-restore-'))).toBe(true);
  });

  it('rejects a corrupt snapshot without destroying the live database', () => {
    const bad = path.join(userData, 'corrupt.db');
    fs.writeFileSync(bad, 'this is not sqlite');
    const ok = restoreDatabase(dbPath, bad, userData);
    expect(ok).toBe(false);
    expect(repo.listTasks().some((t) => t.title === 'قبل النسخ')).toBe(true);
  });

  it('throws for a missing snapshot', () => {
    expect(() => restoreDatabase(dbPath, path.join(root, 'nope.db'), userData)).toThrow();
  });
});
