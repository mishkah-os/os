# النظام الديناميكي الكامل للـ CRUD

## المشكلة القديمة 🔴

### في الـ Front-end (pos.js):
```javascript
// ❌ إنشاء يدوي لكل object - فرصة كبيرة للخطأ
function createOrderLine(item, qty) {
  const baseLine = {
    id: uniqueId,
    itemId: String(item.id),      // كتابة يدوية
    item_id: String(item.id),     // تكرار
    name: item.name,              // كتابة يدوية
    quantity: qty,                // كتابة يدوية
    unitPrice: item.price,        // كتابة يدوية
    // ... عشرات الحقول الأخرى
  };
  return baseLine;
}

// المشكلة: إذا نسيت حقل → خطأ صامت
// المشكلة: إذا تغير الـ schema → يجب تعديل الكود
// المشكلة: كل table يحتاج function مختلف
```

### في الـ Back-end (sqlite.js):
```javascript
// ❌ SQL يدوي لكل table
function buildLineRow(record) {
  return {
    branch_id: record.branchId,
    module_id: record.moduleId,
    id: record.id,
    order_id: record.orderId,
    item_id: record.itemId,      // ❌ سهل النسيان
    // ...
  };
}

// SQL statement يدوي
const sql = `
  INSERT INTO order_line (
    branch_id, module_id, id, order_id, item_id, ...
  ) VALUES (
    @branch_id, @module_id, @id, @order_id, @item_id, ...
  )
`;

// المشكلة: 150+ سطر لكل table
// المشكلة: إذا أضفت 100 table → 15,000 سطر!
// المشكلة: أخطاء صامتة عند نسيان حقل
```

---

## الحل الجديد ✅ - نظام ديناميكي بالكامل

### 1️⃣ الـ Schema هو مصدر الحقيقة الوحيد

كل شيء يُقرأ من `definition.json`:

```json
{
  "name": "order_line",
  "fields": [
    {
      "name": "itemId",
      "columnName": "item_id",
      "type": "string",
      "references": {
        "table": "menu_item",
        "column": "item_id"
      }
    }
  ]
}
```

### 2️⃣ معالجة ذكية للـ Foreign Keys

**البنية الموحدة:**
- **FK fields**: تُمثل كـ `{id: '123', name: 'Pizza'}` في الـ front-end
- **عند الحفظ**: النظام يستخرج الـ `id` فقط تلقائياً
- **عند القراءة**: النظام يملأ الـ `{id, name}` تلقائياً من الجدول المرجعي

**مثال:**

```javascript
// ✅ في الـ Front-end
const orderLine = {
  id: 'ln-001',
  itemId: {id: 'item-123', name: 'Pizza'},  // FK كـ object
  quantity: 2,
  unitPrice: 50
};

// عند الحفظ → يحفظ itemId = 'item-123' فقط
await save('order_line', orderLine);

// عند القراءة → يعيد:
{
  id: 'ln-001',
  itemId: {id: 'item-123', name: 'Pizza'},  // ✅ Auto-populated!
  quantity: 2,
  unitPrice: 50
}
```

---

## الملفات الجديدة 📁

### 1. `src/schema/fk-resolver.js`

**الوظيفة:** معالجة ذكية للـ Foreign Keys

**الدوال الرئيسية:**

#### `normalizeRecordForSave(schemaEngine, tableName, record)`
- يستدعى **قبل الحفظ**
- يستخرج الـ `id` من FK objects
- مثال: `{id: '123', name: 'Pizza'}` → `'123'`

```javascript
// قبل:
{
  itemId: {id: '123', name: 'Pizza'},
  quantity: 2
}

// بعد normalizeRecordForSave:
{
  itemId: '123',
  quantity: 2
}
```

#### `populateRecordFks(schemaEngine, store, tableName, record)`
- يستدعى **بعد القراءة**
- يملأ FK fields بـ `{id, name}` من الجداول المرجعية

```javascript
// من DB:
{
  itemId: '123',
  quantity: 2
}

// بعد populateRecordFks:
{
  itemId: {id: '123', name: 'Pizza'},  // ✅ من menu_item table
  quantity: 2
}
```

---

### 2. `src/schema/engine.js` (مُعدّل)

**التعديل:** إضافة FK normalization في `createRecord()`

```javascript
createRecord(tableName, input, context) {
  // ✅ Normalize FK objects قبل معالجة الحقول
  const normalizedInput = normalizeRecordForSave(this, tableName, input);

  // ... باقي المعالجة
}
```

**النتيجة:** كل record يتم حفظه يمر عبر FK normalization تلقائياً

---

### 3. `src/moduleStore.js` (مُعدّل)

**التعديلات:**

#### دالة جديدة: `getRecord(tableName, id, options)`
```javascript
// قراءة record واحد مع FK population
const orderLine = store.getRecord('order_line', 'ln-001');

// النتيجة:
{
  id: 'ln-001',
  itemId: {id: '123', name: 'Pizza'},  // ✅ Auto-populated
  quantity: 2
}

// تعطيل FK population إذا أردت:
const raw = store.getRecord('order_line', 'ln-001', { populate: false });
```

#### دالة جديدة: `queryTable(tableName, options)`
```javascript
// قراءة جميع records مع FK population
const allLines = store.queryTable('order_line');

// مع filter:
const filtered = store.queryTable('order_line', {
  filter: (record) => record.quantity > 1,
  populate: true  // default
});
```

---

### 4. `src/server.js` (مُعدّل)

**WebSocket Endpoint جديد:** `client:query`

#### قراءة record واحد:
```javascript
// من الـ Front-end:
ws.send(JSON.stringify({
  type: 'client:query',
  moduleId: 'pos',
  table: 'order_line',
  queryType: 'get',
  id: 'ln-001',
  populate: true,  // default
  requestId: 'req-123'
}));

// الرد من الـ Server:
{
  type: 'server:query:result',
  requestId: 'req-123',
  table: 'order_line',
  queryType: 'get',
  result: {
    id: 'ln-001',
    itemId: {id: '123', name: 'Pizza'},
    quantity: 2
  }
}
```

#### قراءة جدول كامل:
```javascript
// من الـ Front-end:
ws.send(JSON.stringify({
  type: 'client:query',
  moduleId: 'pos',
  table: 'order_line',
  queryType: 'list',
  filter: { orderId: 'ord-456' },  // optional
  populate: true,
  requestId: 'req-124'
}));

// الرد من الـ Server:
{
  type: 'server:query:result',
  requestId: 'req-124',
  table: 'order_line',
  queryType: 'list',
  result: [
    {
      id: 'ln-001',
      itemId: {id: '123', name: 'Pizza'},
      orderId: 'ord-456',
      quantity: 2
    },
    // ...
  ]
}
```

---

## أمثلة الاستخدام 🎯

### مثال كامل: POS Order Flow

#### 1. إنشاء order line في Front-end:

```javascript
// ✅ لا حاجة لإنشاء يدوي - نقرأ من الـ schema
async function createOrderLine(item, quantity) {
  // نقرأ menu_item كـ FK object جاهز
  const menuItem = await queryRecord('menu_item', item.id);

  return {
    id: generateId(),
    itemId: {
      id: menuItem.id,
      name: menuItem.name
    },
    quantity,
    unitPrice: menuItem.price
  };
}
```

#### 2. حفظ الطلب:

```javascript
// الحفظ تلقائياً ينظف الـ FK objects
ws.send(JSON.stringify({
  type: 'client:publish',
  moduleId: 'pos',
  action: 'module:save',
  table: 'order_line',
  record: {
    id: 'ln-001',
    itemId: {id: 'item-123', name: 'Pizza'},  // ✅ سيُحفظ 'item-123' فقط
    quantity: 2,
    unitPrice: 50
  }
}));
```

#### 3. قراءة الطلب:

```javascript
// Query مع FK population تلقائي
ws.send(JSON.stringify({
  type: 'client:query',
  moduleId: 'pos',
  table: 'order_line',
  queryType: 'list',
  filter: { orderId: 'ord-456' },
  populate: true
}));

// النتيجة: جميع الـ FK fields ممتلئة تلقائياً ✅
```

---

## المزايا ✨

### 1. **لا أخطاء صامتة**
- الـ schema هو المصدر الوحيد
- إذا نسيت حقل في definition.json → خطأ واضح
- لا حاجة لتذكر الحقول يدوياً

### 2. **توحيد الواجهة والخلفية**
- البنية موحدة: FK = `{id, name}`
- الـ Front-end والـ Back-end يتحدثان نفس اللغة
- لا تعارض بين camelCase و snake_case

### 3. **صفر كود لـ tables جديدة**
- أضف table في `definition.json` فقط
- لا حاجة لكتابة:
  - buildRow functions
  - SQL statements
  - createRecord functions
  - FK population code
- كل شيء تلقائي! 🎉

### 4. **FK population ذكي**
```javascript
// بدون populate:
{ itemId: '123', quantity: 2 }

// مع populate (default):
{ itemId: {id: '123', name: 'Pizza'}, quantity: 2 }

// المرونة: يمكنك التحكم متى تريد
```

### 5. **أداء محسّن**
- FK population يحدث فقط عند القراءة
- الحفظ سريع (id فقط)
- لا استعلامات زائدة

---

## مقارنة: قبل vs بعد

| الجانب | قبل (يدوي) | بعد (ديناميكي) |
|--------|------------|----------------|
| **إضافة table جديد** | 150+ سطر كود | 0 سطر - فقط schema |
| **FK handling** | يدوي وعرضة للخطأ | تلقائي 100% |
| **توحيد البنية** | كل table مختلف | بنية موحدة |
| **الأخطاء الصامتة** | شائعة جداً | مستحيلة |
| **الصيانة** | صعبة ومكلفة | سهلة ومباشرة |
| **100 table** | 15,000 سطر | 0 سطر إضافي |

---

## ملاحظات مهمة ⚠️

### 1. الـ FK Population تلقائي
- **default**: `populate: true`
- إذا أردت البيانات الخام: `{ populate: false }`

### 2. الـ Schema يجب أن يكون دقيق
- تأكد أن `references` محددة صحيحاً
- استخدم `columnName` للـ snake_case

### 3. Performance
- الـ FK population يحدث في الذاكرة (سريع)
- لا استعلامات SQL إضافية
- الـ cache موجود في ModuleStore

### 4. التوافقية
- الكود القديم يعمل بدون تغيير
- `listTable()` لا يفعل FK population (للتوافقية)
- استخدم `queryTable()` للـ FK population

---

## التطبيق التدريجي 📈

### المرحلة 1: التحديث التلقائي (تم ✅)
- FK normalization يعمل تلقائياً في `save()`
- لا حاجة لتغيير كود الحفظ الموجود

### المرحلة 2: استخدام Query API (اختياري)
- استبدل `listTable()` بـ `queryTable()` تدريجياً
- استخدم `client:query` في Front-end

### المرحلة 3: تنظيف الكود القديم (مستقبلي)
- حذف buildRow functions
- حذف manual SQL statements
- الاعتماد الكامل على النظام الديناميكي

---

## الخلاصة 🎯

### النظام الجديد:
1. **يقرأ من Schema** → لا كود يدوي
2. **FK objects** → `{id, name}` موحد
3. **Auto normalization** → عند الحفظ
4. **Auto population** → عند القراءة
5. **Zero code** → لـ tables جديدة

### النتيجة:
> **"نظام ديناميكي بالكامل يجبر الواجهة والخلفية على المصدر الواحد ويمنع الأخطاء الكثيرة"**

---

## للبدء 🚀

### في الـ Front-end:
```javascript
// Query with FK population
ws.send({
  type: 'client:query',
  moduleId: 'pos',
  table: 'order_line',
  queryType: 'list',
  populate: true
});

// Save with FK objects (ستُنظف تلقائياً)
ws.send({
  type: 'client:publish',
  moduleId: 'pos',
  action: 'module:save',
  table: 'order_line',
  record: {
    id: 'ln-001',
    itemId: {id: '123', name: 'Pizza'}  // ✅ OK!
  }
});
```

### في الـ Back-end:
```javascript
// الكود الموجود يعمل بدون تغيير!
// FK normalization تلقائي في save()

// للـ FK population:
const record = store.getRecord('order_line', 'ln-001');
const records = store.queryTable('order_line');
```

---

## الدعم والمساعدة

- **FK Resolver**: `src/schema/fk-resolver.js`
- **Schema Engine**: `src/schema/engine.js`
- **Module Store**: `src/moduleStore.js`
- **Server API**: `src/server.js` → `client:query`

جميع الأكواد موثقة بالتفصيل ✅
