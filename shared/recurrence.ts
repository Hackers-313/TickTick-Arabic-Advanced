// A deliberately small RRULE engine covering the recurrence patterns TickTick exposes
// (daily / weekly with weekdays / monthly / yearly, with interval, count and until).
// Unsupported RRULE parts are ignored rather than silently mis-scheduled.

import { addDays, addMonths, dateKeyOf, parseLocal, toLocalISO } from './date';

export interface ParsedRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  byday: number[]; // 0=Sunday..6=Saturday
  until: string | null;
  count: number | null;
  raw: string;
}

const DAY_MAP: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const DAY_CODE = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function parseRRule(rule: string): ParsedRule | null {
  if (!rule) return null;
  const body = rule.replace(/^RRULE:/i, '');
  const parts = new Map<string, string>();
  for (const chunk of body.split(';')) {
    const [k, v] = chunk.split('=');
    if (k && v) parts.set(k.toUpperCase(), v);
  }
  const freq = (parts.get('FREQ') || '').toUpperCase() as ParsedRule['freq'];
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null;
  const interval = Math.max(1, parseInt(parts.get('INTERVAL') || '1', 10) || 1);
  const byday = (parts.get('BYDAY') || '')
    .split(',')
    .map((d) => DAY_MAP[d.trim().slice(-2).toUpperCase()])
    .filter((n): n is number => typeof n === 'number');
  const untilRaw = parts.get('UNTIL') || null;
  const countRaw = parts.get('COUNT') || null;
  return {
    freq,
    interval,
    byday,
    until: untilRaw ? normalizeUntil(untilRaw) : null,
    count: countRaw ? parseInt(countRaw, 10) || null : null,
    raw: body,
  };
}

function normalizeUntil(v: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(v);
  if (!m) return v.includes('-') ? v : null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '23'}:${m[5] ?? '59'}:${m[6] ?? '59'}`;
}

export function buildRRule(opts: {
  freq: ParsedRule['freq'];
  interval?: number;
  byday?: number[];
  until?: string | null;
  count?: number | null;
}): string {
  const parts = [`FREQ=${opts.freq}`];
  if (opts.interval && opts.interval > 1) parts.push(`INTERVAL=${opts.interval}`);
  if (opts.byday && opts.byday.length && opts.freq === 'WEEKLY') {
    parts.push(`BYDAY=${opts.byday.map((d) => DAY_CODE[d]).join(',')}`);
  }
  if (opts.count) parts.push(`COUNT=${opts.count}`);
  if (opts.until) parts.push(`UNTIL=${opts.until.replace(/[-:]/g, '').replace('T', 'T')}`);
  return `RRULE:${parts.join(';')}`;
}

/**
 * All occurrences starting at `baseISO`, bounded by [rangeStart, rangeEnd].
 * The first occurrence is always the base itself.
 */
export function expandRecurrence(
  rule: string | null,
  baseISO: string,
  rangeStart: Date,
  rangeEnd: Date,
  maxIterations = 800,
): string[] {
  const base = parseLocal(baseISO);
  if (!base) return [];
  const parsed = rule ? parseRRule(rule) : null;
  if (!parsed) return [toLocalISO(base)];

  const time = baseISO.slice(10); // "THH:mm:ss" keeps the original clock time
  const out: string[] = [];
  let produced = 0;
  const push = (d: Date) => {
    const iso = `${dateKeyOf(toLocalISO(d))}${time}`;
    produced += 1;
    if (parsed.count && produced > parsed.count) return false;
    if (parsed.until && iso > parsed.until) return false;
    if (d >= rangeStart && d <= rangeEnd) out.push(iso);
    return true;
  };

  if (parsed.freq === 'WEEKLY' && parsed.byday.length) {
    const days = [...new Set(parsed.byday)].sort();
    let cursor = addDays(base, -((base.getDay() - days[0] + 7) % 7));
    // align cursor to the week containing base
    for (let i = 0; i < maxIterations; i++) {
      let stop = false;
      for (const wd of days) {
        const diff = (wd - days[0] + 7) % 7;
        const d = addDays(cursor, diff);
        if (d < base) continue;
        if (d > rangeEnd && parsed.until && toLocalISO(d) > parsed.until) {
          stop = true;
          break;
        }
        if (!push(d)) {
          stop = true;
          break;
        }
        if (d > rangeEnd && !parsed.count) {
          stop = true;
          break;
        }
      }
      if (stop) break;
      cursor = addDays(cursor, 7 * parsed.interval);
    }
    return out;
  }

  let cursor = new Date(base.getTime());
  for (let i = 0; i < maxIterations; i++) {
    if (cursor > rangeEnd && (!parsed.count || produced >= parsed.count)) break;
    if (!push(cursor)) break;
    if (cursor > rangeEnd) break;
    if (parsed.freq === 'DAILY') cursor = addDays(cursor, parsed.interval);
    else if (parsed.freq === 'WEEKLY') cursor = addDays(cursor, 7 * parsed.interval);
    else if (parsed.freq === 'MONTHLY') cursor = addMonths(cursor, parsed.interval);
    else cursor = addMonths(cursor, 12 * parsed.interval);
  }
  return out;
}

/** The next occurrence strictly after `after` (used to roll a completed recurring task forward). */
export function nextOccurrence(rule: string | null, baseISO: string, after: Date): string | null {
  if (!rule) return null;
  const horizon = new Date(after.getTime());
  horizon.setFullYear(horizon.getFullYear() + 3);
  const occurrences = expandRecurrence(rule, baseISO, after, horizon, 1200);
  const afterISO = toLocalISO(after);
  return occurrences.find((o) => o > afterISO) ?? null;
}

export function describeRule(rule: string | null, locale: 'ar' | 'en' = 'ar'): string {
  const p = rule ? parseRRule(rule) : null;
  if (!p) return locale === 'ar' ? 'لا يتكرر' : 'Does not repeat';
  const dayNames =
    locale === 'ar'
      ? ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const every = p.interval > 1 ? (locale === 'ar' ? `كل ${p.interval} ` : `every ${p.interval} `) : '';
  let text = '';
  switch (p.freq) {
    case 'DAILY':
      text = locale === 'ar' ? (p.interval > 1 ? `كل ${p.interval} أيام` : 'كل يوم') : p.interval > 1 ? `every ${p.interval} days` : 'Daily';
      break;
    case 'WEEKLY': {
      const days = p.byday.length ? p.byday.map((d) => dayNames[d]).join(locale === 'ar' ? '، ' : ', ') : '';
      text =
        locale === 'ar'
          ? `${every}أسبوع${days ? ` (${days})` : ''}`
          : `${every}week${p.interval > 1 ? 's' : ''}${days ? ` on ${days}` : ''}`;
      break;
    }
    case 'MONTHLY':
      text = locale === 'ar' ? `${every}شهر` : `${every}month${p.interval > 1 ? 's' : ''}`;
      break;
    case 'YEARLY':
      text = locale === 'ar' ? `${every}سنة` : `${every}year${p.interval > 1 ? 's' : ''}`;
      break;
  }
  if (p.count) text += locale === 'ar' ? ` · ${p.count} مرة` : ` · ${p.count} times`;
  if (p.until) text += locale === 'ar' ? ` · حتى ${p.until.slice(0, 10)}` : ` · until ${p.until.slice(0, 10)}`;
  return text;
}

export const RECURRENCE_PRESETS: { key: string; ar: string; en: string; rule: string | null }[] = [
  { key: 'none', ar: 'لا يتكرر', en: 'Never', rule: null },
  { key: 'daily', ar: 'كل يوم', en: 'Daily', rule: 'RRULE:FREQ=DAILY' },
  { key: 'weekdays', ar: 'أيام العمل', en: 'Weekdays', rule: 'RRULE:FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH' },
  { key: 'weekly', ar: 'كل أسبوع', en: 'Weekly', rule: 'RRULE:FREQ=WEEKLY' },
  { key: 'biweekly', ar: 'كل أسبوعين', en: 'Every 2 weeks', rule: 'RRULE:FREQ=WEEKLY;INTERVAL=2' },
  { key: 'monthly', ar: 'كل شهر', en: 'Monthly', rule: 'RRULE:FREQ=MONTHLY' },
  { key: 'yearly', ar: 'كل سنة', en: 'Yearly', rule: 'RRULE:FREQ=YEARLY' },
];
