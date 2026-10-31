import { useState } from 'react';
import type { Task } from '../../shared/types';
import { useApp } from '../store';
import { quickParse } from '../lib/quickParse';

export function QuickAdd({
  projectId,
  defaults,
  placeholder,
}: {
  projectId?: string;
  defaults?: Partial<Task>;
  placeholder?: string;
}) {
  const { data, t, lang, call, refresh, toast } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const raw = text.trim();
    if (!raw || !data || busy) return;
    setBusy(true);
    try {
      const parsed = quickParse(raw, { projects: data.projects, tags: data.tags });
      const title = parsed.title || raw;
      await call('tasks.create', {
        title,
        notes: '',
        project_id: parsed.project_id ?? projectId ?? defaults?.project_id ?? data.projects.find((p) => p.is_inbox)?.id,
        due_date: parsed.due_date ?? defaults?.due_date ?? null,
        all_day: parsed.due_date ? parsed.all_day : (defaults?.all_day ?? 0),
        priority: parsed.priority || defaults?.priority || 0,
        tags: JSON.stringify(parsed.tags.length ? parsed.tags : JSON.parse(defaults?.tags ?? '[]')),
        recurrence: defaults?.recurrence ?? null,
        quadrant: defaults?.quadrant ?? null,
        kanban_column: defaults?.kanban_column ?? null,
        parent_id: defaults?.parent_id ?? null,
      });
      for (const name of parsed.tags) {
        if (!data.tags.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
          await call('tags.create', name, '#8892a6');
        }
      }
      setText('');
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginBottom: 10 }}>
      <input
        data-testid="quick-add"
        value={text}
        placeholder={placeholder ?? t('quickAddHint')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
          }
        }}
        style={{ width: '100%', padding: '10px 12px' }}
      />
      {text.includes('#') || text.includes('!') || text.includes('@') ? (
        <div className="small muted" style={{ marginTop: 4, paddingInlineStart: 4 }}>
          {lang === 'ar' ? 'سيتم تحليل الوسوم والأولوية والتاريخ تلقائيًا' : 'Tags, priority and dates will be parsed automatically'}
        </div>
      ) : null}
    </div>
  );
}
