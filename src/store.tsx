import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Bootstrap } from './lib/api';
import { invoke } from './lib/api';
import type { Settings, Task } from '../shared/types';
import { translate, type Lang } from '../shared/i18n';
import type { View } from './lib/view';

export interface ToastItem {
  id: number;
  text: string;
  type: 'ok' | 'error' | 'info';
}

export interface EditorState {
  open: boolean;
  taskId?: string;
  defaults?: Partial<Task>;
}

interface AppContextValue {
  data: Bootstrap | null;
  loading: boolean;
  error: string | null;
  settings: Settings | null;
  lang: Lang;
  dir: 'rtl' | 'ltr';
  t: (key: string) => string;
  refresh: () => Promise<void>;
  call: <T = unknown>(method: string, ...args: unknown[]) => Promise<T>;
  mutate: <T = unknown>(method: string, ...args: unknown[]) => Promise<T | undefined>;
  attempt: (fn: () => Promise<unknown>, success?: string) => Promise<boolean>;
  toast: (text: string, type?: ToastItem['type']) => void;
  toasts: ToastItem[];
  dismissToast: (id: number) => void;
  view: View;
  setView: (v: View) => void;
  editor: EditorState;
  openEditor: (taskId?: string, defaults?: Partial<Task>) => void;
  closeEditor: () => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  eventEditor: { open: boolean; eventId?: string; start?: string };
  openEventEditor: (eventId?: string, start?: string) => void;
  closeEventEditor: () => void;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

let toastSeq = 0;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [view, setView] = useState<View>({ kind: 'smart', key: 'today' });
  const [editor, setEditor] = useState<EditorState>({ open: false });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [eventEditor, setEventEditor] = useState<{ open: boolean; eventId?: string; start?: string }>({ open: false });
  const mounted = useRef(true);

  const toast = useCallback((text: string, type: ToastItem['type'] = 'ok') => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev.slice(-3), { id, text, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, type === 'error' ? 6000 : 3200);
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((x) => x.id !== id)), []);

  const refresh = useCallback(async () => {
    try {
      const next = await invoke<Bootstrap>('bootstrap');
      if (!mounted.current) return;
      setData(next);
      setError(null);
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  // Settings can change outside this window (local API, another window, sync setup).
  useEffect(() => {
    const offSettings = window.api.on('settings:changed', () => void refresh());
    const offData = window.api.on('data:changed', () => void refresh());
    return () => {
      offSettings();
      offData();
    };
  }, [refresh]);

  const call = useCallback(async <T,>(method: string, ...args: unknown[]): Promise<T> => invoke<T>(method, ...args), []);

  const mutate = useCallback(
    async <T,>(method: string, ...args: unknown[]): Promise<T | undefined> => {
      try {
        const result = await invoke<T>(method, ...args);
        await refresh();
        return result;
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 'error');
        return undefined;
      }
    },
    [refresh, toast],
  );

  const attempt = useCallback(
    async (fn: () => Promise<unknown>, success?: string): Promise<boolean> => {
      try {
        await fn();
        await refresh();
        if (success) toast(success, 'ok');
        return true;
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 'error');
        return false;
      }
    },
    [refresh, toast],
  );

  const settings = data?.settings ?? null;
  const lang: Lang = settings?.language ?? 'ar';
  const dir: 'rtl' | 'ltr' = settings?.direction ?? (lang === 'ar' ? 'rtl' : 'ltr');
  const t = useCallback((key: string) => translate(key, lang), [lang]);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      try {
        await invoke('settings.update', patch);
        await refresh();
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 'error');
      }
    },
    [refresh, toast],
  );

  const openEditor = useCallback((taskId?: string, defaults?: Partial<Task>) => {
    setEditor({ open: true, taskId, defaults });
  }, []);
  const closeEditor = useCallback(() => setEditor({ open: false }), []);
  const openEventEditor = useCallback((eventId?: string, start?: string) => {
    setEventEditor({ open: true, eventId, start });
  }, []);
  const closeEventEditor = useCallback(() => setEventEditor({ open: false }), []);

  const undo = useCallback(async () => {
    try {
      const res = await invoke<{ ok: boolean; label?: string }>('undo.perform', 'undo');
      await refresh();
      if (res?.ok) toast(`${translate('undo', lang)}: ${res.label ?? ''}`, 'info');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  }, [refresh, toast, lang]);

  const redo = useCallback(async () => {
    try {
      const res = await invoke<{ ok: boolean; label?: string }>('undo.perform', 'redo');
      await refresh();
      if (res?.ok) toast(`${translate('redo', lang)}: ${res.label ?? ''}`, 'info');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  }, [refresh, toast, lang]);

  const value = useMemo<AppContextValue>(
    () => ({
      data,
      loading,
      error,
      settings,
      lang,
      dir,
      t,
      refresh,
      call,
      mutate,
      attempt,
      toast,
      toasts,
      dismissToast,
      view,
      setView,
      editor,
      openEditor,
      closeEditor,
      paletteOpen,
      setPaletteOpen,
      searchOpen,
      setSearchOpen,
      eventEditor,
      openEventEditor,
      closeEventEditor,
      updateSettings,
      undo,
      redo,
    }),
    [
      data,
      loading,
      error,
      settings,
      lang,
      dir,
      t,
      refresh,
      call,
      mutate,
      attempt,
      toast,
      toasts,
      dismissToast,
      view,
      editor,
      openEditor,
      closeEditor,
      paletteOpen,
      searchOpen,
      eventEditor,
      openEventEditor,
      closeEventEditor,
      updateSettings,
      undo,
      redo,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
