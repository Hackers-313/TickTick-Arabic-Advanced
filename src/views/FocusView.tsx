import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useApp } from '../store';
import { formatTime, parseLocal, startOfDay, toLocalISO } from '../../shared/date';
import { prepareSound, playCompletionSound, playTimerTick } from '../lib/sound';
import { Icon } from '../components/Icon';

type Mode = 'focus' | 'short_break' | 'long_break' | 'stopwatch';

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function FocusView() {
  const { data, t, lang, call, refresh, toast } = useApp();
  const pomodoro = data?.settings.pomodoro;
  const [mode, setMode] = useState<Mode>('focus');
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState((pomodoro?.focus_min ?? 25) * 60);
  const [elapsed, setElapsed] = useState(0);
  const [taskId, setTaskId] = useState('');
  const [cycle, setCycle] = useState(0);
  const startedRef = useRef<string | null>(null);
  const finishingRef = useRef(false);
  const finishRef = useRef<(completed: boolean) => void>(() => {});

  const totalFor = (m: Mode): number => {
    if (!pomodoro) return 25 * 60;
    if (m === 'focus') return pomodoro.focus_min * 60;
    if (m === 'short_break') return pomodoro.short_break_min * 60;
    if (m === 'long_break') return pomodoro.long_break_min * 60;
    return 0;
  };

  useEffect(() => {
    if (!running) return;
    let previous = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const seconds = Math.floor((now - previous) / 1000);
      if (seconds < 1) return;
      previous += seconds * 1000;
      if (pomodoro?.sound && pomodoro.tick_sound) playTimerTick();
      if (mode === 'stopwatch') setElapsed((e) => e + seconds);
      else setRemaining((r) => Math.max(0, r - seconds));
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, mode, pomodoro?.sound, pomodoro?.tick_sound]);

  useEffect(() => {
    if (!running || mode === 'stopwatch' || remaining > 0) return;
    finishRef.current(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, running]);

  useEffect(() => {
    if (!pomodoro) return;
    if (!running && !startedRef.current) {
      setRemaining(totalFor(mode));
      setElapsed(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pomodoro?.focus_min, pomodoro?.short_break_min, pomodoro?.long_break_min]);

  if (!data) return null;

  const focusSessions = data.focusSessions.filter((s) => s.mode === 'focus' || s.mode === 'stopwatch');
  const today = startOfDay(new Date());
  const todayMinutes = Math.round(
    focusSessions.filter((s) => (parseLocal(s.started_at) ?? new Date(0)) >= today).reduce((sum, s) => sum + s.duration_sec, 0) / 60,
  );
  const goal = pomodoro?.daily_goal_min ?? 120;
  const total = totalFor(mode);
  const progress = mode === 'stopwatch' ? 0 : total ? ((total - remaining) / total) * 100 : 0;

  const start = () => {
    if (pomodoro?.sound) void prepareSound();
    if (!startedRef.current) startedRef.current = toLocalISO(new Date());
    setRunning(true);
  };

  const pause = () => setRunning(false);

  const reset = () => {
    setRunning(false);
    startedRef.current = null;
    setRemaining(totalFor(mode));
    setElapsed(0);
  };

  const switchMode = (m: Mode) => {
    setRunning(false);
    setMode(m);
    startedRef.current = null;
    setRemaining(totalFor(m));
    setElapsed(0);
  };

  const finish = async (completed: boolean) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    try {
      setRunning(false);
      const duration = mode === 'stopwatch' ? elapsed : total;
      const wasFocus = mode === 'focus' || mode === 'stopwatch';
      // A storage error must not prevent the timer alarm from sounding.
      if (completed && pomodoro?.sound && !(await playCompletionSound())) {
        toast(lang === 'ar' ? 'تعذّر تشغيل صوت المؤقت؛ جرّب اختبار الصوت في الإعدادات.' : 'Timer audio unavailable; try Test sound in Settings.', 'error');
      }
      if (wasFocus && duration > 0) {
        const started = startedRef.current ?? toLocalISO(new Date(Date.now() - duration * 1000));
        await call('focus.save', {
          task_id: taskId || null,
          mode,
          started_at: started,
          ended_at: toLocalISO(new Date()),
          duration_sec: duration,
          completed: completed ? 1 : 0,
          note: '',
        });
        await refresh();
      }
      startedRef.current = null;
      setElapsed(0);
      if (wasFocus) {
        const nextCycle = cycle + 1;
        setCycle(nextCycle);
        const longEvery = pomodoro?.long_break_every ?? 4;
        const nextMode: Mode = nextCycle % Math.max(1, longEvery) === 0 ? 'long_break' : 'short_break';
        setMode(nextMode);
        setRemaining(totalFor(nextMode));
        if (completed) {
          if (data.settings.notifications.enabled) {
            try {
              new Notification(t('focusTimer'), { body: lang === 'ar' ? 'انتهت جلسة التركيز، حان وقت الاستراحة' : 'Focus session finished — time for a break' });
            } catch {
              /* notification unavailable */
            }
          }
          if (pomodoro?.auto_start_breaks) {
            startedRef.current = toLocalISO(new Date());
            setRunning(true);
          }
        }
      } else {
        setMode('focus');
        setRemaining(totalFor('focus'));
        if (completed) {
          if (pomodoro?.auto_start_focus) {
            startedRef.current = toLocalISO(new Date());
            setRunning(true);
          }
        }
      }
      if (completed) toast(lang === 'ar' ? 'اكتملت الجلسة' : 'Session complete');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      finishingRef.current = false;
    }
  };

  finishRef.current = (c) => {
    void finish(c);
  };

  const modeLabel = (m: Mode) =>
    m === 'focus' ? t('workSession') : m === 'short_break' ? t('shortBreak') : m === 'long_break' ? t('longBreak') : t('stopwatch');

  return (
    <div className="main">
      <div className="toolbar">
        <h1>{t('focus')}</h1>
        <span className="small muted">
          {todayMinutes} / {goal} {t('focusMinutes')}
        </span>
        <div className="bar-track" style={{ width: 140 }}>
          <div className="bar-fill" style={{ width: `${Math.min(100, (todayMinutes / Math.max(1, goal)) * 100)}%`, background: 'var(--accent)' }} />
        </div>
      </div>
      <div className="content">
        <div className="focus-wrap">
          <div className="seg">
            {(['focus', 'short_break', 'long_break', 'stopwatch'] as Mode[]).map((m) => (
              <button key={m} className={mode === m ? 'active' : ''} onClick={() => switchMode(m)}>
                {modeLabel(m)}
              </button>
            ))}
          </div>

          <div className="timer-ring" style={{ '--p': Math.max(0, Math.min(100, progress)) } as CSSProperties}>
            <div className="timer-inner">
              <div className="timer-time">{mode === 'stopwatch' ? fmt(elapsed) : fmt(remaining)}</div>
              <div className="timer-mode">
                {modeLabel(mode)} {running ? '· ●' : ''}
              </div>
            </div>
          </div>

          <div className="timer-controls">
            {!running ? (
              <button className="btn primary" onClick={start}>
                <Icon name="play" size={16} /> {t('start')}
              </button>
            ) : (
              <button className="btn" onClick={pause}>
                <Icon name="pause" size={16} /> {t('pause')}
              </button>
            )}
            <button className="btn" onClick={reset}>
              <Icon name="reset" size={16} /> {t('reset')}
            </button>
            <button className="btn" onClick={() => void finish(false)}>
              ⏭ {t('skip')}
            </button>
          </div>

          <div className="gap">
            <span className="small muted">{t('linkTask')}</span>
            <select value={taskId} onChange={(e) => setTaskId(e.target.value)} style={{ maxWidth: 320 }}>
              <option value="">{t('noTaskLinked')}</option>
              {data.tasks
                .filter((x) => !x.deleted_at && x.status === 'open')
                .map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
            </select>
          </div>

          <div className="panel" style={{ width: '100%', maxWidth: 720 }}>
            <h3>{t('sessionHistory')}</h3>
            {data.focusSessions.slice(0, 10).map((s) => (
              <div className="kv" key={s.id}>
                <span>
                  <Icon name={s.mode === 'focus' ? 'target' : s.mode === 'stopwatch' ? 'timer' : 'coffee'} size={15} /> {modeLabel(s.mode as Mode)} ·{' '}
                  {data.tasks.find((x) => x.id === s.task_id)?.title ?? '—'}
                </span>
                <span className="gap">
                  <span className="mono">{Math.round(s.duration_sec / 60)} {lang === 'ar' ? 'د' : 'm'}</span>
                  <span className="muted small">{formatTime(parseLocal(s.started_at) ?? new Date(), lang, data.settings.hour12 === 1)}</span>
                  <button
                    className="btn ghost icon"
                    onClick={async () => {
                      await call('focus.delete', s.id);
                      await refresh();
                    }}
                  >
                    <Icon name="x" size={15} />
                  </button>
                </span>
              </div>
            ))}
            {data.focusSessions.length === 0 && <p className="small muted">{lang === 'ar' ? 'لا توجد جلسات بعد' : 'No sessions yet'}</p>}
          </div>
          <p className="small muted">
            {lang === 'ar'
              ? `جلسات اليوم: ${focusSessions.filter((s) => (parseLocal(s.started_at) ?? new Date(0)) >= today).length}`
              : `Sessions today: ${focusSessions.filter((s) => (parseLocal(s.started_at) ?? new Date(0)) >= today).length}`}
          </p>
        </div>
      </div>
    </div>
  );
}
