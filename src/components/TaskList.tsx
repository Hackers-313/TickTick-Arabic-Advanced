import { useMemo, useState, type ReactNode } from 'react';
import type { Project, Task } from '../../shared/types';
import { useApp } from '../store';
import { childrenOf, dueText, groupLabel, groupTasks, priorityColor, topLevel } from '../lib/tasks';
import { parseTags } from '../../shared/filters';
import { sortTasks } from '../../shared/filters';
import { describeRule } from '../../shared/recurrence';
import { QuickAdd } from './QuickAdd';
import { Icon } from './Icon';

export type SortKey = 'manual' | 'due' | 'priority' | 'created' | 'title';

export function TaskList({
  tasks,
  projects,
  showProject,
  grouping = true,
  showSort = true,
  quickAdd,
  quickAddProjectId,
  quickAddDefaults,
  emptyText,
}: {
  tasks: Task[];
  projects: Project[];
  showProject?: boolean;
  grouping?: boolean;
  showSort?: boolean;
  quickAdd?: boolean;
  quickAddProjectId?: string;
  quickAddDefaults?: Partial<Task>;
  emptyText?: string;
}) {
  const { lang, t, call, refresh, toast } = useApp();
  const [sortBy, setSortBy] = useState<SortKey>('manual');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const roots = useMemo(() => topLevel(tasks), [tasks]);
  const sorted = useMemo(() => sortTasks(roots, sortBy), [roots, sortBy]);
  const groups = useMemo(() => (grouping ? groupTasks(sorted) : [{ key: 'later' as const, tasks: sorted }]), [sorted, grouping]);

  const reorder = async (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    const ids = sorted.map((x) => x.id);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    try {
      await call('tasks.reorder', ids.map((id, index) => ({ id, sort_order: (index + 1) * 10 })));
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const toggleComplete = async (task: Task) => {
    try {
      const res = (await call('tasks.complete', task.id, task.status !== 'completed')) as
        | { task: Task; next: Task | null }
        | null;
      await refresh();
      if (res?.next) toast(lang === 'ar' ? 'أُنشئت النسخة التالية من المهمة المتكررة' : 'Next occurrence created');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const deleteTask = async (task: Task) => {
    try {
      if (task.deleted_at) {
        if (!window.confirm(lang === 'ar' ? 'حذف المهمة نهائيًا؟' : 'Delete permanently?')) return;
        await call('tasks.purge', task.id);
      } else {
        await call('tasks.delete', task.id, false);
      }
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const renderItem = (task: Task, depth = 0) => {
    const kids = childrenOf(tasks, task.id);
    return (
      <TaskItem
        key={task.id}
        task={task}
        subtasks={kids}
        project={projects.find((p) => p.id === task.project_id)}
        showProject={showProject}
        depth={depth}
        onToggle={() => void toggleComplete(task)}
        onDelete={() => void deleteTask(task)}
        onDropTask={sortBy === 'manual' ? reorder : undefined}
        draggable={sortBy === 'manual'}
        renderChild={(child) => renderItem(child, depth + 1)}
      />
    );
  };

  if (!tasks.length) {
    return (
      <>
        {quickAdd && <QuickAdd projectId={quickAddProjectId} defaults={quickAddDefaults} />}
        <div className="empty">
          <div className="big"><Icon name="sparkles" size={44} strokeWidth={1.4} /></div>
          <h3>{emptyText ?? t('noTasks')}</h3>
          <p className="small">{t('noTasksHint')}</p>
        </div>
      </>
    );
  }

  return (
    <div>
      {quickAdd && <QuickAdd projectId={quickAddProjectId} defaults={quickAddDefaults} />}
      {showSort && (
        <div className="gap wrap" style={{ marginBottom: 10, justifyContent: 'flex-end' }}>
          <span className="small muted">{t('sortBy')}</span>
          <div className="seg">
            {(
              [
                ['manual', t('manualOrder')],
                ['due', t('dueDate')],
                ['priority', t('priority')],
                ['created', t('created')],
                ['title', t('title')],
              ] as [SortKey, string][]
            ).map(([key, label]) => (
              <button key={key} className={sortBy === key ? 'active' : ''} onClick={() => setSortBy(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {groups.map((group) => (
        <div className="task-group" key={group.key}>
          {grouping && (
            <button
              className="group-header"
              onClick={() => setCollapsed((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
              style={{ background: 'none', width: '100%', textAlign: 'start' }}
            >
              <span>{collapsed[group.key] ? <Icon name="chevron-right" size={14} /> : <Icon name="chevron-down" size={14} />}</span>
              <span>{groupLabel(group.key, lang)}</span>
              <span className="count">{group.tasks.length}</span>
            </button>
          )}
          {!collapsed[group.key] && (
            <div className="task-list">
              {group.tasks.map((task) => renderItem(task))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TaskItem({
  task,
  subtasks,
  project,
  showProject,
  depth,
  onToggle,
  onDelete,
  onDropTask,
  draggable,
  renderChild,
}: {
  task: Task;
  subtasks: Task[];
  project?: Project;
  showProject?: boolean;
  depth: number;
  onToggle: () => void;
  onDelete: () => void;
  onDropTask?: (draggedId: string, targetId: string) => void;
  draggable: boolean;
  renderChild: (task: Task) => ReactNode;
}) {
  const { data, t, lang, openEditor, call, refresh, toast } = useApp();
  const [over, setOver] = useState(false);
  const tags = parseTags(task.tags);
  const checklist = (data?.checklist ?? []).filter((c) => c.task_id === task.id);
  const checklistDone = checklist.filter((c) => c.done === 1).length;
  const done = task.status === 'completed';
  const overdue = !!task.due_date && !done && dueText(task, lang) !== '' && (() => {
    const d = new Date(task.due_date!);
    return task.all_day ? task.due_date!.slice(0, 10) < new Date().toISOString().slice(0, 10) : d.getTime() < Date.now();
  })();

  const duplicate = async () => {
    try {
      await call('tasks.duplicate', task.id);
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const restore = async () => {
    try {
      await call('tasks.restore', task.id);
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <div>
      <div
        className={`task ${done ? 'done' : ''} ${over ? 'selected' : ''}`}
        draggable={draggable}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/task-id', task.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => {
          if (!onDropTask) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          if (!onDropTask) return;
          e.preventDefault();
          setOver(false);
          const id = e.dataTransfer.getData('text/task-id');
          if (id) onDropTask(id, task.id);
        }}
        onDoubleClick={() => openEditor(task.id)}
      >
        {task.priority > 0 && <span className={`priority-bar p${task.priority}`} />}
        <button
          className={`checkbox ${done ? 'checked' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          aria-label={done ? t('markOpen') : t('markComplete')}
          title={done ? t('markOpen') : t('markComplete')}
        >
          {done ? <Icon name="check" size={13} strokeWidth={3} /> : null}
        </button>
        <div className="task-main" onClick={() => openEditor(task.id)} style={{ cursor: 'pointer' }}>
          <div className="task-title">{task.title || (lang === 'ar' ? '(بدون عنوان)' : '(untitled)')}</div>
          <div className="task-meta">
            {showProject && project && (
              <span className="meta">
                <span className="dot" style={{ background: project.color, width: 7, height: 7, borderRadius: '50%', display: 'inline-block' }} />
                {project.name}
              </span>
            )}
            {task.due_date && (
              <span className={`meta ${overdue ? 'overdue' : ''}`}>
                <Icon name={overdue ? 'alarm' : 'calendar'} size={13} /> {dueText(task, lang, data?.settings)}
              </span>
            )}
            {task.recurrence && <span className="meta"><Icon name="repeat" size={13} /> {describeRule(task.recurrence, lang)}</span>}
            {task.priority > 0 && (
              <span className="meta" style={{ color: priorityColor(task.priority) }}>
                <Icon name="flag" size={13} /> {task.priority === 5 ? t('high') : task.priority === 3 ? t('medium') : t('low')}
              </span>
            )}
            {tags.map((tag) => (
              <span key={tag} className="meta">
                #{tag}
              </span>
            ))}
            {checklist.length > 0 && (
              <span className="meta">
                <Icon name="check-check" size={13} /> {checklistDone}/{checklist.length}
              </span>
            )}
            {task.notes && <span className="meta"><Icon name="file" size={13} /></span>}
            {task.quadrant && <span className="meta">Q{task.quadrant}</span>}
          </div>
        </div>
        <div className="task-actions">
          {task.deleted_at ? (
            <>
              <button className="btn ghost icon" title={t('restore')} onClick={restore}>
                <Icon name="undo" size={15} />
              </button>
              <button className="btn ghost icon" title={t('delete')} onClick={onDelete}>
                <Icon name="trash" size={15} />
              </button>
            </>
          ) : (
            <>
              <button className="btn ghost icon" title={t('edit')} onClick={() => openEditor(task.id)}>
                <Icon name="pencil" size={15} />
              </button>
              <button className="btn ghost icon" title={t('duplicate')} onClick={() => void duplicate()}>
                <Icon name="plus" size={15} />
              </button>
              <button className="btn ghost icon" title={t('delete')} onClick={onDelete}>
                <Icon name="trash" size={15} />
              </button>
            </>
          )}
        </div>
      </div>
      {subtasks.length > 0 && depth < 3 && (
        <div className="subtasks">
          {subtasks.map((child) => renderChild(child))}
        </div>
      )}
    </div>
  );
}
