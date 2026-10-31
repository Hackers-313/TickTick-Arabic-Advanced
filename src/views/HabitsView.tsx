import { useState, type CSSProperties } from 'react';
import type { Habit } from '../../shared/types';
import { useApp } from '../store';
import { adherence, computeBestStreak, computeStreak, heatmap, isDone, isHabitScheduled, monthCompletion, todayProgress } from '../../shared/habits';
import { toDateKey } from '../../shared/date';
import { Modal } from '../components/Modal';

export function HabitsView() {
  const { data, t, lang, call, refresh, toast } = useApp();
  const [editor, setEditor] = useState<{ open: boolean; habit?: Habit }>({ open: false });

  const habits = (data?.habits ?? []).filter((h) => !h.archived);
  const logs = data?.habitLogs ?? [];

  if (!data) return null;

  const toggleDay = async (habit: Habit, dayKey: string) => {
    const existing = logs.find((l) => l.habit_id === habit.id && l.date.slice(0, 10) === dayKey);
    try {
      if (existing && isDone(existing, habit)) {
        await call('habits.uncheck', habit.id, dayKey);
      } else {
        await call('habits.checkin', habit.id, dayKey, habit.goal > 0 ? habit.goal : 1, '');
      }
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const remove = async (habit: Habit) => {
    if (!window.confirm(t('confirmDelete'))) return;
    try {
      await call('habits.delete', habit.id);
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <div className="main">
      <div className="toolbar">
        <h1>{t('habits')}</h1>
        <span className="small muted">{habits.length} {lang === 'ar' ? 'عادة' : 'habits'}</span>
        <button className="btn primary" onClick={() => setEditor({ open: true })}>
          ＋ {t('newHabit')}
        </button>
      </div>
      <div className="content">
        {habits.length === 0 && (
          <div className="empty">
            <div className="big">🔥</div>
            <h3>{lang === 'ar' ? 'ابدأ بعادة جديدة' : 'Start a new habit'}</h3>
            <p className="small">{lang === 'ar' ? 'تتبّع الالتزام والسلاسل اليومية' : 'Track daily streaks and adherence'}</p>
          </div>
        )}
        {habits.map((habit) => {
          const habitLogs = logs.filter((l) => l.habit_id === habit.id);
          const progress = todayProgress(habit, logs);
          const streak = computeStreak(habit, logs);
          const best = computeBestStreak(habit, logs);
          const pct = adherence(habit, logs, 30);
          const todayKey = toDateKey(new Date());
          const scheduledToday = isHabitScheduled(habit, todayKey);
          const month = monthCompletion(habit, logs, new Date());
          const weeks = heatmap(habit, logs, 26);
          return (
            <div className="habit-card" key={habit.id}>
              <div className="habit-top">
                <span className="habit-icon" style={{ background: `color-mix(in srgb, ${habit.color} 18%, var(--bg-2))` }}>
                  {habit.icon}
                </span>
                <div className="grow">
                  <div className="habit-name">{habit.name}</div>
                  <div className="habit-sub">
                    {habit.frequency === 'daily'
                      ? lang === 'ar'
                        ? 'يوميًا'
                        : 'Daily'
                      : habit.frequency === 'weekly'
                        ? `${habit.target_days} ${t('timesPerWeek')}`
                        : lang === 'ar'
                          ? 'أيام محددة'
                          : 'Selected days'}
                    {habit.goal > 1 ? ` · ${t('habitGoal')} ${habit.goal} ${habit.unit}` : ''}
                    {habit.reminder_time ? ` · ⏰ ${habit.reminder_time}` : ''}
                  </div>
                </div>
                <div className="center">
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{streak}</div>
                  <div className="small muted">{t('streak')}</div>
                </div>
                <div className="center">
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{best}</div>
                  <div className="small muted">{t('bestStreak')}</div>
                </div>
                <div className="center">
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{pct}%</div>
                  <div className="small muted">{t('adherence')}</div>
                </div>
                <button className="btn ghost icon" onClick={() => setEditor({ open: true, habit })} title={t('edit')}>
                  ✎
                </button>
                <button className="btn ghost icon" onClick={() => void remove(habit)} title={t('delete')}>
                  🗑
                </button>
              </div>

              <div className="gap" style={{ marginTop: 12 }}>
                {habit.goal > 1 ? (
                  <div className="ring" style={{ '--p': Math.min(100, Math.round((progress.value / Math.max(1, habit.goal)) * 100)) } as CSSProperties}>
                    <span>
                      {progress.value}/{habit.goal}
                    </span>
                  </div>
                ) : (
                  <button
                    className={`checkbox ${progress.done ? 'checked' : ''}`}
                    style={{ width: 34, height: 34, flexBasis: 34, fontSize: 16 }}
                    onClick={() => void toggleDay(habit, todayKey)}
                    disabled={!scheduledToday && !progress.done}
                    title={progress.done ? t('checkedIn') : t('checkIn')}
                  >
                    ✓
                  </button>
                )}
                <span className="small muted">
                  {progress.done
                    ? t('checkedIn')
                    : scheduledToday
                      ? lang === 'ar'
                        ? 'لم يُسجَّل اليوم'
                        : 'Not checked in today'
                      : lang === 'ar'
                        ? 'غير مجدول اليوم'
                        : 'Not scheduled today'}
                </span>
                <span className="chip right">
                  {month.done}/{month.total} {lang === 'ar' ? 'هذا الشهر' : 'this month'}
                </span>
                {habit.goal > 1 && (
                  <>
                    <button
                      className="btn sm"
                      onClick={async () => {
                        await call('habits.checkin', habit.id, todayKey, Math.max(0, progress.value - habit.step), '');
                        await refresh();
                      }}
                    >
                      −
                    </button>
                    <button
                      className="btn sm"
                      onClick={async () => {
                        await call('habits.checkin', habit.id, todayKey, progress.value + habit.step, '');
                        await refresh();
                      }}
                    >
                      ＋
                    </button>
                  </>
                )}
              </div>

              <div className="heatmap" title={t('heatmap')}>
                {weeks.map((col, ci) => (
                  <div className="heat-col" key={ci}>
                    {col.map((cell) => (
                      <button
                        key={cell.date}
                        className={`heat-cell l${cell.level} ${cell.date > todayKey ? 'future' : ''}`}
                        title={`${cell.date}${cell.value ? ` · ${cell.value}` : ''}`}
                        onClick={() => cell.date <= todayKey && void toggleDay(habit, cell.date)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {editor.open && <HabitEditor habit={editor.habit} onClose={() => setEditor({ open: false })} />}
    </div>
  );
}

const DAY_NAMES = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

function HabitEditor({ habit, onClose }: { habit?: Habit; onClose: () => void }) {
  const { t, lang, call, refresh, toast } = useApp();
  const [name, setName] = useState(habit?.name ?? '');
  const [icon, setIcon] = useState(habit?.icon ?? '⭐');
  const [color, setColor] = useState(habit?.color ?? '#4f7cff');
  const [frequency, setFrequency] = useState<Habit['frequency']>(habit?.frequency ?? 'daily');
  const [targetDays, setTargetDays] = useState(habit?.target_days ?? 7);
  const [weekdays, setWeekdays] = useState<number[]>(() => {
    try {
      return JSON.parse(habit?.weekdays ?? '[]');
    } catch {
      return [];
    }
  });
  const [goal, setGoal] = useState(habit?.goal ?? 1);
  const [step, setStep] = useState(habit?.step ?? 1);
  const [unit, setUnit] = useState(habit?.unit ?? '');
  const [reminder, setReminder] = useState(habit?.reminder_time ?? '');
  const [notes, setNotes] = useState(habit?.notes ?? '');

  const save = async () => {
    if (!name.trim()) return toast(lang === 'ar' ? 'أدخل اسم العادة' : 'Enter a habit name', 'error');
    const payload = {
      name: name.trim(),
      icon,
      color,
      frequency,
      target_days: targetDays,
      weekdays: JSON.stringify(weekdays),
      goal: Math.max(1, goal),
      step: Math.max(1, step),
      unit,
      reminder_time: reminder || null,
      notes,
    };
    try {
      if (habit) await call('habits.update', habit.id, payload);
      else await call('habits.create', payload);
      await refresh();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <Modal
      title={habit ? t('edit') + ' · ' + habit.name : t('newHabit')}
      onClose={onClose}
      footer={
        <>
          <button className="btn primary" onClick={() => void save()}>
            {t('save')}
          </button>
          <button className="btn" onClick={onClose}>
            {t('cancel')}
          </button>
        </>
      }
    >
      <div className="row">
        <div className="field" style={{ flex: 3 }}>
          <label>{t('title')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>{t('icon')}</label>
          <input value={icon} onChange={(e) => setIcon(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>{t('color')}</label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ height: 38, padding: 3 }} />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>{t('frequency')}</label>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as Habit['frequency'])}>
            <option value="daily">{t('daily')}</option>
            <option value="weekly">{t('weekly')}</option>
            <option value="custom">{t('custom')}</option>
          </select>
        </div>
        {frequency === 'weekly' && (
          <div className="field">
            <label>{t('timesPerWeek')}</label>
            <input type="number" min={1} max={7} value={targetDays} onChange={(e) => setTargetDays(Math.max(1, Number(e.target.value) || 1))} />
          </div>
        )}
        <div className="field">
          <label>{t('habitGoal')}</label>
          <input type="number" min={1} value={goal} onChange={(e) => setGoal(Math.max(1, Number(e.target.value) || 1))} />
        </div>
        <div className="field">
          <label>{lang === 'ar' ? 'الخطوة' : 'Step'}</label>
          <input type="number" min={1} value={step} onChange={(e) => setStep(Math.max(1, Number(e.target.value) || 1))} />
        </div>
        <div className="field">
          <label>{t('habitUnit')}</label>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={lang === 'ar' ? 'صفحة، كوب…' : 'page, cup…'} />
        </div>
      </div>
      {frequency === 'custom' && (
        <div className="field">
          <label>{t('weekdays')}</label>
          <div className="gap wrap">
            {DAY_NAMES.map((d, i) => (
              <label key={d} className="chip" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={weekdays.includes(i)}
                  onChange={(e) => setWeekdays(e.target.checked ? [...weekdays, i].sort() : weekdays.filter((x) => x !== i))}
                />
                {lang === 'ar' ? d : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="row">
        <div className="field">
          <label>{lang === 'ar' ? 'وقت التذكير' : 'Reminder time'}</label>
          <input type="time" value={reminder} onChange={(e) => setReminder(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>{t('notes')}</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}
