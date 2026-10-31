import type { FilterCondition, FilterRule, Task } from './types';
import { dateKeyOf, parseLocal, startOfDay, toDateKey, todayKey } from './date';

export function parseTags(tags: string | null | undefined): string[] {
  if (!tags) return [];
  try {
    const v = JSON.parse(tags);
    return Array.isArray(v) ? v.filter((t) => typeof t === 'string') : [];
  } catch {
    return tags.split(',').map((t) => t.trim()).filter(Boolean);
  }
}

export function matchesCondition(task: Task, c: FilterCondition, now = new Date()): boolean {
  const value = c.value ?? '';
  switch (c.field) {
    case 'title':
      return c.op === 'contains'
        ? task.title.toLowerCase().includes(value.toLowerCase())
        : c.op === 'is_empty'
          ? !task.title
          : c.op === 'not_empty'
            ? !!task.title
            : task.title === value;
    case 'notes': {
      const n = (task.notes || '').toLowerCase();
      return c.op === 'contains' ? n.includes(value.toLowerCase()) : c.op === 'is_empty' ? !n : !!n;
    }
    case 'priority':
      return c.op === 'equals' ? task.priority === Number(value) : c.op === 'gt' ? task.priority > Number(value) : task.priority < Number(value);
    case 'status':
      return c.op === 'not_equals' ? task.status !== value : task.status === value;
    case 'project_id':
      return c.op === 'not_equals' ? task.project_id !== value : task.project_id === value;
    case 'tag': {
      const tags = parseTags(task.tags).map((t) => t.toLowerCase());
      if (c.op === 'is_empty') return tags.length === 0;
      if (c.op === 'not_empty') return tags.length > 0;
      return tags.includes(value.toLowerCase());
    }
    case 'quadrant':
      return c.op === 'is_empty' ? task.quadrant == null : String(task.quadrant) === value;
    case 'kanban_column':
      return c.op === 'is_empty' ? !task.kanban_column : task.kanban_column === value;
    case 'due_date': {
      const due = task.due_date;
      if (c.op === 'is_empty') return !due;
      if (c.op === 'not_empty') return !!due;
      if (!due) return false;
      if (c.op === 'before') return due < value;
      if (c.op === 'after') return due > value;
      return dateKeyOf(due) === dateKeyOf(value);
    }
    default:
      return true;
  }
}

export function applyFilter(tasks: Task[], rule: FilterRule, now = new Date()): Task[] {
  const filtered = tasks.filter((t) => {
    if (!rule.conditions.length) return true;
    const results = rule.conditions.map((c) => matchesCondition(t, c, now));
    return rule.match === 'any' ? results.some(Boolean) : results.every(Boolean);
  });
  return sortTasks(filtered, rule.sortBy ?? 'due');
}

export function sortTasks(tasks: Task[], by: 'due' | 'priority' | 'created' | 'title' | 'manual' = 'due'): Task[] {
  const copy = [...tasks];
  switch (by) {
    case 'priority':
      copy.sort((a, b) => b.priority - a.priority || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
      break;
    case 'created':
      copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
      break;
    case 'title':
      copy.sort((a, b) => a.title.localeCompare(b.title, 'ar'));
      break;
    case 'manual':
      copy.sort((a, b) => a.sort_order - b.sort_order);
      break;
    default:
      copy.sort((a, b) => {
        const ad = a.due_date ?? '9999-12-31';
        const bd = b.due_date ?? '9999-12-31';
        return ad.localeCompare(bd) || b.priority - a.priority;
      });
  }
  return copy;
}

/** Case/diacritic-insensitive search over title, notes, tags and project name. */
export function searchTasks(tasks: Task[], query: string, projectNames: Record<string, string> = {}): Task[] {
  const q = normalize(query);
  if (!q) return [];
  const scored: { task: Task; score: number }[] = [];
  for (const t of tasks) {
    const title = normalize(t.title);
    const notes = normalize(t.notes || '');
    const tags = normalize(parseTags(t.tags).join(' '));
    const project = normalize(projectNames[t.project_id] || '');
    let score = 0;
    if (title === q) score = 100;
    else if (title.startsWith(q)) score = 80;
    else if (title.includes(q)) score = 60;
    else if (tags.includes(q)) score = 40;
    else if (notes.includes(q)) score = 25;
    else if (project.includes(q)) score = 15;
    if (score > 0) scored.push({ task: t, score });
  }
  scored.sort((a, b) => b.score - a.score || (a.task.due_date ?? '9999').localeCompare(b.task.due_date ?? '9999'));
  return scored.map((s) => s.task);
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '') // Arabic diacritics + tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SmartListContext {
  now?: Date;
}

export function isOverdue(t: Task, now = new Date()): boolean {
  if (t.status !== 'open' || !t.due_date) return false;
  const due = parseLocal(t.due_date);
  if (!due) return false;
  if (t.all_day) return dateKeyOf(t.due_date)! < todayKey(now);
  return due.getTime() < now.getTime();
}

export function isDueToday(t: Task, now = new Date()): boolean {
  if (!t.due_date) return false;
  return dateKeyOf(t.due_date) === todayKey(now);
}

export function isDueWithin(t: Task, days: number, now = new Date()): boolean {
  if (!t.due_date) return false;
  const key = dateKeyOf(t.due_date)!;
  const start = startOfDay(now);
  const end = new Date(start.getTime() + days * 86400000);
  return key >= todayKey(now) && key <= toDateKey(end);
}

/** Eisenhower auto-classification used by the matrix "rules" mode. */
export function autoQuadrant(
  t: Task,
  opts: { urgentDays: number; importantPriorities: number[] } = { urgentDays: 2, importantPriorities: [3, 5] },
  now = new Date(),
): number {
  const due = parseLocal(t.due_date);
  const urgent = due ? due.getTime() - now.getTime() <= opts.urgentDays * 86400000 : false;
  const important = opts.importantPriorities.includes(t.priority);
  if (urgent && important) return 1;
  if (important) return 2;
  if (urgent) return 3;
  return 4;
}
