import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, openDatabase } from '../electron/main/db';
import * as repo from '../electron/main/repo';
import { ensureInbox } from '../electron/main/dataService';

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tta-repo-'));
  openDatabase(path.join(dir, 'test.db'));
  ensureInbox();
});

afterAll(() => {
  closeDatabase();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('projects and tasks', () => {
  it('creates an inbox and project defaults', () => {
    const projects = repo.listProjects();
    const inbox = projects.find((p) => p.is_inbox === 1)!;
    expect(inbox).toBeTruthy();
    expect(inbox.name).toBe('الوارد');

    const project = repo.createProject({ name: '  عمل  ', color: '#123456' });
    expect(project.name).toBe('عمل');
    expect(project.color).toBe('#123456');
    expect(JSON.parse(project.kanban_columns).length).toBe(4);
  });

  it('creates, reads and updates tasks', () => {
    const project = repo.createProject({ name: 'مشروع' });
    const task = repo.createTask({ title: '  مهمة أولى  ', project_id: project.id, priority: 5 });
    expect(task.title).toBe('مهمة أولى');
    expect(task.status).toBe('open');
    expect(task.project_id).toBe(project.id);

    const updated = repo.updateTask(task.id, { notes: 'تفاصيل', due_date: '2026-11-02T09:00:00' })!;
    expect(updated.notes).toBe('تفاصيل');
    expect(updated.due_date).toBe('2026-11-02T09:00:00');
    expect(repo.getTask(task.id)!.notes).toBe('تفاصيل');
    expect(repo.updateTask('missing', { title: 'x' })).toBeNull();
  });

  it('soft-deletes, restores and hard-deletes tasks', () => {
    const task = repo.createTask({ title: 'للحذف' });
    repo.deleteTask(task.id);
    expect(repo.getTask(task.id)!.deleted_at).toBeTruthy();
    expect(repo.listTasks().some((t) => t.id === task.id)).toBe(false);
    expect(repo.listTasks(true).some((t) => t.id === task.id)).toBe(true);

    repo.restoreTask(task.id);
    expect(repo.getTask(task.id)!.deleted_at).toBeNull();

    repo.deleteTask(task.id, true);
    expect(repo.getTask(task.id)).toBeNull();
  });

  it('moves, duplicates and reorders tasks', () => {
    const a = repo.createProject({ name: 'أ' });
    const b = repo.createProject({ name: 'ب' });
    const task = repo.createTask({ title: 'أصلية', project_id: a.id });
    const moved = repo.moveTask(task.id, b.id, 'doing')!;
    expect(moved.project_id).toBe(b.id);
    expect(moved.kanban_column).toBe('doing');

    const copy = repo.duplicateTask(task.id)!;
    expect(copy.id).not.toBe(task.id);
    expect(copy.title).toContain('(نسخة)');
    expect(copy.status).toBe('open');

    repo.reorderTasks([
      { id: task.id, sort_order: 10 },
      { id: copy.id, sort_order: 20 },
    ]);
    expect(repo.getTask(task.id)!.sort_order).toBe(10);
    expect(repo.getTask(copy.id)!.sort_order).toBe(20);
  });

  it('completes a task and creates the next recurring occurrence', () => {
    const project = repo.createProject({ name: 'تكرار' });
    const task = repo.createTask({
      title: 'تمرين',
      project_id: project.id,
      due_date: '2026-10-30T09:00:00',
      start_date: '2026-10-30T08:30:00',
      recurrence: 'RRULE:FREQ=DAILY',
    });
    const checklist = repo.addChecklistItem(task.id, 'خطوة');

    const result = repo.setTaskCompleted(task.id, true)!;
    expect(result.task.status).toBe('completed');
    expect(result.task.completed_at).toBeTruthy();
    expect(result.next).toBeTruthy();
    expect(result.next!.status).toBe('open');
    expect(result.next!.due_date).toBe('2026-10-31T09:00:00');
    expect(result.next!.start_date).toBe('2026-10-31T08:30:00');
    expect(result.next!.id).not.toBe(task.id);
    expect(result.next!.completed_at).toBeNull();

    const nextChecklist = repo.listChecklist(result.next!.id);
    expect(nextChecklist).toHaveLength(1);
    expect(nextChecklist[0].title).toBe('خطوة');
    expect(nextChecklist[0].done).toBe(0);

    // un-completing reopens without creating another occurrence
    const reopened = repo.setTaskCompleted(task.id, false)!;
    expect(reopened.task.status).toBe('open');
    expect(reopened.next).toBeNull();

    expect(repo.setTaskCompleted('missing', true)).toBeNull();
    expect(repo.listChecklist(task.id)[0].id).toBe(checklist.id);
  });

  it('respects recurrence_until when rolling forward', () => {
    const task = repo.createTask({
      title: 'محدودة',
      due_date: '2026-10-30T09:00:00',
      recurrence: 'RRULE:FREQ=DAILY',
      recurrence_until: '2026-10-30T23:59:59',
    });
    const result = repo.setTaskCompleted(task.id, true)!;
    expect(result.next).toBeNull();
  });

  it('completes child tasks with their parent', () => {
    const parent = repo.createTask({ title: 'أب' });
    const child = repo.createTask({ title: 'ابن', parent_id: parent.id });
    repo.setTaskCompleted(parent.id, true);
    expect(repo.getTask(child.id)!.status).toBe('completed');
  });
});

describe('checklist, tags, filters and templates', () => {
  it('manages checklist items', () => {
    const task = repo.createTask({ title: 'قائمة' });
    const a = repo.addChecklistItem(task.id, 'أول');
    const b = repo.addChecklistItem(task.id, 'ثاني');
    expect(a.sort_order).toBeLessThan(b.sort_order);
    repo.toggleChecklistItem(a.id, true);
    expect(repo.listChecklist(task.id)[0].done).toBe(1);
    repo.deleteChecklistItem(b.id);
    expect(repo.listChecklist(task.id)).toHaveLength(1);
  });

  it('deduplicates tags by name', () => {
    const a = repo.createTag('عاجل', '#f00');
    const b = repo.createTag('عاجل', '#0f0');
    expect(b.id).toBe(a.id);
    expect(b.color).toBe('#f00');
    repo.updateTag(a.id, { name: 'مستعجل', color: '#00f' });
    expect(repo.listTags().find((t) => t.id === a.id)!.name).toBe('مستعجل');
    repo.deleteTag(a.id);
    expect(repo.listTags().find((t) => t.id === a.id)).toBeUndefined();
  });

  it('creates and updates smart filters from objects', () => {
    const filter = repo.createFilter({
      name: 'عالية',
      icon: '🔥',
      rule: { match: 'all', conditions: [{ field: 'priority', op: 'equals', value: '5' }], sortBy: 'priority' },
    });
    expect(JSON.parse(filter.rule).sortBy).toBe('priority');
    repo.updateFilter(filter.id, { name: 'عالية جدًا' });
    expect(repo.listFilters().find((f) => f.id === filter.id)!.name).toBe('عالية جدًا');
    repo.deleteFilter(filter.id);
    expect(repo.listFilters().find((f) => f.id === filter.id)).toBeUndefined();
  });

  it('stores templates', () => {
    const t = repo.createTemplate('قالب', { title: 'مهمة', priority: 3 });
    expect(JSON.parse(t.payload).priority).toBe(3);
    repo.deleteTemplate(t.id);
    expect(repo.listTemplates()).toHaveLength(0);
  });
});

describe('habits, focus and countdowns', () => {
  it('upserts habit check-ins for a date', () => {
    const habit = repo.createHabit({ name: 'قراءة', goal: 10, unit: 'صفحة' });
    const first = repo.checkInHabit(habit.id, '2026-10-30T15:00:00', 4);
    expect(first.date).toBe('2026-10-30');
    expect(first.done).toBe(0);

    const second = repo.checkInHabit(habit.id, '2026-10-30', 10, 'أكملت');
    expect(second.id).toBe(first.id);
    expect(second.value).toBe(10);
    expect(second.done).toBe(1);
    expect(second.note).toBe('أكملت');
    expect(repo.listHabitLogs(habit.id)).toHaveLength(1);

    repo.deleteHabitLog(habit.id, '2026-10-30');
    expect(repo.listHabitLogs(habit.id)).toHaveLength(0);
  });

  it('saves focus sessions and filters by date', () => {
    const s = repo.saveFocusSession({
      task_id: null,
      mode: 'focus',
      started_at: '2026-10-30T09:00:00',
      ended_at: '2026-10-30T09:25:00',
      duration_sec: 1500,
      completed: 1,
      note: '',
    });
    expect(s.id).toBeTruthy();
    expect(repo.listFocusSessions('2026-10-30T00:00:00', '2026-10-30T23:59:59')).toHaveLength(1);
    repo.deleteFocusSession(s.id);
    expect(repo.listFocusSessions()).toHaveLength(0);
  });

  it('computes the next yearly countdown occurrence', () => {
    const now = new Date(2026, 9, 30);
    expect(repo.nextCountdownOccurrence('2026-01-01', 1, now)).toBe('2027-01-01');
    expect(repo.nextCountdownOccurrence('2026-12-25', 1, now)).toBe('2026-12-25');
    expect(repo.nextCountdownOccurrence('2020-01-01', 0, now)).toBe('2020-01-01');
  });
});

describe('reminders and settings', () => {
  it('replaces relative reminders based on the due date', () => {
    const task = repo.createTask({ title: 'تذكير', due_date: '2026-11-02T09:00:00' });
    const list = repo.replaceReminders('task', task.id, [
      { kind: 'relative', offset_min: 30, label: 'قبل 30 دقيقة' },
      { kind: 'absolute', trigger_at: '2026-11-01T09:00:00' },
    ]);
    expect(list).toHaveLength(2);
    const relative = list.find((r) => r.kind === 'relative')!;
    expect(relative.trigger_at).toBe('2026-11-02T08:30:00');

    const due = repo.dueReminders('2026-11-02T09:00:00');
    expect(due.some((r) => r.id === relative.id)).toBe(true);

    repo.snoozeReminder(relative.id, 10);
    expect(repo.listReminders('task', task.id).find((r) => r.id === relative.id)!.snoozed_until).toBeTruthy();

    repo.markReminderFired(relative.id, '2026-11-03T08:30:00');
    expect(repo.listReminders('task', task.id).find((r) => r.id === relative.id)!.trigger_at).toBe('2026-11-03T08:30:00');

    repo.disableReminder(relative.id);
    expect(repo.listReminders('task', task.id).find((r) => r.id === relative.id)!.enabled).toBe(0);

    repo.replaceReminders('task', task.id, []);
    expect(repo.listReminders('task', task.id)).toHaveLength(0);
  });

  it('stores JSON settings and reports counts', () => {
    repo.setSetting('language', 'ar');
    repo.setSetting('nested', { a: 1 });
    expect(repo.getSetting('language', 'en')).toBe('ar');
    expect(repo.getSetting('nested', null)).toEqual({ a: 1 });
    expect(repo.getSetting('missing', 'fallback')).toBe('fallback');
    expect(repo.allSettings().language).toBe('ar');
    expect(repo.counts().tasks).toBeGreaterThan(0);
  });
});

describe('undo and redo', () => {
  it('undoes and redoes a task creation', () => {
    const task = repo.createTask({ title: 'للتراجع' });
    expect(repo.undoState().canUndo).toBe(true);
    expect(repo.undoState().canRedo).toBe(false);

    const undone = repo.undo();
    expect(undone.ok).toBe(true);
    expect(repo.getTask(task.id)).toBeNull();
    expect(repo.undoState().canRedo).toBe(true);

    const redone = repo.redo();
    expect(redone.ok).toBe(true);
    expect(repo.getTask(task.id)!.title).toBe('للتراجع');
  });

  it('undoes an update and restores previous values', () => {
    const task = repo.createTask({ title: 'قديم' });
    repo.updateTask(task.id, { title: 'جديد' });
    repo.undo();
    expect(repo.getTask(task.id)!.title).toBe('قديم');
  });

  it('clears redo history after a new edit', () => {
    const task = repo.createTask({ title: 'أ' });
    repo.undo();
    expect(repo.undoState().canRedo).toBe(true);
    repo.createTask({ title: 'ب' });
    expect(repo.undoState().canRedo).toBe(false);
    expect(repo.getTask(task.id)).toBeNull();
  });

  it('reports nothing to undo on an empty stack', () => {
    // Drain the stack.
    for (let i = 0; i < 100; i++) {
      if (!repo.undo().ok) break;
    }
    expect(repo.undoState().canUndo).toBe(false);
    expect(repo.undo().ok).toBe(false);
    // Undoing everything leaves the redo stack populated by design.
    expect(repo.undoState().canRedo).toBe(true);
    expect(repo.redo().ok).toBe(true);
  });
});

describe('counters', () => {
  it('returns today counters', () => {
    const counters = repo.todayCounters();
    expect(counters.open).toBeGreaterThanOrEqual(0);
    expect(counters.overdue).toBeGreaterThanOrEqual(0);
    expect(counters.completedToday).toBeGreaterThanOrEqual(0);
  });
});
