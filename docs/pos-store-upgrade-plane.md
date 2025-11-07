# Mishkah Store - الدليل الشامل الملخص

## الفلسفة / Philosophy

**الهدف**: بديل محلي self-hosted لـ Firebase للمشاريع الصغيرة والمتوسطة

**المبدأ الأساسي**:
- Real-time sync عبر WebSocket
- Offline-first مع IndexedDB
- Insert-Only Architecture (لا UPDATE حقيقي)
- Optimistic Locking للـ versioned tables

---

## المعمارية / Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  Frontend Application                     │
│              (POS, KDS, Reports, etc.)                    │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ├──→ REST API (POST/GET)
                 │    • /api/.../sequences (تخصيص أرقام)
                 │    • /api/.../orders (حفظ طلبات)
                 │
                 ├──→ WebSocket (/ws)
                 │    • Real-time broadcasts
                 │    • mishkah.store.js + mishkah.simple-store.js
                 │
                 └──→ IndexedDB (Offline cache)
                      • Table snapshots
                      • Auto-sync on reconnect
                      │
                      ▼
┌──────────────────────────────────────────────────────────┐
│                    Backend (Node.js)                      │
│  • moduleStore.js (Memory + Version Control)             │
│  • SQLite (Persistent storage - optional)                │
│  • EventStore (Change log)                               │
└──────────────────────────────────────────────────────────┘
```

### الوضع الحالي:

| Component | POS | KDS |
|-----------|-----|-----|
| REST API | ✅ مباشر | ❌ لا |
| WebSocket | ❌ لا | ✅ mishkah-store |
| IndexedDB | ✅ Shifts فقط | ✅ Table cache |
| Real-time | ❌ Polling/Manual | ✅ Auto-sync |

---

## التقنيات / Tech Stack

### Frontend
```javascript
// mishkah.store.js - Core WebSocket client
- WebSocket connection management
- IndexedDB persistence (automatic)
- Event broadcasting (snapshot, event, status)

// mishkah.simple-store.js - High-level DSL
- createDB() / createDBAuto()
- watch(table, callback) - React to changes
- insert/update/delete operations
- status(callback) - Connection monitoring
```

### Backend
```javascript
// moduleStore.js - In-memory data store
- VERSIONED_TABLES = ['order_header', 'order_line']
- Insert-only architecture
- Optimistic locking (version control)
- Conflict detection & resolution

// Key Methods:
- insert(table, record) → auto-version
- updateRecord(table, patch) → version++
- save(table, record) → upsert with version check
```

---

## الكود الأساسي / Core Code

### Frontend: KDS (WebSocket)
```javascript
// إنشاء اتصال
const db = createDBAuto(schema, ['order_header', 'order_line'], {
  branchId: 'dar',
  moduleId: 'pos',
  wsPath: '/ws',
  useIndexedDB: true
});

// مراقبة البيانات
db.watch('order_header', (orders) => {
  // يُستدعى تلقائياً عند أي تغيير
  console.log('Orders updated:', orders);
});

// تحديث
await db.update('order_line', {
  id: 'line-123',
  statusId: 'cooking',  // جزئي
  version: 2            // ← CRITICAL
});
```

### Frontend: POS (REST API)
```javascript
// تخصيص رقم
const invoiceId = await fetch('/api/.../sequences', {
  method: 'POST',
  body: JSON.stringify({
    table: 'order_header',
    field: 'id'
  })
});

// حفظ طلب
await fetch('/api/.../orders', {
  method: 'POST',
  body: JSON.stringify({
    order: {
      id: invoiceId,
      lines: [...],
      version: 1  // ← NEW order
    }
  })
});
```

### Backend: Version Control
```javascript
resolveNextVersion(table, currentRecord, patch, key) {
  const currentVersion = currentRecord?.version || 1;
  const expectedVersion = patch?.version;

  // Missing version = REJECT
  if (!expectedVersion) {
    throw VersionConflictError('missing-version');
  }

  // New record
  if (expectedVersion === 1 && currentVersion === 1) {
    return 2;  // Allow
  }

  // Update: expectedVersion must = currentVersion + 1
  if (expectedVersion !== currentVersion + 1) {
    throw VersionConflictError('stale-version');
  }

  return currentVersion + 1;
}
```

---

## المشاكل الحالية / Current Issues

### ⚠️ عالية الأهمية (Critical)

1. **POS لا يستخدم WebSocket**
   - يستخدم REST API مباشرة
   - لا real-time sync بين أجهزة POS
   - يسبب conflicts عند التعديل المتزامن

2. **Order validation ضعيفة**
   - ✅ تم الإصلاح: منع حفظ طلبات فارغة
   - ✅ تم الإصلاح: منع الحفظ المتكرر
   - ❌ لا يوجد: منع تعديل orders منتهية (delivery/takeaway)

3. **IndexedDB غير متسق**
   - POS: يحفظ shifts فقط
   - KDS: يحفظ كل الجداول
   - لا يوجد sync strategy واضحة

### ⚠️ متوسطة الأهمية

4. **Version conflicts غير واضحة للمستخدم**
   - الخطأ 409 يظهر في console فقط
   - المستخدم لا يعرف ماذا يفعل

5. **لا يوجد offline queue**
   - عند قطع الاتصال، العمليات تفشل
   - لا retry mechanism

6. **WebSocket reconnection بطيئة**
   - لا exponential backoff
   - الـ reconnect قد يأخذ وقت طويل

### 💡 تحسينات مستقبلية

7. **Query capabilities محدودة**
   - لا server-side filtering
   - كل الجداول تُرسل كاملة للـ client

8. **Authentication & permissions**
   - لا يوجد role-based access control
   - كل client يرى كل البيانات

9. **Monitoring & debugging**
   - لا metrics/logging مركزي
   - صعوبة تتبع المشاكل

---

## الإصلاحات المقترحة / Proposed Fixes

### 🔴 Priority 1: توحيد POS مع mishkah-store

```javascript
// حالياً: POS
await fetch('/api/.../orders', {...});  // REST

// مقترح: POS
const db = createDBAuto(schema, ['order_header', 'order_line'], {
  wsPath: '/ws'
});
await db.insert('order_header', {...});  // WebSocket + real-time
```

**الفوائد**:
- Real-time sync بين كل أجهزة POS
- Automatic conflict resolution
- Offline support

**التحديات**:
- إعادة كتابة persistOrderFlow
- Testing مكثف
- Migration path للبيانات الموجودة

### 🔴 Priority 2: Order lifecycle rules

```javascript
// في persistOrderFlow
const orderRules = {
  'dine_in': {
    allowAddLines: (order) => !order.finalized,
    allowEditLines: () => false,  // ممنوع
    allowDeleteLines: () => false // ممنوع
  },
  'delivery': {
    allowAddLines: () => false,     // ممنوع بعد الحفظ
    allowEditLines: () => false,
    allowEditCustomer: (order) => !order.finalized
  },
  'takeaway': {
    allowAddLines: () => false,
    allowEditLines: () => false
  }
};
```

### 🟡 Priority 3: Better conflict UX

```javascript
// عند حدوث conflict
try {
  await db.update('order_header', {...});
} catch (error) {
  if (error.code === 'VERSION_CONFLICT') {
    // ✅ عرض modal للمستخدم
    showConflictModal({
      message: 'تم تعديل الطلب من جهاز آخر',
      options: [
        { label: 'إعادة تحميل', action: 'reload' },
        { label: 'الكتابة فوقه', action: 'force' }
      ]
    });
  }
}
```

### 🟡 Priority 4: Offline queue

```javascript
// في mishkah.store.js
class OfflineQueue {
  queue = [];

  async add(operation) {
    if (!navigator.onLine) {
      this.queue.push(operation);
      await this.saveToIndexedDB();
    }
  }

  async flush() {
    while (this.queue.length) {
      const op = this.queue.shift();
      await this.retry(op);
    }
  }
}
```

---

## Roadmap: منافسة Firebase

### ما لدينا ✅
- ✅ Real-time sync (WebSocket)
- ✅ Offline support (IndexedDB)
- ✅ Conflict resolution (Optimistic locking)
- ✅ Self-hosted (لا cloud fees)
- ✅ Simple API (watch/insert/update/delete)

### ما ينقصنا ❌
- ❌ Authentication & Authorization
- ❌ Server-side queries & filtering
- ❌ File storage
- ❌ Cloud functions (triggers)
- ❌ Dashboard/Admin UI
- ❌ Monitoring & analytics
- ❌ SDKs (mobile, etc.)

### خطة التحسين (6 أشهر)

#### الشهر 1-2: Core stability
1. توحيد POS مع mishkah-store
2. Order lifecycle rules
3. Better error handling & UX
4. Comprehensive testing

#### الشهر 3-4: Developer experience
1. Authentication module
   ```javascript
   db.auth().signIn(email, password)
   db.rules = {
     'order_header': {
       read: (user, order) => user.branchId === order.branchId,
       write: (user) => user.role === 'cashier'
     }
   }
   ```

2. Query API
   ```javascript
   db.query('order_header', {
     where: { status: 'open' },
     orderBy: 'createdAt',
     limit: 100
   })
   ```

3. Admin dashboard (web UI)
   - View all stores/branches
   - Monitor connections
   - View/edit data
   - Logs & metrics

#### الشهر 5-6: Scale & performance
1. Sharding support (multiple stores)
2. Redis cache layer (optional)
3. Compression (WebSocket messages)
4. Rate limiting & quotas
5. Backup & restore

### الميزة التنافسية

| Feature | Firebase | Mishkah Store |
|---------|----------|---------------|
| **Cost** | Pay per usage | Free (self-hosted) |
| **Latency** | ~50-200ms | ~5-20ms (local network) |
| **Offline** | Limited | Full control |
| **Data privacy** | Google Cloud | Your server |
| **Customization** | Limited | Full control |
| **Schema** | Schemaless | Schema-driven |
| **Best for** | Global apps | Local/regional POS |

---

## الخلاصة / Summary

**الوضع الحالي**: Mishkah Store نظام قوي للمشاريع الصغيرة لكن يحتاج:
1. توحيد POS مع WebSocket
2. Order rules أقوى
3. Better UX للـ conflicts
4. Documentation أفضل

**الإمكانات**: مع 3-6 أشهر تطوير، يمكن أن يكون بديل قوي لـ Firebase للمشاريع المحلية/الإقليمية.

**التوصية**:
- ✅ استمر في استخدامه للـ KDS (يعمل بشكل ممتاز)
- ⚠️ هاجر POS إلى mishkah-store (Priority 1)
- 📚 وثق الـ API بشكل أفضل
- 🧪 أضف tests شاملة

---

**آخر تحديث**: 2025-11-07
**الحالة**: Production-ready للـ read-heavy workloads, needs work للـ write-heavy scenarios
