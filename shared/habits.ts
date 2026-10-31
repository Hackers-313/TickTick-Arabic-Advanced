import type { Habit, HabitLog } from './types';
import { addDays, dateKeyOf, parseLocal, startOfDay, startOfWeek, toDateKey, todayKey } from './date';

export function isHabitScheduled(habit: Habit, dayKey: string): boolean {
  if (habit.archived) return false;
  if (habit.frequency === 'daily') return true;
  const d = parseLocal(dayKey);
  if (!d) return false;
  if (habit.frequency === 'weekly') return true; // "N times per week": any day counts
  let days: number[] = [];
  try {
    days = JSON.parse(habit.weekdays || '[]');
  } catch {
    days = [];
  }
  return days.length === 0 || days.includes(d.getDay());
}

export function logKey(habitId: string, date: string): string {
  return `${habitId}:${dateKeyOf(date) ?? date}`;
}

export function indexLogs(logs: HabitLog[]): Map<string, HabitLog> {
  const map = new Map<string, HabitLog>();
  for (const l of logs) map.set(logKey(l.habit_id, l.date), l);
  return map;
}

export function isDone(log: HabitLog | undefined, habit: Habit): boolean {
  if (!log) return false;
  if (habit.goal > 0) return log.value >= habit.goal;
  return log.done === 1;
}

/** Current consecutive streak, counted in scheduled periods (days for daily habits). */
export function computeStreak(habit: Habit, logs: HabitLog[], today = new Date()): number {
  const map = indexLogs(logs.filter((l) => l.habit_id === habit.id));
  let streak = 0;
  let cursor = startOfDay(today);
  const todayDone = isDone(map.get(logKey(habit.id, toDateKey(cursor))), habit);
  // Today not done yet does not break a streak built on previous days.
  if (!todayDone) cursor = addDays(cursor, -1);
  for (let i = 0; i < 3650; i++) {
    const key = toDateKey(cursor);
    if (habit.frequency === 'custom' && !isHabitScheduled(habit, key)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    const log = map.get(logKey(habit.id, key));
    if (isDone(log, habit)) {
      streak += 1;
      cursor = addDays(cursor, -1);
    } else {
      break;
    }
  }
  return streak;
}

export function computeBestStreak(habit: Habit, logs: HabitLog[]): number {
  const map = indexLogs(logs.filter((l) => l.habit_id === habit.id));
  const dates = [...map.keys()]
    .filter((k) => isDone(map.get(k), habit))
    .map((k) => k.split(':')[1])
    .sort();
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const key of dates) {
    const d = parseLocal(key);
    if (!d) continue;
    if (prev && Math.round((d.getTime() - prev.getTime()) / 86400000) === 1) run += 1;
    else run = 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Completion ratio over scheduled days in the window. */
export function adherence(
  habit: Habit,
  logs: HabitLog[],
  days = 30,
  today = new Date(),
): number {
  const map = indexLogs(logs.filter((l) => l.habit_id === habit.id));
  let scheduled = 0;
  let done = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(startOfDay(today), -i);
    const key = toDateKey(d);
    if (!isHabitScheduled(habit, key)) continue;
    if (habit.frequency === 'weekly') {
      // weekly habits are evaluated per calendar week, counted once below
      continue;
    }
    scheduled += 1;
    if (isDone(map.get(logKey(habit.id, key)), habit)) done += 1;
  }
  if (habit.frequency === 'weekly') {
    const weeks = Math.max(1, Math.ceil(days / 7));
    for (let w = 0; w < weeks; w++) {
      const weekStart = startOfWeek(addDays(today, -7 * w));
      let hits = 0;
      for (let i = 0; i < 7; i++) {
        const key = toDateKey(addDays(weekStart, i));
        if (isDone(map.get(logKey(habit.id, key)), habit)) hits += 1;
      }
      scheduled += habit.target_days || 1;
      done += Math.min(hits, habit.target_days || 1);
    }
  }
  if (!scheduled) return 0;
  return Math.round((done / scheduled) * 100);
}

export interface HeatCell {
  date: string;
  value: number;
  level: number; // 0..4
  scheduled: boolean;
}

export function heatmap(habit: Habit, logs: HabitLog[], weeks = 26, today = new Date()): HeatCell[][] {
  const map = indexLogs(logs.filter((l) => l.habit_id === habit.id));
  const end = startOfWeek(today);
  const cols: HeatCell[][] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const weekStart = addDays(end, -7 * w);
    const col: HeatCell[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const key = toDateKey(d);
      const log = map.get(logKey(habit.id, key));
      const done = isDone(log, habit);
      const value = log ? (habit.goal > 0 ? log.value : log.done) : 0;
      const ratio = habit.goal > 0 ? Math.min(1, value / habit.goal) : done ? 1 : 0;
      col.push({
        date: key,
        value,
        level: done ? 4 : ratio > 0 ? Math.max(1, Math.ceil(ratio * 3)) : 0,
        scheduled: isHabitScheduled(habit, key) && d <= today,
      });
    }
    cols.push(col);
  }
  return cols;
}

export function monthCompletion(habit: Habit, logs: HabitLog[], month: Date): { done: number; total: number } {
  const map = indexLogs(logs.filter((l) => l.habit_id === habit.id));
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  let done = 0;
  let total = 0;
  for (let i = 1; i <= days; i++) {
    const key = toDateKey(new Date(month.getFullYear(), month.getMonth(), i));
    if (!isHabitScheduled(habit, key)) continue;
    total += 1;
    if (isDone(map.get(logKey(habit.id, key)), habit)) done += 1;
  }
  return { done, total };
}

export function todayProgress(habit: Habit, logs: HabitLog[], today = new Date()): { value: number; goal: number; done: boolean } {
  const map = indexLogs(logs.filter((l) => l.habit_id === habit.id));
  const log = map.get(logKey(habit.id, todayKey(today)));
  return {
    value: log?.value ?? 0,
    goal: habit.goal > 0 ? habit.goal : 1,
    done: isDone(log, habit),
  };
}
