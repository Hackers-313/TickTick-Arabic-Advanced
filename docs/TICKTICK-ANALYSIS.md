# تحليل TickTick والواجهات الرسمية / TickTick analysis

## 1. الهدف والنطاق

الهدف: فهم نموذج بيانات TickTick وميزاته لبناء تطبيق مستقل يعمل محليًا، مع مزامنة اختيارية عبر الواجهة الرسمية فقط.

**حدود التزام أخلاقي/قانوني:**
- لم يُجرَ أي تعديل على ترخيص TickTick أو كسره.
- لم تُقرأ بيانات المستخدم الشخصية (لا صفوف مهام، ولا ملاحظات، ولا حسابات).
- لم تُستخدم رموز أو ملفات تعريف ارتباط أو جلسات تطبيق TickTick المثبّت.
- لا يوجد استدعاء لأي واجهة غير رسمية.

## 2. الهدف الذي جرى فحصه

| العنصر | القيمة |
|---|---|
| التطبيق | TickTick for Windows (WPF) |
| المسار | `%LOCALAPPDATA%\Programs\TickTick\` (حسب التثبيت) |
| `TickTick.exe` | الإصدار **8.2.4.0**، x64 |
| SHA-256 | `a9818f42…19d6` (تم التحقق) |
| التقنية | .NET Framework 4.6.2 + WPF + WebView2 |
| مكتبات مساعدة | `TickTickDao.dll` (طبقة البيانات)، `TickTickModels.dll` (النماذج) |
| قاعدة البيانات | `%APPDATA%\Tick_Tick\TickTick.db` (SQLite) |

### المنهجية
1. فحص بيانات PE/الإصدار والتوقيع للملفات التنفيذية.
2. جرد مكتبات .NET وأسماء الأنواع العامة.
3. استخراج **مخطط** قاعدة SQLite فقط: أسماء الجداول، الأعمدة، الفهارس (`PRAGMA table_info` / `sqlite_master`).
4. عدم قراءة أي صفوف أو قيم من جداول المستخدم.
5. مقارنة النموذج الناتج مع الميزات المعلنة على `ticktick.com`.
6. التحقق من نقاط النهاية العامة لـ OAuth/API بطلبات مجهولة (بدون حساب).

الناتج الخام محفوظ في `../_analysis/ticktick_schema.json` (76 جدولًا + الفهارس).

## 3. نموذج البيانات المستخرج (76 جدولًا)

أهم المجموعات:

| المجموعة | الجداول |
|---|---|
| المهام | `TaskModel`, `TaskDetailItemModel`, `TaskReminderModel`, `ReminderTimeModel`, `ReminderDelayModel`, `TaskTemplateModel`, `TaskStickyModel`, `TaskSortOrder*` |
| المشاريع | `ProjectModel`, `ProjectGroupModel`, `ColumnModel`, `SectionStatusModel`, `ArrangeSectionStatusModel` |
| الوسوم والفلاتر | `TagModel`, `TagSortTypeModel`, `FilterModel`, `SearchHistoryModel` |
| العادات | `HabitModel`, `HabitCheckInModel`, `HabitRecordModel`, `HabitSectionModel`, `SkipHabitModel`, `HabitWidgetModel` |
| التركيز | `PomodoroModel`, `PomodoroSummaryModel`, `PomoTask`, `TimerModel`, `TimerStatisticsModel`, `FocusOptionModel` |
| التقويم | `CalendarEventModel`, `AttendModel`, `BindCalendarModel`, `CalendarSubscribeProfileModel`, `HolidayModel`, `LocationModel` |
| العدّادات والودجات | `CountdownModel`, `CountdownWidgetModel`, `CalendarWidgetModel`, `WidgetSettingModel` |
| المزامنة | `SyncStatusModel`, `SyncSortOrderModel`, `*SyncedJsonModel` |
| النظام | `SettingsModel`, `UserModel`, `UserInfoModel`, `LimitsModel`, `AppLockModel`, `WindowModel`, `TempDataModel` |

**ملاحظات تصميمية مستخلصة:**
- المهام مرتبطة بمشروع، وقد تكون فرعية (`parentId`)، ولها حالة، أولوية، تواريخ، تكرار، ووسوم.
- التذكيرات جدول مستقل متعدد لكل مهمة (يتوافق مع دعم عدة تذكيرات).
- لوحات كانبان أعمدة قابلة للضبط (`ColumnModel`) وليست ثابتة.
- العادات لها سجلات يومية مستقلة (`HabitCheckInModel`) مع قيمة/هدف.
- جلسات التركيز مرتبطة اختياريًا بمهمة (`PomoTask`).
- العدّادات كيانات مستقلة قابلة للتكرار السنوي.
- الإعدادات مخزّنة كـ JSON داخل `SettingsModel`.

هذا النموذج انعكس مباشرة على مخطط التطبيق المحلي (18 جدولًا مبسّطًا) في `docs/ARCHITECTURE.md`.

## 4. الميزات المستهدفة (من الموقع الرسمي)

- قوائم ذكية: Today / Tomorrow / Next 7 days / Inbox / Completed.
- مشاريع، مهام فرعية، قوائم تحقق، وسوم، أولويات.
- تكرار متقدم وتذكيرات متعددة.
- تقويم (يوم/أسبوع/شهر/سنة/أجندة) وكانبان ومخطط زمني ومصفوفة أيزنهاور.
- عادات مع سلاسل وخريطة حرارية.
- مؤقت بومودورو وإحصاءات إنتاجية.
- عدّادات تنازلية وملاحظات لاصقة.
- ثيمات، وضع كثيف، اختصارات، بحث، قوالب.
- مزامنة سحابية عبر حساب TickTick.

كل ما سبق منفّذ محليًا باستثناء ما ورد في `docs/FEATURES.md` (تعاون، تقويم سحابي، AI، إلخ).

## 5. الواجهات الرسمية التي تم التحقق منها

| العنوان | النتيجة |
|---|---|
| `https://api.ticktick.com/open/v1` | **401** بدون رمز (متوقع) |
| `https://ticktick.com/oauth/authorize` | **200** |
| `https://ticktick.com/oauth/token` | **401** بدون بيانات (متوقع) |

التدفق المنفّذ:
1. `GET /oauth/authorize?client_id=…&redirect_uri=…&response_type=code&scope=tasks:read tasks:write&state=…`
2. استقبال `code` على خادم محلي `127.0.0.1`.
3. `POST /oauth/token` مع `Authorization: Basic base64(client_id:client_secret)` و`grant_type=authorization_code`.
4. تخزين `access_token` / `refresh_token` مشفّرين.
5. `GET /open/v1/project` و`GET /open/v1/project/{projectId}/data`.
6. عند الحاجة: `POST /open/v1/task` و`POST /open/v1/task/{taskId}` (للاتجاه الثنائي).

**لم يُختبر التدفق بحساب حقيقي** لعدم توفر `client_id`/`client_secret`. التفاصيل في `docs/TEST-REPORT.md` قسم 6.

## 6. ما لم يُفعل

- لم يُفكّك منطق الترخيص أو الحماية.
- لم تُقرأ قاعدة بيانات المستخدم أو تُنسخ.
- لم تُستخدم واجهات ويب داخلية غير موثّقة.
- لم تُحلّل الشيفرة المصدرية لـ TickTick (متاحة فقط كـ .NET assemblies) بشكل يستخرج أسرارًا أو مفاتيح.
- لم يُختبر أي سلوك يتطلب حسابًا مدفوعًا (Premium).

## 7. الخلاصة

تحليل المخطط والواجهات العامة كفى لبناء نموذج مهام/عادات/تركيز/تقويم مطابق وظيفيًا، مع الالتزام الكامل بالخصوصية وعدم المساس بالترخيص. الميزات المتقدمة في هذا المشروع مجانية ومحلية بالكامل، والمزامنة اختيارية وتستخدم OAuth الرسمي فقط.
