import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const TEST_DB_DIR = path.join(os.tmpdir(), 'mishkah-ws-hybrid-tests');
const TEST_DB_FILENAME = 'hybrid-purge-test.sqlite';
const TEST_DB_PATH = path.join(TEST_DB_DIR, TEST_DB_FILENAME);

await mkdir(TEST_DB_DIR, { recursive: true });
await rm(TEST_DB_PATH, { force: true });

process.env.HYBRID_SQLITE_DIR = TEST_DB_DIR;
process.env.HYBRID_SQLITE_FILENAME = TEST_DB_FILENAME;

const { default: HybridStore } = await import('../src/hybridStore.js');
const {
  persistRecord: persistSqlRecord,
  loadTableRecords,
  initializeSqlite
} = await import('../src/db/sqlite.js');
const { default: SchemaEngine } = await import('../src/schema/engine.js');

initializeSqlite({ path: TEST_DB_PATH });

test('clearTables purges persisted rows after loading the cold cache', async () => {
  const schemaEngine = new SchemaEngine();
  await schemaEngine.loadFromFile(path.join(ROOT_DIR, 'data/schemas/pos_schema.json'));

  const definition = {
    tables: ['order_header', 'order_line', 'order_payment', 'pos_shift']
  };
  const store = new HybridStore(
    schemaEngine,
    'test-branch',
    'pos',
    definition,
    { version: 1, meta: {}, tables: {} },
    null,
    { cacheTtlMs: 5 }
  );

  const context = { branchId: 'test-branch', moduleId: 'pos' };

  persistSqlRecord(
    'order_header',
    {
      id: 'ord-1',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      status: 'open',
      stage: 'draft',
      paymentState: 'pending',
      version: 1
    },
    context
  );
  persistSqlRecord(
    'order_line',
    {
      id: 'line-1',
      orderId: 'ord-1',
      status: 'open',
      stage: 'draft',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      version: 1
    },
    context
  );
  persistSqlRecord(
    'order_payment',
    {
      id: 'pay-1',
      orderId: 'ord-1',
      method: 'cash',
      capturedAt: '2024-01-01T00:00:00.000Z',
      amount: 10,
      version: 1
    },
    context
  );

  assert.equal(loadTableRecords('order_header', context).length, 1);
  assert.equal(loadTableRecords('order_line', context).length, 1);
  assert.equal(loadTableRecords('order_payment', context).length, 1);

  const result = store.clearTables(['order_header', 'order_line', 'order_payment']);

  assert.equal(result.totalRemoved, 3);
  assert.equal(result.changed, true);

  const clearedCounts = Object.fromEntries(
    result.cleared.map((entry) => [entry.table, entry.removed])
  );
  assert.deepEqual(clearedCounts, {
    order_header: 1,
    order_line: 1,
    order_payment: 1
  });

  assert.equal(loadTableRecords('order_header', context).length, 0);
  assert.equal(loadTableRecords('order_line', context).length, 0);
  assert.equal(loadTableRecords('order_payment', context).length, 0);
});

test('clearTables purges rows even when SQLite stored branch/module ids with different casing', async () => {
  const schemaEngine = new SchemaEngine();
  await schemaEngine.loadFromFile(path.join(ROOT_DIR, 'data/schemas/pos_schema.json'));

  const definition = {
    tables: ['order_header', 'order_line', 'order_payment']
  };
  const store = new HybridStore(
    schemaEngine,
    'test-branch',
    'pos',
    definition,
    { version: 1, meta: {}, tables: {} },
    null,
    { cacheTtlMs: 5 }
  );

  const legacyContext = { branchId: 'TEST-BRANCH', moduleId: 'POS' };
  const db = initializeSqlite();
  db
    .prepare(
      `INSERT INTO order_header (branch_id, module_id, id, status, stage, payment_state, created_at, updated_at, version, payload)
       VALUES (@branch_id, @module_id, @id, @status, @stage, @payment_state, @created_at, @updated_at, @version, @payload)`
    )
    .run({
      branch_id: legacyContext.branchId,
      module_id: legacyContext.moduleId,
      id: 'ord-legacy',
      status: 'open',
      stage: 'draft',
      payment_state: 'pending',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      version: 1,
      payload: JSON.stringify({ id: 'ord-legacy', status: 'open', stage: 'draft', paymentState: 'pending', version: 1 })
    });

  db
    .prepare(
      `INSERT INTO order_line (branch_id, module_id, id, order_id, status, stage, created_at, updated_at, version, payload)
       VALUES (@branch_id, @module_id, @id, @order_id, @status, @stage, @created_at, @updated_at, @version, @payload)`
    )
    .run({
      branch_id: legacyContext.branchId,
      module_id: legacyContext.moduleId,
      id: 'line-legacy',
      order_id: 'ord-legacy',
      status: 'open',
      stage: 'draft',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      version: 1,
      payload: JSON.stringify({ id: 'line-legacy', orderId: 'ord-legacy', status: 'open', stage: 'draft', version: 1 })
    });

  db
    .prepare(
      `INSERT INTO order_payment (branch_id, module_id, id, order_id, method, captured_at, amount, payload)
       VALUES (@branch_id, @module_id, @id, @order_id, @method, @captured_at, @amount, @payload)`
    )
    .run({
      branch_id: legacyContext.branchId,
      module_id: legacyContext.moduleId,
      id: 'payment-legacy',
      order_id: 'ord-legacy',
      method: 'cash',
      captured_at: '2024-01-01T00:00:00.000Z',
      amount: 25,
      payload: JSON.stringify({ id: 'payment-legacy', orderId: 'ord-legacy', method: 'cash', amount: 25, version: 1 })
    });

  assert.equal(loadTableRecords('order_header', { branchId: 'test-branch', moduleId: 'pos' }).length, 1);
  assert.equal(loadTableRecords('order_line', { branchId: 'test-branch', moduleId: 'pos' }).length, 1);
  assert.equal(loadTableRecords('order_payment', { branchId: 'test-branch', moduleId: 'pos' }).length, 1);

  const result = store.clearTables(['order_header', 'order_line', 'order_payment']);

  assert.equal(result.totalRemoved, 3);
  assert.equal(result.changed, true);

  assert.equal(loadTableRecords('order_header', { branchId: 'test-branch', moduleId: 'pos' }).length, 0);
  assert.equal(loadTableRecords('order_line', { branchId: 'test-branch', moduleId: 'pos' }).length, 0);
  assert.equal(loadTableRecords('order_payment', { branchId: 'test-branch', moduleId: 'pos' }).length, 0);
});
