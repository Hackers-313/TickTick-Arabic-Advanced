import { describe, expect, it } from 'vitest';
import {
  buildExportBundle,
  dateOnly,
  eventsFromIcs,
  eventsToIcs,
  fingerprint,
  normalizeDateInput,
  parseCsv,
  taskFingerprint,
  tasksFromCsv,
  tasksToCsv,
  tasksToIcs,
  unfoldIcs,
} from '../shared/importExport';
import { makeProject, makeTask } from './helpers';
import { toLocalISO } from '../shared/date';

describe('CSV', () => {
  const projects = [makeProject({ id: 'p1', name: 'العمل' })];
  const tasks = [
    makeTask({
      title: 'اكتب "التقرير", النهائي',
      notes: 'سطر أول\nسطر ثانٍ',
      project_id: 'p1',
      tags: '["عاجل","مالي"]',
      priority: 5,
      status: 'open',
      due_date: '2026-11-02T09:00:00',
      duration_min: 30,
      recurrence: 'RRULE:FREQ=WEEKLY',
      quadrant: 2,
    }),
  ];

  it('exports a BOM-prefixed CSV with escaped quotes and newlines', () => {
    const csv = tasksToCsv(tasks, projects);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"اكتب ""التقرير"", النهائي"');
    expect(csv).toContain('"سطر أول\nسطر ثانٍ"');
    expect(csv).toContain('العمل');
    expect(csv).toContain('عاجل|مالي');
  });

  it('parses quoted fields, embedded newlines and CRLF', () => {
    const rows = parseCsv('\uFEFFa,b,c\r\n"x,y","line1\nline2","he said ""hi"""\r\n');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['x,y', 'line1\nline2', 'he said "hi"'],
    ]);
    expect(parseCsv('')).toEqual([]);
  });

  it('round-trips exported CSV through the importer', () => {
    const imported = tasksFromCsv(tasksToCsv(tasks, projects));
    expect(imported).toHaveLength(1);
    expect(imported[0].title).toBe('اكتب "التقرير", النهائي');
    expect(imported[0].notes).toBe('سطر أول\nسطر ثانٍ');
    expect(imported[0].tags).toEqual(['عاجل', 'مالي']);
    expect(imported[0].priority).toBe(5);
    expect(imported[0].due_date).toBe('2026-11-02T09:00:00');
    expect(imported[0].project).toBe('العمل');
    expect(imported[0].quadrant).toBe(2);
    expect(imported[0].fingerprint).toBe(fingerprint(imported[0].title, imported[0].due_date, 'العمل'));
  });

  it('accepts flexible headers and sanitises values', () => {
    const csv = 'Name,Due,Tag,Priority,Quadrant\nمهمة,2026/11/02,one,two,9\n,2026-11-02,x,1,1\n';
    const rows = tasksFromCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('مهمة');
    expect(rows[0].priority).toBe(0);
    expect(rows[0].quadrant).toBeNull();
    expect(rows[0].tags).toEqual(['one']);
  });

  it('normalises date input variants', () => {
    expect(normalizeDateInput('2026-11-02')).toBe('2026-11-02T00:00:00');
    expect(normalizeDateInput('2026-11-02 09:30')).toBe('2026-11-02T09:30:00');
    expect(normalizeDateInput('2026-11-02T09:30:15')).toBe('2026-11-02T09:30:15');
    expect(normalizeDateInput('')).toBeNull();
    expect(normalizeDateInput('garbage')).toBeNull();
  });

  it('builds stable fingerprints', () => {
    expect(fingerprint('  Hello   World ', '2026-11-02T09:00:00', ' Work ')).toBe('hello world|2026-11-02T09:00|work');
    expect(taskFingerprint(makeTask({ title: 'A', due_date: '2026-11-02T09:00:00' }), 'Work')).toBe('a|2026-11-02T09:00|work');
  });
});

describe('ICS', () => {
  const sample = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:evt-1@example.com',
    'SUMMARY:اجتماع، مهم',
    'DTSTART;VALUE=DATE:20261102',
    'DTEND;VALUE=DATE:20261103',
    'DESCRIPTION:سطر أول\\nسطر ثانٍ',
    'LOCATION:رام الله',
    'RRULE:FREQ=WEEKLY;BYDAY=MO',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:evt-2@example.com',
    'SUMMARY:UTC event',
    'DTSTART:20261102T100000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  it('unfolds continuation lines', () => {
    expect(unfoldIcs('DESCRIPTION:hello\r\n world\r\nSUMMARY:x')).toEqual(['DESCRIPTION:helloworld', 'SUMMARY:x']);
  });

  it('parses all-day, local and UTC events', () => {
    const events = eventsFromIcs(sample);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      title: 'اجتماع، مهم',
      start: '2026-11-02T00:00:00',
      end: '2026-11-03T00:00:00',
      all_day: 1,
      notes: 'سطر أول\nسطر ثانٍ',
      location: 'رام الله',
      recurrence: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
      uid: 'evt-1@example.com',
    });
    const expectedUtc = toLocalISO(new Date(Date.UTC(2026, 10, 2, 10, 0, 0)));
    expect(events[1].start).toBe(expectedUtc);
  });

  it('skips malformed events without a title or start', () => {
    const text = 'BEGIN:VEVENT\nSUMMARY:no start\nEND:VEVENT\nBEGIN:VEVENT\nDTSTART:20261102T100000\nEND:VEVENT\n';
    expect(eventsFromIcs(text)).toEqual([]);
  });

  it('exports tasks and re-imports them as events', () => {
    const project = makeProject({ id: 'p1', name: 'عمل' });
    const task = makeTask({
      title: 'تسليم, نهائي',
      notes: 'ملاحظة\nثانية',
      due_date: '2026-11-02T09:00:00',
      duration_min: 60,
      recurrence: 'RRULE:FREQ=DAILY',
      project_id: 'p1',
    });
    const ics = tasksToIcs([task], [project]);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:تسليم\\, نهائي');
    expect(ics).toContain('RRULE:FREQ=DAILY');
    const events = eventsFromIcs(ics);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('تسليم, نهائي');
    expect(events[0].start).toBe('2026-11-02T09:00:00');
    expect(events[0].end).toBe('2026-11-02T10:00:00');
  });

  it('exports standalone events with location and notes', () => {
    const ics = eventsToIcs([
      {
        id: 'e1',
        title: 'Event',
        start: '2026-11-02T09:00:00',
        end: null,
        all_day: 0,
        color: '#000',
        project_id: null,
        notes: 'note',
        location: 'Ramallah',
        recurrence: null,
        source: 'local',
        external_uid: 'uid-1',
        created_at: '2026-01-01T00:00:00',
        updated_at: '2026-01-01T00:00:00',
      },
    ]);
    expect(ics).toContain('UID:uid-1@ticktick-arabic-advanced');
    expect(ics).toContain('LOCATION:Ramallah');
    expect(ics).toContain('DESCRIPTION:note');
  });
});

describe('JSON bundle', () => {
  it('wraps data with app metadata', () => {
    const bundle = buildExportBundle({ tasks: [] });
    expect(bundle.app).toBe('TickTick Arabic Advanced');
    expect(bundle.version).toBe(1);
    expect(bundle.data).toEqual({ tasks: [] });
    expect(bundle.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it('extracts date-only keys', () => {
    expect(dateOnly('2026-11-02T09:00:00')).toBe('2026-11-02');
    expect(dateOnly(null)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
