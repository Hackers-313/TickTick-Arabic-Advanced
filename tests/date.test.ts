import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMinutes,
  addMonths,
  dateKeyOf,
  diffDays,
  endOfDay,
  formatDateTime,
  isSameDay,
  isoWeekNumber,
  overlapsDayRange,
  parseLocal,
  startOfWeek,
  toDateKey,
  toLocalISO,
  toLocalMinutes,
} from '../shared/date';

describe('date helpers', () => {
  it('formats and parses naive local ISO values', () => {
    const d = new Date(2026, 9, 30, 14, 5, 9);
    expect(toDateKey(d)).toBe('2026-10-30');
    expect(toLocalISO(d)).toBe('2026-10-30T14:05:09');
    expect(toLocalMinutes(d)).toBe('2026-10-30T14:05:00');
    const parsed = parseLocal('2026-10-30T14:05:09')!;
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(9);
    expect(parsed.getDate()).toBe(30);
    expect(parsed.getHours()).toBe(14);
    expect(parsed.getMinutes()).toBe(5);
    expect(parsed.getSeconds()).toBe(9);
  });

  it('parses date-only values at midnight and rejects garbage', () => {
    expect(parseLocal('2026-10-30')!.getHours()).toBe(0);
    expect(parseLocal('not-a-date')).toBeNull();
    expect(parseLocal(null)).toBeNull();
    expect(dateKeyOf('2026-10-30T23:59:59')).toBe('2026-10-30');
    expect(dateKeyOf('')).toBeNull();
  });

  it('adds days and months with end-of-month clamping', () => {
    expect(toDateKey(addDays(new Date(2026, 9, 30), 2))).toBe('2026-11-01');
    expect(toDateKey(addDays(new Date(2026, 0, 1), -1))).toBe('2025-12-31');
    expect(toDateKey(addMonths(new Date(2026, 0, 31), 1))).toBe('2026-02-28');
    expect(toDateKey(addMonths(new Date(2024, 0, 31), 1))).toBe('2024-02-29');
    expect(toDateKey(addMonths(new Date(2026, 10, 30), 1))).toBe('2026-12-30');
    expect(toLocalISO(addMinutes(new Date(2026, 9, 30, 23, 30), 45))).toBe('2026-10-31T00:15:00');
  });

  it('starts the week on Saturday by default and supports Sunday', () => {
    const friday = new Date(2026, 9, 30, 15, 0);
    expect(toDateKey(startOfWeek(friday))).toBe('2026-10-24');
    expect(toDateKey(startOfWeek(friday, 0))).toBe('2026-10-25');
    const saturday = new Date(2026, 9, 31);
    expect(toDateKey(startOfWeek(saturday))).toBe('2026-10-31');
  });

  it('computes day differences ignoring the time of day', () => {
    expect(diffDays(new Date(2026, 9, 30, 23, 59), new Date(2026, 9, 29, 0, 1))).toBe(1);
    expect(diffDays(new Date(2026, 9, 30), new Date(2026, 10, 2))).toBe(-3);
    expect(isSameDay(new Date(2026, 9, 30, 1), new Date(2026, 9, 30, 22))).toBe(true);
    expect(toLocalISO(endOfDay(new Date(2026, 9, 30)))).toBe('2026-10-30T23:59:59');
  });

  it('computes ISO week numbers', () => {
    expect(isoWeekNumber(new Date(2024, 0, 1))).toBe(1);
    expect(isoWeekNumber(new Date(2023, 0, 1))).toBe(52);
    expect(isoWeekNumber(new Date(2026, 9, 30))).toBe(44);
  });

  it('formats datetimes in Arabic and English without throwing', () => {
    expect(formatDateTime('2026-10-30T14:05:00', 'en')).toMatch(/Oct/);
    expect(formatDateTime(null, 'ar')).toBe('');
    expect(formatDateTime('2026-10-30T14:05:00', 'ar').length).toBeGreaterThan(0);
  });

  it('detects multi-day overlaps', () => {
    expect(overlapsDayRange('2026-10-28T09:00:00', '2026-10-30T10:00:00', '2026-10-29')).toBe(true);
    expect(overlapsDayRange('2026-10-28T09:00:00', '2026-10-30T10:00:00', '2026-10-31')).toBe(false);
    expect(overlapsDayRange('2026-10-28T09:00:00', null, '2026-10-28')).toBe(true);
  });
});
