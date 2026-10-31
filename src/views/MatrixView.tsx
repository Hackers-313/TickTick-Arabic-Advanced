import { useState } from 'react';
import { useApp } from '../store';
import { autoQuadrant } from '../../shared/filters';
import { dueText } from '../lib/tasks';

const QUADRANTS = [
  { n: 1, color: '#ff6b6b', icon: '🔥' },
  { n: 2, color: '#4f7cff', icon: '🌱' },
  { n: 3, color: '#ffb020', icon: '⚡' },
  { n: 4, color: '#8892a6', icon: '🌙' },
];

export function MatrixView() {
  const { data, t, lang, call, refresh, toast, openEditor } = useApp();
  const [over, setOver] = useState<number | 'none' | null>(null);
  const [urgentDays, setUrgentDays] = useState(2);
  const [important, setImportant] = useState<number[]>([3, 5]);

  if (!data) return null;
  const tasks = data.tasks.filter((x) => !x.deleted_at && x.status === 'open');
  const unclassified = tasks.filter((x) => x.quadrant == null);

  const setQuadrant = async (taskId: string, quadrant: number | null) => {
    try {
      await call('tasks.update', taskId, { quadrant });
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const autoClassify = async () => {
    try {
      for (const task of tasks) {
        const q = autoQuadrant(task, { urgentDays, importantPriorities: important });
        if (task.quadrant !== q) await call('tasks.update', task.id, { quadrant: q });
      }
      await refresh();
      toast(t('autoClassify'));
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const toggleImportant = (p: number) =>
    setImportant((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  return (
    <div className="main">
      <div className="toolbar">
        <h1>{t('matrix')}</h1>
        <span className="small muted">{t('classifyRules')}:</span>
        <label className="chip">
          {t('urgentDays')}
          <input
            type="number"
            min={0}
            max={30}
            value={urgentDays}
            onChange={(e) => setUrgentDays(Math.max(0, Number(e.target.value) || 0))}
            style={{ width: 54, padding: '1px 4px', background: 'transparent', border: 'none' }}
          />
        </label>
        {[1, 3, 5].map((p) => (
          <label key={p} className="chip" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={important.includes(p)} onChange={() => toggleImportant(p)} />
            {p === 5 ? t('high') : p === 3 ? t('medium') : t('low')}
          </label>
        ))}
        <button className="btn" onClick={() => void autoClassify()}>
          ✨ {t('autoClassify')}
        </button>
      </div>
      <div className="content no-pad">
        <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
          <div className="matrix" style={{ flex: 1 }}>
            {QUADRANTS.map((q) => {
              const list = tasks.filter((x) => x.quadrant === q.n);
              return (
                <div
                  key={q.n}
                  className={`quad ${over === q.n ? 'over' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(q.n);
                  }}
                  onDragLeave={() => setOver((v) => (v === q.n ? null : v))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(null);
                    const id = e.dataTransfer.getData('text/matrix-id');
                    if (id) void setQuadrant(id, q.n);
                  }}
                >
                  <div className="quad-head">
                    <span className="badge" style={{ background: q.color }}>
                      {q.n}
                    </span>
                    <span className="grow">{t(`quadrant${q.n}`)}</span>
                    <span className="muted small">{list.length}</span>
                    <button className="btn ghost icon" title={t('newTask')} onClick={() => openEditor(undefined, { quadrant: q.n })}>
                      ＋
                    </button>
                  </div>
                  <div className="quad-body">
                    {list.map((task) => (
                      <MatrixCard key={task.id} task={task} lang={lang} due={dueText(task, lang, data.settings)} onOpen={() => openEditor(task.id)} onUnclassify={() => void setQuadrant(task.id, null)} />
                    ))}
                    {list.length === 0 && <span className="small muted center" style={{ padding: 12 }}>{t('dropHere')}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div
            style={{
              width: 250,
              flex: '0 0 250px',
              borderInlineStart: '1px solid var(--border-soft)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              background: 'var(--panel)',
            }}
            className={over === 'none' ? 'quad over' : ''}
            onDragOver={(e) => {
              e.preventDefault();
              setOver('none');
            }}
            onDragLeave={() => setOver((v) => (v === 'none' ? null : v))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData('text/matrix-id');
              if (id) void setQuadrant(id, null);
            }}
          >
            <div className="quad-head">
              <span className="grow">{t('unclassified')}</span>
              <span className="muted small">{unclassified.length}</span>
            </div>
            <div className="quad-body">
              {unclassified.map((task) => (
                <MatrixCard key={task.id} task={task} lang={lang} due={dueText(task, lang, data.settings)} onOpen={() => openEditor(task.id)} />
              ))}
              {unclassified.length === 0 && (
                <span className="small muted center" style={{ padding: 12 }}>
                  {lang === 'ar' ? 'كل المهام مصنفة' : 'All tasks classified'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MatrixCard({
  task,
  lang,
  due,
  onOpen,
  onUnclassify,
}: {
  task: { id: string; title: string; priority: number; due_date: string | null };
  lang: 'ar' | 'en';
  due: string;
  onOpen: () => void;
  onUnclassify?: () => void;
}) {
  return (
    <div
      className="mini-task"
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/matrix-id', task.id)}
      onClick={onOpen}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <span className="grow">{task.title}</span>
        {onUnclassify && (
          <button
            className="btn ghost icon"
            title={lang === 'ar' ? 'إلغاء التصنيف' : 'Unclassify'}
            onClick={(e) => {
              e.stopPropagation();
              onUnclassify();
            }}
            style={{ padding: 0, width: 18 }}
          >
            ↩
          </button>
        )}
      </div>
      <div className="m">
        {due || (lang === 'ar' ? 'بدون تاريخ' : 'No date')}
        {task.priority > 0 ? ` · ⚑ ${task.priority === 5 ? (lang === 'ar' ? 'عالية' : 'High') : task.priority === 3 ? (lang === 'ar' ? 'متوسطة' : 'Medium') : lang === 'ar' ? 'منخفضة' : 'Low'}` : ''}
      </div>
    </div>
  );
}
