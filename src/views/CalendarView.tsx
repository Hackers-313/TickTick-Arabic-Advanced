import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { CalendarEvent, Task } from '../../shared/types';
import { useApp } from '../store';
import {
  addDays,
  addMinutes,
  dateKeyOf,
  endOfDay,
  endOfMonth,
  formatDate,
  formatTime,
  monthNames,
  parseLocal,
  startOfDay,
  startOfMonth,
  startOfWeek,
  toDateKey,
  toLocalISO,
  weekdayNames,
  isoWeekNumber,
} from '../../shared/date';
import { expandRecurrence } from '../../shared/recurrence';

type Mode = 'day' | 'week' | 'month' | 'year' | 'agenda';

interface Entry {
  uid: string;
  kind: 'task' | 'event';
  id: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  color: string;
  done?: boolean;
}

const HOUR_HEIGHT = 56;

export function CalendarView() {
  const { data, lang, settings, openEditor, openEventEditor, call, refresh, toast, t } = useApp();
  const [mode, setMode] = useState<Mode>('week');
  const [cursor, setCursor] = useState(new Date());

  const weekStart = settings?.week_start ?? 6;

  const range = useMemo(() => {
    if (mode === 'day') return { start: startOfDay(cursor), end: endOfDay(cursor) };
    if (mode === 'week') {
      const s = startOfWeek(cursor, weekStart);
      return { start: s, end: endOfDay(addDays(s, 6)) };
    }
    if (mode === 'month') {
      const s = startOfWeek(startOfMonth(cursor), weekStart);
      return { start: s, end: endOfDay(addDays(s, 41)) };
    }
    if (mode === 'year') return { start: new Date(cursor.getFullYear(), 0, 1), end: new Date(cursor.getFullYear(), 11, 31, 23, 59, 59) };
    return { start: startOfDay(new Date()), end: endOfDay(addDays(new Date(), 30)) };
  }, [mode, cursor, weekStart]);

  const entries = useMemo(() => (data ? buildEntries(data.tasks, data.events, data.projects, range.start, range.end) : []), [data, range]);

  const navigate = (dir: number) => {
    if (mode === 'day') setCursor(addDays(cursor, dir));
    else if (mode === 'week') setCursor(addDays(cursor, dir * 7));
    else if (mode === 'month') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1));
    else if (mode === 'year') setCursor(new Date(cursor.getFullYear() + dir, cursor.getMonth(), 1));
    else setCursor(addDays(cursor, dir * 30));
  };

  const headerTitle = () => {
    if (mode === 'day') return formatDate(cursor, lang, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (mode === 'week') {
      const s = startOfWeek(cursor, weekStart);
      const e = addDays(s, 6);
      return `${formatDate(s, lang, { month: 'short', day: 'numeric' })} – ${formatDate(e, lang, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    if (mode === 'month') return `${monthNames(lang)[cursor.getMonth()]} ${cursor.getFullYear()}`;
    if (mode === 'year') return String(cursor.getFullYear());
    return lang === 'ar' ? 'الأجندة القادمة' : 'Upcoming agenda';
  };

  const reschedule = async (kind: 'task' | 'event', id: string, dayKey: string, minutes?: number) => {
    try {
      if (kind === 'task') {
        const task = data?.tasks.find((x) => x.id === id);
        if (!task) return;
        const allDay = !!task.all_day || minutes == null;
        const due = allDay ? `${dayKey}T00:00:00` : `${dayKey}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`;
        const shift = task.due_date ? (parseLocal(due)!.getTime() - parseLocal(task.due_date)!.getTime()) : 0;
        const shiftISO = (iso: string | null | undefined) => (iso ? toLocalISO(new Date((parseLocal(iso)?.getTime() ?? 0) + shift)) : null);
        await call('tasks.update', id, {
          due_date: due,
          all_day: allDay ? 1 : 0,
          start_date: shiftISO(task.start_date),
          end_date: shiftISO(task.end_date),
        });
      } else {
        const event = data?.events.find((x) => x.id === id);
        if (!event) return;
        const old = parseLocal(event.start)!;
        const allDay = !!event.all_day || minutes == null;
        const start = allDay
          ? `${dayKey}T00:00:00`
          : `${dayKey}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`;
        const newStart = parseLocal(start)!;
        const delta = newStart.getTime() - old.getTime();
        await call('events.update', id, {
          start,
          all_day: allDay ? 1 : 0,
          end: event.end ? toLocalISO(new Date(parseLocal(event.end)!.getTime() + delta)) : null,
        });
      }
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  if (!data) return null;

  const openEntry = (e: Entry) => {
    if (e.kind === 'task') openEditor(e.id);
    else openEventEditor(e.id);
  };

  const onDrop = (e: DragEvent, dayKey: string, col?: HTMLElement) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/cal-entry');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { kind: 'task' | 'event'; id: string; allDay: boolean };
      let minutes: number | undefined;
      if (col && !parsed.allDay) {
        const rect = col.getBoundingClientRect();
        const y = e.clientY - rect.top;
        minutes = Math.max(0, Math.min(23 * 60 + 45, Math.round(y / HOUR_HEIGHT * 60 / 15) * 15));
      }
      void reschedule(parsed.kind, parsed.id, dayKey, minutes);
    } catch {
      /* ignore malformed drag */
    }
  };

  return (
    <div className="main">
      <div className="toolbar">
        <h1>{t('calendar')}</h1>
        <div className="seg">
          {(
            [
              ['day', t('day')],
              ['week', t('week')],
              ['month', t('month')],
              ['year', t('year')],
              ['agenda', t('agenda')],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
        </div>
        <button className="btn primary" onClick={() => openEventEditor(undefined, `${toDateKey(new Date())}T09:00:00`)}>
          ＋ {t('newEvent')}
        </button>
      </div>
      <div className="cal" style={{ flex: 1, minHeight: 0 }}>
        <div className="cal-header">
          <button className="btn icon" onClick={() => navigate(-1)}>
            ‹
          </button>
          <button className="btn sm" onClick={() => setCursor(new Date())}>
            {t('goToday')}
          </button>
          <button className="btn icon" onClick={() => navigate(1)}>
            ›
          </button>
          <h2>{headerTitle()}</h2>
          {settings?.show_week_numbers === 1 && mode === 'week' && (
            <span className="chip">
              {t('weekOf')} {isoWeekNumber(cursor)}
            </span>
          )}
          <span className="small muted">{entries.length} {lang === 'ar' ? 'عنصرًا' : 'items'}</span>
        </div>

        <div className="cal-scroll">
          {mode === 'day' || mode === 'week' ? (
            <TimeGrid
              days={mode === 'day' ? [cursor] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor, weekStart), i))}
              entries={entries}
              lang={lang}
              weekStart={weekStart}
              onOpen={openEntry}
              onDrop={onDrop}
              onCreate={(dayKey, minutes) => openEventEditor(undefined, `${dayKey}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`)}
            />
          ) : mode === 'month' ? (
            <MonthGrid
              cursor={cursor}
              weekStart={weekStart}
              lang={lang}
              entries={entries}
              onOpen={openEntry}
              onPickDay={(d) => {
                setCursor(d);
                setMode('day');
              }}
              onDrop={onDrop}
            />
          ) : mode === 'year' ? (
            <YearGrid
              year={cursor.getFullYear()}
              lang={lang}
              weekStart={weekStart}
              entries={entries}
              onPickDay={(d) => {
                setCursor(d);
                setMode('day');
              }}
            />
          ) : (
            <AgendaView entries={entries} lang={lang} onOpen={openEntry} />
          )}
        </div>
      </div>
    </div>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function buildEntries(tasks: Task[], events: CalendarEvent[], projects: { id: string; color: string }[], start: Date, end: Date): Entry[] {
  const out: Entry[] = [];
  const colorOf = (projectId: string | null) => projects.find((p) => p.id === projectId)?.color ?? 'var(--accent)';
  for (const task of tasks) {
    if (task.deleted_at || !task.due_date) continue;
    const base = task.start_date ?? task.due_date;
    const durationMs = task.duration_min ? task.duration_min * 60000 : 0;
    const endOfTask = (iso: string) =>
      task.end_date
        ? toLocalISO(new Date((parseLocal(task.end_date)?.getTime() ?? 0) + ((parseLocal(iso)?.getTime() ?? 0) - (parseLocal(base)?.getTime() ?? 0))))
        : durationMs
          ? toLocalISO(new Date((parseLocal(iso)?.getTime() ?? 0) + durationMs))
          : null;
    const occurrences = task.recurrence ? expandRecurrence(task.recurrence, task.due_date, start, end) : [task.due_date];
    for (const iso of occurrences) {
      const s = task.start_date && iso === task.due_date ? base : iso;
      out.push({
        uid: `task-${task.id}-${iso}`,
        kind: 'task',
        id: task.id,
        title: task.title,
        start: s,
        end: endOfTask(iso),
        allDay: !!task.all_day,
        color: colorOf(task.project_id),
        done: task.status === 'completed',
      });
    }
  }
  for (const event of events) {
    const base = event.start;
    const occurrences = event.recurrence ? expandRecurrence(event.recurrence, base, start, end) : [base];
    for (const iso of occurrences) {
      const delta = (parseLocal(iso)?.getTime() ?? 0) - (parseLocal(base)?.getTime() ?? 0);
      out.push({
        uid: `event-${event.id}-${iso}`,
        kind: 'event',
        id: event.id,
        title: event.title,
        start: iso,
        end: event.end ? toLocalISO(new Date((parseLocal(event.end)?.getTime() ?? 0) + delta)) : null,
        allDay: !!event.all_day,
        color: event.color || 'var(--accent)',
      });
    }
  }
  return out;
}

function TimeGrid({
  days,
  entries,
  lang,
  weekStart,
  onOpen,
  onDrop,
  onCreate,
}: {
  days: Date[];
  entries: Entry[];
  lang: 'ar' | 'en';
  weekStart: number;
  onOpen: (e: Entry) => void;
  onDrop: (e: DragEvent, dayKey: string, col?: HTMLElement) => void;
  onCreate: (dayKey: string, minutes: number) => void;
}) {
  const dow = weekdayNames(lang, weekStart);
  const todayKey = toDateKey(new Date());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [nowMinutes, setNowMinutes] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());

  // Open the grid near the working day instead of at midnight, and keep a live "now" line.
  useEffect(() => {
    const scroller = scrollRef.current?.closest('.cal-scroll') as HTMLElement | null;
    if (scroller) scroller.scrollTop = Math.max(0, (Math.min(nowMinutes, 12 * 60) / 60 - 1.5) * HOUR_HEIGHT);
    const timer = window.setInterval(() => setNowMinutes(new Date().getHours() * 60 + new Date().getMinutes()), 60000);
    return () => window.clearInterval(timer);
    // Only auto-scroll once, when the grid first mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={scrollRef} className="cal-grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
      <div className="cal-dow" style={{ gridColumn: '1 / -1', paddingInlineStart: 56, gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
        {days.map((d, i) => (
          <div key={i} className={toDateKey(d) === todayKey ? 'today' : ''}>
            {dow[(d.getDay() - weekStart + 7) % 7]} {d.getDate()}
          </div>
        ))}
      </div>
      <div className="cal-week" style={{ gridColumn: '1 / -1', gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
        <div className="cal-hours">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="hour-label">
              {h === 0 ? '' : `${pad(h)}:00`}
            </div>
          ))}
        </div>
        {days.map((d) => {
          const key = toDateKey(d);
          const dayEntries = entries.filter((e) => dateKeyOf(e.start) === key);
          const allDay = dayEntries.filter((e) => e.allDay);
          const timed = dayEntries.filter((e) => !e.allDay);
          return (
            <div
              key={key}
              className={`cal-col ${key === todayKey ? 'today' : ''}`}
              style={{ height: 24 * HOUR_HEIGHT }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, key, e.currentTarget)}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const minutes = Math.max(0, Math.min(23 * 60 + 45, Math.round((e.clientY - rect.top) / HOUR_HEIGHT * 60 / 15) * 15));
                onCreate(key, minutes);
              }}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="hour-slot" />
              ))}
              {key === todayKey && (
                <div className="now-line" style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }} aria-hidden="true">
                  <span className="now-dot" />
                </div>
              )}
              {allDay.map((entry, i) => (
                <button
                  key={entry.uid}
                  className="month-pill"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/cal-entry', JSON.stringify({ kind: entry.kind, id: entry.id, allDay: true }))}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(entry);
                  }}
                  style={{ position: 'absolute', top: 4 + i * 20, insetInline: 3, borderInlineStartColor: entry.color, zIndex: 3, opacity: entry.done ? 0.55 : 1 }}
                >
                  {entry.title}
                </button>
              ))}
              {timed.map((entry) => {
                const s = parseLocal(entry.start)!;
                const e = entry.end ? parseLocal(entry.end) : addMinutes(s, 60);
                const top = (s.getHours() * 60 + s.getMinutes()) / 60 * HOUR_HEIGHT;
                const height = Math.max(20, ((e!.getTime() - s.getTime()) / 3600000) * HOUR_HEIGHT);
                return (
                  <button
                    key={entry.uid}
                    className="cal-event"
                    draggable
                    onDragStart={(ev) => ev.dataTransfer.setData('text/cal-entry', JSON.stringify({ kind: entry.kind, id: entry.id, allDay: false }))}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onOpen(entry);
                    }}
                    style={{
                      top,
                      height,
                      borderInlineStartColor: entry.color,
                      background: `color-mix(in srgb, ${entry.color} 16%, var(--card))`,
                      opacity: entry.done ? 0.55 : 1,
                    }}
                  >
                    <div className="t">{entry.title}</div>
                    <div className="s">{formatTime(s, lang)}</div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthGrid({
  cursor,
  weekStart,
  lang,
  entries,
  onOpen,
  onPickDay,
  onDrop,
}: {
  cursor: Date;
  weekStart: number;
  lang: 'ar' | 'en';
  entries: Entry[];
  onOpen: (e: Entry) => void;
  onPickDay: (d: Date) => void;
  onDrop: (e: DragEvent, dayKey: string) => void;
}) {
  const start = startOfWeek(startOfMonth(cursor), weekStart);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const dow = weekdayNames(lang, weekStart);
  const todayKey = toDateKey(new Date());
  return (
    <div>
      <div className="cal-dow" style={{ paddingInlineStart: 0, gridTemplateColumns: 'repeat(7,1fr)' }}>
        {dow.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="month-grid">
        {days.map((d) => {
          const key = toDateKey(d);
          const dayEntries = entries.filter((e) => dateKeyOf(e.start) === key);
          const other = d.getMonth() !== cursor.getMonth();
          return (
            <div
              key={key}
              className={`month-cell ${other ? 'other' : ''} ${key === todayKey ? 'today' : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, key)}
              onClick={() => onPickDay(d)}
            >
              <div className="daynum">
                <span>{d.getDate()}</span>
                {dayEntries.length > 0 && <span className="muted" style={{ fontSize: 9.5 }}>{dayEntries.length}</span>}
              </div>
              {dayEntries.slice(0, 3).map((entry) => (
                <button
                  key={entry.uid}
                  className={`month-pill ${entry.done ? 'done' : ''}`}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/cal-entry', JSON.stringify({ kind: entry.kind, id: entry.id, allDay: true }))}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(entry);
                  }}
                  style={{ borderInlineStartColor: entry.color, textAlign: 'start' }}
                >
                  {entry.title}
                </button>
              ))}
              {dayEntries.length > 3 && (
                <span className="small muted" style={{ fontSize: 9.5 }}>
                  +{dayEntries.length - 3}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearGrid({
  year,
  lang,
  weekStart,
  entries,
  onPickDay,
}: {
  year: number;
  lang: 'ar' | 'en';
  weekStart: number;
  entries: Entry[];
  onPickDay: (d: Date) => void;
}) {
  const names = monthNames(lang);
  const todayKey = toDateKey(new Date());
  const dates = new Set(entries.map((e) => dateKeyOf(e.start)));
  return (
    <div className="year-grid">
      {Array.from({ length: 12 }, (_, m) => {
        const start = startOfWeek(new Date(year, m, 1), weekStart);
        const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
        return (
          <div key={m} className="mini-month">
            <h4>{names[m]}</h4>
            <div className="mini-grid">
              {days.map((d) => {
                const key = toDateKey(d);
                return (
                  <button
                    key={key}
                    className={`mini-day ${d.getMonth() !== m ? 'other' : ''} ${key === todayKey ? 'today' : ''} ${dates.has(key) ? 'has' : ''}`}
                    onClick={() => onPickDay(d)}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgendaView({ entries, lang, onOpen }: { entries: Entry[]; lang: 'ar' | 'en'; onOpen: (e: Entry) => void }) {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = dateKeyOf(e.start) ?? '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  const keys = [...groups.keys()].sort();
  if (!keys.length) {
    return (
      <div className="empty">
        <div className="big">📅</div>
        <h3>{lang === 'ar' ? 'لا توجد عناصر قادمة' : 'Nothing coming up'}</h3>
      </div>
    );
  }
  return (
    <div style={{ padding: '10px 18px' }}>
      {keys.map((key) => (
        <div key={key} className="agenda-day">
          <h4>{formatDate(parseLocal(key)!, lang, { weekday: 'long', month: 'long', day: 'numeric' })}</h4>
          <div className="task-list">
            {groups
              .get(key)!
              .sort((a, b) => a.start.localeCompare(b.start))
              .map((entry) => (
                <button
                  key={entry.uid}
                  className="task"
                  style={{ textAlign: 'start' }}
                  onClick={() => onOpen(entry)}
                >
                  <span className="dot" style={{ background: entry.color, width: 9, height: 9, borderRadius: '50%', marginTop: 6 }} />
                  <span className="task-main">
                    <span className="task-title" style={{ textDecoration: entry.done ? 'line-through' : 'none' }}>
                      {entry.title}
                    </span>
                    <span className="task-meta">
                      <span className="meta">{entry.kind === 'task' ? (lang === 'ar' ? 'مهمة' : 'Task') : (lang === 'ar' ? 'حدث' : 'Event')}</span>
                      <span className="meta">
                        {entry.allDay ? (lang === 'ar' ? 'طوال اليوم' : 'All day') : formatTime(parseLocal(entry.start)!, lang)}
                      </span>
                    </span>
                  </span>
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
