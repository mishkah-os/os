# AGENTS.md
## Working rules
- Do NOT include binary media files in PRs with code changes.
- If media assets are needed, create TWO PRs:
  1) PR A: assets-only (static/assets/broker/*)
  2) PR B: code/config-only (no binaries)
- When opening a PR, ensure the diff contains no *.png, *.jpg, *.jpeg, *.webp files.
- If binaries are present, commit them on a separate branch and open an assets-only PR first.

## قواعد عمل مشكاة (Schema Driven)
- اقرأ جميع ملفات التوثيق (`docs/**/*.md`, `README.md`, ملفات المشاريع في `examples` و `projects`) قبل تنفيذ أي تعديل؛ لا تكتب كود بدون فهم المخطط العام لـ Mishkah Core وواجهاتها.
- الخلفية في `src/service.js` تتعامل مع المخططات فقط: أي CRUD أو منطق جديد يجب أن يُبنى على المخطط المحدد والجداول المزروعة في `data/seeds`؛ لا تُدخل بيانات ثابتة في الكود.
- الواجهة الأمامية تعتمد كليًا على Mishkah DSL/Store (مثل `mishkah.js`, `mishkah-core`, `mishkah-ui`, `mishkah-util`, وواجهات `htmlx`):
  - ممنوع منعًا باتًا تعريف أو إعلان متغيرات بيانات محلية لملء الواجهات؛ القراءة تكون دائمًا من مفاتيح الـ schema التي توفرها الـ store.
  - أي كتابة تتم فقط عبر عمليات `insert/update/delete/watch/list` لـ `mishkah-store simple` مع الالتزام بالإصدارات (versioned updates) وعدم تجاوز طبقة التخزين.
  - فضّل توليد السجلات عبر `createAuto` والعمل مع الجداول ديناميكيًا بكود مختصر.
  - احرص على أن تكون الصفحات والجداول داعمة لـ i18n من خلال المفاتيح المعتمدة في المخطط.
- التزم بتصنيف الـ Atoms بالـ class المناسب واحترام `Mishkah.DSL` عند بناء الواجهات؛ لا تخلط بين الفئات أو تكتب HTML خام إلا للضرورة القصوى.
- تعامل مع تطبيق `brockers` كنموذج مرجعي لفهم التدفق schema-driven بين الأمام والخلف، وراجعه قبل بناء أي تدفق مشابه.
- أي بيانات جديدة تُضاف في ملفات البذور (`data/seeds`) فقط، ثم تُستهلك عبر المخطط؛ لا تزرع بيانات عبر الكود المباشر.
- تجنب تضخيم الكود: ابحث عن مكونات/دوال موجودة في Mishkah قبل إنشاء أخرى جديدة، وأعد استخدامها كلما أمكن.
