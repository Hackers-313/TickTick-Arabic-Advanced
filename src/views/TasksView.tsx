import { useMemo } from 'react';
import { useApp } from '../store';
import { TaskList } from '../components/TaskList';
import { tasksForView, topLevel } from '../lib/tasks';
import { projectProgress } from '../../shared/stats';
import { toDateKey } from '../../shared/date';

export function TasksView() {
  const { data, view, t, lang, openEditor } = useApp();
  const tasks = useMemo(() => (data ? tasksForView(data, view) : []), [data, view]);

  if (!data) return null;

  const smartTitle: Record<string, string> = {
    today: t('today'),
    tomorrow: t('tomorrow'),
    next7: t('next7'),
    all: t('allTasks'),
    completed: t('completed'),
    overdue: t('overdue'),
    trash: t('trash'),
  };

  let title = '';
  let projectId: string | undefined;
  let subtitle = '';
  if (view.kind === 'smart') {
    title = smartTitle[view.key] ?? '';
  } else if (view.kind === 'project') {
    const project = data.projects.find((p) => p.id === view.id);
    title = project ? `${project.icon || '📁'} ${project.name}` : '';
    projectId = view.id;
    const progress = projectProgress(data.tasks.filter((x) => !x.deleted_at), view.id);
    subtitle = `${progress.completed}/${progress.total} · ${progress.percent}%`;
  } else if (view.kind === 'filter') {
    const filter = data.filters.find((f) => f.id === view.id);
    title = filter ? `${filter.icon} ${filter.name}` : t('filters');
  } else if (view.kind === 'tag') {
    title = `#${view.name}`;
  }

  const roots = topLevel(tasks);
  const openCount = roots.filter((x) => x.status === 'open').length;
  const canAdd = view.kind !== 'smart' || view.key !== 'trash';

  return (
    <div className="main">
      <div className="toolbar">
        <h1>{title}</h1>
        <span className="sub">
          {openCount} {t('open')} {subtitle ? `· ${subtitle}` : ''}
        </span>
        {canAdd && (
          <button className="btn primary" onClick={() => openEditor(undefined, projectId ? { project_id: projectId } : undefined)}>
            ＋ {t('newTask')}
          </button>
        )}
      </div>
      <div className="content">
        {view.kind === 'smart' && view.key === 'trash' && (
          <p className="small muted mb">
            {lang === 'ar' ? 'المهام المحذوفة يمكن استعادتها أو حذفها نهائيًا.' : 'Deleted tasks can be restored or purged permanently.'}
          </p>
        )}
        <TaskList
          tasks={tasks}
          projects={data.projects}
          showProject={view.kind !== 'project'}
          grouping={!(view.kind === 'smart' && ['today', 'tomorrow', 'next7', 'overdue', 'trash'].includes(view.key))}
          quickAdd={canAdd}
          quickAddProjectId={projectId}
          quickAddDefaults={
            view.kind === 'smart' && view.key === 'today'
              ? { due_date: `${toDateKey(new Date())}T00:00:00`, all_day: 1 }
              : undefined
          }
        />
      </div>
    </div>
  );
}
