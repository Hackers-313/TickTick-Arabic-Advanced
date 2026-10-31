import { useMemo, useState } from 'react';
import type { Reminder, Task, TaskTemplate } from '../../shared/types';
import { useApp } from '../store';
import { Modal } from './Modal';
import { RECURRENCE_PRESETS, buildRRule, describeRule, parseRRule } from '../../shared/recurrence';
import { dateKeyOf, parseLocal, toLocalISO, toLocalMinutes } from '../../shared/date';

interface ReminderSpec {
  kind: Reminder['kind'];
  offset_min: number | null;
  trigger_at: string;
}

function datePart(iso?: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

function timePart(iso?: string | null): string {
  return iso && iso.length >= 16 ? iso.slice(11, 16) : '';
}

function combine(date: string, time: string, allDay: boolean): string | null {
  if (!date) return null;
  return `${date}T${allDay ? '00:00' : time || '00:00'}:00`;
}

export function TaskEditor() {
  const { data, editor, closeEditor, lang, t, call, refresh, toast } = useApp();
  const task = editor.taskId ? data?.tasks.find((x) => x.id === editor.taskId) : undefined;
  const defaults = editor.defaults ?? {};
  const source = task ?? defaults;

  const [title, setTitle] = useState(source.title ?? '');
  const [notes, setNotes] = useState(source.notes ?? '');
  const [projectId, setProjectId] = useState(source.project_id ?? data?.projects.find((p) => p.is_inbox)?.id ?? data?.projects[0]?.id ?? '');
  const [priority, setPriority] = useState<number>(source.priority ?? 0);
  const [status, setStatus] = useState<Task['status']>(source.status ?? 'open');
  const [dueDate, setDueDate] = useState(datePart(source.due_date));
  const [dueTime, setDueTime] = useState(timePart(source.due_date) || '09:00');
  const [allDay, setAllDay] = useState(!!source.all_day);
  const [startDate, setStartDate] = useState(datePart(source.start_date));
  const [startTime, setStartTime] = useState(timePart(source.start_date) || '09:00');
  const [duration, setDuration] = useState<string>(source.duration_min != null ? String(source.duration_min) : '');
  const [tags, setTags] = useState<string[]>(() => {
    try {
      return JSON.parse(source.tags ?? '[]');
    } catch {
      return [];
    }
  });
  const [tagInput, setTagInput] = useState('');
  const [quadrant, setQuadrant] = useState<string>(source.quadrant != null ? String(source.quadrant) : '');
  const [recurrence, setRecurrence] = useState<string | null>(source.recurrence ?? null);
  const [customRule, setCustomRule] = useState(() => {
    const p = parseRRule(source.recurrence ?? '');
    return {
      freq: (p?.freq ?? 'WEEKLY') as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY',
      interval: p?.interval ?? 1,
      byday: p?.byday ?? [],
      until: p?.until ? p.until.slice(0, 10) : '',
    };
  });
  const [showCustom, setShowCustom] = useState(false);
  const [reminders, setReminders] = useState<ReminderSpec[]>(() => {
    const existing = (data?.reminders ?? []).filter((r) => r.entity_type === 'task' && r.entity_id === task?.id);
    return existing.map((r) => ({ kind: r.kind, offset_min: r.offset_min, trigger_at: r.trigger_at }));
  });
  const [reminderOffset, setReminderOffset] = useState('0');
  const [newChecklist, setNewChecklist] = useState<string[]>([]);
  const [checklistInput, setChecklistInput] = useState('');
  const [busy, setBusy] = useState(false);

  const existingChecklist = useMemo(
    () => (data?.checklist ?? []).filter((c) => c.task_id === task?.id),
    [data, task?.id],
  );
  const attachments = (data?.attachments ?? []).filter((a) => a.task_id === task?.id);
  const children = (data?.tasks ?? []).filter((x) => x.parent_id === task?.id && !x.deleted_at);

  const addTag = () => {
    const value = tagInput.trim().replace(/^#/, '');
    if (value && !tags.includes(value)) setTags([...tags, value]);
    setTagInput('');
  };

  const addReminder = () => {
    const offset = Number(reminderOffset);
    if (!dueDate && reminderOffset !== 'absolute') {
      toast(lang === 'ar' ? 'حدد تاريخ استحقاق أولًا' : 'Set a due date first', 'error');
      return;
    }
    let trigger = '';
    if (reminderOffset === 'absolute') {
      trigger = `${dueDate || new Date().toISOString().slice(0, 10)}T${dueTime}:00`;
    } else {
      const due = combine(dueDate, dueTime, allDay);
      const d = parseLocal(due);
      if (!d) return;
      trigger = toLocalISO(new Date(d.getTime() - offset * 60000));
    }
    setReminders([...reminders, { kind: offset === 0 ? 'absolute' : 'relative', offset_min: offset, trigger_at: trigger }]);
  };

  const save = async () => {
    if (!title.trim()) {
      toast(lang === 'ar' ? 'أدخل عنوان المهمة' : 'Enter a task title', 'error');
      return;
    }
    if (!projectId) {
      toast(lang === 'ar' ? 'اختر مشروعًا' : 'Choose a project', 'error');
      return;
    }
    setBusy(true);
    try {
      const due = combine(dueDate, dueTime, allDay);
      const start = combine(startDate, startTime, false);
      const payload: Partial<Task> & { title: string } = {
        title: title.trim(),
        notes,
        project_id: projectId,
        priority: priority as Task['priority'],
        status,
        due_date: due,
        start_date: start,
        end_date: null,
        all_day: allDay ? 1 : 0,
        duration_min: duration ? Number(duration) : null,
        tags: JSON.stringify(tags),
        recurrence,
        quadrant: quadrant ? Number(quadrant) : null,
        completed_at: status === 'completed' ? (task?.completed_at ?? toLocalISO(new Date())) : null,
        parent_id: task?.parent_id ?? defaults.parent_id ?? null,
      };

      let saved: Task;
      if (task) {
        const updated = await call<Task>('tasks.update', task.id, payload);
        saved = updated ?? task;
      } else {
        saved = await call<Task>('tasks.create', payload);
      }

      for (const name of tags) {
        if (!data?.tags.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
          await call('tags.create', name, '#8892a6');
        }
      }

      const specs = reminders.map((r) => {
        if (r.offset_min != null && r.offset_min > 0 && due) {
          const d = parseLocal(due);
          return {
            kind: r.offset_min === 0 ? 'absolute' : 'relative',
            offset_min: r.offset_min,
            trigger_at: d ? toLocalISO(new Date(d.getTime() - r.offset_min * 60000)) : r.trigger_at,
          };
        }
        return { kind: r.kind, offset_min: r.offset_min, trigger_at: r.trigger_at };
      });
      await call('tasks.setReminders', saved.id, specs);

      for (const text of newChecklist) {
        await call('tasks.addChecklist', saved.id, text, false);
      }
      await refresh();
      toast(t('saved'));
      closeEditor();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!task) return;
    if (!window.confirm(t('confirmDelete'))) return;
    try {
      await call('tasks.delete', task.id, false);
      await refresh();
      closeEditor();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const duplicate = async () => {
    if (!task) return;
    try {
      const copy = await call<Task>('tasks.duplicate', task.id);
      await refresh();
      if (copy) {
        closeEditor();
        toast(t('duplicate'));
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const addAttachment = async () => {
    if (!task) return;
    try {
      const files = await call<string[]>('app.pickFiles');
      for (const file of files) {
        const res = await call<{ ok: boolean; error?: string }>('app.copyAttachment', task.id, file);
        if (!res.ok) toast(res.error ?? 'copy failed', 'error');
      }
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const saveTemplate = async () => {
    const name = window.prompt(lang === 'ar' ? 'اسم القالب' : 'Template name', title.trim());
    if (!name) return;
    const payload = {
      title: title.trim(),
      notes,
      priority,
      tags,
      recurrence,
      duration_min: duration ? Number(duration) : null,
      quadrant: quadrant ? Number(quadrant) : null,
      checklist: [...existingChecklist.map((c) => c.title), ...newChecklist],
    };
    const ok = await call<TaskTemplate>('templates.create', name, payload);
    if (ok) toast(t('saved'));
  };

  const addSubtask = async () => {
    if (!task) return;
    const text = window.prompt(lang === 'ar' ? 'عنوان المهمة الفرعية' : 'Subtask title');
    if (!text) return;
    try {
      await call('tasks.create', { title: text, project_id: task.project_id, parent_id: task.id });
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const toggleChecklist = async (id: string, done: boolean) => {
    try {
      await call('tasks.toggleChecklist', id, done);
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const deleteChecklist = async (id: string) => {
    try {
      await call('tasks.deleteChecklist', id);
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const presetValue = showCustom
    ? 'custom'
    : recurrence == null
      ? 'none'
      : (RECURRENCE_PRESETS.find((p) => p.rule === recurrence)?.key ?? 'custom');

  return (
    <Modal
      wide
      title={task ? t('edit') : t('newTask')}
      onClose={closeEditor}
      footer={
        <>
          <button className="btn primary" onClick={() => void save()} disabled={busy}>
            {busy ? <span className="spinner" /> : '💾'} {t('save')}
          </button>
          <button className="btn" onClick={closeEditor}>
            {t('cancel')}
          </button>
          {task && (
            <>
              <button className="btn" onClick={() => void duplicate()}>
                ⧉ {t('duplicate')}
              </button>
              <button className="btn" onClick={() => void saveTemplate()}>
                📋 {t('saveAsTemplate')}
              </button>
              <button className="btn danger right" onClick={() => void remove()}>
                🗑 {t('delete')}
              </button>
            </>
          )}
        </>
      }
    >
      <div className="field">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('title')}
          autoFocus
          style={{ fontSize: 16, fontWeight: 600 }}
        />
      </div>
      <div className="field">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('notes')} />
      </div>

      <div className="row">
        <div className="field">
          <label>{t('project')}</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {data?.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.icon} {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t('priority')}</label>
          <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
            <option value={0}>{t('none')}</option>
            <option value={1}>{t('low')}</option>
            <option value={3}>{t('medium')}</option>
            <option value={5}>{t('high')}</option>
          </select>
        </div>
        <div className="field">
          <label>{t('status')}</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as Task['status'])}>
            <option value="open">{t('open')}</option>
            <option value="completed">{t('completed')}</option>
            <option value="abandoned">{t('abandoned')}</option>
          </select>
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>{t('dueDate')}</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="field">
          <label>{t('time')}</label>
          <input type="time" value={dueTime} disabled={allDay} onChange={(e) => setDueTime(e.target.value)} />
        </div>
        <div className="field" style={{ display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 6 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0 }}>
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} style={{ width: 'auto' }} />
            {t('allDay')}
          </label>
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>{t('startDate')}</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="field">
          <label>{t('time')}</label>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="field">
          <label>{t('duration')}</label>
          <input type="number" min={0} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="30" />
        </div>
      </div>
      <p className="small muted" style={{ marginTop: -6, marginBottom: 10 }}>
        {t('taskDurationHint')}
      </p>

      <div className="field">
        <label>{t('tagsField')}</label>
        <div className="tag-input">
          {tags.map((tag) => (
            <span key={tag} className="tag-pill">
              #{tag}
              <button onClick={() => setTags(tags.filter((x) => x !== tag))}>✕</button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
            placeholder={lang === 'ar' ? 'أضف وسمًا…' : 'Add a tag…'}
          />
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>{t('repeat')}</label>
          <select
            value={presetValue}
            onChange={(e) => {
              const value = e.target.value;
              if (value === 'custom') {
                setShowCustom(true);
                setRecurrence(buildRRule(customRule));
              } else {
                setShowCustom(false);
                setRecurrence(RECURRENCE_PRESETS.find((p) => p.key === value)?.rule ?? null);
              }
            }}
          >
            {RECURRENCE_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {lang === 'ar' ? p.ar : p.en}
              </option>
            ))}
            <option value="custom">{lang === 'ar' ? 'مخصص…' : 'Custom…'}</option>
          </select>
        </div>
        <div className="field">
          <label>{t('quadrant')}</label>
          <select value={quadrant} onChange={(e) => setQuadrant(e.target.value)}>
            <option value="">{t('unclassified')}</option>
            <option value="1">{t('quadrant1')}</option>
            <option value="2">{t('quadrant2')}</option>
            <option value="3">{t('quadrant3')}</option>
            <option value="4">{t('quadrant4')}</option>
          </select>
        </div>
      </div>

      {showCustom && (
        <div className="panel" style={{ background: 'var(--bg-2)' }}>
          <div className="row">
            <div className="field">
              <label>{t('frequency')}</label>
              <select
                value={customRule.freq}
                onChange={(e) => {
                  const next = { ...customRule, freq: e.target.value as typeof customRule.freq };
                  setCustomRule(next);
                  setRecurrence(buildRRule(next));
                }}
              >
                <option value="DAILY">{lang === 'ar' ? 'يومي' : 'Daily'}</option>
                <option value="WEEKLY">{lang === 'ar' ? 'أسبوعي' : 'Weekly'}</option>
                <option value="MONTHLY">{lang === 'ar' ? 'شهري' : 'Monthly'}</option>
                <option value="YEARLY">{lang === 'ar' ? 'سنوي' : 'Yearly'}</option>
              </select>
            </div>
            <div className="field">
              <label>{lang === 'ar' ? 'كل (فترة)' : 'Interval'}</label>
              <input
                type="number"
                min={1}
                value={customRule.interval}
                onChange={(e) => {
                  const next = { ...customRule, interval: Math.max(1, Number(e.target.value) || 1) };
                  setCustomRule(next);
                  setRecurrence(buildRRule(next));
                }}
              />
            </div>
            <div className="field">
              <label>{lang === 'ar' ? 'حتى تاريخ' : 'Until'}</label>
              <input
                type="date"
                value={customRule.until}
                onChange={(e) => {
                  const next = { ...customRule, until: e.target.value };
                  setCustomRule(next);
                  setRecurrence(buildRRule(next));
                }}
              />
            </div>
          </div>
          {customRule.freq === 'WEEKLY' && (
            <div className="gap wrap" style={{ marginTop: 6 }}>
              {['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'].map((name, day) => (
                <label key={day} className="chip" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={customRule.byday.includes(day)}
                    onChange={(e) => {
                      const byday = e.target.checked
                        ? [...customRule.byday, day].sort()
                        : customRule.byday.filter((d) => d !== day);
                      const next = { ...customRule, byday };
                      setCustomRule(next);
                      setRecurrence(buildRRule(next));
                    }}
                  />
                  {lang === 'ar' ? name : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]}
                </label>
              ))}
            </div>
          )}
          <p className="small muted mt">{describeRule(recurrence, lang)}</p>
        </div>
      )}

      <div className="field">
        <label>{t('reminders')}</label>
        {reminders.length === 0 && <p className="small muted">{t('noReminders')}</p>}
        {reminders.map((r, i) => (
          <div key={i} className="gap" style={{ marginBottom: 6 }}>
            <span className="chip">
              🔔 {r.offset_min != null && r.offset_min > 0
                ? `${r.offset_min} ${lang === 'ar' ? 'دقيقة قبل الموعد' : 'min before'}`
                : `${t('reminderAt')} ${r.trigger_at.replace('T', ' ').slice(0, 16)}`}
            </span>
            <button className="btn ghost icon" onClick={() => setReminders(reminders.filter((_, idx) => idx !== i))}>
              ✕
            </button>
          </div>
        ))}
        <div className="gap">
          <select value={reminderOffset} onChange={(e) => setReminderOffset(e.target.value)} style={{ maxWidth: 220 }}>
            <option value="0">{t('reminderAt')} ({t('dueDate')})</option>
            <option value="5">5 {lang === 'ar' ? 'دقائق قبل' : 'min before'}</option>
            <option value="15">15 {lang === 'ar' ? 'دقيقة قبل' : 'min before'}</option>
            <option value="30">30 {lang === 'ar' ? 'دقيقة قبل' : 'min before'}</option>
            <option value="60">60 {lang === 'ar' ? 'دقيقة قبل' : 'min before'}</option>
            <option value="1440">1 {lang === 'ar' ? 'يوم قبل' : 'day before'}</option>
            <option value="absolute">{lang === 'ar' ? 'مخصص' : 'Custom'}</option>
          </select>
          <button className="btn sm" onClick={addReminder}>
            ＋ {t('addReminder')}
          </button>
        </div>
      </div>

      <div className="field">
        <label>{t('checklist')}</label>
        {existingChecklist.map((item) => (
          <div key={item.id} className="gap" style={{ marginBottom: 4 }}>
            <input
              type="checkbox"
              checked={item.done === 1}
              onChange={(e) => void toggleChecklist(item.id, e.target.checked)}
              style={{ width: 'auto' }}
            />
            <span style={{ textDecoration: item.done ? 'line-through' : 'none', flex: 1 }}>{item.title}</span>
            <button className="btn ghost icon" onClick={() => void deleteChecklist(item.id)}>
              ✕
            </button>
          </div>
        ))}
        {newChecklist.map((text, i) => (
          <div key={`new-${i}`} className="gap" style={{ marginBottom: 4 }}>
            <input type="checkbox" disabled style={{ width: 'auto' }} />
            <span style={{ flex: 1 }}>{text}</span>
            <button className="btn ghost icon" onClick={() => setNewChecklist(newChecklist.filter((_, idx) => idx !== i))}>
              ✕
            </button>
          </div>
        ))}
        <div className="gap">
          <input
            value={checklistInput}
            onChange={(e) => setChecklistInput(e.target.value)}
            placeholder={lang === 'ar' ? 'عنصر جديد…' : 'New item…'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (checklistInput.trim()) {
                  setNewChecklist([...newChecklist, checklistInput.trim()]);
                  setChecklistInput('');
                }
              }
            }}
          />
          <button
            className="btn sm"
            onClick={() => {
              if (checklistInput.trim()) {
                setNewChecklist([...newChecklist, checklistInput.trim()]);
                setChecklistInput('');
              }
            }}
          >
            ＋
          </button>
        </div>
      </div>

      {task && (
        <div className="field">
          <label>{t('attachments')}</label>
          {attachments.map((a) => (
            <div key={a.id} className="gap" style={{ marginBottom: 4 }}>
              <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                📎 {a.name} <span className="small muted">({Math.round(a.size / 1024)} KB)</span>
              </span>
              <button className="btn ghost sm" onClick={() => void call('app.openPath', a.path)}>
                {t('openAttachment')}
              </button>
              <button
                className="btn ghost icon"
                onClick={async () => {
                  await call('tasks.deleteAttachment', a.id);
                  await refresh();
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <button className="btn sm" onClick={() => void addAttachment()}>
            ＋ {t('addAttachment')}
          </button>
        </div>
      )}

      {task && (
        <div className="field">
          <label>{t('subtasks')}</label>
          {children.map((child) => (
            <div key={child.id} className="gap" style={{ marginBottom: 4 }}>
              <span style={{ textDecoration: child.status === 'completed' ? 'line-through' : 'none', flex: 1 }}>{child.title}</span>
              <button className="btn ghost icon" onClick={() => void call('tasks.delete', child.id, false).then(refresh)}>
                ✕
              </button>
            </div>
          ))}
          <button className="btn sm" onClick={() => void addSubtask()}>
            ＋ {t('subtasks')}
          </button>
        </div>
      )}

      <p className="small muted">
        {t('created')}: {task ? task.created_at.replace('T', ' ').slice(0, 16) : '—'} · {t('updated')}:{' '}
        {task ? task.updated_at.replace('T', ' ').slice(0, 16) : '—'}
        {task?.recurrence ? ` · ${describeRule(task.recurrence, lang)}` : ''}
      </p>
    </Modal>
  );
}
