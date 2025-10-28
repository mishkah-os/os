# Mishkah WS2 Gateway | بوابة مشكاة WS2

## English

### Overview
Mishkah WS2 Gateway is a Node.js 18+ HTTP and WebSocket service that mounts schema-driven modules per branch, persists their data on disk, and exposes health, metrics, and synchronization APIs for POS experiments.【F:src/server.js†L1-L127】【F:data/modules.json†L1-L60】【F:data/branches.config.json†L3-L23】【F:src/server.js†L4249-L4393】 Branch definitions and table manifests are loaded from the `data/` directory so that new branches automatically inherit the correct module seeds and live stores.【F:data/modules.json†L1-L60】【F:data/branches.config.json†L3-L23】 Optional Prometheus counters track HTTP, WebSocket, and AJAX activity for observability when running the gateway in testing or production-like environments.【F:src/server.js†L57-L102】【F:src/server.js†L4254-L4274】

### Backend highlights
- **Schema-first records.** The schema engine normalizes field types, generates IDs and timestamps, and builds default datasets so each module starts from a predictable structure.【F:src/schema/engine.js†L4-L154】
- **Robust module store.** Each `ModuleStore` manages versioning, metadata counters, and CRUD helpers that respect schema rules while keeping live data in memory and on disk.【F:src/moduleStore.js†L3-L199】
- **File-backed event sourcing.** Mutations are appended to structured JSONL logs with rotating metadata, enabling replay, archiving, and downstream synchronization workflows.【F:src/eventStore.js†L1-L199】
- **HTTP + WebSocket gateway.** REST endpoints deliver schema, state, and sync APIs while the WebSocket layer greets clients with `server:hello` and routes actions through schema-aware handlers.【F:src/server.js†L4249-L4439】

### Mishkah front-end library
- **Auto-loader script.** `static/lib/mishkah.js` discovers its base path, loads utilities, core, UI, HTMLx, and optional Tailwind-compatible bundles sequentially, and injects CSS for the active theme automatically.【F:static/lib/mishkah.js†L1-L188】
- **Design system tokens & components.** `mishkah-ui.js` defines Tailwind utility shortcuts, buttons, cards, overlays, charts, and toast patterns so POS dashboards share one design language.【F:static/lib/mishkah-ui.js†L1-L120】
- **Ready-made dashboards.** `static/quick.html` ships a bilingual quick dashboard template that uses Mishkah HTMLx components, theme switches, and simulated analytics data for instant demos.【F:static/quick.html†L1-L120】
- **Starter index app.** `static/index.html` demonstrates how to assemble Mishkah apps, templates, and typography helpers for richer marketing or documentation pages.【F:static/index.html†L1-L44】

### Quick access (EN)
| Task | How | Notes |
| --- | --- | --- |
| Install dependencies | `npm install` | Installs the Node runtime packages declared for the gateway server.【F:package.json†L1-L15】 |
| Start development server | `npm run dev` | Launches `node ./src/server.js` with development caching and verbose logs.【F:package.json†L7-L10】 |
| Fetch module schema snapshot | `curl "http://localhost:3200/api/schema?branch=dar&module=pos&include=schema,seed,live"` | Returns schema, seed, and live payloads for a branch/module pair.【F:src/server.js†L4289-L4353】 |
| Check health probe | `curl http://localhost:3200/healthz` | Confirms the server ID and timestamp for readiness checks.【F:src/server.js†L4279-L4281】 |
| Scrape Prometheus metrics | `curl http://localhost:3200/metrics` | Streams counters for HTTP, WebSocket, and AJAX events.【F:src/server.js†L4254-L4274】 |
| Explore static starter | Open `static/index.html` in the browser | Loads the bundled Mishkah apps, templates, and typography helpers.【F:static/index.html†L1-L44】 |
| Try the quick dashboard | Open `static/quick.html` in the browser | Uses Mishkah auto-loader, HTMLx templates, and theme toggles out of the box.【F:static/quick.html†L1-L44】 |
| Embed Mishkah UI elsewhere | `<script src="/lib/mishkah.js" data-css="mishkah"></script>` | Auto-imports utils, core, UI, HTMLx, and optional Tailwind-compatible CSS tokens.【F:static/lib/mishkah.js†L1-L188】 |

---

## العربية

### نظرة عامة
بوابة مشكاة WS2 هي خدمة Node.js تجمع بين HTTP وWebSocket وتحمّل وحدات البيانات حسب الفرع، وتخزنها على القرص، وتوفر واجهات صحة، ومقاييس، وتزامن لتجارب نقاط البيع.【F:src/server.js†L1-L127】【F:data/modules.json†L1-L60】【F:data/branches.config.json†L3-L23】【F:src/server.js†L4249-L4393】 يتم سحب تعريفات الفروع وجداولها من مجلد `data/` لكي يحصل كل فرع جديد على البذور والبيانات الحية المناسبة تلقائياً.【F:data/modules.json†L1-L60】【F:data/branches.config.json†L3-L23】 كما يمكنك تفعيل مقاييس Prometheus الاختيارية لمتابعة حركة HTTP وWebSocket وطلبات AJAX أثناء الاختبارات أو النشر التجريبي.【F:src/server.js†L57-L102】【F:src/server.js†L4254-L4274】

### أبرز خصائص الخلفية
- **سجلات مبنية على المخطط.** محرك المخططات يقوم بتطبيع الأنواع، وتوليد المعرّفات والطوابع الزمنية، وبناء مجموعات البيانات الافتراضية لكل جدول.【F:src/schema/engine.js†L4-L154】
- **مخزن وحدات موثوق.** يتولّى `ModuleStore` إدارة الإصدارات، والعدادات الوصفية، وعمليات CRUD مع احترام قواعد المخطط والبيانات الحية.【F:src/moduleStore.js†L3-L199】
- **تتبع أحداث على شكل ملفات.** يتم تسجيل كل عملية تعديل في ملفات JSONL مع بيانات وصفية دوّارة لدعم إعادة التشغيل والأرشفة ومسارات التزامن اللاحقة.【F:src/eventStore.js†L1-L199】
- **بوابة HTTP وWebSocket.** واجهات REST تعيد المخططات والحالات، بينما قناة WebSocket ترسل `server:hello` وتدير الأوامر بحسب قواعد المخطط.【F:src/server.js†L4249-L4439】

### مكتبة مشكاة للواجهة الأمامية
- **محمل تلقائي.** الملف `static/lib/mishkah.js` يحدد مسار التحميل ويجلب ملفات الأدوات والنواة وواجهة المستخدم وHTMLx وتكامل Tailwind ويضيف ملفات الأنماط تلقائياً.【F:static/lib/mishkah.js†L1-L188】
- **نظام تصميم جاهز.** `mishkah-ui.js` يعرّف رموز Tailwind المختصرة، والأزرار، والبطاقات، والنوافذ، ومكونات الرسوم البيانية والتنبيهات لتوحيد مظهر لوحات التحكم.【F:static/lib/mishkah-ui.js†L1-L120】
- **قوالب جاهزة للعرض.** `static/quick.html` يوفر لوحة تحكم ثنائية اللغة مع HTMLx وتبديل السمات وبيانات تحليلية محاكاة لعرض سريع.【F:static/quick.html†L1-L120】
- **تطبيق تمهيدي.** `static/index.html` يوضح كيفية تجميع تطبيقات مشكاة والقوالب وخطوط العرض في صفحة واحدة.【F:static/index.html†L1-L44】

### وصول سريع (AR)
| المهمة | الطريقة | ملاحظات |
| --- | --- | --- |
| تثبيت الاعتماديات | `npm install` | يجلب حزم الخادم المحددة في إعدادات المشروع.【F:package.json†L1-L15】 |
| تشغيل وضع التطوير | `npm run dev` | يشغّل `node ./src/server.js` مع إعدادات التطوير والسجلات التفصيلية.【F:package.json†L7-L10】 |
| جلب مخطط وحدة | `curl "http://localhost:3200/api/schema?branch=dar&module=pos&include=schema,seed,live"` | يعيد المخطط والبذور والبيانات الحية لفرع ووحدة محددين.【F:src/server.js†L4289-L4353】 |
| فحص الصحة | `curl http://localhost:3200/healthz` | يؤكد هوية الخادم والطابع الزمني للاستعداد.【F:src/server.js†L4279-L4281】 |
| قراءة مقاييس Prometheus | `curl http://localhost:3200/metrics` | يرسل العدادات الخاصة بـ HTTP وWebSocket وAJAX للمراقبة.【F:src/server.js†L4254-L4274】 |
| استعراض الصفحة التمهيدية | افتح `static/index.html` | يستعرض تطبيقات مشكاة، والقوالب، ومساعدي الخطوط في الواجهة الأمامية.【F:static/index.html†L1-L44】 |
| تجربة لوحة القياس السريعة | افتح `static/quick.html` | تعرض HTMLx ومبدلات اللغة/السمة وبيانات تحليلية فورية.【F:static/quick.html†L1-L44】 |
| تضمين مكتبة مشكاة | `<script src="/lib/mishkah.js" data-css="mishkah"></script>` | يجلب الأدوات والنواة وواجهة المستخدم وHTMLx وCSS الداعمة تلقائياً.【F:static/lib/mishkah.js†L1-L188】 |

