import { useMemo, useState } from 'react';
import type { Project, SmartFilter } from '../../shared/types';
import { useApp } from '../store';
import { activeTasks, smartCounts } from '../lib/tasks';
import { viewKey } from '../lib/view';
import { parseTags } from '../../shared/filters';
import { Modal } from './Modal';
import { FilterEditor } from './FilterEditor';
import { Icon, IconPicker } from './Icon';

const PAGE_ITEMS = [
  { key: 'calendar', icon: 'calendar', label: 'calendar' },
  { key: 'kanban', icon: 'columns', label: 'kanban' },
  { key: 'timeline', icon: 'activity', label: 'timeline' },
  { key: 'matrix', icon: 'compass', label: 'matrix' },
  { key: 'habits', icon: 'flame', label: 'habits' },
  { key: 'focus', icon: 'timer', label: 'focus' },
  { key: 'stats', icon: 'trending', label: 'statistics' },
  { key: 'countdowns', icon: 'award', label: 'countdowns' },
  { key: 'sticky', icon: 'sticky', label: 'stickyNotes' },
] as const;

export function Sidebar() {
  const { data, settings, view, setView, t, lang, openEditor, updateSettings, mutate, toast } = useApp();
  const [projectModal, setProjectModal] = useState<{ open: boolean; project?: Project }>({ open: false });
  const [filterModal, setFilterModal] = useState<{ open: boolean; filter?: SmartFilter }>({ open: false });

  const counts = useMemo(() => (data ? smartCounts(data) : null), [data]);
  const tags = useMemo(() => {
    if (!data) return [];
    const set = new Map<string, string>();
    for (const tag of data.tags) set.set(tag.name.toLowerCase(), tag.name);
    for (const task of activeTasks(data)) for (const name of parseTags(task.tags)) if (!set.has(name.toLowerCase())) set.set(name.toLowerCase(), name);
    return [...set.values()].sort((a, b) => a.localeCompare(b, 'ar'));
  }, [data]);

  if (!data) return <aside className="sidebar" />;
  const collapsed = settings?.sidebar_collapsed === 1;
  const current = viewKey(view);
  const projects = data.projects.filter((p) => !p.archived);
  const openCount = (projectId: string) => activeTasks(data).filter((x) => x.project_id === projectId && x.status === 'open').length;

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-scroll">
        <button className="quick-add" style={{ marginBottom: 12 }} onClick={() => openEditor()}>
          <Icon name="plus" size={18} />
          <span className="label">{t('newTask')}</span>
          <kbd style={{ marginInlineStart: 'auto' }}>Ctrl N</kbd>
        </button>

        <div className="sidebar-section">
          <NavItem
            icon="sun"
            label={t('today')}
            count={counts?.today}
            active={current === 'smart:today'}
            collapsed={collapsed}
            onClick={() => setView({ kind: 'smart', key: 'today' })}
            testId="smart:today"
          />
          <NavItem
            icon="sunrise"
            label={t('tomorrow')}
            count={counts?.tomorrow}
            active={current === 'smart:tomorrow'}
            collapsed={collapsed}
            onClick={() => setView({ kind: 'smart', key: 'tomorrow' })}
            testId="smart:tomorrow"
          />
          <NavItem
            icon="calendar-days"
            label={t('next7')}
            count={counts?.next7}
            active={current === 'smart:next7'}
            collapsed={collapsed}
            onClick={() => setView({ kind: 'smart', key: 'next7' })}
            testId="smart:next7"
          />
          <NavItem
            icon="inbox"
            label={t('allTasks')}
            count={counts?.all}
            active={current === 'smart:all'}
            collapsed={collapsed}
            onClick={() => setView({ kind: 'smart', key: 'all' })}
            testId="smart:all"
          />
          <NavItem
            icon="alarm"
            label={t('overdue')}
            count={counts?.overdue}
            active={current === 'smart:overdue'}
            collapsed={collapsed}
            onClick={() => setView({ kind: 'smart', key: 'overdue' })}
            testId="smart:overdue"
          />
          <NavItem
            icon="check-circle"
            label={t('completed')}
            count={counts?.completed}
            active={current === 'smart:completed'}
            collapsed={collapsed}
            onClick={() => setView({ kind: 'smart', key: 'completed' })}
            testId="smart:completed"
          />
        </div>

        <div className="sidebar-section">
          <div className="sidebar-title">
            <span>{t('projects')}</span>
            <button title={t('newProject')} onClick={() => setProjectModal({ open: true })}>
              <Icon name="plus" size={15} />
            </button>
          </div>
          {projects.map((p) => (
            <div key={p.id} style={{ position: 'relative' }}>
              <NavItem
                icon={p.is_inbox ? 'inbox' : p.icon || 'folder'}
                dot={p.color}
                label={p.name}
                count={openCount(p.id)}
                active={current === `project:${p.id}`}
                collapsed={collapsed}
                onClick={() => setView({ kind: 'project', id: p.id })}
                testId={`project:${p.id}`}
                onEdit={() => setProjectModal({ open: true, project: p })}
              />
            </div>
          ))}
        </div>

        <div className="sidebar-section">
          <div className="sidebar-title">
            <span>{t('filters')}</span>
            <button title={t('newFilter')} onClick={() => setFilterModal({ open: true })}>
              <Icon name="plus" size={15} />
            </button>
          </div>
          {data.filters.map((f) => (
            <NavItem
              key={f.id}
              icon={f.icon || 'filter'}
              label={f.name}
              active={current === `filter:${f.id}`}
              collapsed={collapsed}
              onClick={() => setView({ kind: 'filter', id: f.id })}
              onEdit={() => setFilterModal({ open: true, filter: f })}
            />
          ))}
        </div>

        {tags.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-title">
              <span>{t('tags')}</span>
            </div>
            {tags.map((name) => (
              <NavItem
                key={name}
                icon="flag"
                label={name}
                active={current === `tag:${name}`}
                collapsed={collapsed}
                onClick={() => setView({ kind: 'tag', name })}
              />
            ))}
          </div>
        )}

        <div className="sidebar-section">
          <div className="sidebar-title">
            <span>{t('advanced')}</span>
          </div>
          {PAGE_ITEMS.map((item) => (
            <NavItem
              key={item.key}
              icon={item.icon}
              label={t(item.label)}
              active={current === `page:${item.key}`}
              collapsed={collapsed}
              onClick={() => setView({ kind: 'page', key: item.key })}
              testId={`page:${item.key}`}
            />
          ))}
          <NavItem
            icon="trash"
            label={t('trash')}
            count={counts?.trash}
            active={current === 'smart:trash'}
            collapsed={collapsed}
            onClick={() => setView({ kind: 'smart', key: 'trash' })}
            testId="smart:trash"
          />
        </div>
      </div>

      <div className="sidebar-footer">
        {window.api.platform !== 'web' && <NavItem
          icon="link"
          label={t('sync')}
          active={current === 'page:sync'}
          collapsed={collapsed}
          onClick={() => setView({ kind: 'page', key: 'sync' })}
          testId="page:sync"
        />}
        <NavItem
          icon="settings"
          label={t('settings')}
          active={current === 'page:settings'}
          collapsed={collapsed}
          onClick={() => setView({ kind: 'page', key: 'settings' })}
          testId="page:settings"
        />
        <button
          className="nav-item"
          onClick={() => void updateSettings({ sidebar_collapsed: collapsed ? 0 : 1 })}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <span className="icon">
            <Icon name={collapsed ? (lang === 'ar' ? 'chevron-left' : 'chevron-right') : (lang === 'ar' ? 'chevron-right' : 'chevron-left')} size={17} />
          </span>
          <span className="label">{lang === 'ar' ? 'طي الشريط الجانبي' : 'Collapse sidebar'}</span>
        </button>
      </div>

      {projectModal.open && (
        <ProjectEditor
          project={projectModal.project}
          onClose={() => setProjectModal({ open: false })}
          onDelete={
            projectModal.project && !projectModal.project.is_inbox
              ? async () => {
                  if (!window.confirm(t('confirmDelete'))) return;
                  const ok = await mutate('projects.delete', projectModal.project!.id);
                  if (ok !== undefined) {
                    setProjectModal({ open: false });
                    setView({ kind: 'smart', key: 'today' });
                    toast(t('saved'));
                  }
                }
              : undefined
          }
        />
      )}
      {filterModal.open && (
        <FilterEditor
          filter={filterModal.filter}
          onClose={() => setFilterModal({ open: false })}
        />
      )}
    </aside>
  );
}

function NavItem({
  icon,
  label,
  count,
  active,
  collapsed,
  dot,
  onClick,
  onEdit,
  testId,
}: {
  icon: string;
  label: string;
  count?: number;
  active: boolean;
  collapsed: boolean;
  dot?: string;
  onClick: () => void;
  onEdit?: () => void;
  testId?: string;
}) {
  return (
    <div style={{ position: 'relative' }} className="sidebar-row">
      <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick} title={label} data-testid={testId}>
        <span className="icon" style={dot ? { color: dot } : undefined}><Icon name={icon} size={17} /></span>
        <span className="label">{label}</span>
        {count ? <span className="count">{count}</span> : null}
      </button>
      {onEdit && !collapsed && (
        <button
          className="row-edit"
          title="edit"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          style={{
            position: 'absolute',
            insetInlineEnd: 6,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--muted)',
            padding: '2px 5px',
            borderRadius: 5,
            opacity: 0,
          }}
        >
          <Icon name="pencil" size={14} />
        </button>
      )}
    </div>
  );
}

function ProjectEditor({
  project,
  onClose,
  onDelete,
}: {
  project?: Project;
  onClose: () => void;
  onDelete?: () => void | Promise<void>;
}) {
  const { t, lang, mutate, toast } = useApp();
  const [name, setName] = useState(project?.name ?? '');
  const [color, setColor] = useState(project?.color ?? '#4f7cff');
  const [icon, setIcon] = useState(project?.icon ?? 'folder');
  const [viewMode, setViewMode] = useState<Project['view_mode']>(project?.view_mode ?? 'list');

  const save = async () => {
    if (!name.trim()) return toast(lang === 'ar' ? 'أدخل اسمًا' : 'Enter a name', 'error');
    const payload = { name: name.trim(), color, icon, view_mode: viewMode };
    const res = project ? await mutate('projects.update', project.id, payload) : await mutate('projects.create', payload);
    if (res !== undefined) {
      toast(t('saved'));
      onClose();
    }
  };

  return (
    <Modal
      title={project ? t('projectSettings') : t('newProject')}
      onClose={onClose}
      footer={
        <>
          <button className="btn primary" onClick={() => void save()}>
            {t('save')}
          </button>
          <button className="btn" onClick={onClose}>
            {t('cancel')}
          </button>
          {onDelete && (
            <button className="btn danger right" onClick={() => void onDelete()}>
              {t('delete')}
            </button>
          )}
        </>
      }
    >
      <div className="row">
        <div className="field" style={{ flex: 3 }}>
          <label>{t('title')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>{t('color')}</label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ height: 38, padding: 3 }} />
        </div>
      </div>
      <IconPicker value={icon} onChange={setIcon} label={t('icon')} />
      <div className="row">
        <div className="field">
          <label>{t('defaultView')}</label>
          <select value={viewMode} onChange={(e) => setViewMode(e.target.value as Project['view_mode'])}>
            <option value="list">{t('list')}</option>
            <option value="kanban">{t('kanban')}</option>
            <option value="timeline">{t('timeline')}</option>
            <option value="calendar">{t('calendar')}</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}
