// Shared domain types. Used by the Electron main process, the preload bridge and the renderer.

export type Priority = 0 | 1 | 3 | 5; // none | low | medium | high (TickTick-compatible scale)
export type TaskStatus = 'open' | 'completed' | 'abandoned';
export type SyncStatus = 'local' | 'pending' | 'synced' | 'conflict';

export interface Project {
  id: string;
  name: string;
  color: string;
  icon: string;
  kind: 'list' | 'inbox';
  is_inbox: number;
  sort_order: number;
  archived: number;
  view_mode: 'list' | 'kanban' | 'timeline' | 'calendar';
  kanban_columns: string; // JSON: {id,title,color}[]
  settings: string; // JSON project-level settings
  ticktick_id: string | null;
  sync_status: SyncStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Task {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  notes: string;
  priority: Priority;
  status: TaskStatus;
  due_date: string | null;
  start_date: string | null;
  end_date: string | null;
  all_day: number;
  duration_min: number | null;
  tags: string; // JSON string[]
  recurrence: string | null; // RRULE subset
  recurrence_until: string | null;
  recurrence_count: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sort_order: number;
  kanban_column: string | null;
  quadrant: number | null; // 1..4 Eisenhower, null = unclassified
  ticktick_id: string | null;
  etag: string | null;
  sync_status: SyncStatus;
  last_synced_at: string | null;
  timezone: string | null;
}

export interface ChecklistItem {
  id: string;
  task_id: string;
  title: string;
  done: number;
  sort_order: number;
}

export interface Attachment {
  id: string;
  task_id: string;
  name: string;
  path: string;
  size: number;
  mime: string;
  created_at: string;
}

export interface Reminder {
  id: string;
  entity_type: 'task' | 'habit' | 'countdown';
  entity_id: string;
  trigger_at: string; // next fire time (naive local ISO)
  kind: 'absolute' | 'relative' | 'recurring' | 'constant';
  repeat_rule: string | null; // RRULE for recurring reminders
  offset_min: number | null; // minutes before due for relative reminders
  snoozed_until: string | null;
  fired_at: string | null;
  enabled: number;
  label: string;
  created_at: string;
}

export interface Habit {
  id: string;
  name: string;
  icon: string;
  color: string;
  frequency: 'daily' | 'weekly' | 'custom';
  target_days: number; // per week for weekly/custom
  weekdays: string; // JSON number[] for custom
  goal: number;
  step: number;
  unit: string;
  reminder_time: string | null;
  notes: string;
  archived: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface HabitLog {
  id: string;
  habit_id: string;
  date: string; // YYYY-MM-DD
  value: number;
  done: number;
  note: string;
  created_at: string;
}

export interface FocusSession {
  id: string;
  task_id: string | null;
  mode: 'focus' | 'short_break' | 'long_break' | 'stopwatch';
  started_at: string;
  ended_at: string;
  duration_sec: number;
  completed: number;
  note: string;
}

export interface Countdown {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  category: string;
  color: string;
  icon: string;
  repeat_yearly: number;
  remind_days_before: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface StickyNote {
  id: string;
  content: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  always_on_top: number;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string | null;
  all_day: number;
  color: string;
  project_id: string | null;
  notes: string;
  location: string;
  recurrence: string | null;
  source: 'local' | 'ics';
  external_uid: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface SmartFilter {
  id: string;
  name: string;
  icon: string;
  rule: string; // JSON FilterRule
  sort_order: number;
  created_at: string;
}

export interface FilterRule {
  match: 'all' | 'any';
  conditions: FilterCondition[];
  sortBy?: 'due' | 'priority' | 'created' | 'title';
}

export interface FilterCondition {
  field:
    | 'title'
    | 'notes'
    | 'priority'
    | 'status'
    | 'project_id'
    | 'tag'
    | 'due_date'
    | 'quadrant'
    | 'kanban_column';
  op: 'contains' | 'equals' | 'not_equals' | 'gt' | 'lt' | 'is_empty' | 'not_empty' | 'in' | 'before' | 'after';
  value: string;
}

export interface TaskTemplate {
  id: string;
  name: string;
  payload: string; // JSON partial task + checklist
  created_at: string;
}

export interface Settings {
  language: 'ar' | 'en';
  direction: 'rtl' | 'ltr';
  theme: string;
  accent: string;
  week_start: number;
  hour12: number;
  first_day_of_week: number;
  pomodoro: {
    focus_min: number;
    short_break_min: number;
    long_break_min: number;
    long_break_every: number;
    auto_start_breaks: number;
    auto_start_focus: number;
    sound: number;
    daily_goal_min: number;
  };
  notifications: {
    enabled: number;
    sound: number;
    constant_default: number;
    snooze_min: number;
  };
  sync: SyncSettings;
  sidebar_collapsed: number;
  dense_mode: number;
  show_week_numbers: number;
  local_api: { enabled: number; port: number; token: string };
  last_backup_at: string | null;
}

export interface SyncSettings {
  enabled: number;
  direction: 'inbound' | 'two-way';
  interval_min: number;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  scopes: string;
  project_ids: string[] | null; // null = all
  last_sync_at: string | null;
  last_status: 'idle' | 'ok' | 'error' | 'running';
  last_error: string | null;
  account: { name: string; email: string; userId: string } | null;
  delete_remote_enabled: number;
}

export interface SyncLogEntry {
  id: string;
  started_at: string;
  finished_at: string | null;
  direction: string;
  status: 'ok' | 'error' | 'partial';
  added: number;
  updated: number;
  deleted: number;
  conflicts: number;
  message: string;
}

export interface SyncConflict {
  id: string;
  task_id: string;
  local_json: string;
  remote_json: string;
  created_at: string;
  resolved: number;
  resolution: string | null;
}

export interface StatsSnapshot {
  completedToday: number;
  completedWeek: number;
  completedMonth: number;
  overdue: number;
  open: number;
  completionRate: number;
  focusMinutesToday: number;
  focusMinutesWeek: number;
  focusMinutesMonth: number;
  habitsDoneToday: number;
  habitsTotal: number;
  daily: { date: string; completed: number; created: number; focus: number }[];
  projects: { id: string; name: string; color: string; total: number; completed: number; overdue: number }[];
  habitAdherence: { id: string; name: string; color: string; adherence: number; streak: number }[];
  comparison: { current: number; previous: number; delta: number };
}

export interface AppInfo {
  version: string;
  dbPath: string;
  userData: string;
  platform: string;
  electron: string;
  node: string;
  schemaVersion: number;
}

export interface UndoState {
  canUndo: boolean;
  canRedo: boolean;
  label: string | null;
}

export interface LocalApiStatus {
  running: boolean;
  port: number;
  token: string;
  url: string;
}
