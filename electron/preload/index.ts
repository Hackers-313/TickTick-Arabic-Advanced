import { contextBridge, ipcRenderer } from 'electron';

type Listener = (...args: unknown[]) => void;

const api = {
  invoke: async (method: string, ...args: unknown[]): Promise<unknown> => {
    const result = (await ipcRenderer.invoke('api', method, args)) as { ok: boolean; data?: unknown; error?: string };
    if (!result.ok) throw new Error(result.error || 'IPC error');
    return result.data;
  },
  on: (channel: string, listener: Listener): (() => void) => {
    const allowed = new Set(['reminders:fired', 'app:open-entity', 'sync:status', 'settings:changed', 'data:changed']);
    if (!allowed.has(channel)) throw new Error(`Channel not allowed: ${channel}`);
    const wrapped = (_e: unknown, ...args: unknown[]) => listener(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld('api', api);

export type PreloadApi = typeof api;
