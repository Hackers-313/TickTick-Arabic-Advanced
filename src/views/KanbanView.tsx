import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store';
import { projectColumns } from '../lib/tasks';
import { dueText } from '../lib/tasks';
import { parseTags } from '../../shared/filters';

export function KanbanView() {
  const { data, view, t, lang, call, refresh, toast, openEditor } = useApp();
  const [projectId, setProjectId] = useState<string>(view.kind === 'project' ? view.id : '');
  const [over, setOver] = useState<string | null>(null);

  useEffect(() => {
    if (view.kind === 'project') setProjectId(view.id);
  }, [view]);

  const projects = data?.projects ?? [];
  const project = projects.find((p) => p.id === projectId) ?? projects.find((p) => p.is_inbox) ?? projects[0];
  const columns = useMemo(() => projectColumns(project), [project]);
  const tasks = (data?.tasks ?? []).filter((x) => x.project_id === project?.id && !x.deleted_at);

  if (!data || !project) return null;

  const move = async (taskId: string, columnId: string) => {
    try {
      await call('tasks.move', taskId, project.id, columnId);
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const addCard = async (columnId: string) => {
    const title = window.prompt(lang === 'ar' ? 'عنوان المهمة' : 'Task title');
    if (!title) return;
    try {
      await call('tasks.create', { title, project_id: project.id, kanban_column: columnId });
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const addColumn = async () => {
    const title = window.prompt(lang === 'ar' ? 'اسم العمود' : 'Column name');
    if (!title) return;
    const colors = ['#4f7cff', '#37c98b', '#ffb020', '#ff6b6b', '#a78bfa', '#22c1dc'];
    const next = [...columns, { id: `col-${Date.now()}`, title, color: colors[columns.length % colors.length] }];
    try {
      await call('projects.update', project.id, { kanban_columns: JSON.stringify(next) });
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <div className="main">
      <div className="toolbar">
        <h1>{t('kanban')}</h1>
        <select value={project.id} onChange={(e) => setProjectId(e.target.value)} style={{ maxWidth: 240 }}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.icon} {p.name}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => void addColumn()}>
          ＋ {t('addColumn')}
        </button>
        <button className="btn primary" onClick={() => openEditor(undefined, { project_id: project.id })}>
          ＋ {t('newTask')}
        </button>
      </div>
      <div className="content no-pad">
        <div className="kanban">
          {columns.map((col) => {
            const colTasks = tasks.filter((x) => (x.kanban_column ?? columns[0]?.id) === col.id);
            return (
              <div
                key={col.id}
                className={`kanban-col ${over === col.id ? 'over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(col.id);
                }}
                onDragLeave={() => setOver((v) => (v === col.id ? null : v))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  const id = e.dataTransfer.getData('text/kanban-id');
                  if (id) void move(id, col.id);
                }}
              >
                <div className="kanban-head">
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color }} />
                  <span>{col.title}</span>
                  <span className="n">{colTasks.length}</span>
                </div>
                <div className="kanban-body">
                  {colTasks.map((task) => (
                    <div
                      key={task.id}
                      className="kcard"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/kanban-id', task.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => openEditor(task.id)}
                    >
                      <div className="kt" style={{ textDecoration: task.status === 'completed' ? 'line-through' : 'none' }}>
                        {task.title}
                      </div>
                      <div className="km">
                        {task.due_date && <span>📅 {dueText(task, lang, data.settings)}</span>}
                        {task.priority > 0 && <span style={{ color: task.priority >= 5 ? 'var(--danger)' : 'var(--warning)' }}>⚑</span>}
                        {parseTags(task.tags).map((tag) => (
                          <span key={tag}>#{tag}</span>
                        ))}
                        {(data.checklist ?? []).some((c) => c.task_id === task.id) && (
                          <span>
                            ☑ {(data.checklist ?? []).filter((c) => c.task_id === task.id && c.done === 1).length}/
                            {(data.checklist ?? []).filter((c) => c.task_id === task.id).length}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  <button className="quick-add" style={{ padding: '7px 9px', fontSize: 12 }} onClick={() => void addCard(col.id)}>
                    ＋ {t('newTask')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
