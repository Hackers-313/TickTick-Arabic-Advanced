import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, openDatabase } from '../electron/main/db';
import * as repo from '../electron/main/repo';
import {
  clearSampleData,
  ensureInbox,
  exportAllJson,
  exportTasksCsv,
  importIcs,
  importJson,
  importTasksCsv,
  loadSampleData,
} from '../electron/main/dataService';

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tta-data-'));
  openDatabase(path.join(dir, 'test.db'));
  ensureInbox();
});

afterAll(() => {
  closeDatabase();
  fs.rmSync(dir, { recursive: true, force: true });
});

const CSV = [
  'title,notes,project,tags,priority,status,due_date',
  'مهمة مستوردة,ملاحظة,عمل,عاجل|مالي,5,open,2026-11-02T09:00:00',
  'مهمة ثانية,,عمل,,1,open,2026-11-03',
  'مهمة مستوردة,ملاحظة,عمل,عاجل|مالي,5,open,2026-11-02T09:00:00',
].join('\n');

describe('CSV import', () => {
  it('imports tasks, creates missing projects and skips duplicates', () => {
    const first = importTasksCsv(CSV);
    expect(first.added).toBe(2);
    expect(first.skipped).toBe(1);
    expect(first.errors).toEqual([]);

    const project = repo.listProjects().find((p) => p.name === 'عمل')!;
    expect(project).toBeTruthy();
    const imported = repo.listTasks().filter((t) => t.project_id === project.id);
    expect(imported).toHaveLength(2);
    expect(imported.find((t) => t.title === 'مهمة مستوردة')!.tags).toBe('["عاجل","مالي"]');

    const second = importTasksCsv(CSV);
    expect(second.added).toBe(0);
    expect(second.skipped).toBe(3);
  });

  it('exports the same tasks as CSV and reimports without duplication', () => {
    const csv = exportTasksCsv();
    expect(csv).toContain('مهمة مستوردة');
    const before = repo.listTasks().length;
    const summary = importTasksCsv(csv);
    expect(summary.added).toBe(0);
    expect(repo.listTasks().length).toBe(before);
  });
});

describe('ICS import', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:import-1@test',
    'SUMMARY:عيد ميلاد',
    'DTSTART;VALUE=DATE:20261225',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:import-1@test',
    'SUMMARY:عيد ميلاد مكرر',
    'DTSTART;VALUE=DATE:20261225',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  it('imports calendar events and skips duplicate UIDs', () => {
    const first = importIcs(ics, false);
    expect(first.added).toBe(1);
    expect(first.skipped).toBe(1);
    expect(repo.listEvents().some((e) => e.title === 'عيد ميلاد')).toBe(true);

    const second = importIcs(ics, false);
    expect(second.added).toBe(0);
    expect(second.skipped).toBe(2);
  });

  it('imports ICS events as tasks and skips exact duplicates', () => {
    const text = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:اجتماع فريق',
      'DTSTART:20261105T100000',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const first = importIcs(text, true);
    expect(first.added).toBe(1);
    const second = importIcs(text, true);
    expect(second.added).toBe(0);
    expect(second.skipped).toBe(1);
    const task = repo.listTasks().find((t) => t.title === 'اجتماع فريق')!;
    expect(task.due_date).toBe('2026-11-05T10:00:00');
  });
});

describe('JSON export and import', () => {
  it('exports a complete bundle', () => {
    const json = JSON.parse(exportAllJson());
    expect(json.app).toBe('TickTick Arabic Advanced');
    expect(Array.isArray(json.data.tasks)).toBe(true);
    expect(Array.isArray(json.data.projects)).toBe(true);
    expect(Array.isArray(json.data.habits)).toBe(true);
  });

  it('merges without duplicating existing rows', () => {
    const json = exportAllJson();
    const summary = importJson(json, 'merge');
    expect(summary.added).toBe(0);
    expect(summary.skipped).toBeGreaterThan(0);
  });

  it('replaces the dataset and keeps an inbox', () => {
    const json = exportAllJson();
    const before = repo.listTasks().length;
    const summary = importJson(json, 'replace');
    expect(summary.errors).toEqual([]);
    expect(repo.listTasks().length).toBe(before);
    expect(repo.listProjects().some((p) => p.is_inbox === 1)).toBe(true);
  });
});

describe('sample data', () => {
  it('loads sample data idempotently and clears it', () => {
    loadSampleData();
    const tasks = repo.listTasks().filter((t) => t.id.startsWith('sample-')).length;
    expect(tasks).toBeGreaterThan(0);
    const projects = repo.listProjects().filter((p) => p.id.startsWith('sample-')).length;
    expect(projects).toBeGreaterThan(0);

    loadSampleData();
    expect(repo.listTasks().filter((t) => t.id.startsWith('sample-')).length).toBe(tasks);

    clearSampleData();
    expect(repo.listTasks().filter((t) => t.id.startsWith('sample-'))).toHaveLength(0);
    expect(repo.listProjects().filter((p) => p.id.startsWith('sample-'))).toHaveLength(0);
  });
});
