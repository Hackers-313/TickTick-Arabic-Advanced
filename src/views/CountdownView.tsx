import { useState } from 'react';
import type { Countdown } from '../../shared/types';
import { useApp } from '../store';
import { addDays, diffDays, formatDate, parseLocal, toDateKey } from '../../shared/date';
import { Modal } from '../components/Modal';

function nextOccurrence(date: string, repeatYearly: number): Date {
  const base = parseLocal(date) ?? new Date();
  const today = new Date();
  let target = new Date(today.getFullYear(), base.getMonth(), base.getDate());
  if (repeatYearly) {
    while (target < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
      target = new Date(target.getFullYear() + 1, base.getMonth(), base.getDate());
    }
  }
  return target;
}

export function CountdownView() {
  const { data, t, lang, call, refresh, toast } = useApp();
  const [editor, setEditor] = useState<{ open: boolean; item?: Countdown }>({ open: false });
  if (!data) return null;

  const items = [...data.countdowns].sort(
    (a, b) => nextOccurrence(a.date, a.repeat_yearly).getTime() - nextOccurrence(b.date, b.repeat_yearly).getTime(),
  );

  const remove = async (item: Countdown) => {
    if (!window.confirm(t('confirmDelete'))) return;
    try {
      await call('countdowns.delete', item.id);
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <div className="main">
      <div className="toolbar">
        <h1>{t('countdowns')}</h1>
        <span className="small muted">{items.length}</span>
        <button className="btn primary" onClick={() => setEditor({ open: true })}>
          ＋ {t('newCountdown')}
        </button>
      </div>
      <div className="content">
        {items.length === 0 && (
          <div className="empty">
            <div className="big">⏳</div>
            <h3>{lang === 'ar' ? 'أضف حدثًا تنتظره' : 'Add an event to look forward to'}</h3>
          </div>
        )}
        <div className="cd-grid">
          {items.map((item) => {
            const target = nextOccurrence(item.date, item.repeat_yearly);
            const left = diffDays(target, new Date());
            return (
              <div
                key={item.id}
                className="cd-card"
                style={{ background: `linear-gradient(140deg, ${item.color}, color-mix(in srgb, ${item.color} 55%, #000))` }}
              >
                <div>
                  <div className="cd-title">
                    {item.icon} {item.title}
                  </div>
                  <div className="cd-date">{formatDate(target, lang, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                </div>
                <div>
                  <div className="cd-num">{Math.abs(left)}</div>
                  <div className="cd-unit">
                    {left >= 0 ? t('daysLeft') : t('daysPassed')}
                    {item.repeat_yearly ? ` · ${t('repeatYearly')}` : ''}
                  </div>
                </div>
                <div className="sticky-tools" style={{ opacity: 0.85 }}>
                  <button onClick={() => setEditor({ open: true, item })} title={t('edit')}>
                    ✎
                  </button>
                  <button onClick={() => void remove(item)} title={t('delete')}>
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {editor.open && <CountdownEditor item={editor.item} onClose={() => setEditor({ open: false })} />}
    </div>
  );
}

function CountdownEditor({ item, onClose }: { item?: Countdown; onClose: () => void }) {
  const { t, lang, call, refresh, toast } = useApp();
  const [title, setTitle] = useState(item?.title ?? '');
  const [date, setDate] = useState(item?.date?.slice(0, 10) ?? toDateKey(addDays(new Date(), 30)));
  const [category, setCategory] = useState(item?.category ?? '');
  const [color, setColor] = useState(item?.color ?? '#4f7cff');
  const [icon, setIcon] = useState(item?.icon ?? '🎉');
  const [repeat, setRepeat] = useState(!!item?.repeat_yearly);
  const [remind, setRemind] = useState(item?.remind_days_before ?? 1);
  const [notes, setNotes] = useState(item?.notes ?? '');

  const save = async () => {
    if (!title.trim()) return toast(lang === 'ar' ? 'أدخل عنوانًا' : 'Enter a title', 'error');
    const payload = {
      title: title.trim(),
      date,
      category,
      color,
      icon,
      repeat_yearly: repeat ? 1 : 0,
      remind_days_before: remind,
      notes,
    };
    try {
      if (item) await call('countdowns.update', item.id, payload);
      else await call('countdowns.create', payload);
      await refresh();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <Modal
      title={item ? t('edit') + ' · ' + item.title : t('newCountdown')}
      onClose={onClose}
      footer={
        <>
          <button className="btn primary" onClick={() => void save()}>
            {t('save')}
          </button>
          <button className="btn" onClick={onClose}>
            {t('cancel')}
          </button>
        </>
      }
    >
      <div className="row">
        <div className="field" style={{ flex: 3 }}>
          <label>{t('title')}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>{t('icon')}</label>
          <input value={icon} onChange={(e) => setIcon(e.target.value)} />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>{t('dueDate')}</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>{t('countdownCategory')}</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={lang === 'ar' ? 'عيد، سفر…' : 'holiday, trip…'} />
        </div>
        <div className="field">
          <label>{t('color')}</label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ height: 38, padding: 3 }} />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>{t('remindBefore')}</label>
          <input type="number" min={0} max={90} value={remind} onChange={(e) => setRemind(Math.max(0, Number(e.target.value) || 0))} />
        </div>
        <div className="field" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0 }}>
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} style={{ width: 'auto' }} />
            {t('repeatYearly')}
          </label>
        </div>
      </div>
      <div className="field">
        <label>{t('notes')}</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}
