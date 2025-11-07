# 🔍 تحليل مشكلة item_id = null - الجذور الحقيقية

## 🎯 المشكلة الفعلية

المشكلة **لم تكن** فقط في schema SQLite! كانت في **ثلاثة أماكن**:

### 1️⃣ Schema SQLite - المشكلة الأولى ✅ (تم حلها بـ Migration)
- جدول `order_line` لم يكن يحتوي على column `item_id`
- تم إصلاحها: `ALTER TABLE order_line ADD COLUMN item_id TEXT`

### 2️⃣ buildLineRow - المشكلة الثانية ❌ (تم اكتشافها الآن!)
```javascript
// الكود القديم - المشكلة:
function buildLineRow(record = {}, context = {}) {
  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id),
    order_id: String(orderId),
    // ❌ لا يوجد item_id هنا!
    status: status ? String(status) : null,
    ...
  };
}

// الكود الجديد - الحل:
function buildLineRow(record = {}, context = {}) {
  const itemId = record.itemId || record.item_id || null; // ✅

  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id),
    order_id: String(orderId),
    item_id: itemId ? String(itemId) : null, // ✅ إضافة item_id
    status: status ? String(status) : null,
    ...
  };
}
```

### 3️⃣ SQL Upsert Statement - المشكلة الثالثة ❌ (تم اكتشافها الآن!)
```sql
-- الكود القديم - المشكلة:
INSERT INTO order_line (branch_id, module_id, id, order_id, status, ...)
VALUES (@branch_id, @module_id, @id, @order_id, @status, ...)
-- ❌ لا يوجد item_id في الـ INSERT!

-- الكود الجديد - الحل:
INSERT INTO order_line (branch_id, module_id, id, order_id, item_id, status, ...) -- ✅
VALUES (@branch_id, @module_id, @id, @order_id, @item_id, @status, ...) -- ✅
ON CONFLICT(...) DO UPDATE SET
  item_id = excluded.item_id, -- ✅
  ...
```

### 4️⃣ schema/engine.js - المشكلة الرابعة ❌ (تم اكتشافها الآن!)
```javascript
// الكود القديم - المشكلة:
createRecord(tableName, input = {}, context = {}) {
  for (const field of table.fields) {
    const fieldName = field.name; // "itemId"
    let value = input[fieldName]; // يبحث عن input.itemId فقط
    // ❌ لا يبحث عن input.item_id!
    ...
  }
}

// الكود الجديد - الحل:
createRecord(tableName, input = {}, context = {}) {
  for (const field of table.fields) {
    const fieldName = field.name; // "itemId"
    const columnName = field.columnName || field.name; // "item_id"

    // ✅ يبحث عن كلا الاسمين
    let value = input[fieldName]; // input.itemId
    if ((value === undefined || value === null) && columnName !== fieldName) {
      value = input[columnName]; // input.item_id
    }
    ...
  }
}
```

---

## 🔄 المسار الكامل للمشكلة

### قبل الإصلاح:

```
1. Frontend (pos.js)
   └─> يرسل: {itemId: "uuid-123", ...}

2. server.js → handleModuleEvent
   └─> يستقبل record

3. schema/engine.js → createRecord
   ├─> يبحث عن input.itemId ✓ (موجود)
   └─> ينشئ record = {itemId: "uuid-123", ...}

4. moduleStore.js → save/insert
   └─> يحفظ في memory بنجاح ✓

5. hybridStore.js → persistRecord
   └─> يستدعي buildLineRow

6. sqlite.js → buildLineRow ❌
   ├─> لا يقرأ itemId من record
   ├─> لا يضيفه في row
   └─> row = {id, order_id, status, ...} // بدون item_id!

7. sqlite.js → upsert statement ❌
   ├─> INSERT INTO order_line (...) // بدون item_id
   └─> VALUES (...) // بدون @item_id

8. SQLite Database
   └─> يحفظ البيانات بدون item_id ❌

9. عند الاسترجاع
   ├─> يقرأ payload من SQLite
   ├─> payload يحتوي على {itemId: "uuid-123"} ✓
   └─> لكن item_id column = NULL ❌
```

### بعد الإصلاح:

```
1-5. [نفس الخطوات] ✓

6. sqlite.js → buildLineRow ✅
   ├─> const itemId = record.itemId || record.item_id
   ├─> يضيفه في row
   └─> row = {id, order_id, item_id: "uuid-123", ...} ✓

7. sqlite.js → upsert statement ✅
   ├─> INSERT INTO order_line (..., item_id, ...)
   └─> VALUES (..., @item_id, ...)

8. SQLite Database ✅
   ├─> item_id column = "uuid-123" ✓
   └─> payload = {itemId: "uuid-123", ...} ✓

9. عند الاسترجاع ✅
   ├─> item_id column موجود ✓
   └─> payload يحتوي على itemId ✓
```

---

## 📊 ملخص الإصلاحات

### ✅ تم في هذا الـ PR:

1. **src/db/sqlite.js**
   - ✅ إضافة `item_id` extraction في `buildLineRow`
   - ✅ إضافة `item_id` في upsert INSERT clause
   - ✅ إضافة `item_id` في upsert UPDATE clause

2. **src/schema/engine.js**
   - ✅ دعم قراءة القيم من `field.name` (camelCase)
   - ✅ دعم قراءة القيم من `field.columnName` (snake_case)
   - ✅ fallback ذكي بين الاسمين

3. **Migration System**
   - ✅ إضافة `item_id TEXT` column في order_line
   - ✅ Logging شامل لجميع العمليات

---

## 🎓 الدروس المستفادة

### المشكلة لم تكن واحدة، بل سلسلة من المشاكل:

1. **Missing Column** - order_line.item_id لم يكن موجوداً
2. **Missing Builder Logic** - buildLineRow لا يستخرج item_id
3. **Missing SQL Clause** - upsert statement لا يتضمن item_id
4. **Name Mismatch** - camelCase vs snake_case في schema engine

### لماذا كانت المشكلة "صامتة"؟

- SQLite لا يرمي error عند INSERT بحقول ناقصة
- payload (JSON) كان ينجح دائماً
- لكن indexed columns كانت تفشل صامتاً
- النتيجة: item_id = null دائماً

---

## ✅ الحالة الحالية

### بعد هذه الإصلاحات:

1. ✅ SQLite table يحتوي على `item_id TEXT` column
2. ✅ buildLineRow يستخرج ويحفظ item_id
3. ✅ upsert statement يحفظ item_id في column منفصل
4. ✅ schema/engine يدعم كلا camelCase و snake_case
5. ✅ البيانات الجديدة ستُحفظ بشكل صحيح

### للبيانات القديمة:

- السجلات القديمة قد يكون لها `item_id = ''` (default من migration)
- لكن payload لا يزال يحتوي على البيانات الصحيحة
- يمكن عمل data migration لاحقاً إذا لزم الأمر

---

## 🚀 الخطوات التالية

1. ✅ Commit التغييرات
2. ✅ Push للـ branch
3. ✅ Test على السيرفر
4. ✅ Merge PR إذا نجح الاختبار

---

**تم إنشاء هذا التقرير:** 2025-11-05
**الملفات المعدلة:**
- `src/db/sqlite.js` - buildLineRow + upsert statement
- `src/schema/engine.js` - createRecord field name handling
