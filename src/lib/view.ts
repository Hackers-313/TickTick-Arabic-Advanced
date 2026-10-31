export type SmartKey = 'today' | 'tomorrow' | 'next7' | 'all' | 'completed' | 'overdue' | 'trash';

export type PageKey =
  | 'calendar'
  | 'kanban'
  | 'timeline'
  | 'matrix'
  | 'habits'
  | 'focus'
  | 'stats'
  | 'countdowns'
  | 'sticky'
  | 'settings'
  | 'sync';

export type View =
  | { kind: 'smart'; key: SmartKey }
  | { kind: 'project'; id: string }
  | { kind: 'filter'; id: string }
  | { kind: 'tag'; name: string }
  | { kind: 'page'; key: PageKey };

export function viewKey(v: View): string {
  if (v.kind === 'smart') return `smart:${v.key}`;
  if (v.kind === 'project') return `project:${v.id}`;
  if (v.kind === 'filter') return `filter:${v.id}`;
  if (v.kind === 'tag') return `tag:${v.name}`;
  return `page:${v.key}`;
}

export function isPage(v: View, key: PageKey): boolean {
  return v.kind === 'page' && v.key === key;
}
