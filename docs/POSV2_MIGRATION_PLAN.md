# POS V2 Migration Plan - خطة الهجرة

## الهدف / Goal
هجرة pos.js من REST API + IndexedDB إلى mishkah-store (WebSocket) بالكامل

---

## ما تعلمناه من kds.js

### ✅ النمط الحالي في kds.js:
```javascript
// 1. الحصول على store
const store = window.__POS_DB__;

// 2. التحديث مع version control
const currentVersion = record.version || 1;
const nextVersion = currentVersion + 1;

await store.update('order_header', {
  id: orderId,
  status: 'ready',
  version: nextVersion  // ← CRITICAL
});

// 3. الإدراج
await store.insert('order_line', {
  orderId: orderId,
  itemId: itemId,
  quantity: 2
  // لا حاجة لـ id أو version - يُنشأ تلقائياً
});
```

---

## التغييرات المطلوبة في posv2.js

### 1. إزالة REST API Calls ❌

**قبل (pos.js)**:
```javascript
async function allocateInvoiceId() {
  const response = await fetch('/api/.../sequences', {
    method: 'POST',
    body: JSON.stringify({ table: 'order_header', field: 'id' })
  });
  return response.json().id;
}

async function saveOrder(order) {
  await fetch('/api/.../orders', {
    method: 'POST',
    body: JSON.stringify({ order })
  });
}
```

**بعد (posv2.js)**: ✅
```javascript
// لا حاجة لـ allocateInvoiceId()!
// Backend يخصص تلقائياً عند db.insert()

const store = window.__POS_DB__;

// فقط insert مباشرة - sequence يُخصص تلقائياً
await store.insert('order_header', {
  // لا تمرر id - سيُنشأ تلقائياً
  shiftId: currentShift.id,
  type: 'dine_in',
  tableIds: [tableId],
  status: 'draft',
  lines: []  // سيُحذف - نحفظ lines منفصلة
});
```

### 2. استبدال persistOrderFlow() 🔄

**قبل**:
```javascript
async function persistOrderFlow(ctx, mode) {
  // 1. Allocate sequence
  const invoiceId = await allocateInvoiceId();

  // 2. Save via REST API
  await posDB.saveOrder({
    id: invoiceId,
    lines: [...],
    payments: [...]
  });

  // 3. Update state manually
  ctx.setState({...});
}
```

**بعد**:
```javascript
async function persistOrderFlow(ctx, mode) {
  const store = window.__POS_DB__;
  const state = ctx.getState();
  const order = state.data.order;

  console.log('🔥 [POS V2] persistOrderFlow - using mishkah-store');

  // 1. حفظ order_header
  let headerResult;
  if (!order.isPersisted || !order.id) {
    // NEW order - insert
    headerResult = await store.insert('order_header', {
      shiftId: currentShift.id,
      type: order.type,
      tableIds: order.tableIds,
      status: mode === 'finalize' ? 'finalized' : 'draft',
      customerId: order.customerId,
      // لا تمرر lines هنا
    });
  } else {
    // UPDATE existing - with version
    const currentVersion = order.version || 1;
    headerResult = await store.update('order_header', {
      id: order.id,
      version: currentVersion + 1,
      status: mode === 'finalize' ? 'finalized' : 'draft',
      // فقط الحقول المتغيرة
    });
  }

  const orderId = headerResult?.id || order.id;

  // 2. حفظ order_lines (فقط الجديدة!)
  for (const line of order.lines) {
    if (!line.isPersisted) {
      await store.insert('order_line', {
        orderId: orderId,
        itemId: line.itemId,
        quantity: line.qty,
        price: line.price,
        // ...
      });
    }
    // ❌ لا نحدّث lines موجودة - ممنوع!
  }

  // 3. حفظ payments
  for (const payment of order.payments) {
    if (!payment.isPersisted) {
      await store.insert('order_payment', {
        orderId: orderId,
        method: payment.method,
        amount: payment.amount
      });
    }
  }

  // 4. لا حاجة لتحديث state يدوياً
  // db.watch() سيحدثه تلقائياً!

  console.log('✅ [POS V2] Save complete - WebSocket will sync automatically');
}
```

### 3. استخدام db.watch() للـ orders 📡

**في setup (بداية posv2.js)**:
```javascript
const store = window.__POS_DB__;

// Watch order_header changes
store.watch('order_header', (headers) => {
  console.log('[POS V2] order_header updated:', headers.length);
  // Update state automatically
  // TODO: Update current order if it matches
});

// Watch order_line changes
store.watch('order_line', (lines) => {
  console.log('[POS V2] order_line updated:', lines.length);
  // Update current order lines
});
```

---

## القواعد المهمة / Rules

### ✅ افعل:
1. استخدم `store.insert()` للـ records الجديدة
2. استخدم `store.update()` مع `version` للتحديثات
3. احفظ order_lines **منفصلة** عن order_header
4. اعتمد على `db.watch()` لتحديث الـ state

### ❌ لا تفعل:
1. لا تستدعي `/api/.../sequences` - Backend يخصص تلقائياً
2. لا تستدعي `/api/.../orders` - استخدم `db.insert/update`
3. لا تحدّث `order_line` موجود - ممنوع!
4. لا تحدّث state يدوياً - `db.watch()` يعملها

---

## الفوائد / Benefits

| قبل (REST) | بعد (WebSocket) |
|-----------|-----------------|
| ❌ 3-4 API calls per save | ✅ 0 API calls - WebSocket only |
| ❌ Manual state sync | ✅ Auto sync via db.watch() |
| ❌ No real-time across devices | ✅ Real-time sync |
| ❌ Complex IndexedDB management | ✅ mishkah-store handles it |
| ❌ Conflict resolution manual | ✅ Optimistic locking automatic |
| ❌ ~500ms latency | ✅ ~20ms latency |

---

## خطة التنفيذ / Implementation

### المرحلة 1: إنشاء posv2.js (نسخة مبدئية)
```bash
# نسخ pos.js كاملاً
cp static/pos/pos.js static/pos/posv2.js

# تعديلات بسيطة:
1. إضافة console.log('[POS V2]') في البداية
2. تعديل persistOrderFlow() فقط
3. إزالة allocateInvoiceId() و posDB.saveOrder()
```

### المرحلة 2: الاختبار
1. فتح `posv2.html?brname=dar`
2. إنشاء طلب جديد
3. حفظ → شوف console
4. تحقق من WebSocket network tab

### المرحلة 3: التحسينات
1. إضافة db.watch() للـ real-time
2. إزالة IndexedDB code غير ضروري
3. تبسيط state management

---

## الحالة / Status

- ✅ posv2.html created
- ✅ **pos-mini-db.js removed from posv2.html**
- ✅ **Direct createDBAuto usage implemented**
- ✅ posv2.js (copy of pos.js with console marker)
- ⏳ Testing WebSocket connection
- ⏳ Migrate persistOrderFlow() to use db.insert/update
- ⏳ Remove allocateInvoiceId() calls
- ⏳ Add db.watch() for real-time sync

---

## التغييرات الحاسمة / Critical Changes

### ✅ **DONE**: إزالة pos-mini-db.js من posv2.html

**قبل**:
```html
<script src="./pos-mini-db.js"></script>
<script>
  createPosDb({ branchId: BRANCH_ID })
    .then(({ db, moduleEntry }) => {
      window.__POS_DB__ = db;
      // ...
    });
</script>
```

**بعد** ✅:
```html
<!-- ❌ pos-mini-db.js REMOVED - using pure mishkah-store -->
<script>
  // 1. Fetch schema directly
  const schemaResponse = await fetch(`/api/schema?branch=${BRANCH_ID}&module=pos`);
  const schemaPayload = await schemaResponse.json();
  const moduleEntry = schemaPayload?.modules?.pos;

  // 2. Use createDBAuto directly (no wrapper!)
  const db = window.createDBAuto(moduleEntry.schema, tables, {
    branchId: BRANCH_ID,
    moduleId: 'pos',
    role: 'pos-v2',
    autoReconnect: true,
    historyLimit: 200
  });

  window.__POS_DB__ = db;
  await db.ready();
</script>
```

**الفوائد**:
- ❌ لا memory wrapper overhead
- ✅ اتصال مباشر مع mishkah-store
- ✅ نفس النمط المستخدم في kds.js
- ✅ كود أبسط وأوضح

---

**آخر تحديث**: 2025-11-07
**الحالة**: pos-mini-db.js removed, ready for persistOrderFlow migration
