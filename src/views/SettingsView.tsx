import { useState } from 'react';
import { useApp } from '../store';
import type { Settings } from '../../shared/types';
import { playCompletionSound } from '../lib/sound';

type Tab = 'appearance' | 'notifications' | 'pomodoro' | 'data' | 'tags' | 'templates' | 'shortcuts' | 'about';

const THEMES: { id: string; ar: string; en: string; bg: string; accent: string }[] = [
  { id: 'midnight', ar: 'منتصف الليل', en: 'Midnight', bg: '#0d1220', accent: '#5b86ff' },
  { id: 'daylight', ar: 'ضوء النهار', en: 'Daylight', bg: '#f2f5fb', accent: '#3563e9' },
  { id: 'ocean', ar: 'المحيط', en: 'Ocean', bg: '#081b23', accent: '#22c1dc' },
  { id: 'sand', ar: 'الرمل', en: 'Sand', bg: '#f7f2ea', accent: '#b3701f' },
  { id: 'forest', ar: 'الغابة', en: 'Forest', bg: '#0b1512', accent: '#3ecf8e' },
  { id: 'rose', ar: 'الورد', en: 'Rose', bg: '#fdf5f8', accent: '#d6478b' },
];

export function SettingsView() {
  const { data, settings, lang, t, updateSettings, call, refresh, toast } = useApp();
  const [tab, setTab] = useState<Tab>('appearance');
  const [importing, setImporting] = useState(false);
  if (!data || !settings) return null;

  const set = (patch: Partial<Settings>) => void updateSettings(patch);
  const testSound = async () => {
    if (!(await playCompletionSound())) toast(lang === 'ar' ? 'تعذّر تشغيل الصوت؛ تحقق من جهاز الإخراج وإعدادات المتصفح.' : 'Audio unavailable; check your output device and browser settings.', 'error');
  };

  const pickSave = async (defaultName: string, filters: { name: string; extensions: string[] }[]) => {
    return (await call<string | null>('app.pickSavePath', defaultName, filters)) ?? null;
  };

  const exportFile = async (kind: 'json' | 'csv' | 'ics') => {
    try {
      const method = kind === 'json' ? 'data.exportJson' : kind === 'csv' ? 'data.exportCsv' : 'data.exportIcs';
      const content = await call<string>(method);
      const ext = kind;
      const path = await pickSave(`ticktick-arabic-${new Date().toISOString().slice(0, 10)}.${ext}`, [
        { name: ext.toUpperCase(), extensions: [ext] },
      ]);
      if (!path) return;
      await call('app.writeText', path, content);
      toast(t('saved'));
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const importFile = async (kind: 'csv' | 'ics' | 'json') => {
    try {
      const files = await call<string[]>('app.pickFiles');
      if (!files.length) return;
      setImporting(true);
      const text = await call<string>('app.readText', files[0]);
      let summary: { added: number; skipped: number; errors: string[] };
      if (kind === 'csv') summary = await call('data.importCsv', text);
      else if (kind === 'ics') summary = await call('data.importIcs', text, false);
      else summary = await call('data.importJson', text, 'merge');
      await refresh();
      toast(
        `${lang === 'ar' ? 'أُضيف' : 'Added'}: ${summary.added} · ${lang === 'ar' ? 'تم تخطي' : 'Skipped'}: ${summary.skipped}${
          summary.errors.length ? ` · ${summary.errors.length} errors` : ''
        }`,
        summary.errors.length ? 'error' : 'ok',
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setImporting(false);
    }
  };

  const counts = {
    projects: data.projects.filter((p) => !p.deleted_at).length,
    tasks: data.tasks.filter((x) => !x.deleted_at).length,
    completed: data.tasks.filter((x) => !x.deleted_at && x.status === 'completed').length,
    habits: data.habits.length,
    sessions: data.focusSessions.length,
    events: data.events.length,
    countdowns: data.countdowns.length,
    sticky: data.stickyNotes.length,
  };

  const tabs: [Tab, string][] = [
    ['appearance', t('appearance')],
    ['notifications', t('notifications')],
    ['pomodoro', t('pomodoro')],
    ['data', t('data')],
    ['tags', t('tags')],
    ['templates', t('templates')],
    ['shortcuts', t('shortcuts')],
    ['about', t('about')],
  ];

  return (
    <div className="main">
      <div className="toolbar">
        <h1>{t('settings')}</h1>
        <span className="small muted">{t('offlineNotice')}</span>
      </div>
      <div className="content">
        <div className="settings-grid">
          <nav className="settings-nav">
            {tabs.map(([key, label]) => (
              <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </nav>
          <div>
            {tab === 'appearance' && (
              <>
                <div className="panel">
                  <h3>{t('language')}</h3>
                  <div className="seg">
                    <button
                      className={settings.language === 'ar' ? 'active' : ''}
                      onClick={() => set({ language: 'ar', direction: 'rtl' })}
                    >
                      العربية
                    </button>
                    <button
                      className={settings.language === 'en' ? 'active' : ''}
                      onClick={() => set({ language: 'en', direction: 'ltr' })}
                    >
                      English
                    </button>
                  </div>
                  <p className="small muted mt">
                    {lang === 'ar' ? 'واجهة عربية كاملة من اليمين إلى اليسار، مع إمكانية التبديل للإنجليزية.' : 'Full RTL Arabic interface with an English LTR toggle.'}
                  </p>
                </div>
                <div className="panel">
                  <h3>{t('theme')}</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px,1fr))', gap: 10 }}>
                    {THEMES.map((theme) => (
                      <button
                        key={theme.id}
                        onClick={() => set({ theme: theme.id })}
                        style={{
                          border: settings.theme === theme.id ? '2px solid var(--accent)' : '1px solid var(--border)',
                          borderRadius: 10,
                          padding: 10,
                          background: theme.bg,
                          textAlign: 'start',
                        }}
                      >
                        <div style={{ height: 34, borderRadius: 6, background: theme.accent, marginBottom: 6 }} />
                        <div style={{ color: theme.id === 'daylight' || theme.id === 'sand' || theme.id === 'rose' ? '#16203a' : '#e9eefb', fontSize: 12, fontWeight: 700 }}>
                          {lang === 'ar' ? theme.ar : theme.en}
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="setting-row mt">
                    <div className="info">
                      <div className="t">{lang === 'ar' ? 'لون التمييز' : 'Accent color'}</div>
                    </div>
                    <input type="color" value={settings.accent} onChange={(e) => set({ accent: e.target.value })} style={{ width: 60, height: 34, padding: 3 }} />
                  </div>
                </div>
                <div className="panel">
                  <h3>{lang === 'ar' ? 'العرض' : 'Display'}</h3>
                  <ToggleRow
                    title={lang === 'ar' ? 'الوضع المكثف' : 'Dense mode'}
                    desc={lang === 'ar' ? 'مسافات أقل بين العناصر' : 'Tighter spacing between items'}
                    value={settings.dense_mode === 1}
                    onChange={(v) => set({ dense_mode: v ? 1 : 0 })}
                  />
                  <ToggleRow
                    title={lang === 'ar' ? 'نظام 12 ساعة' : '12-hour clock'}
                    desc={lang === 'ar' ? 'عرض الوقت صباحًا/مساءً' : 'Show AM/PM times'}
                    value={settings.hour12 === 1}
                    onChange={(v) => set({ hour12: v ? 1 : 0 })}
                  />
                  <ToggleRow
                    title={lang === 'ar' ? 'أرقام الأسابيع' : 'Week numbers'}
                    desc={lang === 'ar' ? 'إظهار رقم الأسبوع في التقويم' : 'Show week number in calendar'}
                    value={settings.show_week_numbers === 1}
                    onChange={(v) => set({ show_week_numbers: v ? 1 : 0 })}
                  />
                  <div className="setting-row">
                    <div className="info">
                      <div className="t">{lang === 'ar' ? 'بداية الأسبوع' : 'Week starts on'}</div>
                    </div>
                    <select
                      value={settings.week_start}
                      onChange={(e) => set({ week_start: Number(e.target.value), first_day_of_week: Number(e.target.value) })}
                      style={{ maxWidth: 160 }}
                    >
                      {[6, 0, 1, 2, 3, 4, 5].map((d) => (
                        <option key={d} value={d}>
                          {new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'long' }).format(new Date(2024, 0, 7 + d))}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}

            {tab === 'notifications' && (
              <div className="panel">
                <h3>{t('notifications')}</h3>
                <ToggleRow
                  title={t('enable')}
                  desc={lang === 'ar' ? 'إظهار تنبيهات سطح المكتب عند موعد التذكيرات' : 'Show desktop notifications when reminders fire'}
                  value={settings.notifications.enabled === 1}
                  onChange={(v) => set({ notifications: { ...settings.notifications, enabled: v ? 1 : 0 } })}
                />
                <ToggleRow
                  title={t('sound')}
                  desc={lang === 'ar' ? 'تشغيل نغمة قصيرة' : 'Play a short chime'}
                  value={settings.notifications.sound === 1}
                  onChange={(v) => set({ notifications: { ...settings.notifications, sound: v ? 1 : 0 } })}
                />
                <button className="btn" onClick={() => void testSound()}>{lang === 'ar' ? 'اختبار الصوت' : 'Test sound'}</button>
                <ToggleRow
                  title={t('constantReminder')}
                  desc={lang === 'ar' ? 'تفعيل التذكير المستمر افتراضيًا' : 'Enable constant reminders by default'}
                  value={settings.notifications.constant_default === 1}
                  onChange={(v) => set({ notifications: { ...settings.notifications, constant_default: v ? 1 : 0 } })}
                />
                <div className="setting-row">
                  <div className="info">
                    <div className="t">{t('snoozeMinutes')}</div>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={settings.notifications.snooze_min}
                    onChange={(e) => set({ notifications: { ...settings.notifications, snooze_min: Math.max(1, Number(e.target.value) || 5) } })}
                    style={{ maxWidth: 110 }}
                  />
                </div>
              </div>
            )}

            {tab === 'pomodoro' && (
              <div className="panel">
                <h3>{t('pomodoroSettings')}</h3>
                {(
                  [
                    ['focus_min', t('focusMin')],
                    ['short_break_min', t('shortBreakMin')],
                    ['long_break_min', t('longBreakMin')],
                    ['long_break_every', t('longBreakEvery')],
                    ['daily_goal_min', t('dailyGoal')],
                  ] as [keyof Settings['pomodoro'], string][]
                ).map(([key, label]) => (
                  <div className="setting-row" key={key}>
                    <div className="info">
                      <div className="t">{label}</div>
                    </div>
                    <input
                      type="number"
                      min={1}
                      value={settings.pomodoro[key] as number}
                      onChange={(e) => set({ pomodoro: { ...settings.pomodoro, [key]: Math.max(1, Number(e.target.value) || 1) } })}
                      style={{ maxWidth: 110 }}
                    />
                  </div>
                ))}
                <ToggleRow
                  title={t('autoStartBreaks')}
                  value={settings.pomodoro.auto_start_breaks === 1}
                  onChange={(v) => set({ pomodoro: { ...settings.pomodoro, auto_start_breaks: v ? 1 : 0 } })}
                />
                <ToggleRow
                  title={t('autoStartFocus')}
                  value={settings.pomodoro.auto_start_focus === 1}
                  onChange={(v) => set({ pomodoro: { ...settings.pomodoro, auto_start_focus: v ? 1 : 0 } })}
                />
                <ToggleRow
                  title={t('sound')}
                  value={settings.pomodoro.sound === 1}
                  onChange={(v) => set({ pomodoro: { ...settings.pomodoro, sound: v ? 1 : 0 } })}
                />
                <button className="btn" onClick={() => void testSound()}>{lang === 'ar' ? 'اختبار الصوت' : 'Test sound'}</button>
              </div>
            )}

            {tab === 'data' && (
              <>
                {window.api.platform === 'web' && <div className="panel small">{lang === 'ar' ? 'تُحفظ بيانات الموقع في هذا المتصفح فقط. صدّر JSON للاحتفاظ بنسخة احتياطية؛ مسارات الملفات ومزامنة TickTick متاحة في تطبيق سطح المكتب.' : 'Web data is stored only in this browser. Export JSON for a backup; file paths and TickTick sync are desktop-only.'}</div>}
                {window.api.platform !== 'web' && <div className="panel">
                  <h3>{t('backup')}</h3>
                  <div className="gap wrap mb">
                    <button
                      className="btn primary"
                      onClick={async () => {
                        try {
                          const file = await call<string>('data.backup');
                          await refresh();
                          toast(`${t('saved')}: ${file}`);
                        } catch (err) {
                          toast(err instanceof Error ? err.message : String(err), 'error');
                        }
                      }}
                    >
                      💾 {t('backup')}
                    </button>
                    <button
                      className="btn"
                      onClick={async () => {
                        await call('data.revealDb');
                      }}
                    >
                      📂 {lang === 'ar' ? 'إظهار قاعدة البيانات' : 'Reveal database'}
                    </button>
                    <span className="small muted">
                      {lang === 'ar' ? 'آخر نسخة احتياطية' : 'Last backup'}:{' '}
                      {settings.last_backup_at ? settings.last_backup_at.replace('T', ' ').slice(0, 16) : t('never')}
                    </span>
                  </div>
                  <div className="small muted mb">{data.appInfo.dbPath}</div>
                  {data.backups.length === 0 && <p className="small muted">{lang === 'ar' ? 'لا توجد نسخ احتياطية بعد' : 'No backups yet'}</p>}
                  {data.backups.map((b) => (
                    <div className="kv" key={b.path}>
                      <span>{b.name}</span>
                      <span className="gap">
                        <span className="muted small">{Math.round(b.size / 1024)} KB</span>
                        <button
                          className="btn sm"
                          onClick={async () => {
                            if (!window.confirm(lang === 'ar' ? 'استعادة هذه النسخة؟ سيتم استبدال البيانات الحالية.' : 'Restore this backup? Current data will be replaced.')) return;
                            try {
                              const ok = await call<boolean>('data.restoreBackup', b.path);
                              await refresh();
                              toast(ok ? t('saved') : 'Invalid backup', ok ? 'ok' : 'error');
                            } catch (err) {
                              toast(err instanceof Error ? err.message : String(err), 'error');
                            }
                          }}
                        >
                          {t('restoreBackup')}
                        </button>
                      </span>
                    </div>
                  ))}
                </div>}

                <div className="panel">
                  <h3>{lang === 'ar' ? 'تصدير واستيراد' : 'Export & import'}</h3>
                  <div className="gap wrap">
                    <button className="btn" onClick={() => void exportFile('json')}>
                      ⬇ {t('exportJson')}
                    </button>
                    <button className="btn" onClick={() => void exportFile('csv')}>
                      ⬇ {t('exportCsv')}
                    </button>
                    <button className="btn" onClick={() => void exportFile('ics')}>
                      ⬇ {t('exportIcs')}
                    </button>
                  </div>
                  <div className="gap wrap mt">
                    <button className="btn" disabled={importing} onClick={() => void importFile('csv')}>
                      ⬆ {t('importCsv')}
                    </button>
                    <button className="btn" disabled={importing} onClick={() => void importFile('ics')}>
                      ⬆ {t('importIcs')}
                    </button>
                    <button className="btn" disabled={importing} onClick={() => void importFile('json')}>
                      ⬆ {t('importJson')}
                    </button>
                  </div>
                  <p className="small muted mt">
                    {lang === 'ar'
                      ? 'الاستيراد يتخطى العناصر المكررة تلقائيًا (نفس العنوان والتاريخ والمشروع).'
                      : 'Import automatically skips duplicates (same title, date and project).'}
                  </p>
                </div>

                <div className="panel">
                  <h3>{lang === 'ar' ? 'بيانات تجريبية وصيانة' : 'Sample data & maintenance'}</h3>
                  <div className="gap wrap">
                    <button
                      className="btn"
                      onClick={async () => {
                        await call('data.loadSample');
                        await refresh();
                        toast(t('saved'));
                      }}
                    >
                      ✨ {t('loadSample')}
                    </button>
                    <button
                      className="btn"
                      onClick={async () => {
                        await call('data.clearSample');
                        await refresh();
                        toast(t('saved'));
                      }}
                    >
                      {t('clearSample')}
                    </button>
                    <button
                      className="btn danger"
                      onClick={async () => {
                        if (!window.confirm(t('confirmReset'))) return;
                        await call('data.reset');
                        await refresh();
                        toast(t('saved'));
                      }}
                    >
                      {t('resetDatabase')}
                    </button>
                  </div>
                  <div className="mt">
                    {Object.entries(counts).map(([key, value]) => (
                      <div className="kv" key={key}>
                        <span>{key}</span>
                        <span className="mono">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {tab === 'tags' && <TagsPanel />}
            {tab === 'templates' && <TemplatesPanel />}

            {tab === 'shortcuts' && (
              <div className="panel">
                <h3>{t('shortcuts')}</h3>
                {[
                  ['Ctrl+K', t('commandPalette')],
                  ['Ctrl+F', t('search')],
                  ['Ctrl+N', t('newTask')],
                  ['Ctrl+Z', t('undo')],
                  ['Ctrl+Shift+Z', t('redo')],
                  ['Enter', t('save') + ' / ' + t('quickAdd')],
                  ['Esc', t('close')],
                ].map(([key, label]) => (
                  <div className="kv" key={key}>
                    <span>{label}</span>
                    <kbd>{key}</kbd>
                  </div>
                ))}
              </div>
            )}

            {tab === 'about' && (
              <div className="panel">
                <h3>{t('about')}</h3>
                <div className="kv">
                  <span>{t('version')}</span>
                  <span className="mono">{data.appInfo.version}</span>
                </div>
                <div className="kv">
                  <span>Electron</span>
                  <span className="mono">{data.appInfo.electron}</span>
                </div>
                <div className="kv">
                  <span>Node</span>
                  <span className="mono">{data.appInfo.node}</span>
                </div>
                <div className="kv">
                  <span>SQLite schema</span>
                  <span className="mono">v{data.appInfo.schemaVersion}</span>
                </div>
                <div className="kv">
                  <span>{t('dbPath')}</span>
                  <span className="mono small" style={{ maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {data.appInfo.dbPath}
                  </span>
                </div>
                <p className="small muted mt">
                  {lang === 'ar'
                    ? 'تطبيق محلي مستقل بواجهة عربية. جميع الميزات المتقدمة مجانية وتعمل دون اتصال. المزامنة اختيارية وتستخدم واجهة TickTick الرسمية فقط.'
                    : 'An independent local app with an Arabic interface. All advanced features are free and offline. Sync is optional and uses only the official TickTick API.'}
                </p>
                <p className="small muted">
                  {lang === 'ar'
                    ? 'لا يحتوي التطبيق على أي تعديل على ترخيص TickTick أو على بياناتك الخاصة.'
                    : 'This app contains no licence tampering and never reads private TickTick data.'}
                </p>
                <p className="small muted">{lang === 'ar' ? 'الترجمة المتاحة: ar / en' : 'Translations: ar / en'}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ title, desc, value, onChange }: { title: string; desc?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="setting-row">
      <div className="info">
        <div className="t">{title}</div>
        {desc && <div className="d">{desc}</div>}
      </div>
      <button className={`switch ${value ? 'on' : ''}`} onClick={() => onChange(!value)} aria-pressed={value} />
    </div>
  );
}

function TagsPanel() {
  const { data, t, lang, call, refresh, toast } = useApp();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#4f7cff');
  if (!data) return null;

  const add = async () => {
    if (!name.trim()) return;
    try {
      await call('tags.create', name.trim(), color);
      setName('');
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <div className="panel">
      <h3>{t('manageTags')}</h3>
      <div className="gap mb">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('tag')} onKeyDown={(e) => e.key === 'Enter' && void add()} />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 48, height: 34, padding: 3 }} />
        <button className="btn primary" onClick={() => void add()}>
          ＋ {t('add')}
        </button>
      </div>
      {data.tags.length === 0 && <p className="small muted">{lang === 'ar' ? 'لا توجد وسوم بعد' : 'No tags yet'}</p>}
      {data.tags.map((tag) => (
        <div className="kv" key={tag.id}>
          <span>
            <span className="dot" style={{ background: tag.color, display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginInlineEnd: 6 }} />
            #{tag.name}
          </span>
          <button
            className="btn ghost icon"
            onClick={async () => {
              await call('tags.delete', tag.id);
              await refresh();
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

function TemplatesPanel() {
  const { data, t, lang, call, refresh, toast } = useApp();
  if (!data) return null;
  return (
    <div className="panel">
      <h3>{t('templates')}</h3>
      <p className="small muted mb">
        {lang === 'ar' ? 'تُنشأ القوالب من محرر المهمة عبر «حفظ كقالب».' : 'Create templates from the task editor with “Save as template”.'}
      </p>
      {data.templates.length === 0 && <p className="small muted">{lang === 'ar' ? 'لا توجد قوالب' : 'No templates'}</p>}
      {data.templates.map((tpl) => {
        let preview = '';
        try {
          preview = JSON.parse(tpl.payload)?.title ?? '';
        } catch {
          preview = '';
        }
        return (
          <div className="kv" key={tpl.id}>
            <span>
              📋 {tpl.name} {preview ? <span className="small muted">· {preview}</span> : null}
            </span>
            <span className="gap">
              <button
                className="btn sm"
                onClick={async () => {
                  try {
                    const payload = JSON.parse(tpl.payload) as Record<string, unknown>;
                    const checklist = Array.isArray(payload.checklist) ? (payload.checklist as string[]) : [];
                    delete payload.checklist;
                    const task = await call<{ id: string }>('tasks.create', {
                      ...payload,
                      title: String(payload.title ?? tpl.name),
                      tags: JSON.stringify(payload.tags ?? []),
                    });
                    for (const item of checklist) await call('tasks.addChecklist', task.id, item, false);
                    await refresh();
                    toast(t('saved'));
                  } catch (err) {
                    toast(err instanceof Error ? err.message : String(err), 'error');
                  }
                }}
              >
                {t('useTemplate')}
              </button>
              <button
                className="btn ghost icon"
                onClick={async () => {
                  await call('templates.delete', tpl.id);
                  await refresh();
                }}
              >
                ✕
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
