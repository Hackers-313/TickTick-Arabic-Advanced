import { all, getDb, one, run, transaction } from './db';
import type {
  Attachment,
  CalendarEvent,
  ChecklistItem,
  Countdown,
  FilterRule,
  FocusSession,
  Habit,
  HabitLog,
  Project,
  Reminder,
  SmartFilter,
  StickyNote,
  Tag,
  Task,
  TaskTemplate,
} from '../../shared/types';
import { addDays, addMinutes, parseLocal, toDateKey, toLocalISO, todayKey } from '../../shared/date';
import { nextOccurrence } from '../../shared/recurrence';

const uid = () => crypto.randomUUID();
const nowISO = () => toLocalISO(new Date());

// ------------------------------------------------------------------ undo

type UndoOp = { table: string; action: 'insert' | 'update' | 'delete'; data: Record<string, unknown> };

const UNDO_TABLES = new Set([
  'projects',
  'tasks',
  'checklist_items',
  'attachments',
  'reminders',
  'tags',
  'filters',
  'task_templates',
  'habits',
  'habit_logs',
  'focus_sessions',
  'countdowns',
  'sticky_notes',
  'calendar_events',
]);

function applyOps(ops: UndoOp[]): void {
  const db = getDb();
  for (const op of ops) {
    if (!UNDO_TABLES.has(op.table)) throw new Error(`Undo target not allowed: ${op.table}`);
    if (op.action === 'insert') {
      const keys = Object.keys(op.data);
      const sql = `INSERT OR REPLACE INTO ${op.table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
      db.prepare(sql).run(...(keys.map((k) => (op.data[k] ?? null) as string | number | null)));
    } else if (op.action === 'update') {
      const keys = Object.keys(op.data).filter((k) => k !== 'id');
      const sql = `UPDATE ${op.table} SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`;
      db.prepare(sql).run(...(keys.map((k) => (op.data[k] ?? null) as string | number | null)), String(op.data.id));
    } else {
      db.prepare(`DELETE FROM ${op.table} WHERE id=?`).run(String(op.data.id));
    }
  }
}

interface RedoEntry {
  label: string;
  undo: UndoOp[];
  redo: UndoOp[];
}

// Redo lives in memory for the current session. It is intentionally cleared whenever a
// new edit is recorded, which mirrors the behaviour of familiar desktop apps.
let redoStack: RedoEntry[] = [];

export function pushUndo(label: string, undo: UndoOp[], redo: UndoOp[]): void {
  redoStack = [];
  run('INSERT INTO undo_log (label, undo_json, redo_json, created_at) VALUES (?,?,?,?)', [
    label,
    JSON.stringify(undo),
    JSON.stringify(redo),
    nowISO(),
  ]);
  run('DELETE FROM undo_log WHERE id NOT IN (SELECT id FROM undo_log ORDER BY id DESC LIMIT 60)');
}

export function undo(): { ok: boolean; label?: string } {
  const row = one<{ id: number; label: string; undo_json: string; redo_json: string }>(
    'SELECT id,label,undo_json,redo_json FROM undo_log ORDER BY id DESC LIMIT 1',
  );
  if (!row) return { ok: false };
  const undoOps = JSON.parse(row.undo_json) as UndoOp[];
  const redoOps = JSON.parse(row.redo_json || '[]') as UndoOp[];
  transaction(() => {
    applyOps(undoOps);
    run('DELETE FROM undo_log WHERE id=?', [row.id]);
  });
  redoStack.push({ label: row.label, undo: undoOps, redo: redoOps });
  return { ok: true, label: row.label };
}

export function redo(): { ok: boolean; label?: string } {
  const entry = redoStack.pop();
  if (!entry) return { ok: false };
  transaction(() => {
    applyOps(entry.redo);
    run('INSERT INTO undo_log (label, undo_json, redo_json, created_at) VALUES (?,?,?,?)', [
      entry.label,
      JSON.stringify(entry.undo),
      JSON.stringify(entry.redo),
      nowISO(),
    ]);
  });
  return { ok: true, label: entry.label };
}

export function undoState(): { canUndo: boolean; canRedo: boolean; label: string | null } {
  const row = one<{ label: string }>('SELECT label FROM undo_log ORDER BY id DESC LIMIT 1');
  return { canUndo: !!row, canRedo: redoStack.length > 0, label: row?.label ?? null };
}

// ------------------------------------------------------------------ projects

export function listProjects(): Project[] {
  return all<Project>('SELECT * FROM projects ORDER BY is_inbox DESC, sort_order ASC');
}

export function createProject(input: Partial<Project>): Project {
  const ts = nowISO();
  const project: Project = {
    id: input.id ?? uid(),
    name: (input.name ?? '').trim() || 'مشروع جديد',
    color: input.color ?? '#4f7cff',
    icon: input.icon ?? '📁',
    kind: input.kind ?? 'list',
    is_inbox: input.is_inbox ?? 0,
    sort_order: input.sort_order ?? nextSort('projects'),
    archived: 0,
    view_mode: input.view_mode ?? 'list',
    kanban_columns: input.kanban_columns ?? JSON.stringify(defaultColumns()),
    settings: input.settings ?? '{}',
    ticktick_id: input.ticktick_id ?? null,
    sync_status: input.sync_status ?? 'local',
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  };
  run(
    `INSERT INTO projects (id,name,color,icon,kind,is_inbox,sort_order,archived,view_mode,kanban_columns,settings,ticktick_id,sync_status,created_at,updated_at,deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      project.id,
      project.name,
      project.color,
      project.icon,
      project.kind,
      project.is_inbox,
      project.sort_order,
      project.archived,
      project.view_mode,
      project.kanban_columns,
      project.settings,
      project.ticktick_id,
      project.sync_status,
      project.created_at,
      project.updated_at,
      null,
    ],
  );
  pushUndo('إنشاء مشروع', [{ table: 'projects', action: 'delete', data: { id: project.id } }], [
    { table: 'projects', action: 'insert', data: project as unknown as Record<string, unknown> },
  ]);
  return project;
}

export function defaultColumns(): { id: string; title: string; color: string }[] {
  return [
    { id: 'todo', title: 'قائمة الانتظار', color: '#8892a6' },
    { id: 'doing', title: 'قيد التنفيذ', color: '#4f7cff' },
    { id: 'review', title: 'مراجعة', color: '#ffb020' },
    { id: 'done', title: 'مكتملة', color: '#2f9e6e' },
  ];
}

export function updateProject(id: string, patch: Partial<Project>): Project | null {
  const before = one<Project>('SELECT * FROM projects WHERE id=?', [id]);
  if (!before) return null;
  const fields = ['name', 'color', 'icon', 'sort_order', 'archived', 'view_mode', 'kanban_columns', 'settings', 'deleted_at', 'sync_status', 'ticktick_id'];
  const merged: Project = { ...before, ...patch, updated_at: nowISO() };
  run(
    `UPDATE projects SET ${fields.map((f) => `${f}=?`).join(',')}, updated_at=? WHERE id=?`,
    [...fields.map((f) => (merged as unknown as Record<string, unknown>)[f] as string | number | null), merged.updated_at, id],
  );
  pushUndo('تعديل مشروع', [{ table: 'projects', action: 'update', data: before as unknown as Record<string, unknown> }], [
    { table: 'projects', action: 'update', data: merged as unknown as Record<string, unknown> },
  ]);
  return merged;
}

export function deleteProject(id: string): void {
  const before = one<Project>('SELECT * FROM projects WHERE id=?', [id]);
  if (!before || before.is_inbox) return;
  const tasks = all<Task>('SELECT * FROM tasks WHERE project_id=? AND deleted_at IS NULL', [id]);
  transaction(() => {
    run('UPDATE projects SET deleted_at=?, archived=1 WHERE id=?', [nowISO(), id]);
    for (const t of tasks) run('UPDATE tasks SET deleted_at=? WHERE id=?', [nowISO(), t.id]);
    run('UPDATE reminders SET enabled=0 WHERE entity_type=? AND entity_id IN (SELECT id FROM tasks WHERE project_id=?)', ['task', id]);
  });
  pushUndo(
    'حذف مشروع',
    [
      { table: 'projects', action: 'update', data: { id, deleted_at: null, archived: before.archived } },
      ...tasks.map((t): UndoOp => ({ table: 'tasks', action: 'update', data: { id: t.id, deleted_at: null } })),
    ],
    [{ table: 'projects', action: 'update', data: { id, deleted_at: nowISO(), archived: 1 } }],
  );
}

export function purgeProject(id: string): void {
  const project = one<Project>('SELECT * FROM projects WHERE id=?', [id]);
  if (!project || project.is_inbox) return;
  transaction(() => {
    const taskIds = all<{ id: string }>('SELECT id FROM tasks WHERE project_id=?', [id]).map((r) => r.id);
    for (const tid of taskIds) {
      run('DELETE FROM checklist_items WHERE task_id=?', [tid]);
      run('DELETE FROM attachments WHERE task_id=?', [tid]);
      run('DELETE FROM reminders WHERE entity_type=? AND entity_id=?', ['task', tid]);
    }
    run('DELETE FROM tasks WHERE project_id=?', [id]);
    run('DELETE FROM projects WHERE id=?', [id]);
  });
}

// ------------------------------------------------------------------ tasks

export function listTasks(includeDeleted = false): Task[] {
  return all<Task>(
    `SELECT * FROM tasks ${includeDeleted ? '' : 'WHERE deleted_at IS NULL'} ORDER BY sort_order ASC`,
  );
}

export function getTask(id: string): Task | null {
  return one<Task>('SELECT * FROM tasks WHERE id=?', [id]) ?? null;
}

const TASK_FIELDS = [
  'project_id',
  'parent_id',
  'title',
  'notes',
  'priority',
  'status',
  'due_date',
  'start_date',
  'end_date',
  'all_day',
  'duration_min',
  'tags',
  'recurrence',
  'recurrence_until',
  'recurrence_count',
  'completed_at',
  'sort_order',
  'kanban_column',
  'quadrant',
  'timezone',
  'deleted_at',
  'ticktick_id',
  'etag',
  'sync_status',
  'last_synced_at',
] as const;

export function createTask(input: Partial<Task> & { title: string }): Task {
  const ts = nowISO();
  const inbox = one<Project>('SELECT * FROM projects WHERE is_inbox=1 LIMIT 1');
  const projectId = input.project_id || inbox?.id || listProjects()[0]?.id;
  if (!projectId) throw new Error('No project available');
  const task: Task = {
    id: input.id ?? uid(),
    project_id: projectId,
    parent_id: input.parent_id ?? null,
    title: input.title.trim(),
    notes: input.notes ?? '',
    priority: (input.priority ?? 0) as Task['priority'],
    status: input.status ?? 'open',
    due_date: input.due_date ?? null,
    start_date: input.start_date ?? null,
    end_date: input.end_date ?? null,
    all_day: input.all_day ?? 0,
    duration_min: input.duration_min ?? null,
    tags: input.tags ?? '[]',
    recurrence: input.recurrence ?? null,
    recurrence_until: input.recurrence_until ?? null,
    recurrence_count: input.recurrence_count ?? null,
    completed_at: input.completed_at ?? null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
    sort_order: input.sort_order ?? nextSort('tasks'),
    kanban_column: input.kanban_column ?? null,
    quadrant: input.quadrant ?? null,
    ticktick_id: input.ticktick_id ?? null,
    etag: input.etag ?? null,
    sync_status: input.sync_status ?? 'local',
    last_synced_at: null,
    timezone: input.timezone ?? null,
  };
  run(
    `INSERT INTO tasks (${TASK_FIELDS.join(',')},id,created_at,updated_at) VALUES (${TASK_FIELDS.map(() => '?').join(',')},?,?,?)`,
    [
      ...TASK_FIELDS.map((f) => task[f] as string | number | null),
      task.id,
      task.created_at,
      task.updated_at,
    ],
  );
  pushUndo('إنشاء مهمة', [{ table: 'tasks', action: 'delete', data: { id: task.id } }], [
    { table: 'tasks', action: 'insert', data: task as unknown as Record<string, unknown> },
  ]);
  return task;
}

export function updateTask(id: string, patch: Partial<Task>): Task | null {
  const before = getTask(id);
  if (!before) return null;
  // A local edit to a task that exists on the server becomes "pending" until it is pushed.
  // Sync itself passes sync_status explicitly, so remote writes are not marked pending.
  const nextSyncStatus = patch.sync_status ?? (before.ticktick_id ? 'pending' : before.sync_status);
  const merged: Task = { ...before, ...patch, id, sync_status: nextSyncStatus, updated_at: nowISO() };
  const fields = [...TASK_FIELDS];
  run(
    `UPDATE tasks SET ${fields.map((f) => `${f}=?`).join(',')}, updated_at=? WHERE id=?`,
    [...fields.map((f) => merged[f] as string | number | null), merged.updated_at, id],
  );
  pushUndo('تعديل مهمة', [{ table: 'tasks', action: 'update', data: before as unknown as Record<string, unknown> }], [
    { table: 'tasks', action: 'update', data: merged as unknown as Record<string, unknown> },
  ]);
  return merged;
}

export interface CompleteResult {
  task: Task;
  next: Task | null;
}

export function setTaskCompleted(id: string, completed: boolean): CompleteResult | null {
  const task = getTask(id);
  if (!task) return null;
  if (!completed) {
    const updated = updateTask(id, { status: 'open', completed_at: null });
    return updated ? { task: updated, next: null } : null;
  }
  const done = updateTask(id, { status: 'completed', completed_at: nowISO() });
  if (!done) return null;
  run('UPDATE reminders SET enabled=0 WHERE entity_type=? AND entity_id=?', ['task', id]);
  // complete subtasks as well
  for (const child of all<Task>('SELECT * FROM tasks WHERE parent_id=? AND deleted_at IS NULL', [id])) {
    updateTask(child.id, { status: 'completed', completed_at: nowISO() });
  }
  let next: Task | null = null;
  if (task.recurrence) {
    const base = task.due_date ?? task.start_date ?? nowISO();
    const after = parseLocal(base) ?? new Date();
    const following = nextOccurrence(task.recurrence, base, addMinutes(after, 1));
    if (following && (!task.recurrence_until || following <= task.recurrence_until)) {
      const shift = parseLocal(following)!.getTime() - (parseLocal(base)?.getTime() ?? 0);
      const shiftISO = (iso: string | null) => (iso ? toLocalISO(new Date((parseLocal(iso)?.getTime() ?? 0) + shift)) : null);
      next = createTask({
        ...task,
        id: undefined as unknown as string,
        status: 'open',
        completed_at: null,
        due_date: shiftISO(task.due_date),
        start_date: shiftISO(task.start_date),
        end_date: shiftISO(task.end_date),
        ticktick_id: null,
        etag: null,
        sync_status: 'local',
        title: task.title,
      });
      // copy checklist state reset
      for (const item of all<ChecklistItem>('SELECT * FROM checklist_items WHERE task_id=?', [id])) {
        addChecklistItem(next.id, item.title, false);
      }
    }
  }
  return { task: done, next };
}

export function deleteTask(id: string, hard = false): void {
  const task = getTask(id);
  if (!task) return;
  if (hard) {
    transaction(() => {
      run('DELETE FROM checklist_items WHERE task_id=?', [id]);
      run('DELETE FROM attachments WHERE task_id=?', [id]);
      run('DELETE FROM reminders WHERE entity_type=? AND entity_id=?', ['task', id]);
      run('DELETE FROM tasks WHERE id=?', [id]);
    });
    return;
  }
  const ts = nowISO();
  transaction(() => {
    run("UPDATE tasks SET deleted_at=?, sync_status=CASE WHEN ticktick_id IS NOT NULL THEN 'pending' ELSE sync_status END WHERE id=?", [ts, id]);
    run('UPDATE tasks SET deleted_at=? WHERE parent_id=? AND deleted_at IS NULL', [ts, id]);
    run('UPDATE reminders SET enabled=0 WHERE entity_type=? AND entity_id=?', ['task', id]);
  });
  pushUndo('حذف مهمة', [{ table: 'tasks', action: 'update', data: { id, deleted_at: null } }], [
    { table: 'tasks', action: 'update', data: { id, deleted_at: ts } },
  ]);
}

export function restoreTask(id: string): void {
  transaction(() => {
    run('UPDATE tasks SET deleted_at=NULL WHERE id=?', [id]);
    run('UPDATE tasks SET deleted_at=NULL WHERE parent_id=?', [id]);
  });
}

export function moveTask(id: string, projectId: string, kanbanColumn: string | null = null): Task | null {
  return updateTask(id, { project_id: projectId, kanban_column: kanbanColumn });
}

export function reorderTasks(order: { id: string; sort_order: number }[]): void {
  transaction(() => {
    for (const item of order) run('UPDATE tasks SET sort_order=? WHERE id=?', [item.sort_order, item.id]);
  });
}

export function duplicateTask(id: string): Task | null {
  const task = getTask(id);
  if (!task) return null;
  const copy = createTask({
    ...task,
    id: undefined as unknown as string,
    title: `${task.title} (نسخة)`,
    status: 'open',
    completed_at: null,
    ticktick_id: null,
    etag: null,
    sync_status: 'local',
  });
  for (const item of all<ChecklistItem>('SELECT * FROM checklist_items WHERE task_id=?', [id])) {
    addChecklistItem(copy.id, item.title, !!item.done);
  }
  return copy;
}

// ------------------------------------------------------------------ checklist / attachments

export function listChecklist(taskId: string): ChecklistItem[] {
  return all<ChecklistItem>('SELECT * FROM checklist_items WHERE task_id=? ORDER BY sort_order ASC', [taskId]);
}

export function allChecklist(): ChecklistItem[] {
  return all<ChecklistItem>('SELECT * FROM checklist_items ORDER BY sort_order ASC');
}

export function allAttachments(): Attachment[] {
  return all<Attachment>('SELECT * FROM attachments ORDER BY created_at ASC');
}

export function addChecklistItem(taskId: string, title: string, done = false): ChecklistItem {
  const item: ChecklistItem = {
    id: uid(),
    task_id: taskId,
    title,
    done: done ? 1 : 0,
    sort_order: nextSort('checklist_items', 'task_id', taskId),
  };
  run('INSERT INTO checklist_items (id,task_id,title,done,sort_order) VALUES (?,?,?,?,?)', [
    item.id,
    item.task_id,
    item.title,
    item.done,
    item.sort_order,
  ]);
  return item;
}

export function toggleChecklistItem(id: string, done: boolean): void {
  run('UPDATE checklist_items SET done=? WHERE id=?', [done ? 1 : 0, id]);
}

export function deleteChecklistItem(id: string): void {
  run('DELETE FROM checklist_items WHERE id=?', [id]);
}

export function listAttachments(taskId: string): Attachment[] {
  return all<Attachment>('SELECT * FROM attachments WHERE task_id=? ORDER BY created_at ASC', [taskId]);
}

export function addAttachment(rec: Omit<Attachment, 'created_at'>): Attachment {
  const attachment: Attachment = { ...rec, created_at: nowISO() };
  run('INSERT INTO attachments (id,task_id,name,path,size,mime,created_at) VALUES (?,?,?,?,?,?,?)', [
    attachment.id,
    attachment.task_id,
    attachment.name,
    attachment.path,
    attachment.size,
    attachment.mime,
    attachment.created_at,
  ]);
  return attachment;
}

export function deleteAttachment(id: string): void {
  run('DELETE FROM attachments WHERE id=?', [id]);
}

// ------------------------------------------------------------------ reminders

export function listReminders(entityType?: string, entityId?: string): Reminder[] {
  if (entityType && entityId) {
    return all<Reminder>('SELECT * FROM reminders WHERE entity_type=? AND entity_id=? ORDER BY trigger_at ASC', [entityType, entityId]);
  }
  return all<Reminder>('SELECT * FROM reminders ORDER BY trigger_at ASC');
}

export function replaceReminders(
  entityType: 'task' | 'habit' | 'countdown',
  entityId: string,
  specs: { kind: Reminder['kind']; trigger_at?: string; offset_min?: number | null; repeat_rule?: string | null; label?: string }[],
): Reminder[] {
  transaction(() => {
    run('DELETE FROM reminders WHERE entity_type=? AND entity_id=?', [entityType, entityId]);
    for (const spec of specs) {
      const trigger =
        spec.trigger_at ??
        (spec.offset_min != null && entityType === 'task'
          ? toLocalISO(addMinutes(parseLocal(getTask(entityId)?.due_date ?? '') ?? new Date(), -spec.offset_min))
          : nowISO());
      const reminder: Reminder = {
        id: uid(),
        entity_type: entityType,
        entity_id: entityId,
        trigger_at: trigger,
        kind: spec.kind,
        repeat_rule: spec.repeat_rule ?? null,
        offset_min: spec.offset_min ?? null,
        snoozed_until: null,
        fired_at: null,
        enabled: 1,
        label: spec.label ?? '',
        created_at: nowISO(),
      };
      run(
        `INSERT INTO reminders (id,entity_type,entity_id,trigger_at,kind,repeat_rule,offset_min,snoozed_until,fired_at,enabled,label,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          reminder.id,
          reminder.entity_type,
          reminder.entity_id,
          reminder.trigger_at,
          reminder.kind,
          reminder.repeat_rule,
          reminder.offset_min,
          reminder.snoozed_until,
          reminder.fired_at,
          reminder.enabled,
          reminder.label,
          reminder.created_at,
        ],
      );
    }
  });
  return listReminders(entityType, entityId);
}

export function snoozeReminder(id: string, minutes: number): void {
  const next = toLocalISO(addMinutes(new Date(), minutes));
  run('UPDATE reminders SET snoozed_until=?, fired_at=NULL, enabled=1 WHERE id=?', [next, id]);
}

export function dueReminders(nowIso: string): Reminder[] {
  return all<Reminder>(
    `SELECT * FROM reminders WHERE enabled=1 AND trigger_at<=? AND fired_at IS NULL
       AND (snoozed_until IS NULL OR snoozed_until<=?) ORDER BY trigger_at ASC`,
    [nowIso, nowIso],
  );
}

export function markReminderFired(id: string, nextTrigger: string | null): void {
  if (nextTrigger) {
    run('UPDATE reminders SET trigger_at=?, fired_at=NULL, snoozed_until=NULL WHERE id=?', [nextTrigger, id]);
  } else {
    run('UPDATE reminders SET fired_at=? WHERE id=?', [nowISO(), id]);
  }
}

export function disableReminder(id: string): void {
  run('UPDATE reminders SET enabled=0 WHERE id=?', [id]);
}

// ------------------------------------------------------------------ tags / filters / templates

export function listTags(): Tag[] {
  return all<Tag>('SELECT * FROM tags ORDER BY name ASC');
}

export function createTag(name: string, color = '#8892a6'): Tag {
  const existing = one<Tag>('SELECT * FROM tags WHERE name=?', [name]);
  if (existing) return existing;
  const tag: Tag = { id: uid(), name, color, created_at: nowISO() };
  run('INSERT INTO tags (id,name,color,created_at) VALUES (?,?,?,?)', [tag.id, tag.name, tag.color, tag.created_at]);
  return tag;
}

export function updateTag(id: string, patch: Partial<Tag>): void {
  run('UPDATE tags SET name=?, color=? WHERE id=?', [patch.name ?? '', patch.color ?? '#8892a6', id]);
}

export function deleteTag(id: string): void {
  run('DELETE FROM tags WHERE id=?', [id]);
}

export function listFilters(): SmartFilter[] {
  return all<SmartFilter>('SELECT * FROM filters ORDER BY sort_order ASC');
}

export function createFilter(input: { name: string; icon?: string; rule: FilterRule | string }): SmartFilter {
  const filter: SmartFilter = {
    id: uid(),
    name: input.name,
    icon: input.icon ?? '🔎',
    rule: typeof input.rule === 'string' ? input.rule : JSON.stringify(input.rule),
    sort_order: nextSort('filters'),
    created_at: nowISO(),
  };
  run('INSERT INTO filters (id,name,icon,rule,sort_order,created_at) VALUES (?,?,?,?,?,?)', [
    filter.id,
    filter.name,
    filter.icon,
    filter.rule,
    filter.sort_order,
    filter.created_at,
  ]);
  return filter;
}

export function updateFilter(id: string, patch: Partial<SmartFilter>): void {
  const before = one<SmartFilter>('SELECT * FROM filters WHERE id=?', [id]);
  if (!before) return;
  const merged = { ...before, ...patch };
  run('UPDATE filters SET name=?, icon=?, rule=?, sort_order=? WHERE id=?', [
    merged.name,
    merged.icon,
    merged.rule,
    merged.sort_order,
    id,
  ]);
}

export function deleteFilter(id: string): void {
  run('DELETE FROM filters WHERE id=?', [id]);
}

export function listTemplates(): TaskTemplate[] {
  return all<TaskTemplate>('SELECT * FROM task_templates ORDER BY created_at DESC');
}

export function createTemplate(name: string, payload: unknown): TaskTemplate {
  const tpl: TaskTemplate = { id: uid(), name, payload: JSON.stringify(payload), created_at: nowISO() };
  run('INSERT INTO task_templates (id,name,payload,created_at) VALUES (?,?,?,?)', [tpl.id, tpl.name, tpl.payload, tpl.created_at]);
  return tpl;
}

export function deleteTemplate(id: string): void {
  run('DELETE FROM task_templates WHERE id=?', [id]);
}

// ------------------------------------------------------------------ habits

export function listHabits(): Habit[] {
  return all<Habit>('SELECT * FROM habits ORDER BY archived ASC, sort_order ASC');
}

export function createHabit(input: Partial<Habit> & { name: string }): Habit {
  const ts = nowISO();
  const habit: Habit = {
    id: input.id ?? uid(),
    name: input.name.trim(),
    icon: input.icon ?? '✅',
    color: input.color ?? '#4f7cff',
    frequency: input.frequency ?? 'daily',
    target_days: input.target_days ?? 7,
    weekdays: input.weekdays ?? '[]',
    goal: input.goal ?? 1,
    step: input.step ?? 1,
    unit: input.unit ?? '',
    reminder_time: input.reminder_time ?? null,
    notes: input.notes ?? '',
    archived: input.archived ?? 0,
    sort_order: input.sort_order ?? nextSort('habits'),
    created_at: ts,
    updated_at: ts,
  };
  run(
    `INSERT INTO habits (id,name,icon,color,frequency,target_days,weekdays,goal,step,unit,reminder_time,notes,archived,sort_order,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      habit.id,
      habit.name,
      habit.icon,
      habit.color,
      habit.frequency,
      habit.target_days,
      habit.weekdays,
      habit.goal,
      habit.step,
      habit.unit,
      habit.reminder_time,
      habit.notes,
      habit.archived,
      habit.sort_order,
      habit.created_at,
      habit.updated_at,
    ],
  );
  if (habit.reminder_time) {
    const [h, m] = habit.reminder_time.split(':').map(Number);
    const trigger = new Date();
    trigger.setHours(h, m, 0, 0);
    replaceReminders('habit', habit.id, [{ kind: 'recurring', trigger_at: toLocalISO(trigger), repeat_rule: 'RRULE:FREQ=DAILY', label: habit.name }]);
  }
  return habit;
}

export function updateHabit(id: string, patch: Partial<Habit>): Habit | null {
  const before = one<Habit>('SELECT * FROM habits WHERE id=?', [id]);
  if (!before) return null;
  const merged: Habit = { ...before, ...patch, updated_at: nowISO() };
  run(
    `UPDATE habits SET name=?,icon=?,color=?,frequency=?,target_days=?,weekdays=?,goal=?,step=?,unit=?,reminder_time=?,notes=?,archived=?,sort_order=?,updated_at=? WHERE id=?`,
    [
      merged.name,
      merged.icon,
      merged.color,
      merged.frequency,
      merged.target_days,
      merged.weekdays,
      merged.goal,
      merged.step,
      merged.unit,
      merged.reminder_time,
      merged.notes,
      merged.archived,
      merged.sort_order,
      merged.updated_at,
      id,
    ],
  );
  if (patch.reminder_time !== undefined) {
    if (merged.reminder_time) {
      const [h, m] = merged.reminder_time.split(':').map(Number);
      const trigger = new Date();
      trigger.setHours(h, m, 0, 0);
      if (trigger < new Date()) trigger.setDate(trigger.getDate() + 1);
      replaceReminders('habit', id, [
        { kind: 'recurring', trigger_at: toLocalISO(trigger), repeat_rule: 'RRULE:FREQ=DAILY', label: merged.name },
      ]);
    } else {
      replaceReminders('habit', id, []);
    }
  }
  return merged;
}

export function deleteHabit(id: string): void {
  transaction(() => {
    run('DELETE FROM habit_logs WHERE habit_id=?', [id]);
    run('DELETE FROM reminders WHERE entity_type=? AND entity_id=?', ['habit', id]);
    run('DELETE FROM habits WHERE id=?', [id]);
  });
}

export function listHabitLogs(habitId?: string): HabitLog[] {
  return habitId
    ? all<HabitLog>('SELECT * FROM habit_logs WHERE habit_id=? ORDER BY date ASC', [habitId])
    : all<HabitLog>('SELECT * FROM habit_logs ORDER BY date ASC');
}

export function checkInHabit(habitId: string, date: string, value: number, note = ''): HabitLog {
  const habit = one<Habit>('SELECT * FROM habits WHERE id=?', [habitId]);
  if (!habit) throw new Error('Habit not found');
  const key = date.slice(0, 10);
  const done = habit.goal > 0 ? value >= habit.goal : value > 0;
  const existing = one<HabitLog>('SELECT * FROM habit_logs WHERE habit_id=? AND date=?', [habitId, key]);
  if (existing) {
    run('UPDATE habit_logs SET value=?, done=?, note=? WHERE id=?', [value, done ? 1 : 0, note, existing.id]);
    return { ...existing, value, done: done ? 1 : 0, note };
  }
  const log: HabitLog = { id: uid(), habit_id: habitId, date: key, value, done: done ? 1 : 0, note, created_at: nowISO() };
  run('INSERT INTO habit_logs (id,habit_id,date,value,done,note,created_at) VALUES (?,?,?,?,?,?,?)', [
    log.id,
    log.habit_id,
    log.date,
    log.value,
    log.done,
    log.note,
    log.created_at,
  ]);
  return log;
}

export function deleteHabitLog(habitId: string, date: string): void {
  run('DELETE FROM habit_logs WHERE habit_id=? AND date=?', [habitId, date.slice(0, 10)]);
}

// ------------------------------------------------------------------ focus sessions

export function listFocusSessions(from?: string, to?: string): FocusSession[] {
  if (from && to) return all<FocusSession>('SELECT * FROM focus_sessions WHERE started_at>=? AND started_at<=? ORDER BY started_at DESC', [from, to]);
  return all<FocusSession>('SELECT * FROM focus_sessions ORDER BY started_at DESC LIMIT 2000');
}

export function saveFocusSession(input: Omit<FocusSession, 'id'> & { id?: string }): FocusSession {
  const session: FocusSession = {
    id: input.id ?? uid(),
    task_id: input.task_id ?? null,
    mode: input.mode,
    started_at: input.started_at,
    ended_at: input.ended_at,
    duration_sec: Math.max(0, Math.round(input.duration_sec)),
    completed: input.completed ? 1 : 0,
    note: input.note ?? '',
  };
  run('INSERT INTO focus_sessions (id,task_id,mode,started_at,ended_at,duration_sec,completed,note) VALUES (?,?,?,?,?,?,?,?)', [
    session.id,
    session.task_id,
    session.mode,
    session.started_at,
    session.ended_at,
    session.duration_sec,
    session.completed,
    session.note,
  ]);
  return session;
}

export function deleteFocusSession(id: string): void {
  run('DELETE FROM focus_sessions WHERE id=?', [id]);
}

// ------------------------------------------------------------------ countdowns

export function listCountdowns(): Countdown[] {
  return all<Countdown>('SELECT * FROM countdowns ORDER BY date ASC');
}

export function createCountdown(input: Partial<Countdown> & { title: string; date: string }): Countdown {
  const ts = nowISO();
  const item: Countdown = {
    id: input.id ?? uid(),
    title: input.title,
    date: input.date.slice(0, 10),
    category: input.category ?? '',
    color: input.color ?? '#4f7cff',
    icon: input.icon ?? '⏳',
    repeat_yearly: input.repeat_yearly ?? 0,
    remind_days_before: input.remind_days_before ?? 1,
    notes: input.notes ?? '',
    created_at: ts,
    updated_at: ts,
  };
  run(
    'INSERT INTO countdowns (id,title,date,category,color,icon,repeat_yearly,remind_days_before,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [
      item.id,
      item.title,
      item.date,
      item.category,
      item.color,
      item.icon,
      item.repeat_yearly,
      item.remind_days_before,
      item.notes,
      item.created_at,
      item.updated_at,
    ],
  );
  scheduleCountdownReminder(item);
  return item;
}

function scheduleCountdownReminder(item: Countdown): void {
  const target = parseLocal(item.date);
  if (!target) return;
  const trigger = addDays(target, -(item.remind_days_before || 0));
  trigger.setHours(9, 0, 0, 0);
  replaceReminders('countdown', item.id, [
    {
      kind: 'absolute',
      trigger_at: toLocalISO(trigger),
      label: item.title,
    },
  ]);
}

export function updateCountdown(id: string, patch: Partial<Countdown>): Countdown | null {
  const before = one<Countdown>('SELECT * FROM countdowns WHERE id=?', [id]);
  if (!before) return null;
  const merged: Countdown = { ...before, ...patch, updated_at: nowISO() };
  run(
    'UPDATE countdowns SET title=?,date=?,category=?,color=?,icon=?,repeat_yearly=?,remind_days_before=?,notes=?,updated_at=? WHERE id=?',
    [
      merged.title,
      merged.date,
      merged.category,
      merged.color,
      merged.icon,
      merged.repeat_yearly,
      merged.remind_days_before,
      merged.notes,
      merged.updated_at,
      id,
    ],
  );
  scheduleCountdownReminder(merged);
  return merged;
}

export function deleteCountdown(id: string): void {
  transaction(() => {
    run('DELETE FROM reminders WHERE entity_type=? AND entity_id=?', ['countdown', id]);
    run('DELETE FROM countdowns WHERE id=?', [id]);
  });
}

// ------------------------------------------------------------------ sticky notes

export function listStickyNotes(): StickyNote[] {
  return all<StickyNote>('SELECT * FROM sticky_notes ORDER BY created_at ASC');
}

export function createStickyNote(input: Partial<StickyNote> = {}): StickyNote {
  const ts = nowISO();
  const note: StickyNote = {
    id: input.id ?? uid(),
    content: input.content ?? '',
    color: input.color ?? '#ffd66b',
    x: input.x ?? 160,
    y: input.y ?? 160,
    width: input.width ?? 280,
    height: input.height ?? 240,
    always_on_top: input.always_on_top ?? 0,
    created_at: ts,
    updated_at: ts,
  };
  run('INSERT INTO sticky_notes (id,content,color,x,y,width,height,always_on_top,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [
    note.id,
    note.content,
    note.color,
    note.x,
    note.y,
    note.width,
    note.height,
    note.always_on_top,
    note.created_at,
    note.updated_at,
  ]);
  return note;
}

export function updateStickyNote(id: string, patch: Partial<StickyNote>): StickyNote | null {
  const before = one<StickyNote>('SELECT * FROM sticky_notes WHERE id=?', [id]);
  if (!before) return null;
  const merged: StickyNote = { ...before, ...patch, updated_at: nowISO() };
  run('UPDATE sticky_notes SET content=?,color=?,x=?,y=?,width=?,height=?,always_on_top=?,updated_at=? WHERE id=?', [
    merged.content,
    merged.color,
    merged.x,
    merged.y,
    merged.width,
    merged.height,
    merged.always_on_top,
    merged.updated_at,
    id,
  ]);
  return merged;
}

export function deleteStickyNote(id: string): void {
  run('DELETE FROM sticky_notes WHERE id=?', [id]);
}

// ------------------------------------------------------------------ calendar events

export function listEvents(): CalendarEvent[] {
  return all<CalendarEvent>('SELECT * FROM calendar_events ORDER BY start ASC');
}

export function createEvent(input: Partial<CalendarEvent> & { title: string; start: string }): CalendarEvent {
  const ts = nowISO();
  const event: CalendarEvent = {
    id: input.id ?? uid(),
    title: input.title,
    start: input.start,
    end: input.end ?? null,
    all_day: input.all_day ?? 0,
    color: input.color ?? '#4f7cff',
    project_id: input.project_id ?? null,
    notes: input.notes ?? '',
    location: input.location ?? '',
    recurrence: input.recurrence ?? null,
    source: input.source ?? 'local',
    external_uid: input.external_uid ?? null,
    created_at: ts,
    updated_at: ts,
  };
  run(
    'INSERT INTO calendar_events (id,title,start,end,all_day,color,project_id,notes,location,recurrence,source,external_uid,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [
      event.id,
      event.title,
      event.start,
      event.end,
      event.all_day,
      event.color,
      event.project_id,
      event.notes,
      event.location,
      event.recurrence,
      event.source,
      event.external_uid,
      event.created_at,
      event.updated_at,
    ],
  );
  return event;
}

export function updateEvent(id: string, patch: Partial<CalendarEvent>): CalendarEvent | null {
  const before = one<CalendarEvent>('SELECT * FROM calendar_events WHERE id=?', [id]);
  if (!before) return null;
  const merged: CalendarEvent = { ...before, ...patch, updated_at: nowISO() };
  run('UPDATE calendar_events SET title=?,start=?,end=?,all_day=?,color=?,project_id=?,notes=?,location=?,recurrence=?,updated_at=? WHERE id=?', [
    merged.title,
    merged.start,
    merged.end,
    merged.all_day,
    merged.color,
    merged.project_id,
    merged.notes,
    merged.location,
    merged.recurrence,
    merged.updated_at,
    id,
  ]);
  return merged;
}

export function deleteEvent(id: string): void {
  run('DELETE FROM calendar_events WHERE id=?', [id]);
}

// ------------------------------------------------------------------ settings / meta

export function getSetting<T>(key: string, fallback: T): T {
  const row = one<{ value: string }>('SELECT value FROM settings WHERE key=?', [key]);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(key: string, value: unknown): void {
  run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, JSON.stringify(value)]);
}

export function allSettings(): Record<string, unknown> {
  const rows = all<{ key: string; value: string }>('SELECT key,value FROM settings');
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      out[r.key] = r.value;
    }
  }
  return out;
}

export function nextSort(table: string, column?: string, value?: string): number {
  const row = column
    ? one<{ m: number | null }>(`SELECT MAX(sort_order) as m FROM ${table} WHERE ${column}=?`, [value ?? ''])
    : one<{ m: number | null }>(`SELECT MAX(sort_order) as m FROM ${table}`);
  return (row?.m ?? 0) + 1;
}

export function counts(): Record<string, number> {
  const tables = ['projects', 'tasks', 'habits', 'habit_logs', 'focus_sessions', 'countdowns', 'reminders', 'calendar_events'];
  const out: Record<string, number> = {};
  for (const t of tables) {
    const row = one<{ c: number }>(`SELECT COUNT(*) as c FROM ${t}`);
    out[t] = row?.c ?? 0;
  }
  return out;
}

export function todayCounters(): { completedToday: number; open: number; overdue: number } {
  const today = todayKey();
  const completedToday = one<{ c: number }>("SELECT COUNT(*) as c FROM tasks WHERE status='completed' AND completed_at LIKE ?", [`${today}%`])?.c ?? 0;
  const open = one<{ c: number }>("SELECT COUNT(*) as c FROM tasks WHERE status='open' AND deleted_at IS NULL")?.c ?? 0;
  const overdue = one<{ c: number }>("SELECT COUNT(*) as c FROM tasks WHERE status='open' AND deleted_at IS NULL AND due_date IS NOT NULL AND due_date < ?", [
    `${today}T00:00:00`,
  ])?.c ?? 0;
  return { completedToday, open, overdue };
}

export function emptyTrash(): void {
  const rows = all<{ id: string }>('SELECT id FROM tasks WHERE deleted_at IS NOT NULL');
  for (const r of rows) deleteTask(r.id, true);
}

export function nextCountdownOccurrence(date: string, repeatYearly: number, now = new Date()): string {
  if (!repeatYearly) return date;
  const d = parseLocal(date) ?? now;
  const thisYear = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (thisYear >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) return toDateKey(thisYear);
  return toDateKey(new Date(now.getFullYear() + 1, d.getMonth(), d.getDate()));
}
