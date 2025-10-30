# إصلاح مشكلة زر Reset Orders - دعم جدول pos_shift

## المشكلة
بعد الانتقال من نظام الذاكرة فقط (memory-only) إلى HybridStore مع SQLite، كان جدول `pos_shift` غير مُدار في قاعدة البيانات. هذا أدى إلى أن زر "Reset Orders" في شاشة التمويل لا يقوم بمسح بيانات المناوبات (shifts) بشكل صحيح.

## الحل
تم إضافة دعم كامل لجدول `pos_shift` في SQLite مع إمكانية الأرشفة والاستعادة.

## خطوات الإصلاح

### 1. إعادة تشغيل الخادم (مطلوب)
**مهم جداً:** يجب إعادة تشغيل خادم Node.js لتطبيق التغييرات:

```bash
# أوقف الخادم الحالي
# ثم أعد تشغيله
npm start
# أو
node src/server.js
```

عند إعادة التشغيل، سيتم تلقائياً:
- إنشاء جدول `pos_shift` في SQLite
- إضافة الفهارس (indexes) المناسبة
- تفعيل دعم الأرشفة والتنظيف

### 2. تشغيل Migration للبيانات الموجودة (اختياري)
إذا كانت هناك بيانات `pos_shift` موجودة في ملفات JSON ولم تُنقل إلى SQLite، قم بتشغيل:

```bash
# للتحقق من ما سيتم فعله (dry run)
node scripts/migrate-pos-shift.js --dry-run

# لتنفيذ الهجرة فعلياً
node scripts/migrate-pos-shift.js
```

الـ script سيقوم بـ:
- التحقق من وجود جدول `pos_shift` في SQLite
- إنشائه إذا لم يكن موجوداً
- البحث عن بيانات `pos_shift` في ملفات JSON لكل فرع
- نقل البيانات إلى SQLite

### 3. التحقق من عمل الزر

1. افتح شاشة التمويل: `http://localhost:3000/pos/pos_finance.html?brname=dar`
2. اضغط على زر "Reset Orders" / "إعادة ضبط الطلبات"
3. أدخل الكود: `114477`
4. تحقق من النتائج

**النتيجة المتوقعة:**
- رسالة نجاح مع عدد السجلات المحذوفة
- جداول Order Headers, Order Lines, Order Payments, و **POS Shifts** كلها تم تنظيفها
- البيانات تم أرشفتها في: `data/branches/{branchId}/modules/pos/history/purge/`

### 4. التحقق من تنظيف البيانات في المتصفح
إذا كانت البيانات لا تزال تظهر في المتصفح بعد Reset:

1. **افتح أدوات المطور** (F12)
2. اذهب إلى تبويب **Application** (أو Storage)
3. تحت **IndexedDB**, ابحث عن قاعدة البيانات الخاصة بـ POS
4. تحقق من الجداول: `order_header`, `order_line`, `order_payment`, `pos_shift`

**للتنظيف اليدوي من المتصفح:**
```javascript
// في Console
window.__POS_DB__.clear('order_header');
window.__POS_DB__.clear('order_line');
window.__POS_DB__.clear('order_payment');
window.__POS_DB__.clear('pos_shift');
```

أو ببساطة:
- **امسح بيانات الموقع** (Clear site data) من DevTools
- **أعد تحميل الصفحة** (Ctrl/Cmd + Shift + R)

## التغييرات التقنية

### ملفات تم تعديلها:

1. **`src/db/sqlite.js`**
   - إضافة `pos_shift` إلى `DEFAULT_TABLES`
   - إنشاء schema جدول `pos_shift` مع الفهارس
   - إضافة `buildShiftRow()` لتحويل السجلات
   - إضافة SQL statements لـ pos_shift

2. **`src/tasks/hybridStoreTasks.js`**
   - إضافة `pos_shift` إلى `PERSISTED_TABLES`

3. **`scripts/migrate-pos-shift.js`** (جديد)
   - Script لهجرة البيانات الموجودة

## كيف يعمل النظام الآن

### عند الضغط على Reset Orders:

1. **الأرشفة التلقائية**:
   - يتم حفظ جميع السجلات من الجداول الأربعة
   - المسار: `data/branches/{branchId}/modules/pos/history/purge/{timestamp}_{id}.json`
   - يحتوي على metadata كاملة + عينة من السجلات

2. **التنظيف**:
   - مسح من الذاكرة (in-memory)
   - مسح من SQLite (persistent)
   - مسح من IndexedDB (frontend)
   - البث عبر WebSocket لجميع العملاء المتصلين

3. **إمكانية الاستعادة**:
   - API: `GET /api/manage/purge-history?branch={branchId}&module=pos`
   - يمكن استعادة البيانات من الأرشيف لاحقاً

## استعراض الأرشيف

للحصول على قائمة بجميع عمليات التنظيف السابقة:

```bash
GET /api/manage/purge-history?branch=dar&module=pos
```

**الاستجابة:**
```json
{
  "branchId": "dar",
  "moduleId": "pos",
  "entries": [
    {
      "id": "...",
      "createdAt": "2025-10-30T12:00:00.000Z",
      "reason": "finance-reset",
      "requestedBy": "finance-ui",
      "totalRecords": 150,
      "tables": [
        { "name": "order_header", "count": 45 },
        { "name": "order_line", "count": 89 },
        { "name": "order_payment", "count": 12 },
        { "name": "pos_shift", "count": 4 }
      ]
    }
  ]
}
```

## استكشاف الأخطاء

### البيانات لا تزال موجودة بعد Reset

**أسباب محتملة:**

1. **الخادم لم يتم إعادة تشغيله**
   - الحل: أعد تشغيل الخادم

2. **جدول pos_shift غير موجود في SQLite**
   - الحل: شغل migration script: `node scripts/migrate-pos-shift.js`

3. **المتصفح يحتفظ ببيانات قديمة في IndexedDB**
   - الحل: امسح بيانات الموقع أو أعد تحميل بـ Hard Refresh

4. **خطأ في الاتصال بالسيرفر**
   - تحقق من Console في DevTools
   - ابحث عن أخطاء في طلب `/api/manage/purge-live-data`

### فحص سجلات الخادم

عند نجاح عملية Reset، يجب أن ترى في السجلات:

```
[INFO] Purged module transaction tables: { branchId: 'dar', moduleId: 'pos', tables: [...], totalRemoved: 150 }
```

إذا رأيت أخطاء مثل:
```
[WARN] Failed to purge module live data
```

تحقق من:
- وجود جدول `pos_shift` في SQLite: `sqlite3 data/hybrid-store.sqlite "SELECT name FROM sqlite_master WHERE type='table' AND name='pos_shift'"`
- صلاحيات الكتابة على ملف SQLite

## الجداول المُدارة في SQLite

بعد التحديث، الجداول التالية يتم إدارتها في SQLite مع أرشفة تلقائية:

1. ✅ `order_header` - رؤوس الطلبات
2. ✅ `order_line` - سطور الطلبات
3. ✅ `order_payment` - مدفوعات الطلبات
4. ✅ `pos_shift` - مناوبات الكاشير ⬅️ **جديد**

جميع هذه الجداول الآن:
- يتم حفظها في SQLite للبقاء (persistence)
- يتم تخزينها مؤقتاً في الذاكرة (caching)
- يتم أرشفتها قبل الحذف (archiving)
- يمكن استعادتها من الأرشيف (restoration)

## الدعم الفني

إذا استمرت المشكلة بعد اتباع هذه الخطوات:

1. تحقق من السجلات (logs) في الخادم
2. افحص قاعدة بيانات SQLite:
   ```bash
   sqlite3 data/hybrid-store.sqlite
   .tables
   SELECT COUNT(*) FROM pos_shift;
   ```
3. تحقق من IndexedDB في المتصفح (DevTools > Application > IndexedDB)
4. أرسل تفاصيل الخطأ مع:
   - سجلات الخادم
   - رسائل Console من المتصفح
   - نتائج migration script
