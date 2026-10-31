# البنية المعمارية / Architecture

## 1. نظرة عامة

```
┌─────────────────────────────────────────────────────────────┐
│ Renderer (React 19 + TypeScript)                            │
│  src/views/*  src/components/*  src/store.tsx  src/lib/*     │
│  - لا وصول مباشر إلى Node أو الملفات                         │
│  - كل العمليات عبر window.api.invoke(...)                    │
└───────────────────────────┬─────────────────────────────────┘
                            │ contextBridge + IPC ('api')
┌───────────────────────────▼─────────────────────────────────┐
│ Preload (electron/preload/index.ts)                         │
│  invoke(method, ...args)  ·  on(channel, listener)           │
│  قائمة قنوات أحداث مسموحة فقط                                │
└───────────────────────────┬─────────────────────────────────┘
                            │ ipcRenderer.invoke('api')
┌───────────────────────────▼─────────────────────────────────┐
│ Main process (electron/main/*)                              │
│  index.ts      تسجيل IPC، النافذة، دورة الحياة               │
│  repo.ts       عمليات البيانات + Undo/Redo                   │
│  db.ts         SQLite (node:sqlite) + مخطط + معاملات          │
│  dataService   استيراد/تصدير/بيانات تجريبية/إزالة تكرار       │
│  backup.ts     نسخ/استرجاع/فحص صلاحية                        │
│  sync.ts       OAuth2 + مزامنة + تعارضات + DPAPI              │
│  scheduler.ts  تذكيرات كل 15 ثانية                           │
│  localApi.ts   REST على 127.0.0.1 مع Bearer                   │
│  settings.ts   إعدادات + دمج عميق                             │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│ Shared (منطق نقي قابل للاختبار)                              │
│  types.ts date.ts recurrence.ts filters.ts habits.ts         │
│  stats.ts importExport.ts i18n.ts sample.ts                  │
└─────────────────────────────────────────────────────────────┘
```

## 2. مسار الطلب

1. مكوّن React يستدعي `call('tasks.create', input)` أو `invoke(...)`.
2. `window.api.invoke` (preload) يرسل `ipcRenderer.invoke('api', method, args)`.
3. `ipcMain.handle('api')` في العملية الرئيسية يستدعي `handle(method, args)`.
4. `handle` يوجّه إلى `repo` / `dataService` / `sync` / `backup` / `localApi`.
5. النتيجة تُعاد كـ `{ ok, data }` أو `{ ok: false, error }`؛ الـ preload يرمي خطأً عند الفشل.
6. الواجهة تستدعي `refresh()` لجلب `bootstrap()` كاملًا (حزمة واحدة لكل الشرائح).

الأحداث من الرئيسية إلى الواجهة:
- `reminders:fired` — تذكيرات مستحقة.
- `app:open-entity` — فتح مهمة من مصدر خارجي.
- `sync:status` — حالة المزامنة.
- `settings:changed` / `data:changed` — تحديث فوري عند تغيير الإعدادات من مصدر آخر (مثل الـ API المحلي).

## 3. قاعدة البيانات

- الملف: `%APPDATA%\TickTick Arabic Advanced\ticktick-arabic.db` (أو `TTA_USER_DATA` في الاختبار).
- المحرك: `node:sqlite` (`DatabaseSync`)، WAL، مفاتيح أجنبية مفعّلة.
- المخطط v1 مع `user_version` وترحيلات متتابعة.
- المعاملات متداخلة عبر Savepoints (`txDepth` / `savepointSeq`).

الجداول (18):

| المجموعة | الجداول |
|---|---|
| المهام | `projects`, `tasks`, `checklist_items`, `attachments`, `reminders` |
| التنظيم | `tags`, `filters`, `task_templates` |
| العادات | `habits`, `habit_logs` |
| التركيز | `focus_sessions` |
| إضافات | `countdowns`, `sticky_notes`, `calendar_events` |
| النظام | `settings`, `sync_log`, `sync_conflicts`, `undo_log` |

كل التواريخ تُخزَّن كـ ISO محلي بلا منطقة زمنية: `YYYY-MM-DDTHH:mm:ss`.

## 4. التراجع والإعادة

- `repo.pushUndo(label, undoOps, redoOps)` يسجّل العملية مع الحالة المعاكسة.
- `undo()` ينفّذ العمليات العكسية ويضع العملية في `redoStack` (ذاكرة).
- `redo()` يعيد التنفيذ؛ أي تعديل جديد يمسح `redoStack`.
- مفاتيح: `Ctrl+Z` / `Ctrl+Shift+Z`.

## 5. المزامنة

```
الواجهة → sync.connect → خادم HTTP محلي لاستقبال code
        → exchangeCode (Basic client_id:client_secret)
        → saveTokens (safeStorage/DPAPI) → fetchAccount → runSync('initial')
runSync:
  autoBackup(...,'pre-sync')
  GET /open/v1/project + /project/{id}/data
  دمج وارد (افتراضي) أو ثنائي الاتجاه
  كشف التعارضات → sync_conflicts
  حذف بعيد → حذف محلي ناعم
  تحديث last_sync_at + sync_log
```

- إعادة المحاولة عند 401 عبر `refreshAccessToken`.
- قطع الاتصال: حذف `secrets.bin` + تعطيل المزامنة، مع إبقاء البيانات المحلية.

## 6. الأمان

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox` افتراضي.
- CSP للواجهة: `'self'` فقط.
- لا تحميل موارد خارجية.
- الروابط الخارجية تُفتح في المتصفح الافتراضي فقط (`https://`).
- الرموز مشفّرة بـ DPAPI، والـ API المحلي يستمع على `127.0.0.1` فقط ويطلب Bearer token.

## 7. الواجهة

- `store.tsx` يحمل `bootstrap` كاملًا، اللغة، الاتجاه، الثيم، والعمليات المشتركة.
- `App.tsx` يطبّق `dir`, `lang`, `data-theme`, `dense`، ويُسجّل اختصارات لوحة المفاتيح.
- CSS واحد (`src/styles.css`) بمتغيرات لكل ثيم + قواعد RTL/LTR.
- 12 صفحة في `src/views/` و10 مكوّنات في `src/components/`.

## 8. الاختبار

- Vitest للمنطق النقي والطبقة الرئيسية (105 اختبارًا).
- Playwright `_electron` لفحص التطبيق الحقيقي (30 فحصًا).
- سكربتات ثابتة للتحقق من مفاتيح i18n وربط IPC.
- فحوصات منفصلة للنسخة المحزومة والمثبّت.
