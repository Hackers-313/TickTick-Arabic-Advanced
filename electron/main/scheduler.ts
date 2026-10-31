import { BrowserWindow, Notification } from 'electron';
import { addMinutes, parseLocal, toLocalISO } from '../../shared/date';
import { nextOccurrence } from '../../shared/recurrence';
import type { Reminder } from '../../shared/types';
import { disableReminder, dueReminders, getTask, listReminders, markReminderFired } from './repo';
import { getSettings } from './settings';

export interface FiredReminder {
  reminder: Reminder;
  title: string;
  body: string;
  entityId: string;
  entityType: string;
}

let timer: NodeJS.Timeout | null = null;
let onFire: ((items: FiredReminder[]) => void) | null = null;

export function startScheduler(notify: (items: FiredReminder[]) => void): void {
  onFire = notify;
  stopScheduler();
  // Run once shortly after startup to catch reminders that were due while the app was closed.
  setTimeout(() => tick(), 2500);
  timer = setInterval(() => tick(), 15000);
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

function nextTriggerFor(reminder: Reminder): string | null {
  const now = new Date();
  if (reminder.kind === 'constant') {
    const task = reminder.entity_type === 'task' ? getTask(reminder.entity_id) : null;
    if (task && task.status !== 'open') return null;
    return toLocalISO(addMinutes(now, Math.max(1, getSettings().notifications.snooze_min || 5)));
  }
  if (reminder.kind === 'recurring' && reminder.repeat_rule) {
    const base = reminder.trigger_at;
    const next = nextOccurrence(reminder.repeat_rule, base, now);
    if (next) return next;
    const d = parseLocal(base);
    return d ? toLocalISO(addMinutes(d, 24 * 60)) : null;
  }
  return null;
}

export function tick(now = new Date()): FiredReminder[] {
  const nowIso = toLocalISO(now);
  const due = dueReminders(nowIso);
  if (!due.length) return [];
  const settings = getSettings();
  const fired: FiredReminder[] = [];
  for (const reminder of due) {
    if (!reminder.enabled) continue;
    const entity = resolveEntity(reminder);
    if (!entity) {
      disableReminder(reminder.id);
      continue;
    }
    const next = nextTriggerFor(reminder);
    markReminderFired(reminder.id, next);
    fired.push({ reminder, ...entity });
  }
  if (settings.notifications.enabled && fired.length) {
    showNotifications(fired);
  }
  onFire?.(fired);
  return fired;
}

function resolveEntity(reminder: Reminder): { title: string; body: string; entityId: string; entityType: string } | null {
  if (reminder.entity_type === 'task') {
    const task = getTask(reminder.entity_id);
    if (!task || task.deleted_at) return null;
    if (task.status !== 'open') return null;
    const due = task.due_date ? ` · ${task.due_date.slice(5, 16).replace('T', ' ')}` : '';
    return { title: task.title, body: `${reminder.label || 'تذكير مهمة'}${due}`, entityId: task.id, entityType: 'task' };
  }
  if (reminder.entity_type === 'habit') {
    return { title: reminder.label || 'عادة', body: 'حان وقت تسجيل العادة', entityId: reminder.entity_id, entityType: 'habit' };
  }
  return { title: reminder.label || 'عد تنازلي', body: 'موعد يقترب', entityId: reminder.entity_id, entityType: 'countdown' };
}

function showNotifications(items: FiredReminder[]): void {
  const settings = getSettings();
  const visible = BrowserWindow.getAllWindows().some((w) => w.isVisible() && w.isFocused());
  if (items.length > 3) {
    const body = items
      .slice(0, 5)
      .map((i) => `• ${i.title}`)
      .join('\n');
    notify('تذكيرات مستحقة', `${items.length} تذكيرات:\n${body}`, settings.notifications.sound === 1, () => focusWindow());
    return;
  }
  for (const item of items) {
    notify(item.title, item.body, settings.notifications.sound === 1 && !visible, () => {
      focusWindow();
      BrowserWindow.getAllWindows()[0]?.webContents.send('app:open-entity', {
        type: item.entityType,
        id: item.entityId,
      });
    });
  }
}

function notify(title: string, body: string, silent: boolean, onClick?: () => void): void {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent, timeoutType: 'default' });
  if (onClick) n.on('click', onClick);
  n.show();
}

function focusWindow(): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/** Reminders that are scheduled in the future, for the UI panel. */
export function upcomingReminders(limit = 20): Reminder[] {
  const nowIso = toLocalISO(new Date());
  return listReminders()
    .filter((r) => r.enabled && r.trigger_at >= nowIso)
    .slice(0, limit);
}
