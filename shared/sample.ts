import { addDays, toDateKey, toLocalISO, toLocalMinutes, todayKey } from './date';
import { buildRRule } from './recurrence';
import type { Task } from './types';

export interface SampleData {
  projects: { id: string; name: string; color: string; icon: string; is_inbox: number; kind: 'list' | 'inbox'; sort_order: number }[];
  tasks: Partial<Task>[];
  habits: { id: string; name: string; icon: string; color: string; frequency: 'daily' | 'weekly' | 'custom'; target_days: number; weekdays: string; goal: number; step: number; unit: string; sort_order: number }[];
  habitLogs: { habit_id: string; date: string; value: number; done: number }[];
  countdowns: { id: string; title: string; date: string; category: string; color: string; icon: string; repeat_yearly: number; remind_days_before: number }[];
  sessions: { task_id: string | null; mode: string; started_at: string; duration_sec: number; completed: number }[];
  filter: { id: string; name: string; icon: string; rule: string; sort_order: number };
  template: { id: string; name: string; payload: string };
  sticky: { id: string; content: string; color: string };
}

const uid = (p: string, n: number) => `sample-${p}-${n}`;

export function buildSampleData(now = new Date()): SampleData {
  const day = (offset: number) => toDateKey(addDays(now, offset));
  const at = (offset: number, h: number, m = 0) => toLocalMinutes(addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m), offset));

  const projects: SampleData['projects'] = [
    { id: 'sample-inbox', name: 'الوارد', color: '#4f7cff', icon: '📥', is_inbox: 1, kind: 'inbox', sort_order: 0 },
    { id: uid('proj', 1), name: 'العمل', color: '#2f9e6e', icon: '💼', is_inbox: 0, kind: 'list', sort_order: 1 },
    { id: uid('proj', 2), name: 'دراسة', color: '#b06bff', icon: '📚', is_inbox: 0, kind: 'list', sort_order: 2 },
    { id: uid('proj', 3), name: 'شخصي', color: '#ff8a4c', icon: '🏠', is_inbox: 0, kind: 'list', sort_order: 3 },
  ];

  const mk = (n: number, p: string, title: string, extra: Partial<Task> = {}): Partial<Task> => ({
    id: uid('task', n),
    project_id: p,
    title,
    notes: '',
    priority: 0,
    status: 'open',
    all_day: 0,
    tags: '[]',
    sort_order: n,
    ...extra,
  });

  const tasks: Partial<Task>[] = [
    mk(1, projects[0].id, 'مراجعة بريد الصباح', { due_date: at(0, 9, 30), duration_min: 20, priority: 1, tags: '["عمل"]' }),
    mk(2, projects[0].id, 'قراءة 20 صفحة', { due_date: at(0, 21), duration_min: 30, tags: '["تطوير"]' }),
    mk(3, projects[1].id, 'اجتماع فريق المنتج', {
      due_date: at(0, 11),
      end_date: at(0, 12),
      duration_min: 60,
      priority: 5,
      notes: 'مناقشة خارطة الطريق للربع القادم.',
      tags: '["عمل","اجتماع"]',
      quadrant: 1,
    }),
    mk(4, projects[1].id, 'إعداد تقرير المبيعات', { due_date: at(1, 15), duration_min: 90, priority: 3, tags: '["عمل"]', quadrant: 2 }),
    mk(5, projects[1].id, 'مراجعة عقود الموردين', { due_date: at(-1, 14), priority: 5, tags: '["عمل"]', quadrant: 1 }),
    mk(6, projects[1].id, 'تحديث خطة التسويق', { due_date: at(3, 10), duration_min: 45, priority: 3, tags: '["عمل"]' }),
    mk(7, projects[2].id, 'حل تمارين الرياضيات', { due_date: at(0, 18), duration_min: 60, priority: 3, tags: '["دراسة"]', quadrant: 2 }),
    mk(8, projects[2].id, 'محاضرة الفيزياء', { due_date: at(2, 8), end_date: at(2, 10), all_day: 0, priority: 3, tags: '["دراسة"]' }),
    mk(9, projects[2].id, 'تلخيص الفصل الرابع', {
      due_date: at(2, 16),
      duration_min: 45,
      priority: 1,
      recurrence: buildRRule({ freq: 'WEEKLY', byday: [0, 2, 4] }),
      tags: '["دراسة"]',
    }),
    mk(10, projects[3].id, 'شراء مستلزمات المنزل', { due_date: day(1) + 'T00:00:00', all_day: 1, priority: 1, tags: '["شخصي"]' }),
    mk(11, projects[3].id, 'تمرين رياضي', { due_date: at(0, 7), duration_min: 40, priority: 3, tags: '["صحة"]' }),
    mk(12, projects[3].id, 'دفع فاتورة الكهرباء', { due_date: at(4, 12), priority: 5, tags: '["شخصي"]', quadrant: 3 }),
    mk(13, projects[3].id, 'ترتيب مكتب العمل', { due_date: at(-3, 20), priority: 1, status: 'completed', completed_at: at(-3, 21) }),
    mk(14, projects[1].id, 'إنهاء عرض العميل', { due_date: at(-2, 17), priority: 5, status: 'completed', completed_at: at(-2, 18) }),
    mk(15, projects[2].id, 'تسليم مشروع التخرج', { due_date: at(20, 23, 59), priority: 5, notes: 'الموعد النهائي الكبير.', quadrant: 2 }),
    mk(16, projects[0].id, 'مكالمة مع الطبيب', { due_date: at(5, 10), duration_min: 15, priority: 3 }),
    mk(17, projects[3].id, 'حجز تذاكر السفر', { due_date: at(9, 13), priority: 3, tags: '["شخصي"]' }),
    mk(18, projects[1].id, 'مراجعة أداء الفريق', { due_date: at(7, 9), duration_min: 60, priority: 3, recurrence: buildRRule({ freq: 'MONTHLY' }) }),
    mk(19, projects[2].id, 'قراءة بحث علمي', { due_date: at(-5, 22), priority: 1, status: 'completed', completed_at: at(-5, 23) }),
    mk(20, projects[0].id, 'تنظيم الملفات الرقمية', { due_date: null, priority: 1 }),
    // subtasks of task 3
    mk(21, projects[1].id, 'تحضير جدول الأعمال', { parent_id: uid('task', 3), due_date: at(0, 9), status: 'completed', completed_at: at(0, 9, 40) }),
    mk(22, projects[1].id, 'جمع ملاحظات الفريق', { parent_id: uid('task', 3), due_date: at(0, 10) }),
    mk(23, projects[1].id, 'إرسال الملخص', { parent_id: uid('task', 3), due_date: at(0, 13) }),
  ];

  const habits: SampleData['habits'] = [
    { id: uid('habit', 1), name: 'قراءة يومية', icon: '📖', color: '#4f7cff', frequency: 'daily', target_days: 7, weekdays: '[]', goal: 20, step: 5, unit: 'صفحة', sort_order: 1 },
    { id: uid('habit', 2), name: 'ماء', icon: '💧', color: '#31b6c9', frequency: 'daily', target_days: 7, weekdays: '[]', goal: 8, step: 1, unit: 'كوب', sort_order: 2 },
    { id: uid('habit', 3), name: 'رياضة', icon: '🏃', color: '#2f9e6e', frequency: 'weekly', target_days: 4, weekdays: '[]', goal: 1, step: 1, unit: 'جلسة', sort_order: 3 },
    { id: uid('habit', 4), name: 'تأمل', icon: '🧘', color: '#b06bff', frequency: 'daily', target_days: 7, weekdays: '[]', goal: 10, step: 5, unit: 'دقيقة', sort_order: 4 },
  ];

  const habitLogs: SampleData['habitLogs'] = [];
  for (let i = 0; i < 45; i++) {
    const key = day(-i);
    if (i % 7 === 3 && i > 0) continue;
    habitLogs.push({ habit_id: habits[0].id, date: key, value: 20, done: 1 });
    habitLogs.push({ habit_id: habits[1].id, date: key, value: i % 5 === 0 ? 5 : 8, done: i % 5 === 0 ? 0 : 1 });
    if (i % 2 === 0) habitLogs.push({ habit_id: habits[3].id, date: key, value: 10, done: 1 });
    if (i % 3 === 0) habitLogs.push({ habit_id: habits[2].id, date: key, value: 1, done: 1 });
  }

  const countdowns: SampleData['countdowns'] = [
    { id: uid('cd', 1), title: 'تسليم مشروع التخرج', date: day(20), category: 'دراسة', color: '#b06bff', icon: '🎓', repeat_yearly: 0, remind_days_before: 3 },
    { id: uid('cd', 2), title: 'عيد ميلاد سارة', date: day(35), category: 'عائلة', color: '#ff5c8a', icon: '🎂', repeat_yearly: 1, remind_days_before: 7 },
    { id: uid('cd', 3), title: 'رحلة إلى أبها', date: day(60), category: 'سفر', color: '#2f9e6e', icon: '✈️', repeat_yearly: 0, remind_days_before: 5 },
  ];

  const sessions: SampleData['sessions'] = [];
  for (let i = 0; i < 14; i++) {
    const count = (i % 3) + 1;
    for (let k = 0; k < count; k++) {
      sessions.push({
        task_id: i % 4 === 0 ? uid('task', 4) : null,
        mode: 'focus',
        started_at: toLocalISO(new Date(addDays(now, -i).setHours(9 + k, 0, 0, 0))),
        duration_sec: 1500,
        completed: 1,
      });
    }
  }

  const filter = {
    id: uid('filter', 1),
    name: 'عاجل هذا الأسبوع',
    icon: '⚡',
    rule: JSON.stringify({
      match: 'all',
      conditions: [
        { field: 'priority', op: 'gt', value: '1' },
        { field: 'status', op: 'equals', value: 'open' },
        { field: 'due_date', op: 'before', value: day(7) + 'T23:59:59' },
      ],
      sortBy: 'due',
    }),
    sort_order: 1,
  };

  const template = {
    id: uid('template', 1),
    name: 'اجتماع أسبوعي',
    payload: JSON.stringify({
      title: 'اجتماع أسبوعي',
      priority: 3,
      duration_min: 60,
      tags: ['اجتماع'],
      checklist: ['جدول الأعمال', 'الحضور', 'المتابعة'],
    }),
  };

  const sticky = {
    id: uid('sticky', 1),
    content: 'أفكار لهذا الأسبوع:\n• تحسين خطة الدراسة\n• مراجعة ميزانية الشهر',
    color: '#ffd66b',
  };

  return { projects, tasks, habits, habitLogs, countdowns, sessions, filter, template, sticky };
}

export function sampleIdPrefix(): string {
  return 'sample-';
}
