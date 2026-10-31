import type { FocusSession, Habit, HabitLog, Project, StatsSnapshot, Task } from './types';
import { addDays, dateKeyOf, parseLocal, startOfDay, toDateKey, todayKey } from './date';
import { adherence, computeStreak } from './habits';

export interface StatsInput {
  tasks: Task[];
  projects: Project[];
  sessions: FocusSession[];
  habits: Habit[];
  logs: HabitLog[];
  now?: Date;
}

function inRange(iso: string | null | undefined, from: Date, to: Date): boolean {
  if (!iso) return false;
  const d = parseLocal(iso);
  return !!d && d >= from && d <= to;
}

export function computeStats(input: StatsInput, days = 30): StatsSnapshot {
  const now = input.now ?? new Date();
  const today = startOfDay(now);
  const weekStart = addDays(today, -6);
  const monthStart = addDays(today, -29);
  const active = input.tasks.filter((t) => !t.deleted_at);
  const open = active.filter((t) => t.status === 'open');
  const completed = active.filter((t) => t.status === 'completed' && t.completed_at);

  const overdue = open.filter((t) => {
    if (!t.due_date) return false;
    const d = parseLocal(t.due_date);
    return !!d && (t.all_day ? dateKeyOf(t.due_date)! < todayKey(now) : d < now);
  });

  const completedToday = completed.filter((t) => dateKeyOf(t.completed_at) === todayKey(now)).length;
  const completedWeek = completed.filter((t) => inRange(t.completed_at, weekStart, now)).length;
  const completedMonth = completed.filter((t) => inRange(t.completed_at, monthStart, now)).length;

  const focus = input.sessions.filter((s) => s.mode === 'focus' || s.mode === 'stopwatch');
  const focusMinutes = (from: Date, to: Date) =>
    Math.round(
      focus
        .filter((s) => inRange(s.started_at, from, to))
        .reduce((sum, s) => sum + s.duration_sec, 0) / 60,
    );

  const series: StatsSnapshot['daily'] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const key = toDateKey(d);
    const next = addDays(d, 1);
    series.push({
      date: key,
      completed: completed.filter((t) => dateKeyOf(t.completed_at) === key).length,
      created: active.filter((t) => dateKeyOf(t.created_at) === key).length,
      focus: Math.round(
        focus.filter((s) => inRange(s.started_at, d, next)).reduce((sum, s) => sum + s.duration_sec, 0) / 60,
      ),
    });
  }

  const projectStats = input.projects
    .filter((p) => !p.deleted_at)
    .map((p) => {
      const list = active.filter((t) => t.project_id === p.id);
      const done = list.filter((t) => t.status === 'completed').length;
      const late = list.filter((t) => open.includes(t) && overdue.includes(t)).length;
      return { id: p.id, name: p.name, color: p.color, total: list.length, completed: done, overdue: late };
    })
    .filter((p) => p.total > 0);

  const habitStats = input.habits
    .filter((h) => !h.archived)
    .map((h) => ({
      id: h.id,
      name: h.name,
      color: h.color,
      adherence: adherence(h, input.logs, 30, now),
      streak: computeStreak(h, input.logs, now),
    }));

  const habitsTotal = input.habits.filter((h) => !h.archived).length;
  const doneTodayKeys = new Set(
    input.logs
      .filter((l) => dateKeyOf(l.date) === todayKey(now) && l.done === 1)
      .map((l) => l.habit_id),
  );
  const habitsDoneToday = [...doneTodayKeys].filter((id) => input.habits.some((h) => h.id === id && !h.archived)).length;

  const prevStart = addDays(today, -13);
  const prevEnd = addDays(today, -7);
  const previousWeek = completed.filter((t) => inRange(t.completed_at, prevStart, prevEnd)).length;
  const currentWeek = completedWeek;
  const totalConsidered = completed.length + open.length;

  return {
    completedToday,
    completedWeek,
    completedMonth,
    overdue: overdue.length,
    open: open.length,
    completionRate: totalConsidered ? Math.round((completed.length / totalConsidered) * 100) : 0,
    focusMinutesToday: focusMinutes(today, now),
    focusMinutesWeek: focusMinutes(weekStart, now),
    focusMinutesMonth: focusMinutes(monthStart, now),
    habitsDoneToday,
    habitsTotal,
    daily: series,
    projects: projectStats,
    habitAdherence: habitStats,
    comparison: {
      current: currentWeek,
      previous: previousWeek,
      delta: previousWeek ? Math.round(((currentWeek - previousWeek) / previousWeek) * 100) : currentWeek ? 100 : 0,
    },
  };
}

export function projectProgress(tasks: Task[], projectId: string): { total: number; completed: number; percent: number } {
  const list = tasks.filter((t) => t.project_id === projectId && !t.deleted_at);
  const completed = list.filter((t) => t.status === 'completed').length;
  return { total: list.length, completed, percent: list.length ? Math.round((completed / list.length) * 100) : 0 };
}
