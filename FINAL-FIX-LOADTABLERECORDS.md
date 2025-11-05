# 🎯 المشكلة الحقيقية النهائية - loadTableRecords

## 💥 السبب الجذري الحقيقي

المشكلة **لم تكن** في:
- ❌ Schema SQLite (تم إصلاحه بـ migration)
- ❌ buildLineRow (تم إصلاحه)
- ❌ upsert statement (تم إصلاحه)
- ❌ schema/engine (تم إصلاحه)

المشكلة الحقيقية كانت في: **loadTableRecords**!

---

## 🔴 المشكلة

### الكود القديم:

```javascript
export function loadTableRecords(tableName, context = {}) {
  // ...
  const rows = statements.load.all(...);
  const records = [];
  for (const row of rows) {
    const parsed = JSON.parse(row.payload); // ❌ يقرأ من payload فقط!
    records.push(parsed); // ❌ لا يقرأ من columns المنفصلة!
  }
  return records;
}
```

### SQL Query القديم:

```sql
SELECT payload FROM order_line WHERE ...
-- ❌ يقرأ payload فقط، بدون item_id column!
```

---

## 🔍 لماذا كانت المشكلة مخفية؟

1. **الحفظ كان صحيحاً:**
   - `buildLineRow` يستخرج `item_id` من record ✓
   - `upsert` يحفظه في column منفصل ✓
   - `payload` (JSON) أيضاً يحتوي على البيانات ✓

2. **لكن الاسترجاع كان خاطئاً:**
   - SQL query يقرأ `payload` فقط ❌
   - `loadTableRecords` يرجع payload كما هو ❌
   - `item_id` column **لا يُقرأ أبداً** ❌

3. **النتيجة:**
   - البيانات القديمة في payload كانت بدون itemId
   - البيانات الجديدة تُحفظ في column منفصل
   - لكن عند القراءة، يُرجع payload القديم فقط!
   - **itemId = null** دائماً!

---

## ✅ الحل النهائي

### 1. تعديل SQL Query:

```sql
-- قبل:
SELECT payload FROM order_line WHERE ...

-- بعد:
SELECT item_id, payload FROM order_line WHERE ... ✅
```

### 2. تعديل loadTableRecords:

```javascript
export function loadTableRecords(tableName, context = {}) {
  // ...
  for (const row of rows) {
    const parsed = JSON.parse(row.payload);

    // ✅ دمج item_id من column في parsed record
    if (tableName === 'order_line' && row.item_id != null && row.item_id !== '') {
      parsed.itemId = row.item_id;
      parsed.item_id = row.item_id;
    }

    records.push(parsed);
  }
  return records;
}
```

---

## 🔄 المسار الكامل بعد الإصلاح

### عند الحفظ:
```
1. Frontend → {itemId: "uuid-123", ...}
2. server → handleModuleEvent
3. schema/engine → createRecord (يدعم camelCase + snake_case) ✅
4. moduleStore → save (يحفظ في memory) ✅
5. sqlite → buildLineRow (يستخرج item_id) ✅
6. sqlite → upsert (يحفظ في column + payload) ✅
```

### عند الاسترجاع:
```
1. sqlite → loadTableRecords
2. SQL: SELECT item_id, payload FROM order_line ✅
3. Parse payload JSON ✅
4. Merge item_id from column into parsed ✅
5. Return: {itemId: "uuid-123", item_id: "uuid-123", ...} ✅
```

---

## 📊 الملخص النهائي

### تم إصلاح 5 مشاكل:

1. ✅ **Schema SQLite** - إضافة `item_id TEXT` column
2. ✅ **buildLineRow** - استخراج وحفظ item_id
3. ✅ **upsert statement** - إضافة item_id في INSERT/UPDATE
4. ✅ **schema/engine** - دعم camelCase + snake_case
5. ✅ **loadTableRecords** - قراءة ودمج item_id من column

---

## 🎉 النتيجة المتوقعة

بعد هذه الإصلاحات:
- ✅ itemId سيُحفظ في column منفصل
- ✅ itemId سيُسترجع من column عند القراءة
- ✅ البيانات القديمة والجديدة ستعمل بشكل صحيح
- ✅ لن ترى `[POS] Skipping line without item id` بعد الآن

---

**ملف معدل:**
- `src/db/sqlite.js`
  - loadTableRecords: دمج item_id من column
  - SQL query: SELECT item_id, payload

**التاريخ:** 2025-11-05
**الحالة:** ✅ جاهز للاختبار
