import { describe, expect, it } from 'vitest';
import { quickParse, toWesternDigits } from '../src/lib/quickParse';
import { makeProject } from './helpers';

const NOW = new Date(2026, 9, 30, 9, 0, 0); // Friday 30 Oct 2026, 09:00
const projects = [makeProject({ id: 'p-work', name: 'العمل' })];

describe('quick add parsing', () => {
  it('converts Arabic-Indic digits', () => {
    expect(toWesternDigits('٣٢١')).toBe('321');
    expect(toWesternDigits('abc')).toBe('abc');
  });

  it('extracts tags, project, priority and a relative date', () => {
    const r = quickParse('اشترِ حليب غدا #منزل @العمل !high', { projects, tags: [], now: NOW });
    expect(r.title).toBe('اشترِ حليب');
    expect(r.tags).toEqual(['منزل']);
    expect(r.project_id).toBe('p-work');
    expect(r.priority).toBe(5);
    expect(r.due_date).toBe('2026-10-31T00:00:00');
    expect(r.all_day).toBe(1);
    expect(r.matched.length).toBeGreaterThanOrEqual(3);
  });

  it('parses Arabic and English priorities', () => {
    expect(quickParse('مهمة !عالي', { projects: [], tags: [], now: NOW }).priority).toBe(5);
    expect(quickParse('task !medium', { projects: [], tags: [], now: NOW }).priority).toBe(3);
    expect(quickParse('task !low', { projects: [], tags: [], now: NOW }).priority).toBe(1);
    expect(quickParse('task !none', { projects: [], tags: [], now: NOW }).priority).toBe(0);
    expect(quickParse('task !unknown', { projects: [], tags: [], now: NOW }).title).toBe('task !unknown');
  });

  it('parses a time with 24h and meridiem forms', () => {
    const a = quickParse('اجتماع 10:30', { projects: [], tags: [], now: NOW });
    expect(a.title).toBe('اجتماع');
    expect(a.due_date).toBe('2026-10-30T10:30:00');
    expect(a.all_day).toBe(0);

    const b = quickParse('مكالمة ٣ م', { projects: [], tags: [], now: NOW });
    expect(b.due_date).toBe('2026-10-30T15:00:00');

    const c = quickParse('standup 9am', { projects: [], tags: [], now: NOW });
    expect(c.due_date).toBe('2026-10-30T09:00:00');
  });

  it('parses explicit and relative dates', () => {
    expect(quickParse('تقرير 2026-11-02', { projects: [], tags: [], now: NOW }).due_date).toBe('2026-11-02T00:00:00');
    expect(quickParse('مهمة اليوم', { projects: [], tags: [], now: NOW }).due_date).toBe('2026-10-30T00:00:00');
    expect(quickParse('مهمة بعد غد', { projects: [], tags: [], now: NOW }).due_date).toBe('2026-11-01T00:00:00');
    expect(quickParse('مهمة الأحد', { projects: [], tags: [], now: NOW }).due_date).toBe('2026-11-01T00:00:00');
    expect(quickParse('task monday', { projects: [], tags: [], now: NOW }).due_date).toBe('2026-11-02T00:00:00');
  });

  it('parses D/M and D/M/Y dates', () => {
    expect(quickParse('موعد 2/11', { projects: [], tags: [], now: NOW }).due_date).toBe('2026-11-02T00:00:00');
    expect(quickParse('موعد 2/11/2027', { projects: [], tags: [], now: NOW }).due_date).toBe('2027-11-02T00:00:00');
  });

  it('keeps an unknown @word in the title', () => {
    const r = quickParse('راسل @شخص', { projects, tags: [], now: NOW });
    expect(r.project_id).toBeNull();
    expect(r.title).toBe('راسل @شخص');
  });

  it('returns no date for plain text', () => {
    const r = quickParse('فقط مهمة عادية', { projects: [], tags: [], now: NOW });
    expect(r.title).toBe('فقط مهمة عادية');
    expect(r.due_date).toBeNull();
    expect(r.all_day).toBe(0);
  });
});
