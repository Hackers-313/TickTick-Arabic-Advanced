import { useMemo, useState, type DragEvent } from 'react';
import { useApp } from '../store';
import { addDays, dateKeyOf, diffDays, formatDate, parseLocal, startOfDay, toDateKey, toLocalISO, weekdayNames } from '../../shared/date';

const DAY_W = 120;

interface Row {
  id: string;
  kind: 'task' | 'event';
  title: string;
  start: string;
  end: string | null;
  color: string;
  done?: boolean;
}

export function TimelineView() {
  const { data, t, lang, settings, call, refresh, toast, openEditor, openEventEditor } = useApp();
  const [offset, setOffset] = useState(0);
  const [dragResize, setDragResize] = useState<{ row: Row; startX: number; days: number } | null>(null);

  const rangeStart = useMemo(() => startOfDay(addDays(new Date(), offset * 14)), [offset]);
  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => addDays(rangeStart, i)), [rangeStart]);
  const rangeEnd = useMemo(() => addDays(rangeStart, 20), [rangeStart]);

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const out: Row[] = [];
    for (const task of data.tasks) {
      if (task.deleted_at || !task.due_date) continue;
      const start = task.start_date ?? task.due_date;
      const s = parseLocal(start);
      if (!s) continue;
      const end = task.end_date ?? (task.duration_min ? toLocalISO(new Date(s.getTime() + task.duration_min * 60000)) : task.due_date);
      const e = parseLocal(end) ?? s;
      if (e < rangeStart || s > addDays(rangeEnd, 1)) continue;
      out.push({
        id: task.id,
        kind: 'task',
        title: task.title,
        start,
        end,
        color: data.projects.find((p) => p.id === task.project_id)?.color ?? 'var(--accent)',
        done: task.status === 'completed',
      });
    }
    for (const ev of data.events) {
      const s = parseLocal(ev.start);
      if (!s) continue;
      const e = parseLocal(ev.end) ?? s;
      if (e < rangeStart || s > addDays(rangeEnd, 1)) continue;
      out.push({ id: ev.id, kind: 'event', title: ev.title, start: ev.start, end: ev.end, color: ev.color });
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
  }, [data, rangeStart, rangeEnd]);

  if (!data) return null;

  const dow = weekdayNames(lang, settings?.week_start ?? 6);

  const shiftRow = async (row: Row, dayDelta: number, endDelta = 0) => {
    if (!dayDelta && !endDelta) return;
    try {
      if (row.kind === 'task') {
        const task = data.tasks.find((x) => x.id === row.id);
        if (!task) return;
        const shift = (iso: string | null | undefined, n: number) =>
          iso ? toLocalISO(addDays(parseLocal(iso) ?? new Date(), n)) : null;
        await call('tasks.update', task.id, {
          due_date: shift(task.due_date, dayDelta),
          start_date: shift(task.start_date, dayDelta),
          end_date: endDelta && task.end_date ? shift(task.end_date, endDelta) : shift(task.end_date, dayDelta),
        });
      } else {
        const ev = data.events.find((x) => x.id === row.id);
        if (!ev) return;
        const shift = (iso: string | null | undefined, n: number) =>
          iso ? toLocalISO(addDays(parseLocal(iso) ?? new Date(), n)) : null;
        await call('events.update', ev.id, { start: shift(ev.start, dayDelta), end: shift(ev.end, endDelta || dayDelta) });
      }
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>, row: Row) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/tl-row');
    if (!raw) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rtl = (settings?.direction ?? 'rtl') === 'rtl';
    const x = rtl ? rect.right - e.clientX : e.clientX - rect.left;
    const dayIndex = Math.round(x / DAY_W);
    const target = addDays(rangeStart, Math.max(0, Math.min(20, dayIndex)));
    const currentStart = parseLocal(row.start)!;
    const delta = diffDays(target, currentStart);
    if (delta) void shiftRow(row, delta);
  };

  return (
    <div className="main">
      <div className="toolbar">
        <h1>{t('timeline')}</h1>
        <span className="small muted">{t('timelineHint')}</span>
        <button className="btn sm" onClick={() => setOffset((o) => o - 1)}>
          ‹ {lang === 'ar' ? 'السابق' : 'Prev'}
        </button>
        <button className="btn sm" onClick={() => setOffset(0)}>
          {t('goToday')}
        </button>
        <button className="btn sm" onClick={() => setOffset((o) => o + 1)}>
          {lang === 'ar' ? 'التالي' : 'Next'} ›
        </button>
      </div>
      <div className="content no-pad">
        <div className="timeline">
          <div className="tl-head">
            {days.map((d) => (
              <div key={toDateKey(d)} className={`tl-day ${toDateKey(d) === toDateKey(new Date()) ? 'today' : ''}`}>
                {dow[(d.getDay() - (settings?.week_start ?? 6) + 7) % 7]} {d.getDate()}
              </div>
            ))}
          </div>
          {rows.map((row) => {
            const s = parseLocal(row.start)!;
            const e = parseLocal(row.end ?? row.start)!;
            const startIdx = Math.max(0, diffDays(s, rangeStart));
            const endIdx = Math.min(20, diffDays(e, rangeStart));
            const span = Math.max(0, endIdx - startIdx) + 1;
            return (
              <div className="tl-row" key={`${row.kind}-${row.id}`}>
                <div className="tl-label" title={row.title} onClick={() => (row.kind === 'task' ? openEditor(row.id) : openEventEditor(row.id))}>
                  {row.done ? '✓ ' : ''}
                  {row.title}
                </div>
                <div
                  className="tl-track"
                  onDragOver={(ev) => ev.preventDefault()}
                  onDrop={(ev) => onDrop(ev, row)}
                >
                  <div
                    className="tl-bar"
                    draggable
                    onDragStart={(ev) => ev.dataTransfer.setData('text/tl-row', row.id)}
                    onDoubleClick={() => (row.kind === 'task' ? openEditor(row.id) : openEventEditor(row.id))}
                    style={{
                      insetInlineStart: `${(startIdx / 21) * 100}%`,
                      width: `${(span / 21) * 100}%`,
                      background: row.color,
                      opacity: row.done ? 0.55 : 1,
                    }}
                    title={`${row.title} · ${formatDate(s, lang, { month: 'short', day: 'numeric' })}`}
                  >
                    {row.title}
                    <span
                      className="handle r"
                      onPointerDown={(ev) => {
                        ev.stopPropagation();
                        setDragResize({ row, startX: ev.clientX, days: 0 });
                        (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
                      }}
                      onPointerMove={(ev) => {
                        if (!dragResize) return;
                        const delta = Math.round((ev.clientX - dragResize.startX) / DAY_W);
                        if (delta !== dragResize.days) setDragResize({ ...dragResize, days: delta });
                      }}
                      onPointerUp={() => {
                        if (dragResize && dragResize.days) void shiftRow(dragResize.row, 0, dragResize.days);
                        setDragResize(null);
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div className="empty">
              <div className="big">📶</div>
              <h3>{lang === 'ar' ? 'لا توجد مهام بمواعيد في هذه الفترة' : 'No scheduled tasks in this range'}</h3>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
