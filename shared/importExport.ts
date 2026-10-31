// CSV / ICS / JSON import-export. Pure functions so they can be unit tested without Electron.

import type { CalendarEvent, Project, Task } from './types';
import { dateKeyOf, parseLocal, toDateKey, toLocalISO } from './date';

// ---------------------------------------------------------------- CSV

export const CSV_COLUMNS = [
  'title',
  'notes',
  'project',
  'tags',
  'priority',
  'status',
  'due_date',
  'start_date',
  'duration_min',
  'recurrence',
  'quadrant',
] as const;

function escapeCsv(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function tasksToCsv(tasks: Task[], projects: Project[]): string {
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const lines = [CSV_COLUMNS.join(',')];
  for (const t of tasks) {
    lines.push(
      [
        t.title,
        t.notes,
        names.get(t.project_id) ?? '',
        parseTagsSafe(t.tags).join('|'),
        t.priority,
        t.status,
        t.due_date ?? '',
        t.start_date ?? '',
        t.duration_min ?? '',
        t.recurrence ?? '',
        t.quadrant ?? '',
      ]
        .map(escapeCsv)
        .join(','),
    );
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

function parseTagsSafe(json: string): string[] {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** RFC4180-ish parser: quotes, embedded newlines, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    if (row.some((c) => c.trim() !== '')) rows.push(row);
  }
  return rows;
}

export interface ImportedTask {
  title: string;
  notes: string;
  project: string;
  tags: string[];
  priority: number;
  status: string;
  due_date: string | null;
  start_date: string | null;
  duration_min: number | null;
  recurrence: string | null;
  quadrant: number | null;
  fingerprint: string;
}

export function normalizeDateInput(v: string): string | null {
  if (!v) return null;
  const trimmed = v.trim();
  // Excel/ISO/date-only variants
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(trimmed);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4] ?? '00'}:${iso[5] ?? '00'}:${iso[6] ?? '00'}`;
  }
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : toLocalISO(d);
}

export function tasksFromCsv(text: string): ImportedTask[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const pick = (row: string[], name: string) => {
    const i = idx(name);
    return i >= 0 ? (row[i] ?? '').trim() : '';
  };
  const out: ImportedTask[] = [];
  for (const row of rows.slice(1)) {
    const title = pick(row, 'title') || pick(row, 'name') || pick(row, 'task');
    if (!title) continue;
    const due = normalizeDateInput(pick(row, 'due_date') || pick(row, 'due') || pick(row, 'date'));
    const start = normalizeDateInput(pick(row, 'start_date') || pick(row, 'start'));
    const tagsRaw = pick(row, 'tags') || pick(row, 'tag');
    const tags = tagsRaw
      .split(/[|,]/)
      .map((t) => t.trim())
      .filter(Boolean);
    const priority = Number(pick(row, 'priority')) || 0;
    const quadrantRaw = Number(pick(row, 'quadrant'));
    out.push({
      title,
      notes: pick(row, 'notes') || pick(row, 'content') || pick(row, 'description'),
      project: pick(row, 'project') || pick(row, 'list'),
      tags,
      priority: [0, 1, 3, 5].includes(priority) ? priority : 0,
      status: (pick(row, 'status') || 'open').toLowerCase(),
      due_date: due,
      start_date: start,
      duration_min: Number(pick(row, 'duration_min') || pick(row, 'duration')) || null,
      recurrence: pick(row, 'recurrence') || null,
      quadrant: quadrantRaw >= 1 && quadrantRaw <= 4 ? quadrantRaw : null,
      fingerprint: fingerprint(title, due, pick(row, 'project')),
    });
  }
  return out;
}

export function fingerprint(title: string, due: string | null, project: string): string {
  const t = title.toLowerCase().replace(/\s+/g, ' ').trim();
  return `${t}|${due ? due.slice(0, 16) : ''}|${project.toLowerCase().trim()}`;
}

export function taskFingerprint(t: Task, projectName: string): string {
  return fingerprint(t.title, t.due_date, projectName);
}

// ---------------------------------------------------------------- ICS

export function unfoldIcs(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines: string[] = [];
  for (const line of raw) {
    if (/^[ \t]/.test(line) && lines.length) lines[lines.length - 1] += line.slice(1);
    else lines.push(line);
  }
  return lines;
}

function unescapeIcs(v: string): string {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function parseIcsDate(value: string): { iso: string | null; allDay: boolean } {
  const v = value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly) return { iso: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00`, allDay: true };
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (dt) {
    if (dt[7] === 'Z') {
      const d = new Date(Date.UTC(+dt[1], +dt[2] - 1, +dt[3], +dt[4], +dt[5], +(dt[6] ?? 0)));
      return { iso: toLocalISO(d), allDay: false };
    }
    return { iso: `${dt[1]}-${dt[2]}-${dt[3]}T${dt[4]}:${dt[5]}:${dt[6] ?? '00'}`, allDay: false };
  }
  const parsed = parseLocal(v);
  return { iso: parsed ? toLocalISO(parsed) : null, allDay: false };
}

export interface ImportedEvent {
  title: string;
  start: string;
  end: string | null;
  all_day: number;
  notes: string;
  location: string;
  recurrence: string | null;
  uid: string | null;
}

export function eventsFromIcs(text: string): ImportedEvent[] {
  const lines = unfoldIcs(text);
  const out: ImportedEvent[] = [];
  let cur: Partial<ImportedEvent> | null = null;
  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) cur = { title: '', start: '', end: null, all_day: 0, notes: '', location: '', recurrence: null, uid: null };
    else if (line.startsWith('END:VEVENT')) {
      if (cur && cur.title && cur.start) out.push(cur as ImportedEvent);
      cur = null;
    } else if (cur) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const left = line.slice(0, i);
      const value = line.slice(i + 1);
      const key = left.split(';')[0].toUpperCase();
      if (key === 'SUMMARY') cur.title = unescapeIcs(value);
      else if (key === 'DTSTART') {
        const p = parseIcsDate(value);
        cur.start = p.iso ?? '';
        if (p.allDay) cur.all_day = 1;
      } else if (key === 'DTEND') cur.end = parseIcsDate(value).iso;
      else if (key === 'DESCRIPTION') cur.notes = unescapeIcs(value);
      else if (key === 'LOCATION') cur.location = unescapeIcs(value);
      else if (key === 'RRULE') cur.recurrence = `RRULE:${value}`;
      else if (key === 'UID') cur.uid = value;
    }
  }
  return out;
}

function foldIcs(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length) {
    parts.push(' ' + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  return parts.join('\r\n');
}

function icsDate(iso: string, allDay: boolean): string {
  const d = parseLocal(iso)!;
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  if (allDay) return ymd;
  return `${ymd}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;
}

export function tasksToIcs(tasks: Task[], projects: Project[], calendarName = 'TickTick Arabic Advanced'): string {
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TickTick Arabic Advanced//AR//EN',
    `X-WR-CALNAME:${calendarName}`,
    'CALSCALE:GREGORIAN',
  ];
  for (const t of tasks) {
    if (!t.due_date) continue;
    const start = t.start_date ?? t.due_date;
    const end = t.end_date ?? (t.duration_min ? toLocalISO(new Date((parseLocal(start)?.getTime() ?? Date.now()) + t.duration_min * 60000)) : null);
    lines.push('BEGIN:VEVENT');
    lines.push(foldIcs(`UID:${t.id}@ticktick-arabic-advanced`));
    lines.push(foldIcs(`SUMMARY:${escapeIcsText(t.title)}`));
    lines.push(`DTSTART:${icsDate(start, !!t.all_day)}`);
    if (end) lines.push(`DTEND:${icsDate(end, !!t.all_day)}`);
    if (t.notes) lines.push(foldIcs(`DESCRIPTION:${escapeIcsText(t.notes)}`));
    if (t.recurrence) lines.push(`RRULE:${t.recurrence.replace(/^RRULE:/i, '')}`);
    lines.push(foldIcs(`CATEGORIES:${escapeIcsText(names.get(t.project_id) ?? '')}`));
    lines.push(`STATUS:${t.status === 'completed' ? 'COMPLETED' : 'CONFIRMED'}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

function escapeIcsText(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function eventsToIcs(events: CalendarEvent[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TickTick Arabic Advanced//AR//EN', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.external_uid ?? e.id}@ticktick-arabic-advanced`);
    lines.push(foldIcs(`SUMMARY:${escapeIcsText(e.title)}`));
    lines.push(`DTSTART:${icsDate(e.start, !!e.all_day)}`);
    if (e.end) lines.push(`DTEND:${icsDate(e.end, !!e.all_day)}`);
    if (e.notes) lines.push(foldIcs(`DESCRIPTION:${escapeIcsText(e.notes)}`));
    if (e.location) lines.push(foldIcs(`LOCATION:${escapeIcsText(e.location)}`));
    if (e.recurrence) lines.push(`RRULE:${e.recurrence.replace(/^RRULE:/i, '')}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------- JSON

export interface ExportBundle {
  app: string;
  version: number;
  exportedAt: string;
  data: Record<string, unknown>;
}

export function buildExportBundle(data: Record<string, unknown>, version = 1): ExportBundle {
  return {
    app: 'TickTick Arabic Advanced',
    version,
    exportedAt: toLocalISO(new Date()),
    data,
  };
}

export function dateOnly(iso: string | null): string {
  return dateKeyOf(iso) ?? toDateKey(new Date());
}
