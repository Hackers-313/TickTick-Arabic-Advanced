import { useApp } from '../store';
import { Icon } from './Icon';

export function TitleBar() {
  const { data, t, undo, redo, setPaletteOpen, setSearchOpen, lang } = useApp();
  const sync = data?.settings.sync;
  const status = sync?.last_status ?? 'idle';
  const dotClass = status === 'ok' ? 'ok' : status === 'error' ? 'error' : status === 'running' ? 'running' : '';

  return (
    <header className="titlebar">
      <div className="brand">
        <span className="brand-mark">
          <Icon name="layers" size={17} />
        </span>
        <strong>{t('appName')}</strong>
        <span className="muted small" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span className={`sync-dot ${dotClass}`} />
          {status === 'running' ? t('syncing') : sync?.account ? t('connected') : t('offlineNotice')}
        </span>
      </div>
      <div className="titlebar-actions">
        <button className="win-btn" title={t('commandPalette') + ' (Ctrl+K)'} onClick={() => setPaletteOpen(true)}>
          <Icon name="command" size={16} />
        </button>
        <button className="win-btn" title={t('search') + ' (Ctrl+F)'} onClick={() => setSearchOpen(true)}>
          <Icon name="search" size={16} />
        </button>
        <button className="win-btn" title={t('undoTooltip')} onClick={() => void undo()} disabled={!data?.undo.canUndo}>
          <Icon name="undo" size={16} />
        </button>
        <button className="win-btn" title={t('redo')} onClick={() => void redo()} disabled={!data?.undo.canRedo}>
          <Icon name="redo" size={16} />
        </button>
        {window.api.platform !== 'web' && <><span style={{ width: 8 }} />
        <button className="win-btn" onClick={() => void window.api.invoke('window.minimize')} aria-label="minimize">
          <Icon name="minus" size={16} />
        </button>
        <button className="win-btn" onClick={() => void window.api.invoke('window.maximize')} aria-label="maximize">
          <Icon name="square" size={13} />
        </button>
        <button className="win-btn close" onClick={() => void window.api.invoke('window.close')} aria-label="close">
          <Icon name="x" size={16} />
        </button>
        </>}
      </div>
      <span className="hidden">{lang}</span>
    </header>
  );
}
