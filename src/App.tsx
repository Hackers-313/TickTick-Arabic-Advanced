import { useEffect, type ComponentType } from 'react';
import { useApp } from './store';
import { prepareSound, playCompletionSound } from './lib/sound';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { TaskEditor } from './components/TaskEditor';
import { EventEditor } from './components/EventEditor';
import { CommandPalette, SearchOverlay } from './components/Palette';
import { Toasts } from './components/Toasts';
import { TasksView } from './views/TasksView';
import { CalendarView } from './views/CalendarView';
import { KanbanView } from './views/KanbanView';
import { TimelineView } from './views/TimelineView';
import { MatrixView } from './views/MatrixView';
import { HabitsView } from './views/HabitsView';
import { FocusView } from './views/FocusView';
import { StatsView } from './views/StatsView';
import { CountdownView } from './views/CountdownView';
import { StickyView } from './views/StickyView';
import { SettingsView } from './views/SettingsView';
import { SyncView } from './views/SyncView';
import type { PageKey } from './lib/view';

const PAGES: Record<PageKey, ComponentType> = {
  calendar: CalendarView,
  kanban: KanbanView,
  timeline: TimelineView,
  matrix: MatrixView,
  habits: HabitsView,
  focus: FocusView,
  stats: StatsView,
  countdowns: CountdownView,
  sticky: StickyView,
  settings: SettingsView,
  sync: SyncView,
};

const LIGHT_THEMES = new Set(['daylight', 'sand', 'rose']);

export function App() {
  const { data, loading, error, settings, view, editor, eventEditor, paletteOpen, searchOpen, openEditor, setPaletteOpen, setSearchOpen, undo, redo, toast, lang } =
    useApp();

  useEffect(() => {
    const unlock = () => { void prepareSound(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);

  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.lang = settings.language;
    root.dir = settings.direction;
    root.style.setProperty('--accent', settings.accent);
    root.style.setProperty('--accent-soft', `color-mix(in srgb, ${settings.accent} 16%, transparent)`);
    root.classList.toggle('dense', settings.dense_mode === 1);
    void window.api.invoke('window.setTheme', LIGHT_THEMES.has(settings.theme) ? 'light' : 'dark').catch(() => undefined);
  }, [settings]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        openEditor();
      } else if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) void redo();
        else void undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openEditor, setPaletteOpen, setSearchOpen, undo, redo]);

  useEffect(() => {
    const offReminders = window.api.on('reminders:fired', (payload) => {
      const items = (payload as { label?: string; title?: string }[]) ?? [];
      if (items.length && data?.settings.notifications.enabled && data.settings.notifications.sound) void playCompletionSound();
      for (const item of items) {
        toast(`🔔 ${item.label || item.title || (lang === 'ar' ? 'تذكير' : 'Reminder')}`, 'info');
        try {
          if (data?.settings.notifications.enabled) {
            new Notification(lang === 'ar' ? 'تذكير' : 'Reminder', { body: item.label || item.title || '' });
          }
        } catch {
          /* notifications unavailable */
        }
      }
    });
    const offOpen = window.api.on('app:open-entity', (payload) => {
      const p = payload as { kind?: string; id?: string };
      if (p?.kind === 'task' && p.id) openEditor(p.id);
    });
    return () => {
      offReminders();
      offOpen();
    };
  }, [toast, openEditor, lang, data?.settings.notifications.enabled, data?.settings.notifications.sound]);

  if (loading) {
    return (
      <div className="app" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="empty">
          <div className="big">🗂️</div>
          <h3>TickTick Arabic Advanced</h3>
          <p className="small muted">{lang === 'ar' ? 'جارٍ تحميل البيانات المحلية…' : 'Loading local data…'}</p>
          <div className="spinner" style={{ marginTop: 12 }} />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="app">
        <TitleBar />
        <div className="empty">
          <div className="big">⚠️</div>
          <h3>{lang === 'ar' ? 'تعذر تحميل البيانات' : 'Could not load data'}</h3>
          <p className="small muted">{error}</p>
          <button className="btn primary mt" onClick={() => location.reload()}>
            {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  const Page = view.kind === 'page' ? PAGES[view.key] : null;

  return (
    <div className={`app ${settings?.dense_mode ? 'dense' : ''}`}>
      <TitleBar />
      <div className="body">
        <Sidebar />
        {Page === FocusView ? null : Page ? <Page /> : <TasksView />}
        <div style={{ display: Page === FocusView ? 'contents' : 'none' }} aria-hidden={Page !== FocusView}>
          <FocusView />
        </div>
      </div>
      {editor.open && <TaskEditor key={editor.taskId ?? 'new'} />}
      {eventEditor.open && <EventEditor key={eventEditor.eventId ?? eventEditor.start ?? 'new'} />}
      {paletteOpen && <CommandPalette />}
      <SearchOverlay />
      <Toasts />
    </div>
  );
}
