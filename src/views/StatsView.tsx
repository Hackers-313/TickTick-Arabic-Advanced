import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { computeStats } from '../../shared/stats';
import { BarChart, ProgressBar } from '../components/Charts';
import { formatDate, parseLocal } from '../../shared/date';
import { Icon } from '../components/Icon';

export function StatsView() {
  const { data, t, lang } = useApp();
  const [days, setDays] = useState(30);

  const stats = useMemo(
    () =>
      data
        ? computeStats({
            tasks: data.tasks,
            projects: data.projects,
            sessions: data.focusSessions,
            habits: data.habits,
            logs: data.habitLogs,
          }, days)
        : null,
    [data, days],
  );

  if (!data || !stats) return null;

  const daily = stats.daily.map((d) => ({
    label: formatDate(parseLocal(d.date)!, lang, { day: 'numeric' }),
    value: d.completed,
  }));
  const focusDaily = stats.daily.map((d) => ({
    label: formatDate(parseLocal(d.date)!, lang, { day: 'numeric' }),
    value: d.focus,
  }));

  return (
    <div className="main">
      <div className="toolbar">
        <h1>{t('statistics')}</h1>
        <div className="seg">
          {[7, 30, 90].map((n) => (
            <button key={n} className={days === n ? 'active' : ''} onClick={() => setDays(n)}>
              {n} {t('days')}
            </button>
          ))}
        </div>
        <span className="chip accent">{t('productivity')}</span>
      </div>
      <div className="content">
        <div className="stat-grid">
          <StatCard value={stats.completedToday} label={t('todayDone')} icon="✅" />
          <StatCard value={stats.completedWeek} label={t('thisWeek')} icon="📅" />
          <StatCard value={stats.completedMonth} label={t('thisMonth')} icon="🗓️" />
          <StatCard value={stats.open} label={t('open')} icon="📋" />
          <StatCard value={stats.overdue} label={t('overdue')} icon="⚠️" danger={stats.overdue > 0} />
          <StatCard value={`${stats.completionRate}%`} label={t('completionRate')} icon="📈" />
          <StatCard value={stats.focusMinutesToday} label={t('focusMinutes')} icon="⏱️" />
          <StatCard value={`${stats.habitsDoneToday}/${stats.habitsTotal}`} label={t('habits')} icon="🔥" />
        </div>

        <div className="panel">
          <h3>
            {t('completedTasks')} · {t('last30Days')}
            <span className={`chip ${stats.comparison.delta >= 0 ? 'accent' : 'danger'}`} style={{ marginInlineStart: 8 }}>
              {stats.comparison.delta >= 0 ? '▲' : '▼'} {Math.abs(stats.comparison.delta)}% {t('comparison')}
            </span>
          </h3>
          <BarChart data={daily} height={170} suffix="" />
        </div>

        <div className="panel">
          <h3>{t('focusMinutes')} · {t('days')}</h3>
          <BarChart data={focusDaily} color="var(--success)" height={140} suffix="m" />
        </div>

        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="panel" style={{ flex: 1 }}>
            <h3>{t('projectPerformance')}</h3>
            {stats.projects.length === 0 && <p className="small muted">—</p>}
            {stats.projects.map((p) => (
              <div className="bar-row" key={p.id}>
                <span className="name" title={p.name}>
                  {p.name}
                </span>
                <ProgressBar value={p.total ? (p.completed / p.total) * 100 : 0} color={p.color} />
                <span className="val">
                  {p.completed}/{p.total}
                </span>
              </div>
            ))}
          </div>
          <div className="panel" style={{ flex: 1 }}>
            <h3>{t('habitProgress')}</h3>
            {stats.habitAdherence.length === 0 && <p className="small muted">—</p>}
            {stats.habitAdherence.map((h) => (
              <div className="bar-row" key={h.id}>
                <span className="name" title={h.name}>
                  {h.name}
                </span>
                <ProgressBar value={h.adherence} color={h.color} />
                <span className="val">{h.adherence}%</span>
                <span className="chip">🔥 {h.streak}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h3>{t('projectPerformance')} · {t('overdue')}</h3>
          {stats.projects.filter((p) => p.overdue > 0).length === 0 ? (
            <p className="small muted">{lang === 'ar' ? 'لا توجد مهام متأخرة 🎉' : 'No overdue tasks 🎉'}</p>
          ) : (
            stats.projects
              .filter((p) => p.overdue > 0)
              .map((p) => (
                <div className="kv" key={p.id}>
                  <span>{p.name}</span>
                  <span className="chip danger">{p.overdue}</span>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ value, label, icon, danger }: { value: number | string; label: string; icon: string; danger?: boolean }) {
  return (
    <div className="stat-card">
      <div className="gap">
        <span className="stat-icon"><Icon name={icon} size={19} /></span>
        <div className="v" style={danger ? { color: 'var(--danger)' } : undefined}>
          {value}
        </div>
      </div>
      <div className="l">{label}</div>
    </div>
  );
}
