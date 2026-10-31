import { describe, expect, it } from 'vitest';
import {
  applyFilter,
  autoQuadrant,
  isDueToday,
  isDueWithin,
  isOverdue,
  matchesCondition,
  normalize,
  parseTags,
  searchTasks,
  sortTasks,
} from '../shared/filters';
import { makeTask } from './helpers';

const NOW = new Date(2026, 9, 30, 12, 0);

describe('filter conditions', () => {
  const task = makeTask({
    title: 'مراجعة التقرير المالي',
    notes: 'Need the Q4 numbers',
    priority: 5,
    tags: '["عمل","مالي"]',
    due_date: '2026-10-29T09:00:00',
    quadrant: 1,
    kanban_column: 'doing',
    project_id: 'p-work',
  });

  it('parses tags defensively', () => {
    expect(parseTags('["a","b"]')).toEqual(['a', 'b']);
    expect(parseTags('a, b')).toEqual(['a', 'b']);
    expect(parseTags('')).toEqual([]);
    expect(parseTags(null)).toEqual([]);
    expect(parseTags('{"x":1}')).toEqual([]);
  });

  it('matches text fields', () => {
    expect(matchesCondition(task, { field: 'title', op: 'contains', value: 'التقرير' })).toBe(true);
    expect(matchesCondition(task, { field: 'title', op: 'contains', value: 'zzz' })).toBe(false);
    expect(matchesCondition(task, { field: 'title', op: 'is_empty', value: '' })).toBe(false);
    expect(matchesCondition(task, { field: 'notes', op: 'contains', value: 'q4' })).toBe(true);
  });

  it('matches numeric, status and project fields', () => {
    expect(matchesCondition(task, { field: 'priority', op: 'equals', value: '5' })).toBe(true);
    expect(matchesCondition(task, { field: 'priority', op: 'gt', value: '3' })).toBe(true);
    expect(matchesCondition(task, { field: 'priority', op: 'lt', value: '3' })).toBe(false);
    expect(matchesCondition(task, { field: 'status', op: 'equals', value: 'open' })).toBe(true);
    expect(matchesCondition(task, { field: 'status', op: 'not_equals', value: 'completed' })).toBe(true);
    expect(matchesCondition(task, { field: 'project_id', op: 'equals', value: 'p-work' })).toBe(true);
    expect(matchesCondition(task, { field: 'project_id', op: 'not_equals', value: 'p-work' })).toBe(false);
  });

  it('matches tags, quadrants, columns and dates', () => {
    expect(matchesCondition(task, { field: 'tag', op: 'equals', value: 'عمل' })).toBe(true);
    expect(matchesCondition(task, { field: 'tag', op: 'not_empty', value: '' })).toBe(true);
    expect(matchesCondition(makeTask({ tags: '[]' }), { field: 'tag', op: 'is_empty', value: '' })).toBe(true);
    expect(matchesCondition(task, { field: 'quadrant', op: 'equals', value: '1' })).toBe(true);
    expect(matchesCondition(task, { field: 'quadrant', op: 'is_empty', value: '' })).toBe(false);
    expect(matchesCondition(task, { field: 'kanban_column', op: 'equals', value: 'doing' })).toBe(true);
    expect(matchesCondition(task, { field: 'due_date', op: 'before', value: '2026-10-30' })).toBe(true);
    expect(matchesCondition(task, { field: 'due_date', op: 'after', value: '2026-10-30' })).toBe(false);
    expect(matchesCondition(task, { field: 'due_date', op: 'equals', value: '2026-10-29' })).toBe(true);
    expect(matchesCondition(makeTask(), { field: 'due_date', op: 'is_empty', value: '' })).toBe(true);
    expect(matchesCondition(makeTask(), { field: 'due_date', op: 'before', value: '2026-10-30' })).toBe(false);
  });

  it('combines conditions with all/any', () => {
    const list = [
      makeTask({ title: 'A', priority: 5, due_date: '2026-10-30T09:00:00' }),
      makeTask({ title: 'B', priority: 1, due_date: '2026-10-30T09:00:00' }),
      makeTask({ title: 'C', priority: 5, due_date: null }),
    ];
    const all = applyFilter(list, {
      match: 'all',
      conditions: [
        { field: 'priority', op: 'equals', value: '5' },
        { field: 'due_date', op: 'not_empty', value: '' },
      ],
    });
    expect(all.map((t) => t.title)).toEqual(['A']);

    const any = applyFilter(list, {
      match: 'any',
      conditions: [
        { field: 'priority', op: 'equals', value: '1' },
        { field: 'title', op: 'equals', value: 'C' },
      ],
      sortBy: 'title',
    });
    expect(any.map((t) => t.title)).toEqual(['B', 'C']);

    expect(applyFilter(list, { match: 'all', conditions: [] })).toHaveLength(3);
  });
});

describe('sorting and search', () => {
  it('sorts by priority, created date, title and manual order', () => {
    const list = [
      makeTask({ title: 'ب', priority: 1, created_at: '2026-01-01T00:00:00', sort_order: 2 }),
      makeTask({ title: 'أ', priority: 5, created_at: '2026-02-01T00:00:00', sort_order: 1 }),
      makeTask({ title: 'ج', priority: 3, created_at: '2026-03-01T00:00:00', sort_order: 3 }),
    ];
    expect(sortTasks(list, 'priority').map((t) => t.title)).toEqual(['أ', 'ج', 'ب']);
    expect(sortTasks(list, 'created').map((t) => t.title)).toEqual(['ج', 'أ', 'ب']);
    expect(sortTasks(list, 'manual').map((t) => t.title)).toEqual(['أ', 'ب', 'ج']);
    expect(sortTasks(list, 'title').map((t) => t.title)).toEqual(['أ', 'ب', 'ج']);
    expect(sortTasks(list, 'due').map((t) => t.title)).toEqual(['أ', 'ج', 'ب']);
  });

  it('normalises Arabic diacritics and letter variants', () => {
    expect(normalize('  الأَحْمَد  ')).toBe('الاحمد');
    expect(normalize('مدرسة')).toBe('مدرسه');
    expect(normalize('على')).toBe('علي');
  });

  it('ranks title matches above notes and tags', () => {
    const tasks = [
      makeTask({ title: 'تقرير سنوي', notes: '', tags: '[]' }),
      makeTask({ title: 'مهمة', notes: 'اكتب تقرير', tags: '[]' }),
      makeTask({ title: 'مهمة أخرى', notes: '', tags: '["تقرير"]' }),
    ];
    const results = searchTasks(tasks, 'تقرير');
    expect(results[0].title).toBe('تقرير سنوي');
    expect(results).toHaveLength(3);
    expect(searchTasks(tasks, '')).toEqual([]);
  });

  it('searches by project name and normalised query', () => {
    const tasks = [makeTask({ title: 'مهمة', project_id: 'p1' })];
    expect(searchTasks(tasks, 'مهمه')).toHaveLength(1);
    expect(searchTasks(tasks, 'عمل', { p1: 'العمل' })).toHaveLength(1);
  });
});

describe('smart list helpers', () => {
  it('detects overdue, today and upcoming tasks', () => {
    const overdue = makeTask({ due_date: '2026-10-29T09:00:00' });
    const today = makeTask({ due_date: '2026-10-30T23:00:00' });
    const future = makeTask({ due_date: '2026-11-02T09:00:00' });
    expect(isOverdue(overdue, NOW)).toBe(true);
    expect(isOverdue(today, NOW)).toBe(false);
    expect(isOverdue(makeTask({ due_date: '2026-10-29T09:00:00', status: 'completed' }), NOW)).toBe(false);
    expect(isDueToday(today, NOW)).toBe(true);
    expect(isDueToday(makeTask(), NOW)).toBe(false);
    expect(isDueWithin(today, 3, NOW)).toBe(true);
    expect(isDueWithin(future, 2, NOW)).toBe(false);
    expect(isDueWithin(future, 3, NOW)).toBe(true);
    expect(isDueWithin(overdue, 5, NOW)).toBe(false);
  });

  it('classifies the Eisenhower matrix', () => {
    const urgentImportant = makeTask({ priority: 5, due_date: '2026-10-31T09:00:00' });
    const important = makeTask({ priority: 3, due_date: null });
    const urgent = makeTask({ priority: 0, due_date: '2026-10-31T09:00:00' });
    const neither = makeTask({ priority: 0, due_date: null });
    expect(autoQuadrant(urgentImportant, undefined, NOW)).toBe(1);
    expect(autoQuadrant(important, undefined, NOW)).toBe(2);
    expect(autoQuadrant(urgent, undefined, NOW)).toBe(3);
    expect(autoQuadrant(neither, undefined, NOW)).toBe(4);
  });
});
