// Pure date helpers. All stored datetimes are naive local ISO strings: YYYY-MM-DDTHH:mm:ss
// Keeping them naive-local makes lexicographic comparison valid and avoids DST surprises
// in a single-user desktop app.

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toLocalISO(d: Date): string {
  return `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function toLocalMinutes(d: Date): string {
  return `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

export function parseLocal(s?: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
    Number(m[6] ?? 0),
  );
}

export function dateKeyOf(s?: string | null): string | null {
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : null;
}

export function todayKey(now = new Date()): string {
  return toDateKey(now);
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d.getTime());
  c.setDate(c.getDate() + n);
  return c;
}

export function addMonths(d: Date, n: number): Date {
  const c = new Date(d.getTime());
  const day = c.getDate();
  c.setDate(1);
  c.setMonth(c.getMonth() + n);
  const dim = new Date(c.getFullYear(), c.getMonth() + 1, 0).getDate();
  c.setDate(Math.min(day, dim));
  return c;
}

export function addMinutes(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 60000);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
}

/** Week starts on Saturday by default (Arabic convention), configurable 0=Sunday..6=Saturday */
export function startOfWeek(d: Date, weekStart = 6): Date {
  const s = startOfDay(d);
  const diff = (s.getDay() - weekStart + 7) % 7;
  return addDays(s, -diff);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
}

export function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

export function endOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 11, 31, 23, 59, 59);
}

export function diffDays(a: Date, b: Date): number {
  const ms = startOfDay(a).getTime() - startOfDay(b).getTime();
  return Math.round(ms / 86400000);
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

export function minutesOfDay(s?: string | null): number {
  const d = parseLocal(s);
  if (!d) return 0;
  return d.getHours() * 60 + d.getMinutes();
}

export function isoWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function formatTime(d: Date, locale = 'ar', hour12 = true): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12,
  }).format(d);
}

export function formatDate(d: Date, locale = 'ar', opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(
    locale === 'ar' ? 'ar-EG' : 'en-GB',
    opts ?? { year: 'numeric', month: 'long', day: 'numeric' },
  ).format(d);
}

export function formatDateTime(s: string | null | undefined, locale = 'ar'): string {
  const d = parseLocal(s);
  if (!d) return '';
  return `${formatDate(d, locale, { month: 'short', day: 'numeric' })} ${formatTime(d, locale)}`;
}

export function weekdayNames(locale = 'ar', weekStart = 6): string[] {
  const fmt = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'short' });
  const base = new Date(2024, 0, 6); // Saturday
  return Array.from({ length: 7 }, (_, i) => fmt.format(addDays(base, i)));
}

export function monthNames(locale = 'ar'): string[] {
  const fmt = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { month: 'long' });
  return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2024, i, 1)));
}

export function relativeDayLabel(d: Date, locale = 'ar', now = new Date()): string {
  const diff = diffDays(d, now);
  if (diff === 0) return locale === 'ar' ? 'اليوم' : 'Today';
  if (diff === 1) return locale === 'ar' ? 'غدًا' : 'Tomorrow';
  if (diff === -1) return locale === 'ar' ? 'أمس' : 'Yesterday';
  return formatDate(d, locale, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function overlapsDayRange(startISO: string, endISO: string | null, dayKey: string): boolean {
  const startKey = dateKeyOf(startISO);
  const endKey = dateKeyOf(endISO) ?? startKey;
  if (!startKey || !endKey) return false;
  return dayKey >= startKey && dayKey <= endKey;
}
