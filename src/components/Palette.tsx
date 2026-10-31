import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store';
import { searchTasks } from '../../shared/filters';
import { activeTasks, dueText } from '../lib/tasks';
import { Modal } from './Modal';
import { Icon } from './Icon';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  run: () => void;
}

export function CommandPalette() {
  const { data, t, lang, setPaletteOpen, openEditor, setView, undo, redo } = useApp();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commands = useMemo<Command[]>(() => {
    if (!data) return [];
    const list: Command[] = [
      { id: 'new-task', label: t('newTask'), hint: 'Ctrl+N', icon: 'plus', run: () => openEditor() },
      { id: 'today', label: t('today'), icon: 'sun', run: () => setView({ kind: 'smart', key: 'today' }) },
      { id: 'next7', label: t('next7'), icon: 'calendar-days', run: () => setView({ kind: 'smart', key: 'next7' }) },
      { id: 'calendar', label: t('calendar'), icon: 'calendar', run: () => setView({ kind: 'page', key: 'calendar' }) },
      { id: 'kanban', label: t('kanban'), icon: 'columns', run: () => setView({ kind: 'page', key: 'kanban' }) },
      { id: 'matrix', label: t('matrix'), icon: 'compass', run: () => setView({ kind: 'page', key: 'matrix' }) },
      { id: 'habits', label: t('habits'), icon: 'flame', run: () => setView({ kind: 'page', key: 'habits' }) },
      { id: 'focus', label: t('focus'), icon: 'timer', run: () => setView({ kind: 'page', key: 'focus' }) },
      { id: 'stats', label: t('statistics'), icon: 'trending', run: () => setView({ kind: 'page', key: 'stats' }) },
      { id: 'countdowns', label: t('countdowns'), icon: 'hourglass', run: () => setView({ kind: 'page', key: 'countdowns' }) },
      { id: 'sticky', label: t('stickyNotes'), icon: 'sticky', run: () => setView({ kind: 'page', key: 'sticky' }) },
      { id: 'settings', label: t('settings'), icon: 'settings', run: () => setView({ kind: 'page', key: 'settings' }) },
      { id: 'sync', label: t('sync'), icon: 'link', run: () => setView({ kind: 'page', key: 'sync' }) },
      { id: 'undo', label: t('undo'), hint: 'Ctrl+Z', icon: 'undo', run: () => void undo() },
      { id: 'redo', label: t('redo'), icon: 'redo', run: () => void redo() },
    ];
    for (const p of data.projects) {
      list.push({ id: `project-${p.id}`, label: p.name, hint: t('project'), icon: p.icon || 'folder', run: () => setView({ kind: 'project', id: p.id }) });
    }
    return list;
  }, [data, t, openEditor, setView, undo, redo]);

  const filteredCommands = commands.filter((c) => !query || c.label.toLowerCase().includes(query.toLowerCase()));

  const taskResults = useMemo(() => {
    if (!data || !query.trim()) return [];
    const names = Object.fromEntries(data.projects.map((p) => [p.id, p.name]));
    return searchTasks(activeTasks(data), query, names).slice(0, 6);
  }, [data, query]);

  const items = [
    ...taskResults.map((task) => ({
      id: `task-${task.id}`,
      label: task.title,
      hint: dueText(task, lang),
      icon: task.status === 'completed' ? 'check-circle' : 'file',
      run: () => openEditor(task.id),
    })),
    ...filteredCommands,
  ];

  useEffect(() => {
    setActive(0);
  }, [query]);

  const run = (cmd?: Command) => {
    if (!cmd) return;
    setPaletteOpen(false);
    cmd.run();
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setPaletteOpen(false)}>
      <div className="modal palette" role="dialog" aria-modal="true">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('commandPalette') + '…'}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              run(items[active]);
            } else if (e.key === 'Escape') {
              setPaletteOpen(false);
            }
          }}
        />
        <div className="palette-list">
          {items.length === 0 && <div className="empty small">{t('filtersNone')}</div>}
          {items.map((item, i) => (
            <button
              key={item.id}
              className={`palette-item ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(item)}
            >
              <span><Icon name={item.icon} size={16} /></span>
              <span>{item.label}</span>
              {item.hint ? <span className="hint">{item.hint}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SearchOverlay() {
  const { data, t, lang, searchOpen, setSearchOpen, openEditor } = useApp();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) {
      setQuery('');
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [searchOpen]);

  const results = useMemo(() => {
    if (!data || !query.trim()) return [];
    const names = Object.fromEntries(data.projects.map((p) => [p.id, p.name]));
    return searchTasks(activeTasks(data), query, names).slice(0, 60);
  }, [data, query]);

  if (!searchOpen) return null;

  return (
    <Modal
      title={t('search')}
      onClose={() => setSearchOpen(false)}
      footer={<span className="small muted">{results.length} {t('results')}</span>}
    >
      <div className="field">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) {
              setSearchOpen(false);
              openEditor(results[0].id);
            }
          }}
        />
      </div>
      <div className="scroll-y" style={{ maxHeight: 420 }}>
        {results.map((task) => (
          <button
            key={task.id}
            className="palette-item"
            onClick={() => {
              setSearchOpen(false);
              openEditor(task.id);
            }}
          >
            <span><Icon name={task.status === 'completed' ? 'check-circle' : 'file'} size={16} /></span>
            <span className="grow" style={{ textAlign: 'start' }}>
              <span style={{ display: 'block' }}>{task.title}</span>
              <span className="small muted">
                {data?.projects.find((p) => p.id === task.project_id)?.name} · {dueText(task, lang)}
              </span>
            </span>
          </button>
        ))}
        {query && results.length === 0 && <div className="empty small">{t('filtersNone')}</div>}
      </div>
    </Modal>
  );
}
