# آلية الحفظ في نظام POS - POS Save Mechanism

## نظرة عامة / Overview

هذا الدليل يشرح بالتفصيل آلية حفظ الطلبات في نظام POS، ويوثق المشاكل الموجودة والحلول المقترحة.

---

## المعمارية الحالية / Current Architecture

### البنية التقنية

```
┌─────────────────────────────────────────────────────────────┐
│                    pos.js (Frontend)                         │
│  • UI Layer (أزرار الحفظ والإنهاء)                          │
│  • State Management (حالة الطلب المحلية)                    │
│  • Business Logic (حسابات، تحققات)                          │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ├──→ IndexedDB (للتخزين المؤقت والعمل offline)
                 │
                 ├──→ REST API: POST /api/branches/{}/modules/{}/sequences
                 │    (تخصيص رقم فاتورة جديد)
                 │
                 └──→ REST API: POST /api/branches/{}/modules/{}/orders
                      (حفظ الطلب الكامل)
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (moduleStore.js)                  │
│  • Optimistic Locking (Version Control)                     │
│  • Insert-Only Architecture                                 │
│  • Conflict Detection & Resolution                          │
└─────────────────────────────────────────────────────────────┘
```

### ملاحظة مهمة

**pos.js لا يستخدم mishkah-store!**
- يستخدم REST API مباشرة
- IndexedDB فقط للـ caching والعمل offline
- لا يوجد WebSocket real-time sync

---

## تدفق عملية الحفظ / Save Flow

### 1. نقطة البداية: Event Handler

**الموقع**: `static/pos/pos.js:10767-10774`

```javascript
'pos.order.save': {
  on: ['click'],
  gkeys: ['pos:order:save'],
  handler: async (e, ctx) => {
    const trigger = e.target.closest('[data-save-mode]');
    const mode = trigger?.getAttribute('data-save-mode') || 'draft';
    await persistOrderFlow(ctx, mode);  // ← الدالة الرئيسية
  }
}
```

**أنماط الحفظ المتاحة**:
- `draft`: حفظ كمسودة (يسمح بالتعديل لاحقاً)
- `finalize`: إنهاء الطلب (قفل الطلب)
- `finalize-print`: إنهاء + طباعة

### 2. الدالة الرئيسية: `persistOrderFlow()`

**الموقع**: `static/pos/pos.js:5984-6576`

#### أ) التحققات الأولية (Lines 5991-6033)

```javascript
// 1. فحص عدد المحاولات
if (retryCount >= MAX_RETRIES) {
  throw new Error('Max retry attempts reached');
}

// 2. التحقق من IndexedDB
if (!posDB) {
  throw new Error('IndexedDB not available');
}

// 3. التحقق من وجود shift نشط
const activeShift = await posDB.getActiveShift();
if (!activeShift) {
  throw new Error('No active shift');
}

// 4. متطلبات نوع الطلب
if (orderType === 'dine_in' && !order.tableId) {
  throw new Error('Table is required for dine-in orders');
}

if (orderType === 'delivery' && (!order.customerId || !order.addressId)) {
  throw new Error('Customer and address required for delivery');
}
```

#### ب) تخصيص رقم الفاتورة (Lines 6244-6282)

**الشرط الحاسم** (Line 6250):
```javascript
if (!order.isPersisted || !previousOrderId ||
    previousOrderId === '' || previousOrderId === 'undefined' || isDraftId) {
  // تخصيص رقم جديد
  finalOrderId = await allocateInvoiceId();
}
```

**متى يتم طلب sequence جديد؟**
1. ✅ طلب جديد (`order.isPersisted === false`)
2. ✅ لا يوجد رقم سابق (`!previousOrderId`)
3. ✅ الرقم الحالي مسودة (`isDraftId === true` أي يبدأ بـ `draft-`)

**متى لا يتم طلب sequence جديد؟**
1. ✅ طلب محفوظ مسبقاً (`order.isPersisted === true`)
2. ✅ يوجد رقم فاتورة حقيقي (لا يبدأ بـ `draft-`)

#### ج) دالة `allocateInvoiceId()` (Lines 4599-4622)

```javascript
async function allocateInvoiceId() {
  if (!ACTIVE_BRANCH_ID) {
    throw new Error('Branch id is required for invoice allocation');
  }

  const endpoint = window.basedomain +
    `/api/branches/${encodeURIComponent(ACTIVE_BRANCH_ID)}/` +
    `modules/${encodeURIComponent(MODULE_ID)}/sequences`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      table: 'order_header',
      field: 'id',
      record: {
        posId: POS_INFO.id,
        posNumber: POS_INFO.number
      }
    })
  });

  const payload = await response.json();
  return payload.id;  // مثال: "2025010001"
}
```

#### د) إعداد البيانات (Lines 6105-6375)

```javascript
// 1. تطبيع الأسطر
let safeLines = (order.lines || []).map(line => {
  const sanitizedLine = normalizeOrderLine(line, {
    orderId: order.id,
    createdAt: now,
    updatedAt: now
  });

  return {
    ...sanitizedLine,
    locked: true,
    status: sanitizedLine?.status || 'draft',
    kitchenSection: sanitizedLine?.kitchenSection || 'expo'
  };
});

// 2. حساب الإجماليات
const totals = calculateTotals(
  safeLines,
  state.data.settings || {},
  orderType,
  { orderDiscount: order.discount }
);

// 3. إدارة الإصدارات (Version Control)
const currentVersion = order.version || 1;
const idChanged = previousOrderId !== finalOrderId;

const outgoingVersion = (idChanged || isDraftId)
  ? 1  // طلب جديد يبدأ بـ version 1
  : (order.isPersisted && Number.isFinite(currentVersion) && currentVersion > 0
      ? Math.trunc(currentVersion) + 1  // زيادة الإصدار للتحديثات
      : 1);

// 4. بناء payload الكامل
const orderPayload = {
  ...order,
  id: finalOrderId,
  status,
  fulfillmentStage: finalizeStage,
  lines: safeLines,  // ← الأسطر مضمنة
  notes: orderNotes,
  totals,
  payments: normalizedPayments,
  version: outgoingVersion,
  expectedVersion: outgoingVersion,
  // حقول snake_case للـ backend
  order_type_id: orderType,
  status_id: status,
  stage_id: finalizeStage,
  table_id: primaryTableId
};
```

#### هـ) الحفظ الفعلي (Lines 6373-6430)

```javascript
try {
  savedOrder = await posDB.saveOrder(persistableOrder);

  // تحديث الـ State المحلي
  const updatedOrder = {
    ...order,
    id: savedOrder.id,
    isPersisted: true,
    dirty: false,
    version: savedOrder.version || outgoingVersion
  };

  setState({ currentOrder: updatedOrder });

  UI.pushToast(ctx, {
    title: 'تم حفظ الطلب بنجاح ✅',
    icon: '💾'
  });

} catch (error) {
  if (isDraftId && idChanged) {
    // إعادة المحاولة برقم جديد
    console.error('[POS] Draft conversion failed, retrying...');
    return await persistOrderFlow(ctx, rawMode, {
      ...options,
      retryCount: (options.retryCount || 0) + 1
    });
  }
  throw error;
}
```

### 3. دالة `posDB.saveOrder()` (Lines 2080-2096)

```javascript
async function saveOrder(order) {
  if (!BRANCH_ID) throw new Error('Branch id is required');
  if (!order || !order.shiftId) {
    throw new Error('Order payload requires an active shift');
  }

  const endpoint = window.basedomain +
    `/api/branches/${encodeURIComponent(BRANCH_ID)}/` +
    `modules/${encodeURIComponent(MODULE_ID)}/orders`;

  const outgoing = { ...order };

  // التأكد من إرسال version
  const expectedVersion = Number(order?.expectedVersion);
  const currentVersion = Number(order?.version);

  if (Number.isFinite(expectedVersion) && expectedVersion > 0) {
    outgoing.version = expectedVersion;
  } else if (Number.isFinite(currentVersion) && currentVersion > 0) {
    outgoing.version = currentVersion;
  }

  const payload = await postJson(endpoint, { order: outgoing });
  return payload?.order ? normalizePersistedOrder(payload.order) : order;
}
```

---

## المشاكل الموجودة / Current Issues

### ⚠️ مشكلة #1: لا توجد آلية لمنع الحفظ المتكرر

**الوصف**: المستخدم يمكنه الضغط على زر الحفظ عدة مرات بسرعة.

**النتيجة**:
- تخصيص أرقام فواتير متعددة (INV001, INV002, INV003)
- حفظ نفس الطلب عدة مرات
- استهلاك sequences بدون داعي

**الدليل**:
```javascript
// Line 10770 - لا توجد حماية
handler: async (e, ctx) => {
  // ❌ لا يوجد فحص لـ isSaving flag
  // ❌ لا يوجد disabled على الزر
  await persistOrderFlow(ctx, mode);  // يمكن تنفيذه مرات متعددة!
}
```

**السيناريو الخطير**:
```
الوقت    الحدث                           النتيجة
------    -----                           -------
t=0      المستخدم يضغط الزر (المرة 1)
t=10ms   يبدأ allocateInvoiceId()         → INV001
t=20ms   المستخدم يضغط الزر (المرة 2)
t=30ms   يبدأ allocateInvoiceId()         → INV002
t=40ms   المستخدم يضغط الزر (المرة 3)
t=50ms   يبدأ allocateInvoiceId()         → INV003
t=500ms  اكتملت المرة 1                   → حفظ INV001
t=510ms  اكتملت المرة 2                   → حفظ INV002
t=520ms  اكتملت المرة 3                   → حفظ INV003

النتيجة: 3 طلبات بأرقام مختلفة لنفس الطلب!
```

### ⚠️ مشكلة #2: لا يتم التحقق من وجود تغييرات قبل الحفظ

**الوصف**: النظام لا يفحص `order.dirty` flag قبل الحفظ.

**الدليل**:
```javascript
// Line 6015 - يطبع dirty لكن لا يتحقق منه
console.log('[POS] persistOrderFlow START', {
  orderId: order.id,
  isPersisted: order.isPersisted,
  dirty: order.dirty,  // ← فقط للطباعة!
  linesCount: order.lines?.length || 0
});

// ❌ لا يوجد:
// if (!order.dirty && order.isPersisted) {
//   UI.pushToast(ctx, { title: 'لا توجد تغييرات للحفظ' });
//   return { status: 'no-changes' };
// }
```

**النتيجة**:
- حفظ طلب بدون تغييرات → زيادة version بدون سبب
- إرسال طلبات غير ضرورية للـ backend
- تعقيد في تتبع التغييرات الحقيقية

### ⚠️ مشكلة #3: حفظ طلبات فارغة (بدون أسطر)

**الوصف**: يمكن حفظ طلب بدون أي `order_line`.

**الدليل**: لا يوجد فحص في الكود.

**النتيجة**:
- طلبات "صفرية" في القاعدة
- استهلاك أرقام sequences بدون فائدة
- بيانات غير صحيحة في التقارير

### ⚠️ مشكلة #4: إعادة المحاولة تخصص أرقام إضافية

**الدليل** (Line 6417):
```javascript
if (isDraftId && idChanged) {
  console.error('[POS] Draft conversion failed, retrying...');

  // ❌ إعادة المحاولة = تخصيص رقم جديد!
  return await persistOrderFlow(ctx, rawMode, {
    ...options,
    retryCount: (options.retryCount || 0) + 1
  });
}
```

**المشكلة**:
- إذا فشلت المحاولة الأولى (خصصت INV001)
- إعادة المحاولة ستخصص INV002
- إذا فشلت مرة أخرى، ستخصص INV003
- النتيجة: 3 أرقام مخصصة، طلب واحد محفوظ (أو لا شيء!)

---

## الحلول المقترحة / Proposed Solutions

### ✅ حل #1: إضافة `isSaving` Flag

#### في State:
```javascript
const initialState = {
  // ... existing state
  ui: {
    saving: false  // ← flag جديد
  }
};
```

#### في Event Handler:
```javascript
'pos.order.save': {
  on: ['click'],
  gkeys: ['pos:order:save'],
  handler: async (e, ctx) => {
    const state = ctx.getState();

    // ✅ فحص: هل يجري حفظ حالياً؟
    if (state.ui?.saving) {
      console.log('[POS] Save already in progress, ignoring click');
      return;  // منع التنفيذ المتكرر
    }

    const trigger = e.target.closest('[data-save-mode]');
    const mode = trigger?.getAttribute('data-save-mode') || 'draft';

    // ✅ تفعيل flag
    ctx.setState(s => ({
      ...s,
      ui: { ...s.ui, saving: true }
    }));

    try {
      await persistOrderFlow(ctx, mode);
    } finally {
      // ✅ إلغاء flag (سواء نجح أو فشل)
      ctx.setState(s => ({
        ...s,
        ui: { ...s.ui, saving: false }
      }));
    }
  }
}
```

### ✅ حل #2: تعطيل الزر أثناء الحفظ

```javascript
// في render الزر
const saveButton = UI.Button({
  attrs: {
    gkey: 'pos:order:save',
    'data-save-mode': 'draft',
    disabled: state.ui?.saving ? 'disabled' : undefined,  // ← تعطيل
    class: tw`min-w-[160px] flex items-center justify-center gap-2 ${
      state.ui?.saving ? 'opacity-50 cursor-not-allowed' : ''
    }`
  },
  variant: 'solid',
  size: 'md'
}, [
  // ✅ نص ديناميكي
  state.ui?.saving
    ? D.Text.Span({}, ['⏳ جاري الحفظ...'])
    : D.Text.Span({}, [saveLabel])
]);
```

### ✅ حل #3: فحص التغييرات قبل الحفظ

```javascript
// في بداية persistOrderFlow()
async function persistOrderFlow(ctx, rawMode, options = {}) {
  const state = ctx.getState();
  const order = state.currentOrder || {};

  // ✅ فحص: هل يوجد تغييرات؟
  if (order.isPersisted && !order.dirty && rawMode === 'draft') {
    console.log('[POS] No changes detected, skipping save');
    UI.pushToast(ctx, {
      title: t.toast.no_changes || 'لا توجد تغييرات للحفظ',
      icon: 'ℹ️',
      variant: 'info'
    });
    return { status: 'no-changes' };
  }

  // ... باقي الكود
}
```

### ✅ حل #4: منع حفظ طلبات فارغة

```javascript
// في بداية persistOrderFlow()
async function persistOrderFlow(ctx, rawMode, options = {}) {
  const state = ctx.getState();
  const order = state.currentOrder || {};

  // ✅ فحص: يوجد سطر واحد على الأقل؟
  const lines = order.lines || [];
  if (!lines.length || !lines.some(line => !line.cancelled)) {
    console.error('[POS] Cannot save empty order');
    UI.pushToast(ctx, {
      title: t.errors.empty_order || 'لا يمكن حفظ طلب فارغ',
      subtitle: 'يجب إضافة صنف واحد على الأقل',
      icon: '⚠️',
      variant: 'error'
    });
    return { status: 'empty-order', error: 'NO_LINES' };
  }

  // ... باقي الكود
}
```

### ✅ حل #5: Debouncing (اختياري)

```javascript
// في module scope
let saveTimeout = null;

'pos.order.save': {
  on: ['click'],
  gkeys: ['pos:order:save'],
  handler: async (e, ctx) => {
    // ✅ إلغاء المحاولة السابقة
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    const trigger = e.target.closest('[data-save-mode]');
    const mode = trigger?.getAttribute('data-save-mode') || 'draft';

    // ✅ انتظار 300ms قبل التنفيذ
    saveTimeout = setTimeout(async () => {
      await persistOrderFlow(ctx, mode);
    }, 300);
  }
}
```

---

## قواعد الحفظ الجديدة / New Save Rules

### ✅ القاعدة 1: منع الحفظ المتكرر
```javascript
if (state.ui.saving) {
  return; // ← لا تسمح بحفظ متزامن
}
```

### ✅ القاعدة 2: فحص التغييرات
```javascript
if (order.isPersisted && !order.dirty && mode === 'draft') {
  return { status: 'no-changes' }; // ← لا تحفظ إذا لم يتغير شيء
}
```

### ✅ القاعدة 3: فحص الأسطر
```javascript
const validLines = lines.filter(line => !line.cancelled);
if (!validLines.length) {
  return { status: 'empty-order', error: 'NO_LINES' }; // ← لا تحفظ طلب فارغ
}
```

### ✅ القاعدة 4: تخصيص Sequence فقط عند الحاجة
```javascript
// ✅ تخصيص رقم جديد فقط إذا:
if (!order.isPersisted ||   // 1. طلب جديد
    !previousOrderId ||      // 2. لا يوجد رقم
    isDraftId) {             // 3. مسودة
  finalOrderId = await allocateInvoiceId();
}

// ✅ لا تخصص رقم جديد إذا:
// - الطلب محفوظ مسبقاً (isPersisted = true)
// - يوجد رقم فاتورة حقيقي
```

### ✅ القاعدة 5: منع التعديل على الطلبات المنتهية

```javascript
// للطلبات غير dine_in (delivery, takeaway)
if (order.isPersisted && orderType !== 'dine_in') {
  // ✅ مسموح: ربط/تعديل العميل
  // ✅ مسموح: تحديث حالة الطلب
  // ❌ ممنوع: إضافة/تعديل/حذف أسطر
  // ❌ ممنوع: تغيير نوع الطلب

  const allowedFields = ['customerId', 'addressId', 'status', 'driverId'];
  const modifiedFields = Object.keys(patch || {});
  const forbidden = modifiedFields.filter(f => !allowedFields.includes(f));

  if (forbidden.length) {
    throw new Error(
      `Cannot modify finalized ${orderType} order. ` +
      `Forbidden fields: ${forbidden.join(', ')}`
    );
  }
}

// لطلبات dine_in
if (order.isPersisted && orderType === 'dine_in' && !order.allowAdditions) {
  // ✅ مسموح: إضافة أسطر جديدة فقط
  // ❌ ممنوع: تعديل/حذف أسطر قديمة

  const newLines = lines.filter(line => !line.id || line.id.startsWith('temp-'));
  if (newLines.length < lines.length) {
    throw new Error('Cannot modify existing lines in persisted order');
  }
}
```

---

## السيناريوهات المدعومة / Supported Scenarios

### سيناريو 1: طلب جديد - صالة

```
1. المستخدم يختار طاولة T5
2. يضيف صنف: برجر × 2
3. يضغط "حفظ" (draft)
   ✅ يخصص رقم: INV001
   ✅ يحفظ order_header (version=1)
   ✅ يحفظ order_line × 1 (locked=false)
   ✅ يحدث State: isPersisted=true, dirty=false
4. يضيف صنف جديد: بيبسي × 1
   ✅ يحدث State: dirty=true
5. يضغط "حفظ" مرة أخرى
   ✅ لا يخصص رقم جديد (يستخدم INV001)
   ✅ يحفظ فقط السطر الجديد (version=2)
```

### سيناريو 2: طلب دليفري

```
1. المستخدم يختار دليفري
2. يختار عميل وعنوان
3. يضيف أصناف
4. يضغط "حفظ"
   ✅ يخصص رقم: INV002
   ✅ يحفظ order_header
   ✅ يحفظ order_lines
5. بعد الحفظ:
   ❌ لا يمكن إضافة أصناف جديدة
   ❌ لا يمكن تعديل الأصناف الموجودة
   ✅ يمكن فقط: تعيين سائق، تحديث حالة
```

### سيناريو 3: النقر المتكرر (المشكلة القديمة)

```
قبل الإصلاح:
1. المستخدم يضغط "حفظ" 3 مرات بسرعة
   ❌ يخصص 3 أرقام: INV001, INV002, INV003
   ❌ يحفظ 3 طلبات منفصلة (أو يفشل)
   ❌ فوضى في الـ sequences

بعد الإصلاح:
1. المستخدم يضغط "حفظ" 3 مرات بسرعة
   ✅ المحاولة 1: تبدأ الحفظ، تفعل isSaving=true
   ✅ المحاولة 2: تُرفض (isSaving=true)
   ✅ المحاولة 3: تُرفض (isSaving=true)
   ✅ النتيجة: حفظ واحد فقط، رقم واحد فقط
```

---

## نقاط مهمة للمطورين / Developer Notes

### 1. Version Control

- `order_header` و `order_line` يستخدمان Optimistic Locking
- كل update يزيد `version` بمقدار 1
- Backend يرفض أي update بـ version قديم (409 VERSION_CONFLICT)

### 2. Insert-Only Architecture

- لا يوجد UPDATE حقيقي في القاعدة
- كل "update" هو INSERT لسجل جديد بـ version أعلى
- عند القراءة، يتم استرجاع السجل بأعلى version

### 3. Sequences

- تُخصص فقط عند إنشاء طلب جديد
- لا تُعاد استخدامها أبداً
- في حالة الفشل، الرقم المخصص يُهدر (by design)

### 4. State Management

- `order.isPersisted`: هل الطلب محفوظ في الـ backend؟
- `order.dirty`: هل يوجد تغييرات غير محفوظة؟
- `order.version`: رقم الإصدار الحالي
- `ui.saving`: هل يجري حفظ الآن؟

---

## ملخص سريع / Quick Summary

### المشاكل
- ❌ لا توجد آلية لمنع الحفظ المتكرر
- ❌ لا يتم التحقق من dirty flag
- ❌ يمكن حفظ طلبات فارغة
- ❌ إعادة المحاولة تخصص أرقام إضافية

### الحلول
- ✅ إضافة `isSaving` flag
- ✅ تعطيل الزر أثناء الحفظ
- ✅ فحص dirty flag قبل الحفظ
- ✅ فحص وجود أسطر قبل الحفظ
- ✅ Debouncing (اختياري)

### القواعد الجديدة
1. ✅ منع الحفظ المتكرر
2. ✅ فحص التغييرات
3. ✅ فحص الأسطر
4. ✅ تخصيص Sequence عند الحاجة فقط
5. ✅ منع التعديل على الطلبات المنتهية

---

**آخر تحديث**: 2025-11-07
**الحالة**: تم التوثيق والتحليل - جاهز للتطبيق
**المراجع**:
- `static/pos/pos.js` (Lines 5984-6576, 10767-10774, 4599-4622, 2080-2096)
- `src/moduleStore.js` (Backend implementation)
