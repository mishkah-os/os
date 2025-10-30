import path from 'path';
import { mkdirSync } from 'fs';

import Database from 'better-sqlite3';

let database = null;
const statementCache = new Map();

const DEFAULT_TABLES = new Set(['order_header', 'order_line', 'order_payment', 'pos_shift']);

function normalizeKey(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

function normalizeContext(context = {}) {
  const branchId = normalizeKey(context.branchId);
  const moduleId = normalizeKey(context.moduleId);
  if (!branchId || !moduleId) {
    return { branchId: null, moduleId: null };
  }
  return { branchId, moduleId };
}

function resolveDatabasePath(options = {}) {
  if (options.path) return options.path;
  const rootDir = options.rootDir || process.cwd();
  const filename = options.filename || process.env.HYBRID_SQLITE_FILENAME || 'hybrid-store.sqlite';
  const baseDir = options.baseDir || process.env.HYBRID_SQLITE_DIR || path.join(rootDir, 'data');
  return path.join(baseDir, filename);
}

function ensureDirectory(filePath) {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
}

function openDatabase(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function createTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_header (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      shift_id TEXT,
      status TEXT,
      stage TEXT,
      payment_state TEXT,
      created_at TEXT,
      updated_at TEXT,
      version INTEGER DEFAULT 1,
      payload TEXT NOT NULL,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS order_header_branch_shift_idx ON order_header (branch_id, module_id, shift_id)');
  db.exec('CREATE INDEX IF NOT EXISTS order_header_updated_idx ON order_header (branch_id, module_id, updated_at DESC)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS order_line (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      status TEXT,
      stage TEXT,
      created_at TEXT,
      updated_at TEXT,
      version INTEGER DEFAULT 1,
      payload TEXT NOT NULL,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS order_line_order_idx ON order_line (branch_id, module_id, order_id)');
  db.exec('CREATE INDEX IF NOT EXISTS order_line_updated_idx ON order_line (branch_id, module_id, updated_at DESC)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS order_payment (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      method TEXT,
      captured_at TEXT,
      amount REAL,
      payload TEXT NOT NULL,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS order_payment_order_idx ON order_payment (branch_id, module_id, order_id)');
  db.exec('CREATE INDEX IF NOT EXISTS order_payment_captured_idx ON order_payment (branch_id, module_id, captured_at DESC)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS pos_shift (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      pos_id TEXT,
      status TEXT,
      is_closed INTEGER DEFAULT 0,
      opened_at TEXT,
      closed_at TEXT,
      created_at TEXT,
      updated_at TEXT,
      version INTEGER DEFAULT 1,
      payload TEXT NOT NULL,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS pos_shift_pos_status_idx ON pos_shift (branch_id, module_id, pos_id, is_closed)');
  db.exec('CREATE INDEX IF NOT EXISTS pos_shift_updated_idx ON pos_shift (branch_id, module_id, updated_at DESC)');
}

export function initializeSqlite(options = {}) {
  if (database) return database;
  const dbPath = resolveDatabasePath(options);
  ensureDirectory(dbPath);
  database = openDatabase(dbPath);
  createTables(database);
  return database;
}

function getDatabaseInstance() {
  if (!database) {
    return initializeSqlite();
  }
  return database;
}

function buildHeaderRow(record = {}, context = {}) {
  if (!record || record.id == null) {
    throw new Error('order_header record requires an id');
  }
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) {
    throw new Error('order_header record requires branchId and moduleId');
  }
  const status = record.status || record.statusId || record.metadata?.status || null;
  const stage = record.fulfillmentStage || record.stage || null;
  const paymentState = record.paymentState || record.payment_state || null;
  const createdAt = record.createdAt || record.created_at || null;
  const updatedAt = record.updatedAt || record.updated_at || record.savedAt || record.saved_at || createdAt;
  const shiftId = record.shiftId || record.shift_id || record.metadata?.shiftId || null;
  const version = Number.isFinite(Number(record.version)) ? Math.trunc(Number(record.version)) : 1;
  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id),
    shift_id: shiftId ? String(shiftId) : null,
    status: status ? String(status) : null,
    stage: stage ? String(stage) : null,
    payment_state: paymentState ? String(paymentState) : null,
    created_at: createdAt || null,
    updated_at: updatedAt || createdAt || null,
    version,
    payload: JSON.stringify(record)
  };
}

function buildLineRow(record = {}, context = {}) {
  if (!record || record.id == null) {
    throw new Error('order_line record requires an id');
  }
  const orderId = record.orderId || record.order_id;
  if (!orderId) {
    throw new Error('order_line record requires an orderId');
  }
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) {
    throw new Error('order_line record requires branchId and moduleId');
  }
  const status = record.status || record.statusId || null;
  const stage = record.stage || record.fulfillmentStage || null;
  const createdAt = record.createdAt || record.created_at || null;
  const updatedAt = record.updatedAt || record.updated_at || createdAt;
  const version = Number.isFinite(Number(record.version)) ? Math.trunc(Number(record.version)) : 1;
  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id),
    order_id: String(orderId),
    status: status ? String(status) : null,
    stage: stage ? String(stage) : null,
    created_at: createdAt || null,
    updated_at: updatedAt || createdAt || null,
    version,
    payload: JSON.stringify(record)
  };
}

function buildPaymentRow(record = {}, context = {}) {
  if (!record || record.id == null) {
    throw new Error('order_payment record requires an id');
  }
  const orderId = record.orderId || record.order_id;
  if (!orderId) {
    throw new Error('order_payment record requires an orderId');
  }
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) {
    throw new Error('order_payment record requires branchId and moduleId');
  }
  const method =
    record.paymentMethodId ||
    record.method ||
    record.methodId ||
    (record.metadata && record.metadata.method) ||
    null;
  const amountValue = Number(record.amount);
  const amount = Number.isFinite(amountValue) ? amountValue : null;
  const capturedAt = record.capturedAt || record.captured_at || record.processedAt || null;
  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id),
    order_id: String(orderId),
    method: method ? String(method) : null,
    captured_at: capturedAt || null,
    amount,
    payload: JSON.stringify(record)
  };
}

function buildShiftRow(record = {}, context = {}) {
  if (!record || record.id == null) {
    throw new Error('pos_shift record requires an id');
  }
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) {
    throw new Error('pos_shift record requires branchId and moduleId');
  }
  const posId = record.posId || record.pos_id || null;
  const status = record.status || null;
  const isClosed = record.isClosed || record.is_closed || false;
  const openedAt = record.openedAt || record.opened_at || null;
  const closedAt = record.closedAt || record.closed_at || null;
  const createdAt = record.createdAt || record.created_at || null;
  const updatedAt = record.updatedAt || record.updated_at || record.savedAt || record.saved_at || createdAt;
  const version = Number.isFinite(Number(record.version)) ? Math.trunc(Number(record.version)) : 1;
  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id),
    pos_id: posId ? String(posId) : null,
    status: status ? String(status) : null,
    is_closed: isClosed ? 1 : 0,
    opened_at: openedAt || null,
    closed_at: closedAt || null,
    created_at: createdAt || null,
    updated_at: updatedAt || createdAt || null,
    version,
    payload: JSON.stringify(record)
  };
}

function getBuilder(tableName) {
  switch (tableName) {
    case 'order_header':
      return buildHeaderRow;
    case 'order_line':
      return buildLineRow;
    case 'order_payment':
      return buildPaymentRow;
    case 'pos_shift':
      return buildShiftRow;
    default:
      return null;
  }
}

function getStatements(tableName) {
  if (statementCache.has(tableName)) {
    return statementCache.get(tableName);
  }
  const db = getDatabaseInstance();
  let statements = null;
  switch (tableName) {
    case 'order_header':
      statements = {
        upsert: db.prepare(`
          INSERT INTO order_header (branch_id, module_id, id, shift_id, status, stage, payment_state, created_at, updated_at, version, payload)
          VALUES (@branch_id, @module_id, @id, @shift_id, @status, @stage, @payment_state, @created_at, @updated_at, @version, @payload)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
            shift_id = excluded.shift_id,
            status = excluded.status,
            stage = excluded.stage,
            payment_state = excluded.payment_state,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            version = excluded.version,
            payload = excluded.payload
        `),
        remove: db.prepare(
          'DELETE FROM order_header WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'
        ),
        truncate: db.prepare(
          'DELETE FROM order_header WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'
        ),
        load: db.prepare(
          'SELECT payload FROM order_header WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE ORDER BY updated_at DESC'
        )
      };
      break;
    case 'order_line':
      statements = {
        upsert: db.prepare(`
          INSERT INTO order_line (branch_id, module_id, id, order_id, status, stage, created_at, updated_at, version, payload)
          VALUES (@branch_id, @module_id, @id, @order_id, @status, @stage, @created_at, @updated_at, @version, @payload)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
            order_id = excluded.order_id,
            status = excluded.status,
            stage = excluded.stage,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            version = excluded.version,
            payload = excluded.payload
        `),
        remove: db.prepare(
          'DELETE FROM order_line WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'
        ),
        truncate: db.prepare(
          'DELETE FROM order_line WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'
        ),
        load: db.prepare(
          'SELECT payload FROM order_line WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE ORDER BY updated_at DESC'
        )
      };
      break;
    case 'order_payment':
      statements = {
        upsert: db.prepare(`
          INSERT INTO order_payment (branch_id, module_id, id, order_id, method, captured_at, amount, payload)
          VALUES (@branch_id, @module_id, @id, @order_id, @method, @captured_at, @amount, @payload)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
            order_id = excluded.order_id,
            method = excluded.method,
            captured_at = excluded.captured_at,
            amount = excluded.amount,
            payload = excluded.payload
        `),
        remove: db.prepare(
          'DELETE FROM order_payment WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'
        ),
        truncate: db.prepare(
          'DELETE FROM order_payment WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'
        ),
        load: db.prepare(
          'SELECT payload FROM order_payment WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE ORDER BY captured_at DESC'
        )
      };
      break;
    case 'pos_shift':
      statements = {
        upsert: db.prepare(`
          INSERT INTO pos_shift (branch_id, module_id, id, pos_id, status, is_closed, opened_at, closed_at, created_at, updated_at, version, payload)
          VALUES (@branch_id, @module_id, @id, @pos_id, @status, @is_closed, @opened_at, @closed_at, @created_at, @updated_at, @version, @payload)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
            pos_id = excluded.pos_id,
            status = excluded.status,
            is_closed = excluded.is_closed,
            opened_at = excluded.opened_at,
            closed_at = excluded.closed_at,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            version = excluded.version,
            payload = excluded.payload
        `),
        remove: db.prepare(
          'DELETE FROM pos_shift WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'
        ),
        truncate: db.prepare(
          'DELETE FROM pos_shift WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'
        ),
        load: db.prepare(
          'SELECT payload FROM pos_shift WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE ORDER BY updated_at DESC'
        )
      };
      break;
    default:
      statements = null;
  }
  if (statements) {
    statementCache.set(tableName, statements);
  }
  return statements;
}

export function isManagedTable(tableName) {
  return DEFAULT_TABLES.has(tableName);
}

export function persistRecord(tableName, record, context = {}) {
  if (!isManagedTable(tableName)) return false;
  const builder = getBuilder(tableName);
  const statements = getStatements(tableName);
  if (!builder || !statements) return false;
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) {
    throw new Error('persistRecord requires branchId and moduleId');
  }
  const row = builder(record, normalizedContext);
  statements.upsert.run(row);
  return true;
}

export function deleteRecord(tableName, key, context = {}) {
  if (!isManagedTable(tableName)) return false;
  const statements = getStatements(tableName);
  if (!statements) return false;
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) return false;
  statements.remove.run({
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(key)
  });
  return true;
}

export function truncateTable(tableName, context = {}) {
  if (!isManagedTable(tableName)) return false;
  const statements = getStatements(tableName);
  if (!statements) return false;
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) return false;
  statements.truncate.run({
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId
  });
  return true;
}

export function loadTableRecords(tableName, context = {}) {
  if (!isManagedTable(tableName)) return [];
  const statements = getStatements(tableName);
  if (!statements) return [];
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) return [];
  const rows = statements.load.all(normalizedContext.branchId, normalizedContext.moduleId);
  const records = [];
  for (const row of rows) {
    if (!row || typeof row.payload !== 'string') continue;
    try {
      const parsed = JSON.parse(row.payload);
      if (parsed && typeof parsed === 'object') {
        records.push(parsed);
      }
    } catch (error) {
      // ignore malformed rows, but continue processing the rest
    }
  }
  return records;
}

export function replaceTableRecords(tableName, records = [], context = {}) {
  if (!isManagedTable(tableName)) return false;
  const builder = getBuilder(tableName);
  const statements = getStatements(tableName);
  if (!builder || !statements) return false;
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) return false;
  const db = getDatabaseInstance();
  const tx = db.transaction((rows) => {
    statements.truncate.run({
      branch_id: normalizedContext.branchId,
      module_id: normalizedContext.moduleId
    });
    for (const record of rows) {
      const row = builder(record, normalizedContext);
      statements.upsert.run(row);
    }
  });
  tx(records);
  return true;
}

export function withTransaction(fn) {
  const db = getDatabaseInstance();
  const tx = db.transaction(fn);
  return (...args) => tx(...args);
}

export function getDatabase() {
  return getDatabaseInstance();
}
