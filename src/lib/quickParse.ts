import type { Priority, Project, Tag } from '../../shared/types';
import { addDays, toDateKey, toLocalISO } from '../../shared/date';
import { normalize } from '../../shared/filters';

export interface QuickParseResult {
  title: string;
  due_date: string | null;
  all_day: number;
  priority: Priority;
  tags: string[];
  project_id: string | null;
  matched: string[];
}

const WEEKDAYS: Record<string, number> = {
  'الاحد': 0,
  'الأحد': 0,
  'احد': 0,
  'الاثنين': 1,
  'الإثنين': 1,
  'اثنين': 1,
  'الثلاثاء': 2,
  'ثلاثاء': 2,
  'الاربعاء': 3,
  'الأربعاء': 3,
  'اربعاء': 3,
  'الخميس': 4,
  'خميس': 4,
  'الجمعة': 5,
  'جمعه': 5,
  'السبت': 6,
  'سبت': 6,
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const AR_DIGITS: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
};

export function toWesternDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => AR_DIGITS[d] ?? d);
}

function nextWeekday(from: Date, weekday: number): Date {
  const diff = (weekday - from.getDay() + 7) % 7 || 7;
  return addDays(from, diff);
}

interface TimeMatch {
  hour: number;
  minute: number;
  text: string;
}

function extractTime(input: string): TimeMatch | null {
  const s = toWesternDigits(input);
  // 10:30 / 10.30 / 10h30
  let m = /(?:^|\s)([01]?\d|2[0-3])[:.h]([0-5]\d)(?:\s*(ص|م|am|pm))?(?=\s|$)/i.exec(s);
  if (m) {
    let hour = Number(m[1]);
    const minute = Number(m[2]);
    const suffix = (m[3] ?? '').toLowerCase();
    if ((suffix === 'م' || suffix === 'pm') && hour < 12) hour += 12;
    if ((suffix === 'ص' || suffix === 'am') && hour === 12) hour = 0;
    return { hour, minute, text: m[0] };
  }
  // 10pm / 10 م / الساعة 10
  m = /(?:^|\s)(?:الساعة\s*)?([01]?\d|2[0-3])\s*(ص|م|am|pm)(?=\s|$)/i.exec(s);
  if (m) {
    let hour = Number(m[1]);
    const suffix = (m[2] ?? '').toLowerCase();
    if ((suffix === 'م' || suffix === 'pm') && hour < 12) hour += 12;
    if ((suffix === 'ص' || suffix === 'am') && hour === 12) hour = 0;
    return { hour, minute: 0, text: m[0] };
  }
  return null;
}

function extractDate(input: string, now: Date): { date: Date; text: string } | null {
  const s = toWesternDigits(input);
  const lower = s.toLowerCase();

  const explicit = /(?:^|\s)(\d{4})-(\d{2})-(\d{2})(?=\s|$)/.exec(s);
  if (explicit) {
    const d = new Date(Number(explicit[1]), Number(explicit[2]) - 1, Number(explicit[3]));
    if (!isNaN(d.getTime())) return { date: d, text: explicit[0] };
  }
  const dmy = /(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s|$)/.exec(s);
  if (dmy) {
    const year = dmy[3] ? (dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3])) : now.getFullYear();
    const d = new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
    if (!isNaN(d.getTime())) return { date: d, text: dmy[0] };
  }

  const relative: [RegExp, number][] = [
    [/(?:^|\s)(?:بعد\s*غد|بعد\s*بكرة)(?=\s|$)/, 2],
    [/(?:^|\s)(?:غدا|غدًا|غداً|بكرة|tomorrow)(?=\s|$)/, 1],
    [/(?:^|\s)(?:اليوم|today)(?=\s|$)/, 0],
  ];
  for (const [re, offset] of relative) {
    const m = re.exec(lower);
    if (m) return { date: addDays(now, offset), text: m[0] };
  }
  if (/(?:^|\s)(?:بعد\s*أسبوع|next\s*week)(?=\s|$)/.test(lower)) return { date: addDays(now, 7), text: 'next week' };

  const words = lower.split(/\s+/);
  for (const w of words) {
    const clean = w.replace(/[،,.!?]/g, '');
    const wd = WEEKDAYS[clean] ?? WEEKDAYS[normalize(clean)];
    if (wd !== undefined) return { date: nextWeekday(now, wd), text: w };
  }
  return null;
}

function priorityFromToken(token: string): Priority | null {
  const v = normalize(token);
  if (['high', 'h', '3', '!!!', 'عالي', 'عاليه', 'مرتفع'].includes(v)) return 5;
  if (['medium', 'med', 'm', '2', '!!', 'متوسط', 'متوسطه'].includes(v)) return 3;
  if (['low', 'l', '1', '!', 'منخفض', 'منخفضه'].includes(v)) return 1;
  if (['none', '0', 'بدون'].includes(v)) return 0;
  return null;
}

/**
 * Parses the small "natural language" subset used by the quick-add box:
 * `#tag`, `@project`, `!high`, `today`, `tomorrow`, `sunday`, `10:30`, `2026-11-02`.
 */
export function quickParse(
  raw: string,
  opts: { projects: Project[]; tags: Tag[]; now?: Date } = { projects: [], tags: [] },
): QuickParseResult {
  const now = opts.now ?? new Date();
  let rest = raw.trim();
  const matched: string[] = [];
  const tags: string[] = [];
  let projectId: string | null = null;
  let priority: Priority = 0;

  rest = rest.replace(/(?:^|\s)#([^\s#]+)/g, (full, name: string) => {
    tags.push(name);
    matched.push(full.trim());
    return '';
  });

  rest = rest.replace(/(?:^|\s)@([^\s@]+)/g, (full, name: string) => {
    const target = opts.projects.find((p) => normalize(p.name) === normalize(name));
    if (target) {
      projectId = target.id;
      matched.push(full.trim());
      return '';
    }
    return full;
  });

  rest = rest.replace(/(?:^|\s)!([^\s!]+)/g, (full, name: string) => {
    const p = priorityFromToken(name);
    if (p === null) return full;
    priority = p;
    matched.push(full.trim());
    return '';
  });

  const time = extractTime(rest);
  let date: { date: Date; text: string } | null = null;
  if (time) {
    rest = rest.replace(time.text, ' ');
    matched.push(time.text.trim());
  }
  date = extractDate(rest, now);
  if (date) {
    rest = rest.replace(date.text, ' ');
    matched.push(date.text.trim());
  }

  let due: string | null = null;
  let allDay = 0;
  if (date) {
    const d = new Date(date.date);
    if (time) {
      d.setHours(time.hour, time.minute, 0, 0);
    } else {
      d.setHours(0, 0, 0, 0);
      allDay = 1;
    }
    due = toLocalISO(d);
  } else if (time) {
    const d = new Date(now);
    d.setHours(time.hour, time.minute, 0, 0);
    due = toLocalISO(d);
  }

  const title = rest.replace(/\s+/g, ' ').trim();
  return { title, due_date: due, all_day: allDay, priority, tags, project_id: projectId, matched };
}

export function todayISOKey(d = new Date()): string {
  return toDateKey(d);
}
