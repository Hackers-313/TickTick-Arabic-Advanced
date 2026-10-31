import { useState } from 'react';
import { useApp } from '../store';
import { formatDateTime } from '../../shared/date';

interface SyncResult {
  ok: boolean;
  added: number;
  updated: number;
  conflicts: number;
  deleted: number;
  error?: string;
}

export function SyncView() {
  const { data, t, lang, call, refresh, toast, updateSettings } = useApp();
  const sync = data?.settings.sync;
  const [clientId, setClientId] = useState(sync?.client_id ?? '');
  const [clientSecret, setClientSecret] = useState(sync?.client_secret ?? '');
  const [redirect, setRedirect] = useState(sync?.redirect_uri ?? '');
  const [busy, setBusy] = useState<'connect' | 'sync' | 'rebuild' | null>(null);

  if (!data || !sync) return null;
  if (window.api.platform === 'web') return (
    <div className="main"><div className="toolbar"><h1>{t('sync')}</h1></div><div className="content"><div className="panel">
      {lang === 'ar' ? 'ربط TickTick غير متاح في الموقع. استخدم تطبيق Windows، وأنشئ تطبيقًا لدى TickTick للحصول على Client ID وClient Secret.' : 'TickTick sync is unavailable on the website. Use the Windows app and register a TickTick developer app to obtain a Client ID and Client Secret.'}
    </div></div></div>
  );

  const saveCredentials = async () => {
    try {
      await call('settings.update', { sync: { ...sync, client_id: clientId.trim(), client_secret: clientSecret.trim(), redirect_uri: redirect.trim() } });
      await refresh();
      toast(t('saved'));
    } catch (error) { toast(error instanceof Error ? error.message : String(error), 'error'); }
  };

  const connect = async () => {
    setBusy('connect');
    try {
      // Save the fields the user sees before opening OAuth; a separate Save click is not required.
      await call('settings.update', { sync: { ...sync, client_id: clientId.trim(), client_secret: clientSecret.trim(), redirect_uri: redirect.trim() } });
      const res = await call<{ ok: boolean; error?: string; account?: { name: string; email: string }; initial?: SyncResult }>('sync.connect');
      await refresh();
      if (res.ok) {
        toast(lang === 'ar' ? 'تم ربط الحساب' : 'Account connected');
      } else {
        const msg =
          res.error === 'MISSING_CLIENT_ID' || res.error === 'MISSING_CLIENT_SECRET'
            ? (lang === 'ar' ? 'أدخل Client ID وClient Secret من بوابة مطوري TickTick.' : 'Enter the Client ID and Client Secret from the TickTick developer portal.')
            : res.error === 'INVALID_REDIRECT_URI'
              ? (lang === 'ar' ? 'يجب أن يكون عنوان العودة http://127.0.0.1 مع منفذ، وأن يطابق العنوان المسجل في TickTick تمامًا.' : 'Use an http://127.0.0.1 redirect with a port that exactly matches the TickTick developer portal.')
            : res.error === 'CALLBACK_SERVER_FAILED'
              ? (lang === 'ar' ? 'تعذر فتح منفذ العودة المحلي؛ تأكد من أنه غير مستخدم.' : 'Could not open the callback port; make sure it is available.')
            : res.error === 'AUTH_CANCELLED'
              ? lang === 'ar'
                ? 'أُلغيت عملية الربط أو انتهت مهلتها'
                : 'Authorization was cancelled or timed out'
              : res.error ?? 'error';
        toast(msg, 'error');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const runSync = async () => {
    setBusy('sync');
    try {
      const res = await call<SyncResult>('sync.now');
      await refresh();
      if (res.ok) {
        toast(
          `${lang === 'ar' ? 'مزامنة' : 'Synced'}: +${res.added} ~${res.updated}${res.conflicts ? ` · ${res.conflicts} ${t('conflicts')}` : ''}`,
          res.conflicts ? 'info' : 'ok',
        );
      } else {
        toast(res.error ?? t('syncError'), 'error');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const rebuild = async () => {
    if (!window.confirm(lang === 'ar' ? 'سيتم حذف المهام المرتبطة بـ TickTick محليًا وإعادة جلبها. المهام المحلية فقط تبقى. متابعة؟' : 'Locally synced tasks will be removed and re-fetched. Local-only tasks stay. Continue?')) return;
    setBusy('rebuild');
    try {
      const res = await call<SyncResult>('sync.rebuild');
      await refresh();
      toast(res.ok ? t('rebuilt') : (res.error ?? t('syncError')), res.ok ? 'ok' : 'error');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const statusDot = sync.last_status === 'ok' ? 'ok' : sync.last_status === 'error' ? 'error' : sync.last_status === 'running' ? 'running' : '';

  return (
    <div className="main">
      <div className="toolbar">
        <h1>{t('sync')}</h1>
        <span className="sync-badge">
          <span className={`sync-dot ${statusDot}`} />
          {sync.account ? `${t('connected')}: ${sync.account.name || sync.account.email}` : t('notConnected')}
        </span>
        {sync.account && (
          <button className="btn" onClick={() => void runSync()} disabled={busy === 'sync'}>
            {busy === 'sync' ? <span className="spinner" /> : '🔄'} {t('syncNow')}
          </button>
        )}
      </div>
      <div className="content">
        <div className="panel">
          <h3>{t('connectAccount')}</h3>
          <p className="small muted mb">{t('oauthHint')}</p>
          <div className="row">
            <div className="field">
              <label>{t('clientId')}</label>
              <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="…" />
            </div>
            <div className="field">
              <label>{t('clientSecret')}</label>
              <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="…" />
            </div>
          </div>
          <div className="field">
            <label>{t('redirectUri')}</label>
            <input value={redirect} onChange={(e) => setRedirect(e.target.value)} />
          </div>
          <div className="gap wrap">
            <button className="btn" onClick={() => void saveCredentials()}>
              💾 {t('save')}
            </button>
            <button className="btn primary" onClick={() => void connect()} disabled={busy === 'connect' || !clientId.trim() || !clientSecret.trim()}>
              {busy === 'connect' ? <span className="spinner" /> : '🔗'} {t('connectAccount')}
            </button>
            {sync.account && (
              <button
                className="btn danger"
                onClick={async () => {
                  if (!window.confirm(t('disconnectAccount') + '?')) return;
                  await call('sync.disconnect');
                  await refresh();
                  toast(t('disconnectAccount'));
                }}
              >
                {t('disconnectAccount')}
              </button>
            )}
          </div>
          <p className="small muted mt">
            {lang === 'ar'
              ? 'يجب إنشاء تطبيق في بوابة مطوري TickTick والحصول على Client ID وClient Secret. تُخزَّن الرموز مشفرة عبر Windows DPAPI، ولا تُرسل كلمة مرورك إلى التطبيق.'
              : 'Create an app in the TickTick developer portal to obtain a Client ID and Secret. Tokens are encrypted with Windows DPAPI; your password is never sent to this app.'}
          </p>
          <p className="small muted">{lang === 'ar' ? 'ملاحظة أمان: يُحفظ Client Secret في إعدادات قاعدة البيانات المحلية غير المشفرة، وقد يتضمنه تصدير JSON؛ لا تشارك ملف التصدير.' : 'Security note: the Client Secret is stored in unencrypted local settings and may be included in JSON exports; do not share exported files.'}</p>
        </div>

        <div className="panel">
          <h3>{lang === 'ar' ? 'إعدادات المزامنة' : 'Sync settings'}</h3>
          <div className="setting-row">
            <div className="info">
              <div className="t">{t('syncEnabled')}</div>
              <div className="d">{t('lastSync')}: {sync.last_sync_at ? formatDateTime(sync.last_sync_at, lang) : t('never')}</div>
            </div>
            <button
              className={`switch ${sync.enabled ? 'on' : ''}`}
              onClick={() => void updateSettings({ sync: { ...sync, enabled: sync.enabled ? 0 : 1 } })}
            />
          </div>
          <div className="setting-row">
            <div className="info">
              <div className="t">{t('syncDirection')}</div>
              <div className="d">{t('syncDirectionWarning')}</div>
            </div>
            <div className="seg">
              <button
                className={sync.direction === 'inbound' ? 'active' : ''}
                onClick={() => void updateSettings({ sync: { ...sync, direction: 'inbound' } })}
              >
                {t('inboundOnly')}
              </button>
              <button
                className={sync.direction === 'two-way' ? 'active' : ''}
                onClick={() => void updateSettings({ sync: { ...sync, direction: 'two-way' } })}
              >
                {t('twoWay')}
              </button>
            </div>
          </div>
          <div className="setting-row">
            <div className="info">
              <div className="t">{t('syncInterval')}</div>
            </div>
            <input
              type="number"
              min={5}
              max={1440}
              value={sync.interval_min}
              onChange={(e) => void updateSettings({ sync: { ...sync, interval_min: Math.max(5, Number(e.target.value) || 30) } })}
              style={{ maxWidth: 110 }}
            />
          </div>
          <div className="setting-row">
            <div className="info">
              <div className="t">{t('deleteRemote')}</div>
            </div>
            <button
              className={`switch ${sync.delete_remote_enabled ? 'on' : ''}`}
              onClick={() => void updateSettings({ sync: { ...sync, delete_remote_enabled: sync.delete_remote_enabled ? 0 : 1 } })}
            />
          </div>
          {sync.last_error && <p className="chip danger mt">{sync.last_error}</p>}
          <div className="gap wrap mt">
            <button className="btn" onClick={() => void rebuild()} disabled={busy === 'rebuild' || !sync.account}>
              ♻ {t('rebuildFromRemote')}
            </button>
            <span className="small muted">{t('syncProjects')}: {t('allProjects')}</span>
          </div>
        </div>

        {data.conflicts.length > 0 && (
          <div className="panel">
            <h3>{t('conflicts')} ({data.conflicts.length})</h3>
            {data.conflicts.map((c) => {
              let localTitle = '';
              let remoteTitle = '';
              try {
                localTitle = JSON.parse(c.local_json)?.title ?? '';
                remoteTitle = JSON.parse(c.remote_json)?.title ?? '';
              } catch {
                /* ignore */
              }
              return (
                <div className="kv" key={c.id} style={{ alignItems: 'flex-start' }}>
                  <span>
                    <strong>{localTitle || remoteTitle || c.task_id}</strong>
                    <div className="small muted">
                      {t('localVersion')}: {localTitle || '—'} · {t('remoteVersion')}: {remoteTitle || '—'}
                    </div>
                  </span>
                  <span className="gap">
                    <button
                      className="btn sm"
                      onClick={async () => {
                        await call('sync.resolve', c.id, 'local');
                        await refresh();
                        toast(t('keepLocal'));
                      }}
                    >
                      {t('keepLocal')}
                    </button>
                    <button
                      className="btn sm"
                      onClick={async () => {
                        await call('sync.resolve', c.id, 'remote');
                        await refresh();
                        toast(t('keepRemote'));
                      }}
                    >
                      {t('keepRemote')}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="panel">
          <h3>{t('syncHistory')}</h3>
          {data.syncLogs.length === 0 && <p className="small muted">{lang === 'ar' ? 'لا يوجد سجل بعد' : 'No history yet'}</p>}
          {data.syncLogs.map((log) => (
            <div className="kv" key={log.id}>
              <span>
                {log.status === 'ok' ? '✅' : log.status === 'partial' ? '⚠️' : '❌'} {log.started_at.replace('T', ' ').slice(0, 16)}
                <span className="small muted"> · {log.direction} · +{log.added} ~{log.updated}</span>
              </span>
              <span className="small muted">{log.message}</span>
            </div>
          ))}
        </div>

        <div className="panel">
          <h3>{t('localApi')}</h3>
          <p className="small muted">{t('localApiHint')}</p>
          <div className="gap wrap mt">
            <button
              className="btn"
              onClick={async () => {
                const status = await call<{ running: boolean }>('localApi.toggle', !data.localApi.running);
                await refresh();
                toast(status?.running ? t('enable') : t('disable'));
              }}
            >
              {data.localApi.running ? t('disable') : t('enable')}
            </button>
            <span className={`chip ${data.localApi.running ? 'accent' : ''}`}>{data.localApi.running ? 'running' : 'stopped'}</span>
            {data.localApi.running && (
              <>
                <code className="small">{data.localApi.url}</code>
                <button
                  className="btn sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(data.localApi.token);
                    toast(t('copied'));
                  }}
                >
                  {t('copied')} token
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
