/** SQLite compatibility layer for the browser. Persistence is managed by the API layer. */
import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import dbSource from '../../electron/main/db.ts?raw';

type Params = (string | number | null)[];
let db: Database;
let depth = 0;
let sequence = 0;

export async function openBrowserDatabase(bytes?: Uint8Array): Promise<void> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  db = bytes ? new SQL.Database(bytes) : new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  const migration = dbSource.match(/const MIGRATIONS:[\s\S]*?sql: `([\s\S]*?)`/);
  if (!migration) throw new Error('Could not load the application database schema');
  const current = one<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
  if (current < 1) transaction(() => { db.run(migration[1]); db.run('PRAGMA user_version = 1'); });
}

export function exportBrowserDatabase(): Uint8Array {
  const bytes = db.export();
  // sql.js reopens the database when exporting, which resets connection PRAGMAs.
  db.run('PRAGMA foreign_keys = ON');
  return bytes;
}

export function all<T = Record<string, unknown>>(sql: string, params: Params = []): T[] {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params as SqlValue[]);
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
    return rows;
  } finally { stmt.free(); }
}
export function one<T = Record<string, unknown>>(sql: string, params: Params = []): T | undefined {
  return all<T>(sql, params)[0];
}
export function run(sql: string, params: Params = []): void { db.run(sql, params as SqlValue[]); }

// Match node:sqlite's statement API used by the shared repository.
export function getDb() {
  return {
    exec: (sql: string) => db.run(sql),
    prepare: (sql: string) => ({
      all: (...params: Params) => all(sql, params),
      get: (...params: Params) => one(sql, params),
      run: (...params: Params) => run(sql, params),
    }),
  };
}

export function transaction<T>(fn: () => T): T {
  const nested = depth > 0;
  const name = `sp_${++sequence}`;
  db.run(nested ? `SAVEPOINT ${name}` : 'BEGIN');
  depth++;
  try {
    const result = fn();
    db.run(nested ? `RELEASE SAVEPOINT ${name}` : 'COMMIT');
    return result;
  } catch (error) {
    db.run(nested ? `ROLLBACK TO SAVEPOINT ${name}` : 'ROLLBACK');
    if (nested) db.run(`RELEASE SAVEPOINT ${name}`);
    throw error;
  } finally { depth--; }
}
