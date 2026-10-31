import { describe, expect, it } from 'vitest';
import {
  adherence,
  computeBestStreak,
  computeStreak,
  heatmap,
  indexLogs,
  isDone,
  isHabitScheduled,
  logKey,
  monthCompletion,
  todayProgress,
} from '../shared/habits';
import { makeHabit, makeLog } from './helpers';
import { addDays, toDateKey } from '../shared/date';

const NOW = new Date(2026, 9, 30, 12, 0); // Friday 30 Oct 2026

describe('habit scheduling', () => {
  it('schedules daily habits every day and weekly habits on any day', () => {
    expect(isHabitScheduled(makeHabit({ frequency: 'daily' }), '2026-10-30')).toBe(true);
    expect(isHabitScheduled(makeHabit({ frequency: 'weekly' }), '2026-10-30')).toBe(true);
  });

  it('respects custom weekdays and archived state', () => {
    const habit = makeHabit({ frequency: 'custom', weekdays: '[1,3]' });
    expect(isHabitScheduled(habit, '2026-10-26')).toBe(true); // Monday
    expect(isHabitScheduled(habit, '2026-10-27')).toBe(false); // Tuesday
    expect(isHabitScheduled(habit, '2026-10-28')).toBe(true); // Wednesday
    expect(isHabitScheduled(makeHabit({ archived: 1 }), '2026-10-30')).toBe(false);
  });

  it('treats empty custom weekday lists as every day', () => {
    expect(isHabitScheduled(makeHabit({ frequency: 'custom', weekdays: '[]' }), '2026-10-30')).toBe(true);
  });
});

describe('habit completion', () => {
  it('indexes logs by habit and date', () => {
    const log = makeLog('h1', '2026-10-30');
    const map = indexLogs([log]);
    expect(map.get(logKey('h1', '2026-10-30T15:00:00'))).toBe(log);
  });

  it('uses the numeric goal when one is set', () => {
    const habit = makeHabit({ goal: 3 });
    expect(isDone(makeLog('h1', '2026-10-30', 2), habit)).toBe(false);
    expect(isDone(makeLog('h1', '2026-10-30', 3), habit)).toBe(true);
    expect(isDone(undefined, habit)).toBe(false);
  });

  it('counts a daily streak, tolerating an unfinished today', () => {
    const habit = makeHabit();
    const done = ['2026-10-28', '2026-10-29', '2026-10-30'].map((d) => makeLog(habit.id, d));
    expect(computeStreak(habit, done, NOW)).toBe(3);

    const previousDays = ['2026-10-27', '2026-10-28', '2026-10-29'].map((d) => makeLog(habit.id, d));
    expect(computeStreak(habit, previousDays, NOW)).toBe(3);

    const withGap = ['2026-10-27', '2026-10-29', '2026-10-30'].map((d) => makeLog(habit.id, d));
    expect(computeStreak(habit, withGap, NOW)).toBe(2);
  });

  it('skips unscheduled days for custom habits', () => {
    const habit = makeHabit({ frequency: 'custom', weekdays: '[1,3]' });
    const logs = [makeLog(habit.id, '2026-10-19'), makeLog(habit.id, '2026-10-21'), makeLog(habit.id, '2026-10-26'), makeLog(habit.id, '2026-10-28')];
    expect(computeStreak(habit, logs, NOW)).toBe(4);
  });

  it('computes the best historical streak', () => {
    const habit = makeHabit();
    const logs = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-10', '2026-10-11'].map((d) => makeLog(habit.id, d));
    expect(computeBestStreak(habit, logs)).toBe(3);
    expect(computeBestStreak(habit, [])).toBe(0);
  });

  it('computes 30-day adherence', () => {
    const habit = makeHabit();
    const logs: ReturnType<typeof makeLog>[] = [];
    for (let i = 0; i < 30; i += 2) logs.push(makeLog(habit.id, toDateKey(addDays(NOW, -i))));
    expect(adherence(habit, logs, 30, NOW)).toBe(50);
    expect(adherence(habit, [], 30, NOW)).toBe(0);
  });

  it('evaluates weekly habits against their weekly target', () => {
    const habit = makeHabit({ frequency: 'weekly', target_days: 3 });
    const logs = ['2026-10-26', '2026-10-27', '2026-10-28'].map((d) => makeLog(habit.id, d));
    const value = adherence(habit, logs, 7, NOW);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThanOrEqual(100);
  });

  it('builds a heatmap grid with levels and future flags', () => {
    const habit = makeHabit();
    const logs = [makeLog(habit.id, '2026-10-29'), makeLog(habit.id, '2026-10-30')];
    const grid = heatmap(habit, logs, 4, NOW);
    expect(grid).toHaveLength(4);
    expect(grid.every((col) => col.length === 7)).toBe(true);
    const flat = grid.flat();
    expect(flat.find((c) => c.date === '2026-10-30')!.level).toBe(4);
    expect(flat.find((c) => c.date === '2026-10-30')!.scheduled).toBe(true);
    expect(flat.some((c) => c.date > '2026-10-30' && c.scheduled)).toBe(false);
  });

  it('counts monthly completion and today progress', () => {
    const habit = makeHabit({ goal: 3 });
    const logs = [makeLog(habit.id, '2026-10-01', 3), makeLog(habit.id, '2026-10-02', 1)];
    expect(monthCompletion(habit, logs, new Date(2026, 9, 1))).toEqual({ done: 1, total: 31 });
    expect(todayProgress(habit, logs, NOW)).toEqual({ value: 0, goal: 3, done: false });
    const todayLog = [...logs, makeLog(habit.id, '2026-10-30', 3)];
    expect(todayProgress(habit, todayLog, NOW).done).toBe(true);
  });
});
