import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';

describe('browser SQLite schema compatibility', () => {
  it('applies the desktop schema in SQLite WASM and enforces foreign keys', async () => {
    const source = readFileSync(new URL('../electron/main/db.ts', import.meta.url), 'utf8');
    const migration = source.match(/const MIGRATIONS:[\s\S]*?sql: `([\s\S]*?)`/);
    expect(migration).not.toBeNull();
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    try {
      db.run('PRAGMA foreign_keys = ON');
      db.run(migration![1]);
      expect(db.exec('PRAGMA foreign_keys')[0].values[0][0]).toBe(1);
      const names = db.exec("SELECT name FROM sqlite_master WHERE type = 'table'")[0].values.flat();
      expect(names).toContain('tasks');
      expect(names).toContain('habits');
      expect(names).toContain('calendar_events');
      const bytes = db.export();
      const restored = new SQL.Database(bytes);
      try {
        expect(restored.exec("SELECT count(*) FROM sqlite_master WHERE type = 'table'")[0].values[0][0]).toBeGreaterThan(10);
      } finally { restored.close(); }
    } finally { db.close(); }
  });
});
