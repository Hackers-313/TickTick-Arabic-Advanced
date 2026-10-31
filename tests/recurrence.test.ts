import { describe, expect, it } from 'vitest';
import {
  buildRRule,
  describeRule,
  expandRecurrence,
  nextOccurrence,
  parseRRule,
} from '../shared/recurrence';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe('RRULE parsing', () => {
  it('parses frequency, interval, byday, count and until', () => {
    const r = parseRRule('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=8;UNTIL=20261231T235959Z')!;
    expect(r.freq).toBe('WEEKLY');
    expect(r.interval).toBe(2);
    expect(r.byday).toEqual([1, 3]);
    expect(r.count).toBe(8);
    expect(r.until).toBe('2026-12-31T23:59:59');
    expect(r.raw).toContain('FREQ=WEEKLY');
  });

  it('accepts lowercase input and defaults', () => {
    const r = parseRRule('rrule:freq=daily')!;
    expect(r.freq).toBe('DAILY');
    expect(r.interval).toBe(1);
    expect(r.byday).toEqual([]);
    expect(r.count).toBeNull();
    expect(r.until).toBeNull();
  });

  it('returns null for unsupported or empty rules', () => {
    expect(parseRRule('')).toBeNull();
    expect(parseRRule('RRULE:FREQ=HOURLY')).toBeNull();
    expect(parseRRule('FREQ=MONTHLY;BYMONTHDAY=15')!.freq).toBe('MONTHLY');
  });

  it('builds canonical rules', () => {
    expect(buildRRule({ freq: 'DAILY' })).toBe('RRULE:FREQ=DAILY');
    expect(buildRRule({ freq: 'WEEKLY', interval: 2, byday: [6, 0] })).toBe('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SA,SU');
    expect(buildRRule({ freq: 'MONTHLY', count: 5, until: '2026-12-31T23:59:59' })).toBe(
      'RRULE:FREQ=MONTHLY;COUNT=5;UNTIL=20261231T235959',
    );
  });
});

describe('recurrence expansion', () => {
  it('returns only the base occurrence when there is no rule', () => {
    expect(expandRecurrence(null, '2026-10-30T09:00:00', at(2026, 10, 1), at(2026, 11, 30))).toEqual([
      '2026-10-30T09:00:00',
    ]);
  });

  it('expands daily occurrences within the range', () => {
    const out = expandRecurrence('RRULE:FREQ=DAILY', '2026-10-28T09:00:00', at(2026, 10, 29), new Date(2026, 10, 2, 23, 59));
    expect(out).toEqual([
      '2026-10-29T09:00:00',
      '2026-10-30T09:00:00',
      '2026-10-31T09:00:00',
      '2026-11-01T09:00:00',
      '2026-11-02T09:00:00',
    ]);
  });

  it('honours INTERVAL, COUNT and UNTIL', () => {
    const everyOther = expandRecurrence(
      'RRULE:FREQ=DAILY;INTERVAL=2',
      '2026-10-28T09:00:00',
      at(2026, 10, 28),
      at(2026, 11, 3),
    );
    expect(everyOther).toEqual(['2026-10-28T09:00:00', '2026-10-30T09:00:00', '2026-11-01T09:00:00']);

    const counted = expandRecurrence('RRULE:FREQ=DAILY;COUNT=3', '2026-10-28T09:00:00', at(2026, 10, 1), at(2026, 12, 1));
    expect(counted).toHaveLength(3);

    const until = expandRecurrence(
      'RRULE:FREQ=DAILY;UNTIL=20261030T235959',
      '2026-10-28T09:00:00',
      at(2026, 10, 1),
      at(2026, 12, 1),
    );
    expect(until).toEqual(['2026-10-28T09:00:00', '2026-10-29T09:00:00', '2026-10-30T09:00:00']);
  });

  it('expands weekly rules on selected weekdays', () => {
    const out = expandRecurrence(
      'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR',
      '2026-10-05T08:00:00',
      at(2026, 10, 1),
      at(2026, 10, 31),
    );
    expect(out).toHaveLength(12);
    expect(out[0]).toBe('2026-10-05T08:00:00');
    expect(out).toContain('2026-10-30T08:00:00');
    expect(out).not.toContain('2026-10-02T08:00:00'); // before the base
  });

  it('supports biweekly rules with weekday sets', () => {
    const out = expandRecurrence(
      'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SA',
      '2026-10-03T10:00:00',
      at(2026, 10, 1),
      at(2026, 11, 15),
    );
    expect(out).toEqual(['2026-10-03T10:00:00', '2026-10-17T10:00:00', '2026-10-31T10:00:00', '2026-11-14T10:00:00']);
  });

  it('expands monthly and yearly rules', () => {
    const monthly = expandRecurrence('RRULE:FREQ=MONTHLY', '2026-01-15T09:00:00', at(2026, 1, 1), at(2026, 4, 30));
    expect(monthly.map((s) => s.slice(0, 7))).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);

    const yearly = expandRecurrence('RRULE:FREQ=YEARLY', '2024-02-29T09:00:00', at(2024, 1, 1), at(2028, 12, 31));
    expect(yearly.map((s) => s.slice(0, 4))).toEqual(['2024', '2025', '2026', '2027', '2028']);
  });

  it('finds the next occurrence strictly after a timestamp', () => {
    expect(nextOccurrence('RRULE:FREQ=DAILY', '2026-10-30T09:00:00', new Date(2026, 9, 30, 12, 0))).toBe(
      '2026-10-31T09:00:00',
    );
    expect(nextOccurrence('RRULE:FREQ=WEEKLY;BYDAY=MO', '2026-10-05T09:00:00', new Date(2026, 9, 30, 12, 0))).toBe(
      '2026-11-02T09:00:00',
    );
    expect(nextOccurrence(null, '2026-10-30T09:00:00', new Date(2026, 9, 30, 12, 0))).toBeNull();
  });

  it('describes rules in Arabic and English', () => {
    expect(describeRule(null, 'ar')).toBe('لا يتكرر');
    expect(describeRule(null, 'en')).toBe('Does not repeat');
    expect(describeRule('RRULE:FREQ=DAILY', 'en')).toBe('Daily');
    expect(describeRule('RRULE:FREQ=DAILY;INTERVAL=3', 'en')).toBe('every 3 days');
    expect(describeRule('RRULE:FREQ=WEEKLY;BYDAY=MO,WE', 'en')).toBe('week on Mon, Wed');
    expect(describeRule('RRULE:FREQ=MONTHLY;COUNT=4', 'ar')).toBe('شهر · 4 مرة');
    expect(describeRule('RRULE:FREQ=YEARLY;UNTIL=20301231T235959', 'en')).toBe('year · until 2030-12-31');
  });
});
