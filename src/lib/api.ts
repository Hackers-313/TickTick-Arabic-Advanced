import type {
  AppInfo,
  Attachment,
  CalendarEvent,
  ChecklistItem,
  Countdown,
  FocusSession,
  Habit,
  HabitLog,
  LocalApiStatus,
  Project,
  Reminder,
  Settings,
  SmartFilter,
  StickyNote,
  SyncConflict,
  SyncLogEntry,
  Tag,
  Task,
  TaskTemplate,
  UndoState,
} from '../../shared/types';

export interface BackupInfo {
  name: string;
  path: string;
  size: number;
  mtime: string;
}

export interface Bootstrap {
  projects: Project[];
  tasks: Task[];
  checklist: ChecklistItem[];
  attachments: Attachment[];
  reminders: Reminder[];
  tags: Tag[];
  filters: SmartFilter[];
  templates: TaskTemplate[];
  habits: Habit[];
  habitLogs: HabitLog[];
  focusSessions: FocusSession[];
  countdowns: Countdown[];
  stickyNotes: StickyNote[];
  events: CalendarEvent[];
  settings: Settings;
  appInfo: AppInfo;
  syncLogs: SyncLogEntry[];
  conflicts: SyncConflict[];
  localApi: LocalApiStatus;
  undo: UndoState;
  counters: { completedToday: number; open: number; overdue: number };
  backups: BackupInfo[];
}

export async function invoke<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
  return (await window.api.invoke(method, ...args)) as T;
}
