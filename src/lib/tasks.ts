import type { Project, Settings, Task } from '../../shared/types';
import type { Bootstrap } from './api';
import { applyFilter, isDueToday, isDueWithin, isOverdue, parseTags } from '../../shared/filters';
import { dateKeyOf, diffDays, parseLocal, startOfDay, toDateKey } from '../../shared/date';
import type { View } from './view';

export function activeTasks(data: Bootstrap): Task[] {
  return data.tasks.filter((t) => !t.deleted_at);
}

export function tasksForView(data: Bootstrap, view: View, now = new Date()): Task[] {
  const all = data.tasks;
  const active = all.filter((t) => !t.deleted_at);
  if (view.kind === 'smart') {
    switch (view.key) {
      case 'today':
        return active.filter((t) => t.status === 'open' && (isDueToday(t, now) || isOverdue(t, now)));
      case 'tomorrow': {
        const key = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
        return active.filter((t) => t.status === 'open' && dateKeyOf(t.due_date) === key);
      }
      case 'next7':
        return active.filter((t) => t.status === 'open' && isDueWithin(t, 7, now));
      case 'overdue':
        return active.filter((t) => isOverdue(t, now));
      case 'completed':
        return active.filter((t) => t.status === 'completed');
      case 'trash':
        return all.filter((t) => !!t.deleted_at);
      case 'all':
      default:
        return active.filter((t) => t.status === 'open');
    }
  }
  if (view.kind === 'project') return active.filter((t) => t.project_id === view.id);
  if (view.kind === 'tag') {
    const name = view.name.toLowerCase();
    return active.filter((t) => parseTags(t.tags).some((x) => x.toLowerCase() === name));
  }
  if (view.kind === 'filter') {
    const filter = data.filters.find((f) => f.id === view.id);
    if (!filter) return [];
    try {
      return applyFilter(active, JSON.parse(filter.rule), now);
    } catch {
      return [];
    }
  }
  return [];
}

export function topLevel(tasks: Task[]): Task[] {
  const ids = new Set(tasks.map((t) => t.id));
  return tasks.filter((t) => !t.parent_id || !ids.has(t.parent_id));
}

export function childrenOf(tasks: Task[], id: string): Task[] {
  return tasks.filter((t) => t.parent_id === id).sort((a, b) => a.sort_order - b.sort_order);
}

export function projectColumns(project: Project | undefined): { id: string; title: string; color: string }[] {
  const fallback = [
    { id: 'todo', title: 'قيد الانتظار', color: '#8892a6' },
    { id: 'doing', title: 'قيد التنفيذ', color: '#4f7cff' },
    { id: 'done', title: 'مكتملة', color: '#37c98b' },
  ];
  if (!project) return fallback;
  try {
    const cols = JSON.parse(project.kanban_columns || '[]');
    return Array.isArray(cols) && cols.length ? cols : fallback;
  } catch {
    return fallback;
  }
}

export type TaskGroupKey = 'overdue' | 'today' | 'tomorrow' | 'next7' | 'later' | 'nodate' | 'completed';

export function groupTasks(tasks: Task[], now = new Date()): { key: TaskGroupKey; tasks: Task[] }[] {
  const groups: Record<TaskGroupKey, Task[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    next7: [],
    later: [],
    nodate: [],
    completed: [],
  };
  const tomorrowKey = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  for (const t of tasks) {
    if (t.status === 'completed') {
      groups.completed.push(t);
      continue;
    }
    if (!t.due_date) {
      groups.nodate.push(t);
      continue;
    }
    const key = dateKeyOf(t.due_date)!;
    const d = parseLocal(t.due_date)!;
    if (isOverdue(t, now)) groups.overdue.push(t);
    else if (dateKeyOf(t.due_date) === toDateKey(now)) groups.today.push(t);
    else if (key === tomorrowKey) groups.tomorrow.push(t);
    else if (diffDays(d, now) > 1 && diffDays(d, now) <= 7) groups.next7.push(t);
    else groups.later.push(t);
  }
  const order: TaskGroupKey[] = ['overdue', 'today', 'tomorrow', 'next7', 'later', 'nodate', 'completed'];
  return order.filter((k) => groups[k].length).map((k) => ({ key: k, tasks: groups[k] }));
}

export function groupLabel(key: TaskGroupKey, lang: 'ar' | 'en'): string {
  const map: Record<TaskGroupKey, [string, string]> = {
    overdue: ['متأخرة', 'Overdue'],
    today: ['اليوم', 'Today'],
    tomorrow: ['غدًا', 'Tomorrow'],
    next7: ['الأيام السبعة القادمة', 'Next 7 days'],
    later: ['لاحقًا', 'Later'],
    nodate: ['بدون تاريخ', 'No date'],
    completed: ['مكتملة', 'Completed'],
  };
  return lang === 'ar' ? map[key][0] : map[key][1];
}

export function smartCounts(data: Bootstrap, now = new Date()) {
  const active = activeTasks(data);
  const open = active.filter((t) => t.status === 'open');
  return {
    today: tasksForView(data, { kind: 'smart', key: 'today' }, now).length,
    tomorrow: tasksForView(data, { kind: 'smart', key: 'tomorrow' }, now).length,
    next7: tasksForView(data, { kind: 'smart', key: 'next7' }, now).length,
    all: open.length,
    completed: active.filter((t) => t.status === 'completed').length,
    overdue: active.filter((t) => isOverdue(t, now)).length,
    trash: data.tasks.filter((t) => !!t.deleted_at).length,
  };
}

export function dueText(task: Task, lang: 'ar' | 'en', settings?: Settings | null): string {
  if (!task.due_date) return '';
  const d = parseLocal(task.due_date);
  if (!d) return '';
  const day = diffDays(d, new Date());
  const time = d.getHours() * 60 + d.getMinutes();
  const timeText =
    task.all_day || time === 0
      ? ''
      : new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: !settings || settings.hour12 === 1,
        }).format(d);
  if (day === 0) return `${lang === 'ar' ? 'اليوم' : 'Today'}${timeText ? ` · ${timeText}` : ''}`;
  if (day === 1) return `${lang === 'ar' ? 'غدًا' : 'Tomorrow'}${timeText ? ` · ${timeText}` : ''}`;
  if (day === -1) return `${lang === 'ar' ? 'أمس' : 'Yesterday'}${timeText ? ` · ${timeText}` : ''}`;
  const date = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { month: 'short', day: 'numeric' }).format(d);
  return `${date}${timeText ? ` · ${timeText}` : ''}`;
}

export function priorityColor(p: number): string {
  if (p >= 5) return 'var(--danger)';
  if (p >= 3) return 'var(--warning)';
  if (p >= 1) return 'var(--accent)';
  return 'transparent';
}

export function startOfToday(now = new Date()): Date {
  return startOfDay(now);
}
