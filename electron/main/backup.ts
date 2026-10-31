import fs from 'node:fs';
import path from 'node:path';
import { getDb, closeDatabase, openDatabase } from './db';

export function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Copy the live database to a destination file after a WAL checkpoint. */
export function backupDatabase(dbPath: string, destPath: string): string {
  const db = getDb();
  db.exec('PRAGMA wal_checkpoint(FULL);');
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(dbPath, destPath);
  // copy WAL/SHM if still present for a consistent snapshot
  for (const ext of ['-wal', '-shm']) {
    const side = `${dbPath}${ext}`;
    if (fs.existsSync(side)) fs.copyFileSync(side, `${destPath}${ext}`);
  }
  return destPath;
}

export function autoBackup(dbPath: string, userData: string, tag = 'auto'): string {
  const dir = path.join(userData, 'backups');
  return backupDatabase(dbPath, path.join(dir, `backup-${tag}-${timestamp()}.db`));
}

export function listBackups(userData: string): { name: string; path: string; size: number; mtime: string }[] {
  const dir = path.join(userData, 'backups');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const full = path.join(dir, f);
      const st = fs.statSync(full);
      return { name: f, path: full, size: st.size, mtime: st.mtime.toISOString() };
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime));
}

/** Replace the live database with a backup. Returns false when the file is not a valid SQLite DB. */
export function restoreDatabase(dbPath: string, srcPath: string, userData: string): boolean {
  if (!fs.existsSync(srcPath)) throw new Error('Backup file not found');
  // Validate by opening a copy first so a corrupt file cannot destroy the live DB.
  const probe = path.join(userData, `restore-probe-${Date.now()}.db`);
  fs.copyFileSync(srcPath, probe);
  let valid = false;
  closeDatabase();
  try {
    const db = openDatabase(probe);
    db.prepare('SELECT count(*) as c FROM sqlite_master').get();
    valid = true;
  } catch {
    valid = false;
  } finally {
    closeDatabase();
    try {
      fs.unlinkSync(probe);
    } catch {
      /* ignore */
    }
  }
  if (!valid) {
    openDatabase(dbPath);
    return false;
  }

  // Reopen the live database so the pre-restore snapshot can checkpoint its WAL.
  openDatabase(dbPath);
  autoBackup(dbPath, userData, 'pre-restore');
  closeDatabase();
  for (const ext of ['', '-wal', '-shm']) {
    const target = `${dbPath}${ext}`;
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
  fs.copyFileSync(srcPath, dbPath);
  for (const ext of ['-wal', '-shm']) {
    if (fs.existsSync(`${srcPath}${ext}`)) fs.copyFileSync(`${srcPath}${ext}`, `${dbPath}${ext}`);
  }
  openDatabase(dbPath);
  return true;
}
