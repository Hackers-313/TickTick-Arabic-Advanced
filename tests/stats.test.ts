import { describe, expect, it } from 'vitest';
import { computeStats, projectProgress } from '../shared/stats';
import { makeHabit, makeLog, makeProject, makeSession, makeTask, isoDaysAgo } from './helpers';

const NOW = new Date(2026, 9, 30, 12, 0);

describe('statistics', () => {
  const projects = [
    makeProject({ id: 'p1', name: 'عمل', color: '#111' }),
    makeProject({ id: 'p2', name: 'شخصي', color: '#222' }),
    makeProject({ id: 'p3', name: 'فارغ', color: '#333' }),
    makeProject({ id: 'p4', name: 'محذوف', deleted_at: '2026-01-01T00:00:00' }),
  ];
  const tasks = [
    makeTask({ project_id: 'p1', status: 'completed', completed_at: isoDaysAgo(0, NOW), created_at: isoDaysAgo(1, NOW) }),
    makeTask({ project_id: 'p1', status: 'completed', completed_at: isoDaysAgo(1, NOW), created_at: isoDaysAgo(2, NOW) }),
    makeTask({ project_id: 'p2', status: 'completed', completed_at: isoDaysAgo(10, NOW), created_at: isoDaysAgo(11, NOW) }),
    makeTask({ project_id: 'p2', due_date: isoDaysAgo(1, NOW), all_day: 1 }),
    makeTask({ project_id: 'p1', due_date: isoDaysAgo(3, NOW), all_day: 0 }),
    makeTask({ project_id: 'p1' }),
    makeTask({ project_id: 'p2', deleted_at: '2026-01-01T00:00:00' }),
  ];
  const sessions = [
    makeSession({ started_at: isoDaysAgo(0, NOW), duration_sec: 1800 }),
    makeSession({ started_at: isoDaysAgo(1, NOW), duration_sec: 3600, mode: 'stopwatch' }),
    makeSession({ started_at: isoDaysAgo(1, NOW), duration_sec: 600, mode: 'short_break' }),
    makeSession({ started_at: isoDaysAgo(40, NOW), duration_sec: 1200 }),
  ];
  const habits = [makeHabit({ id: 'h1', name: 'قراءة' }), makeHabit({ id: 'h2', name: 'رياضة', archived: 1 })];
  const logs = [makeLog('h1', isoDaysAgo(0, NOW).slice(0, 10)), makeLog('h2', isoDaysAgo(0, NOW).slice(0, 10))];

  const stats = computeStats({ tasks, projects, sessions, habits, logs, now: NOW });

  it('counts open, completed and overdue tasks', () => {
    expect(stats.open).toBe(3);
    expect(stats.overdue).toBe(2);
    expect(stats.completedToday).toBe(1);
    expect(stats.completedWeek).toBe(2);
    expect(stats.completedMonth).toBe(3);
    expect(stats.completionRate).toBe(50); // 3 completed / (3 completed + 3 open)
  });

  it('aggregates focus minutes', () => {
    expect(stats.focusMinutesToday).toBe(30);
    expect(stats.focusMinutesWeek).toBe(90);
    expect(stats.focusMinutesMonth).toBe(90);
  });

  it('builds a daily series of the requested length', () => {
    expect(stats.daily).toHaveLength(30);
    expect(stats.daily[29].date).toBe('2026-10-30');
    expect(stats.daily[29].completed).toBe(1);
    expect(stats.daily[29].focus).toBe(30);
    expect(stats.daily[28].focus).toBe(60);
  });

  it('summarises projects and drops empty/deleted ones', () => {
    expect(stats.projects.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
    const p1 = stats.projects.find((p) => p.id === 'p1')!;
    expect(p1.total).toBe(4);
    expect(p1.completed).toBe(2);
    expect(p1.overdue).toBe(1);
    const p2 = stats.projects.find((p) => p.id === 'p2')!;
    expect(p2.total).toBe(2);
    expect(p2.overdue).toBe(1);
  });

  it('summarises habits and excludes archived ones', () => {
    expect(stats.habitsTotal).toBe(1);
    expect(stats.habitsDoneToday).toBe(1);
    expect(stats.habitAdherence).toHaveLength(1);
    expect(stats.habitAdherence[0]).toMatchObject({ id: 'h1', name: 'قراءة' });
    expect(stats.habitAdherence[0].adherence).toBeGreaterThan(0);
    expect(stats.habitAdherence[0].streak).toBe(1);
  });

  it('compares this week with the previous week', () => {
    expect(stats.comparison.current).toBe(2);
    expect(stats.comparison.previous).toBe(1);
    expect(stats.comparison.delta).toBe(100);
  });

  it('computes project progress percentages', () => {
    expect(projectProgress(tasks, 'p1')).toEqual({ total: 4, completed: 2, percent: 50 });
    expect(projectProgress(tasks, 'p3')).toEqual({ total: 0, completed: 0, percent: 0 });
  });
});
