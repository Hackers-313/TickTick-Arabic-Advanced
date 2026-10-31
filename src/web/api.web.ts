import * as repo from '../../electron/main/repo';
import * as data from '../../electron/main/dataService';
import { getSettings, saveSettings } from '../../electron/main/settings';
import { exportBrowserDatabase, openBrowserDatabase } from './db.web';
import { loadSnapshot, saveSnapshot } from './storage.web';

const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
const files = new Map<string, File>();
const unsupported = () => { throw new Error('هذه الميزة متاحة في تطبيق سطح المكتب فقط / This feature is desktop-only'); };

function bootstrap() {
  return {
    projects: repo.listProjects(), tasks: repo.listTasks(true), checklist: repo.allChecklist(),
    attachments: repo.allAttachments(), reminders: repo.listReminders(), tags: repo.listTags(),
    filters: repo.listFilters(), templates: repo.listTemplates(), habits: repo.listHabits(),
    habitLogs: repo.listHabitLogs(), focusSessions: repo.listFocusSessions(), countdowns: repo.listCountdowns(),
    stickyNotes: repo.listStickyNotes(), events: repo.listEvents(), settings: getSettings(),
    appInfo: { version: '1.0.0-web', dbPath: 'IndexedDB', userData: 'IndexedDB', platform: 'web', electron: '', node: '', schemaVersion: 1 },
    syncLogs: [], conflicts: [], localApi: { running: false, port: 0, token: '', url: '' },
    undo: repo.undoState(), counters: repo.todayCounters(), backups: [],
  };
}

function pickFiles(): Promise<string[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true;
    input.onchange = () => {
      const selected = Array.from(input.files ?? []);
      resolve(selected.map((file) => { const id = crypto.randomUUID(); files.set(id, file); return id; }));
    };
    input.oncancel = () => resolve([]);
    input.click();
  });
}

async function handle(method: string, args: unknown[]): Promise<unknown> {
  const [a, b, c, d] = args as [never, never, never, never];
  switch (method) {
    case 'bootstrap': return bootstrap();
    case 'app.info': return bootstrap().appInfo;
    case 'window.setTheme': return true;
    case 'window.minimize': case 'window.maximize': case 'window.close': return false;
    case 'app.pickFiles': return pickFiles();
    case 'app.pickSavePath': return a;
    case 'app.readText': { const f = files.get(a); if (!f) throw new Error('File not selected'); return f.text(); }
    case 'app.writeText': {
      const url = URL.createObjectURL(new Blob([b], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = a; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000); return true;
    }
    case 'app.openExternal': { const url = new URL(a); if (url.protocol !== 'https:') throw new Error('HTTPS required'); window.open(url.href, '_blank', 'noopener,noreferrer'); return true; }
    case 'tasks.create': return repo.createTask(a);
    case 'tasks.update': return repo.updateTask(a, b);
    case 'tasks.delete': repo.deleteTask(a, !!b); return true;
    case 'tasks.restore': repo.restoreTask(a); return true;
    case 'tasks.purge': repo.deleteTask(a, true); return true;
    case 'tasks.complete': return repo.setTaskCompleted(a, !!b);
    case 'tasks.move': return repo.moveTask(a, b, c ?? null);
    case 'tasks.reorder': repo.reorderTasks(a); return true;
    case 'tasks.duplicate': return repo.duplicateTask(a);
    case 'tasks.setReminders': return repo.replaceReminders('task', a, b);
    case 'tasks.checklist': return repo.listChecklist(a);
    case 'tasks.addChecklist': return repo.addChecklistItem(a, b, !!c);
    case 'tasks.toggleChecklist': repo.toggleChecklistItem(a, !!b); return true;
    case 'tasks.deleteChecklist': repo.deleteChecklistItem(a); return true;
    case 'tasks.attachments': return repo.listAttachments(a);
    case 'tasks.deleteAttachment': repo.deleteAttachment(a); return true;
    case 'projects.create': return repo.createProject(a);
    case 'projects.update': return repo.updateProject(a, b);
    case 'projects.delete': repo.deleteProject(a); return true;
    case 'projects.purge': repo.purgeProject(a); return true;
    case 'tags.create': return repo.createTag(a, b ?? '#8892a6');
    case 'tags.update': repo.updateTag(a, b); return true;
    case 'tags.delete': repo.deleteTag(a); return true;
    case 'filters.create': return repo.createFilter(a);
    case 'filters.update': repo.updateFilter(a, b); return true;
    case 'filters.delete': repo.deleteFilter(a); return true;
    case 'templates.create': return repo.createTemplate(a, b);
    case 'templates.delete': repo.deleteTemplate(a); return true;
    case 'habits.create': return repo.createHabit(a);
    case 'habits.update': return repo.updateHabit(a, b);
    case 'habits.delete': repo.deleteHabit(a); return true;
    case 'habits.checkin': return repo.checkInHabit(a, b, Number(c) || 0, d ?? '');
    case 'habits.uncheck': repo.deleteHabitLog(a, b); return true;
    case 'focus.save': return repo.saveFocusSession(a);
    case 'focus.delete': repo.deleteFocusSession(a); return true;
    case 'reminders.snooze': repo.snoozeReminder(a, Number(b) || 5); return true;
    case 'reminders.delete': repo.disableReminder(a); return true;
    case 'countdowns.create': return repo.createCountdown(a);
    case 'countdowns.update': return repo.updateCountdown(a, b);
    case 'countdowns.delete': repo.deleteCountdown(a); return true;
    case 'sticky.create': return repo.createStickyNote(a ?? {});
    case 'sticky.update': return repo.updateStickyNote(a, b);
    case 'sticky.delete': repo.deleteStickyNote(a); return true;
    case 'events.create': return repo.createEvent(a);
    case 'events.update': return repo.updateEvent(a, b);
    case 'events.delete': repo.deleteEvent(a); return true;
    case 'settings.update': return saveSettings(a);
    case 'data.exportJson': return data.exportAllJson();
    case 'data.exportCsv': return data.exportTasksCsv();
    case 'data.exportIcs': return data.exportTasksIcs();
    case 'data.importCsv': return data.importTasksCsv(a, b ?? undefined);
    case 'data.importIcs': return data.importIcs(a, !!b);
    case 'data.importJson': return data.importJson(a, b ?? 'merge');
    case 'data.loadSample': data.loadSampleData(); return true;
    case 'data.clearSample': data.clearSampleData(); return true;
    case 'data.reset': data.resetDatabase(); return true;
    case 'data.stats': return data.dbStats();
    case 'undo.perform': return a === 'redo' ? repo.redo() : repo.undo();
    case 'undo.state': return repo.undoState();
    case 'sync.status': return { settings: getSettings().sync, running: false, logs: [], conflicts: [] };
    case 'sync.logs': case 'sync.conflicts': case 'data.backups': return [];
    case 'localApi.status': return bootstrap().localApi;
    default: return unsupported();
  }
}

export async function initializeWebApi(): Promise<void> {
  // A snapshot database cannot safely merge concurrent writers from two tabs.
  // Hold an exclusive browser lock for this page's lifetime rather than silently
  // overwriting another tab's changes.
  if (!navigator.locks) throw new Error('Web Locks API is required to protect local data');
  const held = new Promise<void>(() => {});
  const acquired = new Promise<void>((resolve, reject) => {
    void navigator.locks.request('ticktick-arabic-web-database', { ifAvailable: true }, async (lock) => {
      if (!lock) { reject(new Error('التطبيق مفتوح في علامة تبويب أخرى؛ أغلقها أولًا')); return; }
      resolve();
      await held;
    }).catch(reject);
  });
  await acquired;
  await openBrowserDatabase(await loadSnapshot());
  data.ensureInbox();
  await saveSnapshot(exportBrowserDatabase());
  let queue: Promise<unknown> = Promise.resolve();
  window.api = {
    platform: 'web',
    on(channel, listener) {
      const set = listeners.get(channel) ?? new Set(); set.add(listener); listeners.set(channel, set);
      return () => { set.delete(listener); };
    },
    invoke(method, ...args) {
      // File dialogs need to run directly in the user-gesture call stack.
      if (method === 'app.pickFiles') return pickFiles();
      const operation = queue.then(async () => {
        const result = await handle(method, args);
        const readOnly = method === 'bootstrap' || method === 'app.info' || method.startsWith('app.') ||
          method.startsWith('window.') || method.startsWith('data.export') || method === 'data.stats' ||
          method === 'data.backups' || method === 'undo.state' || method === 'localApi.status' ||
          method === 'sync.status' || method === 'sync.logs' || method === 'sync.conflicts' ||
          method === 'tasks.checklist' || method === 'tasks.attachments';
        // Never acknowledge a mutation before IndexedDB commits it.
        if (!readOnly) await saveSnapshot(exportBrowserDatabase());
        if (method === 'settings.update') listeners.get('settings:changed')?.forEach((fn) => fn(result));
        return result;
      });
      queue = operation.catch(() => undefined);
      return operation;
    },
  };
}
