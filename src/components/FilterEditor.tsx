import { useState } from 'react';
import type { FilterCondition, FilterRule, SmartFilter } from '../../shared/types';
import { useApp } from '../store';
import { Modal } from './Modal';

const FIELDS: { value: FilterCondition['field']; ar: string; en: string }[] = [
  { value: 'title', ar: 'العنوان', en: 'Title' },
  { value: 'notes', ar: 'الملاحظات', en: 'Notes' },
  { value: 'priority', ar: 'الأولوية', en: 'Priority' },
  { value: 'status', ar: 'الحالة', en: 'Status' },
  { value: 'project_id', ar: 'المشروع', en: 'Project' },
  { value: 'tag', ar: 'الوسم', en: 'Tag' },
  { value: 'due_date', ar: 'تاريخ الاستحقاق', en: 'Due date' },
  { value: 'quadrant', ar: 'الربع', en: 'Quadrant' },
  { value: 'kanban_column', ar: 'عمود كانبان', en: 'Kanban column' },
];

const OPS: { value: FilterCondition['op']; ar: string; en: string }[] = [
  { value: 'contains', ar: 'يحتوي', en: 'contains' },
  { value: 'equals', ar: 'يساوي', en: 'equals' },
  { value: 'not_equals', ar: 'لا يساوي', en: 'not equals' },
  { value: 'gt', ar: 'أكبر من', en: 'greater than' },
  { value: 'lt', ar: 'أصغر من', en: 'less than' },
  { value: 'before', ar: 'قبل', en: 'before' },
  { value: 'after', ar: 'بعد', en: 'after' },
  { value: 'is_empty', ar: 'فارغ', en: 'is empty' },
  { value: 'not_empty', ar: 'غير فارغ', en: 'not empty' },
];

export function FilterEditor({ filter, onClose }: { filter?: SmartFilter; onClose: () => void }) {
  const { data, lang, mutate, t, toast } = useApp();
  const [name, setName] = useState(filter?.name ?? '');
  const [icon, setIcon] = useState(filter?.icon ?? '🎯');
  const initial: FilterRule = (() => {
    try {
      return filter ? (JSON.parse(filter.rule) as FilterRule) : { match: 'all', conditions: [], sortBy: 'due' };
    } catch {
      return { match: 'all', conditions: [], sortBy: 'due' };
    }
  })();
  const [match, setMatch] = useState<'all' | 'any'>(initial.match);
  const [sortBy, setSortBy] = useState<NonNullable<FilterRule['sortBy']>>(initial.sortBy ?? 'due');
  const [conditions, setConditions] = useState<FilterCondition[]>(
    initial.conditions.length ? initial.conditions : [{ field: 'status', op: 'equals', value: 'open' }],
  );

  const update = (i: number, patch: Partial<FilterCondition>) =>
    setConditions((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const save = async () => {
    if (!name.trim()) return toast(lang === 'ar' ? 'أدخل اسمًا للمرشح' : 'Enter a filter name', 'error');
    const rule: FilterRule = { match, conditions, sortBy: sortBy as FilterRule['sortBy'] };
    if (filter) {
      const ok = await mutate('filters.update', filter.id, { name: name.trim(), icon, rule: JSON.stringify(rule) });
      if (ok !== undefined) {
        toast(t('saved'));
        onClose();
      }
    } else {
      const created = await mutate<SmartFilter>('filters.create', { name: name.trim(), icon, rule });
      if (created) {
        toast(t('saved'));
        onClose();
      }
    }
  };

  return (
    <Modal
      title={filter ? t('edit') + ' · ' + filter.name : t('newFilter')}
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
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>{t('icon')}</label>
          <input value={icon} onChange={(e) => setIcon(e.target.value)} />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>{t('smartFilter')}</label>
          <select value={match} onChange={(e) => setMatch(e.target.value as 'all' | 'any')}>
            <option value="all">{t('matchAll')}</option>
            <option value="any">{t('matchAny')}</option>
          </select>
        </div>
        <div className="field">
          <label>{t('sortBy')}</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as NonNullable<FilterRule['sortBy']>)}>
            <option value="due">{t('dueDate')}</option>
            <option value="priority">{t('priority')}</option>
            <option value="created">{t('created')}</option>
            <option value="title">{t('title')}</option>
          </select>
        </div>
      </div>

      {conditions.map((c, i) => (
        <div className="row" key={i} style={{ marginBottom: 8, alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t('field')}</label>
            <select value={c.field} onChange={(e) => update(i, { field: e.target.value as FilterCondition['field'] })}>
              {FIELDS.map((f) => (
                <option key={f.value} value={f.value}>
                  {lang === 'ar' ? f.ar : f.en}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t('operator')}</label>
            <select value={c.op} onChange={(e) => update(i, { op: e.target.value as FilterCondition['op'] })}>
              {OPS.map((o) => (
                <option key={o.value} value={o.value}>
                  {lang === 'ar' ? o.ar : o.en}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0, flex: 1.6 }}>
            <label>{t('value')}</label>
            <ConditionValue condition={c} onChange={(value) => update(i, { value })} />
          </div>
          <button
            className="btn ghost icon"
            style={{ marginBottom: 2 }}
            onClick={() => setConditions((prev) => prev.filter((_, idx) => idx !== i))}
            aria-label="remove"
          >
            ✕
          </button>
        </div>
      ))}
      <button className="btn sm" onClick={() => setConditions((prev) => [...prev, { field: 'title', op: 'contains', value: '' }])}>
        ＋ {t('addCondition')}
      </button>
    </Modal>
  );
}

function ConditionValue({ condition, onChange }: { condition: FilterCondition; onChange: (v: string) => void }) {
  const { data, lang, t } = useApp();
  if (condition.op === 'is_empty' || condition.op === 'not_empty') return <span className="muted small">—</span>;
  if (condition.field === 'priority') {
    return (
      <select value={condition.value} onChange={(e) => onChange(e.target.value)}>
        <option value="0">{t('none')}</option>
        <option value="1">{t('low')}</option>
        <option value="3">{t('medium')}</option>
        <option value="5">{t('high')}</option>
      </select>
    );
  }
  if (condition.field === 'status') {
    return (
      <select value={condition.value} onChange={(e) => onChange(e.target.value)}>
        <option value="open">{t('open')}</option>
        <option value="completed">{t('completed')}</option>
        <option value="abandoned">{t('abandoned')}</option>
      </select>
    );
  }
  if (condition.field === 'project_id') {
    return (
      <select value={condition.value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {data?.projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    );
  }
  if (condition.field === 'quadrant') {
    return (
      <select value={condition.value} onChange={(e) => onChange(e.target.value)}>
        <option value="1">{t('quadrant1')}</option>
        <option value="2">{t('quadrant2')}</option>
        <option value="3">{t('quadrant3')}</option>
        <option value="4">{t('quadrant4')}</option>
      </select>
    );
  }
  if (condition.field === 'due_date' && (condition.op === 'before' || condition.op === 'after' || condition.op === 'equals')) {
    return <input type="date" value={condition.value.slice(0, 10)} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <input
      value={condition.value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={lang === 'ar' ? 'القيمة' : 'value'}
    />
  );
}
