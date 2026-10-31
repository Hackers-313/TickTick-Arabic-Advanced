import type { Settings } from '../../shared/types';
import { getSetting, setSetting } from './repo';

export const DEFAULT_SETTINGS: Settings = {
  language: 'ar',
  direction: 'rtl',
  theme: 'midnight',
  accent: '#4f7cff',
  week_start: 6,
  hour12: 1,
  first_day_of_week: 6,
  pomodoro: {
    focus_min: 25,
    short_break_min: 5,
    long_break_min: 15,
    long_break_every: 4,
    auto_start_breaks: 0,
    auto_start_focus: 0,
    sound: 1,
    daily_goal_min: 120,
  },
  notifications: {
    enabled: 1,
    sound: 1,
    constant_default: 0,
    snooze_min: 5,
  },
  sync: {
    enabled: 0,
    direction: 'inbound',
    interval_min: 30,
    client_id: '',
    client_secret: '',
    redirect_uri: 'http://127.0.0.1:45999/oauth/callback',
    scopes: 'tasks:read tasks:write',
    project_ids: null,
    last_sync_at: null,
    last_status: 'idle',
    last_error: null,
    account: null,
    delete_remote_enabled: 0,
  },
  sidebar_collapsed: 0,
  dense_mode: 0,
  show_week_numbers: 0,
  local_api: { enabled: 0, port: 45998, token: Array.from(crypto.getRandomValues(new Uint8Array(16)), (v) => v.toString(16).padStart(2, '0')).join('') },
  last_backup_at: null,
};

function mergeDeep<T>(base: T, patch: unknown): T {
  if (patch == null || typeof patch !== 'object' || Array.isArray(patch)) return (patch as T) ?? base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const current = out[k];
    out[k] = current && typeof current === 'object' && !Array.isArray(current) ? mergeDeep(current, v) : v;
  }
  return out as T;
}

export function getSettings(): Settings {
  const stored = getSetting<Partial<Settings>>('settings', {});
  const merged = mergeDeep(DEFAULT_SETTINGS, stored);
  if (!merged.local_api?.token) merged.local_api = { ...DEFAULT_SETTINGS.local_api };
  return merged;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const merged = mergeDeep(getSettings(), patch);
  setSetting('settings', merged);
  return merged;
}
