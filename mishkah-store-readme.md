# Mishkah Store Documentation / دليل نظام Mishkah Store

## Overview / نظرة عامة

Mishkah Store is a **real-time, WebSocket-based data synchronization system** designed for multi-device POS applications. It provides automatic state synchronization across devices with offline support via IndexedDB.

نظام Mishkah Store هو **نظام مزامنة بيانات فوري عبر WebSocket** مصمم لتطبيقات نقاط البيع متعددة الأجهزة. يوفر مزامنة تلقائية للحالة عبر الأجهزة مع دعم العمل بلا اتصال عبر IndexedDB.

---

## Key Differences from Firebase / الفروقات الرئيسية عن Firebase

| Feature | Mishkah Store | Firebase |
|---------|---------------|----------|
| **Architecture** | Self-hosted WebSocket + IndexedDB | Cloud-hosted (Google) |
| **Data Model** | Table-based (SQL-like) | Document/Collection based |
| **Real-time** | WebSocket events | WebSocket + REST |
| **Offline** | IndexedDB automatic | Firestore persistence |
| **Schema** | Schema-driven from `definition.json` | Schemaless |
| **Queries** | In-memory filtering after sync | Server-side queries |
| **Authentication** | Handled externally | Built-in Firebase Auth |

### Important Conceptual Differences:

#### 1. **Data Organization**

**Firebase:**
```javascript
// Collection → Document → Fields
db.collection('orders').doc('order123').get()
```

**Mishkah:**
```javascript
// Table → Records (all in memory after sync)
db.watch('order_header', (orders) => {
  // orders is complete array of all records
  const order = orders.find(o => o.id === 'order123');
});
```

#### 2. **Real-time Updates**

**Firebase:**
```javascript
// Subscribe to specific document or query
db.collection('orders').where('status', '==', 'pending')
  .onSnapshot(snapshot => { ... });
```

**Mishkah:**
```javascript
// Subscribe to entire table, filter in memory
db.watch('order_header', (allOrders) => {
  const pending = allOrders.filter(o => o.status === 'pending');
});
```

#### 3. **Updates**

**Firebase:**
```javascript
// Update specific document
await db.collection('orders').doc('order123').update({
  status: 'completed'
});
```

**Mishkah:**
```javascript
// Update by sending full/partial record with ID
await db.update('order_header', {
  id: 'order123',
  status: 'completed'
});
```

---

## Architecture / البنية المعمارية

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Application                         │
│  (KDS, POS, Reports, etc.)                                  │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ createDB() / createDBAuto()
                 ▼
┌─────────────────────────────────────────────────────────────┐
│              mishkah.simple-store.js                         │
│  • Object definitions (name → table mapping)                │
│  • watch() / status() subscriptions                         │
│  • insert() / update() / delete() operations                │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ store.insert() / store.merge() / store.remove()
                 ▼
┌─────────────────────────────────────────────────────────────┐
│              mishkah.store.js                                │
│  • WebSocket connection management                          │
│  • Event broadcasting (snapshot, event, status)             │
│  • IndexedDB persistence                                    │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ WebSocket (/ws)
                 ▼
┌─────────────────────────────────────────────────────────────┐
│              Backend Server                                  │
│  • Handles data persistence                                 │
│  • Broadcasts changes to all connected clients              │
└─────────────────────────────────────────────────────────────┘
```

---

## API Reference / مرجع الواجهة البرمجية

### 1. Database Creation / إنشاء قاعدة البيانات

#### `createDB(options)`

Creates a database instance with manual table registration.

```javascript
const db = createDB({
  branchId: 'dar',           // Branch identifier
  moduleId: 'pos',           // Module identifier
  role: 'kds-station',       // Client role
  wsPath: '/ws',             // WebSocket path (relative)
  autoConnect: true,         // Auto-connect on creation
  useIndexedDB: true,        // Enable offline persistence

  // Manual table registration
  objects: {
    kitchen_section: {
      table: 'kitchen_section'  // Map name → table
    },
    order_header: {
      table: 'order_header'
    },
    order_line: {
      table: 'order_line'
    }
  }
});
```

**Options:**

- `branchId` (string): Branch identifier (e.g., 'dar', 'riyadh')
- `moduleId` (string): Module identifier (e.g., 'pos', 'kds', 'reports')
- `role` (string): Client role for permissions
- `wsPath` (string): WebSocket endpoint path (use relative path, NOT full URL)
- `wsUrl` (string): ⚠️ Don't use - prefer `wsPath` for automatic URL resolution
- `autoConnect` (boolean): Auto-connect on creation (default: true)
- `useIndexedDB` (boolean): Enable IndexedDB persistence (default: true)
- `objects` (object): Table definitions (name → table mapping)

#### `createDBAuto(schema, entries, options)`

Creates a database with automatic table registration from schema.

```javascript
const posSchema = window.database.schema;  // From definition.json

const db = createDBAuto(
  posSchema,  // Schema object
  ['kitchen_section', 'order_header', 'order_line'],  // Tables to register
  {
    branchId: 'dar',
    moduleId: 'pos',
    role: 'kds-station',
    wsPath: '/ws',
    autoConnect: true,
    useIndexedDB: true
  }
);
```

**When to use createDBAuto:**
- ✅ You have a schema definition available (`window.database.schema`)
- ✅ You want automatic table lookup from schema
- ✅ Cleaner code with less manual configuration

**When to use createDB:**
- You don't have a schema object
- You need custom `toRecord` / `fromRecord` transformations
- You're working without a formal schema

---

### 2. Connection Management / إدارة الاتصال

#### `db.connect()`

Manually connect to the WebSocket server.

```javascript
try {
  await db.connect();
  console.log('Connected to Mishkah Store');
} catch (err) {
  console.error('Connection failed:', err);
}
```

**Note:** Usually not needed if `autoConnect: true` (default).

#### `db.disconnect()`

Disconnect from the WebSocket server.

```javascript
db.disconnect();
```

#### `db.ready()`

Wait for connection to be ready.

```javascript
await db.ready();
console.log('Store is ready');
```

---

### 3. Watching Data / مراقبة البيانات

#### `db.watch(name, handler, options)`

Subscribe to real-time updates for a table.

```javascript
// Basic usage
db.watch('order_header', (orders) => {
  console.log('Orders updated:', orders.length);
  orders.forEach(order => {
    console.log(`Order ${order.orderNumber}: ${order.status}`);
  });
});

// With metadata
db.watch('order_line', (lines, meta) => {
  console.log('Table name:', meta.table);
  console.log('Raw rows:', meta.rows);

  // Filter in memory
  const pending = lines.filter(line => line.statusId === 'queued');
});

// Without immediate call
const unsubscribe = db.watch('kitchen_section', (sections) => {
  console.log('Sections changed');
}, { immediate: false });  // Don't call handler immediately

// Unsubscribe
unsubscribe();
```

**Parameters:**
- `name` (string): Object name (must match `objects` key)
- `handler` (function): Callback receiving `(data, meta)`
  - `data`: Array of records processed by `fromRecord()`
  - `meta.table`: Table name
  - `meta.rows`: Raw database rows
- `options.immediate` (boolean): Call handler immediately with current data (default: true)

**Returns:** Unsubscribe function

**Important Notes:**
- 🔄 Handler is called **every time the table changes**
- 📦 You receive the **entire table** as an array (not just changes)
- 🎯 Filter data in memory - no server-side queries
- ⚡ Very efficient for small to medium datasets (< 10,000 records)

---

### 4. Monitoring Connection Status / مراقبة حالة الاتصال

#### `db.status(handler)`

Subscribe to connection status changes.

```javascript
db.status((status) => {
  console.log('Connection status:', status);

  if (status === 'connected') {
    console.log('✅ Connected to server');
  } else if (status === 'disconnected') {
    console.log('❌ Disconnected from server');
  } else if (status === 'connecting') {
    console.log('⏳ Connecting...');
  }
});
```

**Status Values:**
- `'idle'`: Not connected yet
- `'connecting'`: Connection in progress
- `'connected'`: Successfully connected
- `'disconnected'`: Connection lost

**Returns:** Unsubscribe function

**Key Difference from `db.watch()`:**
- `db.status()` → Connection state (connected/disconnected)
- `db.watch()` → Data changes (order updates, new items, etc.)

---

### 5. Writing Data / كتابة البيانات

#### `db.insert(name, value, meta)`

Insert a new record.

```javascript
await db.insert('order_header', {
  orderNumber: 'ORD-001',
  serviceMode: 'dine_in',
  tableLabel: 'T5',
  status: 'pending'
});

// ID and timestamps are auto-generated
```

**Notes:**
- Auto-generates `id` if not provided (using UUID)
- Auto-adds `branchId`, `createdAt`, `serverAt`
- Uses `toRecord()` transformation if defined

#### `db.update(name, value, meta)`

Update or insert (upsert) a record.

```javascript
// Update existing record
await db.update('order_line', {
  id: 'line-uuid-123',
  statusId: 'cooking'
});

// Creates new record if ID doesn't exist
await db.update('order_line', {
  id: 'new-line-456',
  itemId: 'item-789',
  quantity: 2,
  statusId: 'queued'
});
```

**Important:**
- Must include `id` field
- Performs **merge** (partial update) - only specified fields are updated
- Creates new record if ID doesn't exist
- Uses `toRecord()` transformation

**Example from KDS v2:**

```javascript
// Update order line status
window.startJob = async function(jobId) {
  const job = state.jobs.get(jobId);

  for (const item of job.items) {
    await db.update('order_line', {
      id: item.id,           // ✅ Must include ID
      statusId: 'cooking'    // ✅ Partial update
    });
  }
};
```

#### `db.delete(name, recordRef, meta)`

Delete a record.

```javascript
// Delete by ID
await db.delete('order_line', { id: 'line-uuid-123' });

// Delete by reference object
await db.delete('order_line', lineRecord);
```

---

### 6. Reading Data / قراءة البيانات

#### `db.list(name)`

Get current snapshot of data (synchronous).

```javascript
const orders = db.list('order_header');
console.log('Current orders:', orders.length);

// This is a one-time read - doesn't subscribe to changes
```

**When to use:**
- Need immediate synchronous access to data
- Don't need real-time updates
- Reading inside event handlers

**When to use `db.watch()` instead:**
- Need automatic updates when data changes
- Building reactive UIs
- Want to stay synchronized with other clients

---

## Complete Working Example: KDS v2

This is the actual implementation from `static/kds-v2.js`:

```javascript
// ==================== Configuration ====================
const CONFIG = {
  branchId: 'dar',
  moduleId: 'pos',
  role: 'kds-station',
  wsPath: '/ws'  // ✅ Use relative path
};

// ==================== State ====================
const state = {
  connected: false,
  sections: [],
  orders: [],
  lines: [],
  jobs: new Map()
};

// ==================== Database Setup ====================
const database = window.database || {};
const posSchema = database.schema || database.pos_schema || null;

let db;
if (posSchema && typeof createDBAuto === 'function') {
  // ✅ Automatic registration with schema
  db = createDBAuto(posSchema,
    ['kitchen_section', 'order_header', 'order_line'],
    {
      branchId: CONFIG.branchId,
      moduleId: CONFIG.moduleId,
      role: CONFIG.role,
      wsPath: CONFIG.wsPath,
      autoConnect: true,
      useIndexedDB: true
    }
  );
} else {
  // ✅ Manual registration fallback
  db = createDB({
    branchId: CONFIG.branchId,
    moduleId: CONFIG.moduleId,
    role: CONFIG.role,
    wsPath: CONFIG.wsPath,
    autoConnect: true,
    useIndexedDB: true,
    objects: {
      kitchen_section: { table: 'kitchen_section' },
      order_header: { table: 'order_header' },
      order_line: { table: 'order_line' }
    }
  });
}

// ==================== Data Watching ====================

// Watch connection status
db.status((status) => {
  console.log('[KDS] Connection status:', status);
  state.connected = status === 'connected';
  updateConnectionUI();
});

// Watch kitchen sections
db.watch('kitchen_section', (sections) => {
  console.log('[KDS] Sections updated:', sections.length);
  state.sections = sections || [];
  renderTabs();
  renderOrders();
});

// Watch order headers
db.watch('order_header', (headers) => {
  console.log('[KDS] Orders updated:', headers.length);
  state.orders = headers || [];
  processOrders();
});

// Watch order lines
db.watch('order_line', (lines) => {
  console.log('[KDS] Lines updated:', lines.length);
  state.lines = lines || [];
  processOrders();
});

// ==================== Processing Logic ====================
function processOrders() {
  if (!state.orders || !state.lines) return;

  state.jobs.clear();

  // Group lines by order and kitchen section
  state.lines.forEach(line => {
    const orderId = line.orderId;
    const sectionId = line.kitchenSectionId;  // ✅ Direct from backend

    if (!orderId || !sectionId) return;

    const order = state.orders.find(o => o.id === orderId);
    if (!order) return;

    // Create unique job ID: orderId:sectionId
    const jobId = `${orderId}:${sectionId}`;

    if (!state.jobs.has(jobId)) {
      state.jobs.set(jobId, {
        id: jobId,
        orderId: orderId,
        orderNumber: order.orderNumber,
        sectionId: sectionId,
        items: [],
        status: 'queued'
      });
    }

    const job = state.jobs.get(jobId);
    job.items.push({
      id: line.id,
      itemId: line.itemId,
      nameAr: line.itemNameAr,
      quantity: line.quantity,
      status: line.statusId
    });
  });

  renderOrders();
}

// ==================== Update Actions ====================

// Start cooking
window.startJob = async function(jobId) {
  const job = state.jobs.get(jobId);
  if (!job) return;

  for (const item of job.items) {
    await db.update('order_line', {
      id: item.id,           // ✅ Must include ID
      statusId: 'cooking'    // ✅ Partial update
    });
  }
};

// Mark ready
window.markJobReady = async function(jobId) {
  const job = state.jobs.get(jobId);
  if (!job) return;

  for (const item of job.items) {
    await db.update('order_line', {
      id: item.id,
      statusId: 'ready'
    });
  }
};

// Bump (complete)
window.bumpJob = async function(jobId) {
  const job = state.jobs.get(jobId);
  if (!job) return;

  for (const item of job.items) {
    await db.update('order_line', {
      id: item.id,
      statusId: 'completed'
    });
  }
};

// ==================== Initialize ====================
try {
  await db.connect();
  console.log('[KDS] Connected successfully');
} catch (err) {
  console.error('[KDS] Connection failed:', err);
}
```

---

## Common Patterns / الأنماط الشائعة

### Pattern 1: Reactive State Updates

```javascript
// ✅ Good: Let watch() handle updates
db.watch('order_header', (orders) => {
  state.orders = orders;
  renderUI();  // Re-render automatically
});

// ❌ Bad: Manual polling
setInterval(() => {
  const orders = db.list('order_header');
  state.orders = orders;
  renderUI();
}, 1000);
```

### Pattern 2: Joining Data

```javascript
// Watch both tables
db.watch('order_header', (headers) => {
  state.headers = headers;
  updateJoinedView();
});

db.watch('order_line', (lines) => {
  state.lines = lines;
  updateJoinedView();
});

// Join in memory
function updateJoinedView() {
  const joined = state.headers.map(header => ({
    ...header,
    lines: state.lines.filter(line => line.orderId === header.id)
  }));
  renderOrders(joined);
}
```

### Pattern 3: Filtering and Grouping

```javascript
db.watch('order_line', (lines) => {
  // Group by section
  const bySection = {};
  lines.forEach(line => {
    const section = line.kitchenSectionId;
    if (!bySection[section]) bySection[section] = [];
    bySection[section].push(line);
  });

  // Filter by status
  const pending = lines.filter(l => l.statusId === 'queued');
  const cooking = lines.filter(l => l.statusId === 'cooking');
  const ready = lines.filter(l => l.statusId === 'ready');

  renderBySections(bySection);
  updateCounts({ pending: pending.length, cooking: cooking.length });
});
```

### Pattern 4: Batch Updates

```javascript
// Update multiple records efficiently
async function updateOrderStatus(orderId, newStatus) {
  const lines = state.lines.filter(l => l.orderId === orderId);

  // Update all in parallel
  await Promise.all(
    lines.map(line =>
      db.update('order_line', {
        id: line.id,
        statusId: newStatus
      })
    )
  );
}
```

---

## Best Practices / أفضل الممارسات

### ✅ Do's / افعل

1. **Use relative paths for WebSocket**
   ```javascript
   // ✅ Good
   wsPath: '/ws'

   // ❌ Bad
   wsUrl: 'wss://dar.mishkah.app/ws'
   ```

2. **Always include ID in updates**
   ```javascript
   // ✅ Good
   await db.update('order_line', {
     id: line.id,
     statusId: 'cooking'
   });

   // ❌ Bad
   await db.update('order_line', {
     statusId: 'cooking'  // No ID!
   });
   ```

3. **Filter data in memory**
   ```javascript
   // ✅ Good
   db.watch('order_header', (orders) => {
     const pending = orders.filter(o => o.status === 'pending');
   });
   ```

4. **Use db.status() for connection monitoring**
   ```javascript
   // ✅ Good
   db.status((status) => {
     if (status === 'connected') {
       showOnlineIndicator();
     } else {
       showOfflineIndicator();
     }
   });
   ```

5. **Prefer createDBAuto when schema is available**
   ```javascript
   // ✅ Good
   const db = createDBAuto(posSchema, ['order_header', 'order_line'], config);

   // ⚠️ More verbose
   const db = createDB({
     ...config,
     objects: {
       order_header: { table: 'order_header' },
       order_line: { table: 'order_line' }
     }
   });
   ```

### ❌ Don'ts / لا تفعل

1. **Don't use non-existent methods**
   ```javascript
   // ❌ Wrong
   db.onStatusChange((status) => { ... });

   // ✅ Correct
   db.status((status) => { ... });
   ```

2. **Don't separate ID from update data**
   ```javascript
   // ❌ Wrong
   await db.update('order_line', line.id, { statusId: 'cooking' });

   // ✅ Correct
   await db.update('order_line', { id: line.id, statusId: 'cooking' });
   ```

3. **Don't manually poll for changes**
   ```javascript
   // ❌ Wrong
   setInterval(() => {
     const orders = db.list('order_header');
     updateUI(orders);
   }, 1000);

   // ✅ Correct
   db.watch('order_header', (orders) => {
     updateUI(orders);
   });
   ```

4. **Don't expect server-side filtering**
   ```javascript
   // ❌ Wrong expectation (Mishkah doesn't support this)
   db.watch('order_header', { where: { status: 'pending' } }, callback);

   // ✅ Correct
   db.watch('order_header', (orders) => {
     const pending = orders.filter(o => o.status === 'pending');
   });
   ```

5. **Don't forget to handle null/undefined**
   ```javascript
   // ❌ Risky
   db.watch('order_header', (orders) => {
     orders.forEach(order => { ... });  // May crash if null
   });

   // ✅ Safe
   db.watch('order_header', (orders) => {
     (orders || []).forEach(order => { ... });
   });
   ```

---

## Troubleshooting / استكشاف الأخطاء

### Error: `db.onStatusChange is not a function`

**Problem:** Using wrong method name

**Solution:**
```javascript
// ❌ Wrong
db.onStatusChange((status) => { ... });

// ✅ Correct
db.status((status) => { ... });
```

### Error: WebSocket connection failed

**Problem:** Using absolute URL instead of relative path

**Solution:**
```javascript
// ❌ Wrong
createDB({ wsUrl: 'wss://dar.mishkah.app/ws' })

// ✅ Correct
createDB({ wsPath: '/ws' })
```

### Data not updating in watch()

**Problem:** Table not registered

**Solution:**
```javascript
// ✅ Register tables
const db = createDB({
  objects: {
    order_header: { table: 'order_header' }
  }
});

// Or use createDBAuto
const db = createDBAuto(schema, ['order_header'], config);
```

### Update not working

**Problem:** Missing ID field or wrong signature

**Solution:**
```javascript
// ❌ Wrong
await db.update('order_line', { statusId: 'cooking' });

// ✅ Correct - include ID
await db.update('order_line', {
  id: 'line-uuid-123',
  statusId: 'cooking'
});
```

---

## Summary: Mishkah vs Firebase

| Aspect | Mishkah Store | Firebase |
|--------|---------------|----------|
| **Philosophy** | Table-based sync, all data in memory | Document-based, lazy loading |
| **Best for** | Small-medium datasets, multi-device POS | Large datasets, global scale |
| **Real-time** | WebSocket to self-hosted server | WebSocket to Google Cloud |
| **Queries** | In-memory filtering | Server-side queries |
| **Offline** | IndexedDB automatic | Firestore persistence |
| **Data shape** | Arrays of records | Nested documents |
| **Updates** | Merge by ID | Document reference |
| **Cost** | Self-hosted (free after setup) | Pay per usage |

---

## Quick Reference Card

```javascript
// Setup
const db = createDBAuto(schema, ['table1', 'table2'], {
  branchId: 'branch-id',
  moduleId: 'module-id',
  wsPath: '/ws'
});

// Connection
await db.connect();
db.status((status) => console.log(status));

// Watch data
db.watch('table_name', (data) => {
  console.log(data);  // Array of records
});

// Insert
await db.insert('table_name', { field: 'value' });

// Update
await db.update('table_name', { id: 'rec-123', field: 'new-value' });

// Delete
await db.delete('table_name', { id: 'rec-123' });

// One-time read
const data = db.list('table_name');
```

---

## Additional Resources / موارد إضافية

- **Schema Definition:** `data/branches/[branchId]/modules/[moduleId]/schema/definition.json`
- **Core Library:** `static/lib/mishkah.store.js`
- **Simple Store:** `static/lib/mishkah.simple-store.js`
- **Example Implementation:** `static/kds-v2.js` and `static/kds-v2.html`
- **CRUD Example:** `static/crud.html`

---

**Created:** 2025-11-05
**Version:** 1.0
**Based on:** mishkah.simple-store.js (Mishkah Realtime Simple DSL)
