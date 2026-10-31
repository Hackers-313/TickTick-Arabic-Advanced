import { app, BrowserWindow, dialog, ipcMain, shell, nativeTheme } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { openDatabase, closeDatabase, schemaVersion } from './db';
import * as repo from './repo';
import * as dataService from './dataService';
import { getSettings, saveSettings } from './settings';
import { startScheduler, stopScheduler, tick } from './scheduler';
import * as sync from './sync';
import * as localApi from './localApi';
import { autoBackup, backupDatabase, listBackups, restoreDatabase, timestamp } from './backup';

const isDev = !!process.env.VITE_DEV_SERVER_URL;
// TTA_USER_DATA lets automated tests use a throwaway profile without touching real data.
const userData = process.env.TTA_USER_DATA || app.getPath('userData');
const dbPath = path.join(userData, 'ticktick-arabic.db');

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 620,
    show: false,
    frame: false,
    backgroundColor: '#0f1420',
    title: 'TickTick Arabic Advanced',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in the default browser, never inside the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
}

/** Push a change to every open window so settings/data stay in sync across sources. */
function broadcast(channel: 'settings:changed' | 'data:changed', payload?: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function bootstrap() {
  const settings = getSettings();
  return {
    projects: repo.listProjects(),
    tasks: repo.listTasks(true),
    checklist: repo.allChecklist(),
    attachments: repo.allAttachments(),
    reminders: repo.listReminders(),
    tags: repo.listTags(),
    filters: repo.listFilters(),
    templates: repo.listTemplates(),
    habits: repo.listHabits(),
    habitLogs: repo.listHabitLogs(),
    focusSessions: repo.listFocusSessions(),
    countdowns: repo.listCountdowns(),
    stickyNotes: repo.listStickyNotes(),
    events: repo.listEvents(),
    settings,
    appInfo: {
      version: app.getVersion(),
      dbPath,
      userData,
      platform: process.platform,
      electron: process.versions.electron,
      node: process.versions.node,
      schemaVersion: schemaVersion(),
    },
    syncLogs: sync.syncLogs(20),
    conflicts: sync.listConflicts(),
    localApi: localApi.localApiStatus(),
    undo: repo.undoState(),
    counters: repo.todayCounters(),
    backups: listBackups(userData).slice(0, 10),
  };
}

function requireString(v: unknown, name: string): string {
  if (typeof v !== 'string' || !v) throw new Error(`${name} is required`);
  return v;
}

async function handle(method: string, args: unknown[]): Promise<unknown> {
  const [a, b, c, d] = args as [never, never, never, never];
  switch (method) {
    // ---------------------------------------------------------- app
    case 'bootstrap':
      return bootstrap();
    case 'app.info':
      return bootstrap().appInfo;
    case 'app.openExternal':
      await shell.openExternal(requireString(a, 'url'));
      return true;
    case 'app.showItemInFolder':
      shell.showItemInFolder(requireString(a, 'path'));
      return true;
    case 'app.openPath':
      return shell.openPath(requireString(a, 'path'));
    case 'app.pickFiles': {
      const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile', 'multiSelections'] });
      return result.canceled ? [] : result.filePaths;
    }
    case 'app.pickSavePath': {
      const result = await dialog.showSaveDialog(mainWindow!, {
        defaultPath: requireString(a, 'defaultName'),
        filters: (b as { name: string; extensions: string[] }[]) ?? [],
      });
      return result.canceled ? null : result.filePath;
    }
    case 'app.readText':
      return fs.readFileSync(requireString(a, 'path'), 'utf8');
    case 'app.writeText':
      fs.writeFileSync(requireString(a, 'path'), requireString(b, 'content'), 'utf8');
      return true;
    case 'app.copyAttachment':
      return dataService.copyAttachment(userData, requireString(a, 'taskId'), requireString(b, 'srcPath'));
    case 'window.minimize':
      mainWindow?.minimize();
      return true;
    case 'window.maximize':
      if (mainWindow?.isMaximized()) mainWindow.unmaximize();
      else mainWindow?.maximize();
      return mainWindow?.isMaximized() ?? false;
    case 'window.close':
      mainWindow?.close();
      return true;
    case 'window.setTheme':
      nativeTheme.themeSource = a as 'system' | 'light' | 'dark';
      return true;

    // ---------------------------------------------------------- tasks
    case 'tasks.create':
      return repo.createTask(a as never);
    case 'tasks.update':
      return repo.updateTask(requireString(a, 'id'), b as never);
    case 'tasks.delete':
      repo.deleteTask(requireString(a, 'id'), !!b);
      return true;
    case 'tasks.restore':
      repo.restoreTask(requireString(a, 'id'));
      return true;
    case 'tasks.purge':
      repo.deleteTask(requireString(a, 'id'), true);
      return true;
    case 'tasks.complete':
      return repo.setTaskCompleted(requireString(a, 'id'), !!b);
    case 'tasks.move':
      return repo.moveTask(requireString(a, 'id'), requireString(b, 'projectId'), (c as string | null) ?? null);
    case 'tasks.reorder':
      repo.reorderTasks(a as { id: string; sort_order: number }[]);
      return true;
    case 'tasks.duplicate':
      return repo.duplicateTask(requireString(a, 'id'));
    case 'tasks.setReminders':
      return repo.replaceReminders('task', requireString(a, 'id'), b as never);
    case 'tasks.checklist':
      return repo.listChecklist(requireString(a, 'id'));
    case 'tasks.addChecklist':
      return repo.addChecklistItem(requireString(a, 'taskId'), requireString(b, 'title'), !!c);
    case 'tasks.toggleChecklist':
      repo.toggleChecklistItem(requireString(a, 'id'), !!b);
      return true;
    case 'tasks.deleteChecklist':
      repo.deleteChecklistItem(requireString(a, 'id'));
      return true;
    case 'tasks.attachments':
      return repo.listAttachments(requireString(a, 'id'));
    case 'tasks.deleteAttachment':
      repo.deleteAttachment(requireString(a, 'id'));
      return true;

    // ---------------------------------------------------------- projects
    case 'projects.create':
      return repo.createProject(a as never);
    case 'projects.update':
      return repo.updateProject(requireString(a, 'id'), b as never);
    case 'projects.delete':
      repo.deleteProject(requireString(a, 'id'));
      return true;
    case 'projects.purge':
      repo.purgeProject(requireString(a, 'id'));
      return true;

    // ---------------------------------------------------------- tags / filters / templates
    case 'tags.create':
      return repo.createTag(requireString(a, 'name'), (b as string) ?? '#8892a6');
    case 'tags.update':
      repo.updateTag(requireString(a, 'id'), b as never);
      return true;
    case 'tags.delete':
      repo.deleteTag(requireString(a, 'id'));
      return true;
    case 'filters.create':
      return repo.createFilter(a as never);
    case 'filters.update':
      repo.updateFilter(requireString(a, 'id'), b as never);
      return true;
    case 'filters.delete':
      repo.deleteFilter(requireString(a, 'id'));
      return true;
    case 'templates.create':
      return repo.createTemplate(requireString(a, 'name'), b);
    case 'templates.delete':
      repo.deleteTemplate(requireString(a, 'id'));
      return true;

    // ---------------------------------------------------------- habits
    case 'habits.create':
      return repo.createHabit(a as never);
    case 'habits.update':
      return repo.updateHabit(requireString(a, 'id'), b as never);
    case 'habits.delete':
      repo.deleteHabit(requireString(a, 'id'));
      return true;
    case 'habits.checkin':
      return repo.checkInHabit(requireString(a, 'habitId'), requireString(b, 'date'), Number(c) || 0, (d as string) ?? '');
    case 'habits.uncheck':
      repo.deleteHabitLog(requireString(a, 'habitId'), requireString(b, 'date'));
      return true;

    // ---------------------------------------------------------- focus
    case 'focus.save':
      return repo.saveFocusSession(a as never);
    case 'focus.delete':
      repo.deleteFocusSession(requireString(a, 'id'));
      return true;

    // ---------------------------------------------------------- reminders
    case 'reminders.snooze':
      repo.snoozeReminder(requireString(a, 'id'), Number(b) || 5);
      return true;
    case 'reminders.delete':
      repo.disableReminder(requireString(a, 'id'));
      return true;

    // ---------------------------------------------------------- countdowns
    case 'countdowns.create':
      return repo.createCountdown(a as never);
    case 'countdowns.update':
      return repo.updateCountdown(requireString(a, 'id'), b as never);
    case 'countdowns.delete':
      repo.deleteCountdown(requireString(a, 'id'));
      return true;

    // ---------------------------------------------------------- sticky notes
    case 'sticky.create':
      return repo.createStickyNote((a as never) ?? {});
    case 'sticky.update':
      return repo.updateStickyNote(requireString(a, 'id'), b as never);
    case 'sticky.delete':
      repo.deleteStickyNote(requireString(a, 'id'));
      return true;

    // ---------------------------------------------------------- events
    case 'events.create':
      return repo.createEvent(a as never);
    case 'events.update':
      return repo.updateEvent(requireString(a, 'id'), b as never);
    case 'events.delete':
      repo.deleteEvent(requireString(a, 'id'));
      return true;

    // ---------------------------------------------------------- settings / data
    case 'settings.update': {
      const merged = saveSettings(a as never);
      broadcast('settings:changed', merged);
      return merged;
    }
    case 'data.exportJson':
      return dataService.exportAllJson();
    case 'data.exportCsv':
      return dataService.exportTasksCsv();
    case 'data.exportIcs':
      return dataService.exportTasksIcs();
    case 'data.importCsv':
      return dataService.importTasksCsv(requireString(a, 'text'), (b as string) ?? undefined);
    case 'data.importIcs':
      return dataService.importIcs(requireString(a, 'text'), !!b);
    case 'data.importJson':
      return dataService.importJson(requireString(a, 'text'), (b as 'merge' | 'replace') ?? 'merge');
    case 'data.loadSample':
      dataService.loadSampleData();
      return true;
    case 'data.clearSample':
      dataService.clearSampleData();
      return true;
    case 'data.reset':
      dataService.resetDatabase();
      return true;
    case 'data.stats':
      return dataService.dbStats();
    case 'data.backup': {
      const dir = path.join(userData, 'backups');
      const file = backupDatabase(dbPath, path.join(dir, `backup-manual-${timestamp()}.db`));
      broadcast('settings:changed', saveSettings({ last_backup_at: new Date().toISOString() }));
      return file;
    }
    case 'data.autoBackup':
      return autoBackup(dbPath, userData, (a as string) ?? 'manual');
    case 'data.backups':
      return listBackups(userData);
    case 'data.restoreBackup':
      return restoreDatabase(dbPath, requireString(a, 'path'), userData);
    case 'data.revealDb':
      shell.showItemInFolder(dbPath);
      return true;

    // ---------------------------------------------------------- undo
    case 'undo.perform':
      return a === 'redo' ? repo.redo() : repo.undo();
    case 'undo.state':
      return repo.undoState();

    // ---------------------------------------------------------- sync
    case 'sync.status':
      return { settings: getSettings().sync, running: sync.syncRunning(), logs: sync.syncLogs(20), conflicts: sync.listConflicts() };
    case 'sync.configure': {
      const merged = saveSettings({ sync: a as never });
      broadcast('settings:changed', merged);
      sync.stopAutoSync();
      if (merged.sync.enabled && merged.sync.last_sync_at) sync.startAutoSync(userData);
      return merged.sync;
    }
    case 'sync.connect': {
      const result = await sync.connect(userData);
      if (result.ok) {
        const initial = await sync.runSync(userData, 'initial');
        if (!initial.ok) return { ok: false, error: initial.error ?? 'INITIAL_SYNC_FAILED' };
        // Open API deployments may not expose a user-profile endpoint.
        const account = (await sync.fetchAccount(userData)) ?? { name: 'TickTick', email: '', userId: '' };
        const current = getSettings();
        broadcast('settings:changed', saveSettings({ sync: { ...current.sync, account, last_status: 'ok', enabled: 1 } }));
        sync.startAutoSync(userData);
        return { ok: true, account, initial };
      }
      return result;
    }
    case 'sync.disconnect':
      sync.disconnect(userData);
      return true;
    case 'sync.now':
      return sync.runSync(userData, 'manual');
    case 'sync.conflicts':
      return sync.listConflicts();
    case 'sync.resolve':
      return sync.resolveConflict(requireString(a, 'id'), (b as 'local' | 'remote') ?? 'remote');
    case 'sync.logs':
      return sync.syncLogs(50);
    case 'sync.rebuild':
      return sync.rebuildFromRemote(userData);

    // ---------------------------------------------------------- local api
    case 'localApi.status':
      return localApi.localApiStatus();
    case 'localApi.toggle': {
      const settings = getSettings();
      broadcast('settings:changed', saveSettings({ local_api: { ...settings.local_api, enabled: b ? 1 : 0 } }));
      return b ? localApi.startLocalApi() : (localApi.stopLocalApi(), localApi.localApiStatus());
    }

    default:
      throw new Error(`Unknown method: ${method}`);
  }
}

app.whenReady().then(() => {
  openDatabase(dbPath);
  dataService.ensureInbox();
  const settings = getSettings();
  nativeTheme.themeSource = settings.theme === 'light' ? 'light' : settings.theme === 'system' ? 'system' : 'dark';
  createWindow();
  startScheduler((items) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('reminders:fired', items);
  });
  if (settings.sync.enabled && settings.sync.last_sync_at) sync.startAutoSync(userData);
  if (settings.local_api.enabled) localApi.startLocalApi();

  // Automatic daily backup, kept alongside the manual and pre-sync snapshots.
  const lastBackup = settings.last_backup_at ? Date.parse(settings.last_backup_at) : 0;
  if (!lastBackup || Date.now() - lastBackup > 24 * 60 * 60 * 1000) {
    try {
      autoBackup(dbPath, userData, 'daily');
      saveSettings({ last_backup_at: new Date().toISOString() });
    } catch {
      /* a failed automatic backup must never block startup */
    }
  }

  ipcMain.handle('api', async (_event, method: string, args: unknown[]) => {
    try {
      return { ok: true, data: await handle(method, args ?? []) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopScheduler();
  sync.stopAutoSync();
  localApi.stopLocalApi();
  closeDatabase();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopScheduler();
  closeDatabase();
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

export { tick };
