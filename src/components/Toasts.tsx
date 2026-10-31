import { useApp } from '../store';
import { Icon } from './Icon';

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type === 'error' ? 'error' : ''}`} onClick={() => dismissToast(t.id)}>
          <Icon name={t.type === 'error' ? 'info' : t.type === 'info' ? 'info' : 'check'} size={16} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
