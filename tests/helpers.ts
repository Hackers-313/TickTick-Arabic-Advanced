import type { FocusSession, Habit, HabitLog, Project, Task } from '../shared/types';

let seq = 0;
const nextId = () => `test-${++seq}`;

export function makeProject(patch: Partial<Project> = {}): Project {
  const id = patch.id ?? nextId();
  return {
    id,
    name: 'Project',
    color: '#4f7cff',
    icon: '📁',
    kind: 'list',
    is_inbox: 0,
    sort_order: 0,
    archived: 0,
    view_mode: 'list',
    kanban_columns: '[]',
    settings: '{}',
    ticktick_id: null,
    sync_status: 'local',
    created_at: '2026-01-01T09:00:00',
    updated_at: '2026-01-01T09:00:00',
    deleted_at: null,
    ...patch,
  };
}

export function makeTask(patch: Partial<Task> = {}): Task {
  const id = patch.id ?? nextId();
  return {
    id,
    project_id: 'p1',
    parent_id: null,
    title: 'Task',
    notes: '',
    priority: 0,
    status: 'open',
    due_date: null,
    start_date: null,
    end_date: null,
    all_day: 0,
    duration_min: null,
    tags: '[]',
    recurrence: null,
    recurrence_until: null,
    recurrence_count: null,
    completed_at: null,
    created_at: '2026-01-01T09:00:00',
    updated_at: '2026-01-01T09:00:00',
    deleted_at: null,
    sort_order: 0,
    kanban_column: null,
    quadrant: null,
    ticktick_id: null,
    etag: null,
    sync_status: 'local',
    last_synced_at: null,
    timezone: null,
    ...patch,
  };
}

export function makeHabit(patch: Partial<Habit> = {}): Habit {
  const id = patch.id ?? nextId();
  return {
    id,
    name: 'Habit',
    icon: '✅',
    color: '#4f7cff',
    frequency: 'daily',
    target_days: 7,
    weekdays: '[]',
    goal: 1,
    step: 1,
    unit: '',
    reminder_time: null,
    notes: '',
    archived: 0,
    sort_order: 0,
    created_at: '2026-01-01T09:00:00',
    updated_at: '2026-01-01T09:00:00',
    ...patch,
  };
}

export function makeLog(habitId: string, date: string, value = 1, done = 1): HabitLog {
  return {
    id: `log-${habitId}-${date}`,
    habit_id: habitId,
    date,
    value,
    done,
    note: '',
    created_at: `${date}T09:00:00`,
  };
}

export function makeSession(patch: Partial<FocusSession> = {}): FocusSession {
  return {
    id: patch.id ?? nextId(),
    task_id: null,
    mode: 'focus',
    started_at: '2026-01-01T09:00:00',
    ended_at: '2026-01-01T09:30:00',
    duration_sec: 1800,
    completed: 1,
    note: '',
    ...patch,
  };
}

/** Local ISO for a date offset from a fixed anchor, keeping noon to avoid DST edges. */
export function isoDaysAgo(daysAgo: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 12, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}
