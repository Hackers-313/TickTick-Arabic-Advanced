import { useState } from 'react';
import type { StickyNote } from '../../shared/types';
import { useApp } from '../store';

const COLORS = ['#ffd66b', '#ffb3c7', '#a8e6cf', '#b3d4ff', '#e0c3fc', '#ffe0a3'];

export function StickyView() {
  const { data, t, lang, call, refresh, toast } = useApp();
  if (!data) return null;

  const add = async () => {
    try {
      await call('sticky.create', { content: '', color: COLORS[data.stickyNotes.length % COLORS.length] });
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <div className="main">
      <div className="toolbar">
        <h1>{t('stickyNotes')}</h1>
        <span className="small muted">{lang === 'ar' ? 'تُحفظ تلقائيًا عند مغادرة الحقل' : 'Autosaved when the field loses focus'}</span>
        <button className="btn primary" onClick={() => void add()}>
          ＋ {t('add')}
        </button>
      </div>
      <div className="content">
        <div className="sticky-board">
          {data.stickyNotes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
          {data.stickyNotes.length === 0 && (
            <div className="empty" style={{ width: '100%' }}>
              <div className="big">🗒️</div>
              <h3>{lang === 'ar' ? 'لا توجد ملاحظات لاصقة' : 'No sticky notes'}</h3>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NoteCard({ note }: { note: StickyNote }) {
  const { t, call, refresh, toast } = useApp();
  const [content, setContent] = useState(note.content);
  const [color, setColor] = useState(note.color);

  const save = async () => {
    if (content === note.content && color === note.color) return;
    try {
      await call('sticky.update', note.id, { content, color });
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const remove = async () => {
    if (!window.confirm(t('confirmDelete'))) return;
    try {
      await call('sticky.delete', note.id);
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <div className="sticky-note" style={{ background: color }}>
      <div className="sticky-tools">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => {
              setColor(c);
              void call('sticky.update', note.id, { color: c }).then(refresh);
            }}
            style={{ width: 14, height: 14, borderRadius: '50%', background: c, border: c === color ? '2px solid #333' : '1px solid rgba(0,0,0,.15)' }}
            aria-label={c}
          />
        ))}
        <button onClick={() => void remove()} title={t('delete')}>
          🗑
        </button>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onBlur={() => void save()}
        placeholder="…"
        style={{ color: '#2a2410' }}
      />
      <div className="small" style={{ color: 'rgba(0,0,0,.45)', textAlign: 'end' }}>
        {note.updated_at.replace('T', ' ').slice(0, 16)}
      </div>
    </div>
  );
}
