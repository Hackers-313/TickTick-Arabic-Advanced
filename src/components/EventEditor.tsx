import { useState } from 'react';
import { useApp } from '../store';
import { Modal } from './Modal';
import { toLocalISO } from '../../shared/date';

export function EventEditor() {
  const { data, eventEditor, closeEventEditor, t, lang, call, refresh, toast } = useApp();
  const event = eventEditor.eventId ? data?.events.find((e) => e.id === eventEditor.eventId) : undefined;
  const initialStart = event?.start ?? eventEditor.start ?? `${new Date().toISOString().slice(0, 10)}T09:00:00`;

  const [title, setTitle] = useState(event?.title ?? '');
  const [date, setDate] = useState(initialStart.slice(0, 10));
  const [startTime, setStartTime] = useState(initialStart.slice(11, 16) || '09:00');
  const [endTime, setEndTime] = useState(event?.end ? event.end.slice(11, 16) : '10:00');
  const [allDay, setAllDay] = useState(!!event?.all_day);
  const [color, setColor] = useState(event?.color ?? '#4f7cff');
  const [location, setLocation] = useState(event?.location ?? '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [projectId, setProjectId] = useState(event?.project_id ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim()) return toast(lang === 'ar' ? 'أدخل عنوان الحدث' : 'Enter an event title', 'error');
    setBusy(true);
    try {
      const start = `${date}T${allDay ? '00:00' : startTime || '09:00'}:00`;
      const end = allDay ? null : `${date}T${endTime || '10:00'}:00`;
      const payload = {
        title: title.trim(),
        start,
        end,
        all_day: allDay ? 1 : 0,
        color,
        location,
        notes,
        project_id: projectId || null,
      };
      if (event) await call('events.update', event.id, payload);
      else await call('events.create', payload);
      await refresh();
      toast(t('saved'));
      closeEventEditor();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!event) return;
    if (!window.confirm(t('confirmDelete'))) return;
    try {
      await call('events.delete', event.id);
      await refresh();
      closeEventEditor();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <Modal
      title={event ? t('edit') + ' · ' + event.title : t('newEvent')}
      onClose={closeEventEditor}
      footer={
        <>
          <button className="btn primary" onClick={() => void save()} disabled={busy}>
            {t('save')}
          </button>
          <button className="btn" onClick={closeEventEditor}>
            {t('cancel')}
          </button>
          {event && (
            <button className="btn danger right" onClick={() => void remove()}>
              {t('delete')}
            </button>
          )}
        </>
      }
    >
      <div className="field">
        <label>{t('title')}</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      <div className="row">
        <div className="field">
          <label>{t('dueDate')}</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>{t('start')}</label>
          <input type="time" value={startTime} disabled={allDay} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="field">
          <label>{t('endDate')}</label>
          <input type="time" value={endTime} disabled={allDay} onChange={(e) => setEndTime(e.target.value)} />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>{t('project')}</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">—</option>
            {data?.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t('color')}</label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ height: 38, padding: 3 }} />
        </div>
        <div className="field" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0 }}>
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} style={{ width: 'auto' }} />
            {t('allDay')}
          </label>
        </div>
      </div>
      <div className="field">
        <label>{lang === 'ar' ? 'الموقع' : 'Location'}</label>
        <input value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <div className="field">
        <label>{t('notes')}</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <span className="hidden">{toLocalISO(new Date())}</span>
    </Modal>
  );
}
