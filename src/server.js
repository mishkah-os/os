import { createServer } from 'http';
import { readFile, writeFile, access, mkdir, readdir, rename, rm, stat } from 'fs/promises';
import { constants as FS_CONSTANTS } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { Pool } from 'pg';

import logger from './logger.js';
import {
  getEventStoreContext,
  appendEvent as appendModuleEvent,
  loadEventMeta,
  updateEventMeta,
  rotateEventLog,
  listArchivedLogs,
  readLogFile,
  discardLogFile,
  logRejectedMutation
} from './eventStore.js';
import { createId, nowIso, safeJsonParse, deepClone, serializeOnce } from './utils.js';
import SchemaEngine from './schema/engine.js';
import HybridStore from './hybridStore.js';
import { VersionConflictError } from './moduleStore.js';
import SequenceManager from './sequenceManager.js';
import { initializeSqlite } from './db/sqlite.js';
import { createQuery, executeRawQuery, getDatabaseSchema } from './queryBuilder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const STATIC_DIR = path.join(ROOT_DIR, 'static');

const DEV_MODE = String(process.env.WS2_DEV_MODE || process.env.NODE_ENV || '').toLowerCase() === 'development';

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3200);
const SERVER_ID = process.env.SERVER_ID || createId('ws');
const BRANCHES_DIR = process.env.BRANCHES_DIR || path.join(ROOT_DIR, 'data', 'branches');
const DEFAULT_SCHEMA_PATH = path.join(ROOT_DIR, 'data', 'schemas', 'pos_schema.json');
const ENV_SCHEMA_PATH = process.env.WS_SCHEMA_PATH
  ? path.isAbsolute(process.env.WS_SCHEMA_PATH)
    ? process.env.WS_SCHEMA_PATH
    : path.join(ROOT_DIR, process.env.WS_SCHEMA_PATH)
  : null;
const MODULES_CONFIG_PATH = process.env.MODULES_CONFIG_PATH || path.join(ROOT_DIR, 'data', 'modules.json');
const BRANCHES_CONFIG_PATH = process.env.BRANCHES_CONFIG_PATH || path.join(ROOT_DIR, 'data', 'branches.config.json');
const HISTORY_DIR = process.env.HISTORY_DIR || path.join(ROOT_DIR, 'data', 'history');
const SEQUENCE_RULES_PATH = process.env.SEQUENCE_RULES_PATH
  ? path.isAbsolute(process.env.SEQUENCE_RULES_PATH)
    ? process.env.SEQUENCE_RULES_PATH
    : path.join(ROOT_DIR, process.env.SEQUENCE_RULES_PATH)
  : path.join(ROOT_DIR, 'data', 'sequence-rules.json');
const EVENT_ARCHIVE_INTERVAL_MS = Math.max(60000, Number(process.env.WS2_EVENT_ARCHIVE_INTERVAL_MS || process.env.EVENT_ARCHIVE_INTERVAL_MS) || 5 * 60 * 1000);
const EVENTS_PG_URL = process.env.WS2_EVENTS_PG_URL || process.env.EVENTS_PG_URL || process.env.WS2_PG_URL || process.env.DATABASE_URL || null;
const EVENT_ARCHIVER_DISABLED = ['1', 'true', 'yes'].includes(
  String(process.env.WS2_EVENT_ARCHIVE_DISABLED || process.env.EVENT_ARCHIVE_DISABLED || '').toLowerCase()
);
const METRICS_ENABLED = !['0', 'false', 'no', 'off'].includes(
  String(process.env.WS2_METRICS || process.env.WS2_ENABLE_METRICS || '1').toLowerCase()
);
const PROM_EXPORTER_PREFERRED = METRICS_ENABLED && !['0', 'false', 'no', 'off'].includes(
  String(process.env.WS2_PROMETHEUS_DISABLED || process.env.WS2_DISABLE_PROMETHEUS || '').toLowerCase()
);
const HYBRID_CACHE_TTL_MS = Math.max(250, Number(process.env.HYBRID_CACHE_TTL_MS) || 1500);

const metricsState = {
  enabled: METRICS_ENABLED,
  prom: { client: null, register: null, counters: {}, histograms: {} },
  ws: { broadcasts: 0, frames: 0, serializations: 0, cacheHits: 0, payloadBytes: 0 },
  ajax: { requests: 0, totalDurationMs: 0 },
  http: { requests: 0 }
};

if (PROM_EXPORTER_PREFERRED) {
  (async () => {
    try {
      const prom = await import('prom-client');
      metricsState.prom.client = prom;
      metricsState.prom.register = prom.register;
      if (typeof prom.collectDefaultMetrics === 'function') {
        prom.collectDefaultMetrics();
      }
      metricsState.prom.counters.wsBroadcasts = new prom.Counter({
        name: 'ws2_ws_broadcast_events_total',
        help: 'Total websocket broadcast payloads sent by channel',
        labelNames: ['channel']
      });
      metricsState.prom.counters.wsFrames = new prom.Counter({
        name: 'ws2_ws_frames_delivered_total',
        help: 'Total websocket frames delivered to clients',
        labelNames: ['channel']
      });
      metricsState.prom.counters.wsSerializations = new prom.Counter({
        name: 'ws2_ws_serialization_events_total',
        help: 'Total websocket payload serialization events',
        labelNames: ['channel', 'result']
      });
      metricsState.prom.counters.wsPayloadBytes = new prom.Counter({
        name: 'ws2_ws_payload_bytes_total',
        help: 'Total websocket payload bytes delivered',
        labelNames: ['channel']
      });
      metricsState.prom.counters.httpRequests = new prom.Counter({
        name: 'ws2_http_requests_total',
        help: 'Total HTTP requests processed by the WS2 gateway',
        labelNames: ['kind', 'method']
      });
      metricsState.prom.histograms.ajaxDuration = new prom.Histogram({
        name: 'ws2_ajax_request_duration_ms',
        help: 'Duration of AJAX (REST) requests in milliseconds',
        labelNames: ['method'],
        buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2000]
      });
    } catch (error) {
      logger.info({ err: error }, 'Prometheus exporter disabled; prom-client not available');
      metricsState.prom.client = null;
      metricsState.prom.register = null;
      metricsState.prom.counters = {};
      metricsState.prom.histograms = {};
    }
  })();
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const DEFAULT_TRANSACTION_TABLES = [
  'order_header',
  'order_line',
  'order_payment',
  'pos_shift',
  'job_order_header',
  'job_order_detail',
  'job_order_detail_modifier',
  'job_order_status_history'
];

const sequenceManager = new SequenceManager({
  rulesPath: SEQUENCE_RULES_PATH,
  branchesDir: BRANCHES_DIR,
  logger
});

const STATIC_CACHE_HEADERS = DEV_MODE
  ? {
      'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      pragma: 'no-cache',
      expires: '0'
    }
  : {
      'cache-control': 'public, max-age=86400'
    };

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (_err) {
    return value;
  }
}

function isVersionConflict(error) {
  return error instanceof VersionConflictError || (error && error.code === 'VERSION_CONFLICT');
}

function versionConflictDetails(error) {
  return {
    table: error?.table || null,
    key: error?.key || null,
    expectedVersion: error?.expectedVersion ?? null,
    currentVersion: error?.currentVersion ?? null
  };
}

function parseCookies(header) {
  if (typeof header !== 'string' || !header.trim()) return {};
  const entries = header.split(';');
  const cookies = {};
  for (const rawEntry of entries) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    const idx = entry.indexOf('=');
    if (idx <= 0) continue;
    const name = entry.slice(0, idx).trim();
    if (!name) continue;
    const rawValue = entry.slice(idx + 1).trim();
    cookies[name] = safeDecode(rawValue);
  }
  return cookies;
}

function encodeBranchId(branchId) {
  return encodeURIComponent(branchId);
}

function getBranchDir(branchId) {
  return path.join(BRANCHES_DIR, encodeBranchId(branchId));
}

function getBranchModuleDir(branchId, moduleId) {
  return path.join(getBranchDir(branchId), 'modules', moduleId);
}

function getModuleSchemaPath(branchId, moduleId) {
  const def = getModuleConfig(moduleId);
  const relative = def.schemaPath || path.join('schema', 'definition.json');
  return path.join(getBranchModuleDir(branchId, moduleId), relative);
}

function getModuleSchemaFallbackPath(moduleId) {
  const def = getModuleConfig(moduleId);
  if (!def.schemaFallbackPath) return null;
  return path.isAbsolute(def.schemaFallbackPath)
    ? def.schemaFallbackPath
    : path.join(ROOT_DIR, def.schemaFallbackPath);
}

function getModuleSeedPath(branchId, moduleId) {
  const def = getModuleConfig(moduleId);
  const relative = def.seedPath || path.join('seeds', 'initial.json');
  return path.join(getBranchModuleDir(branchId, moduleId), relative);
}

function getModuleSeedFallbackPath(moduleId) {
  const def = getModuleConfig(moduleId);
  if (!def.seedFallbackPath) return null;
  return path.isAbsolute(def.seedFallbackPath)
    ? def.seedFallbackPath
    : path.join(ROOT_DIR, def.seedFallbackPath);
}

function getModuleLivePath(branchId, moduleId) {
  const def = getModuleConfig(moduleId);
  const relative = def.livePath || path.join('live', 'data.json');
  return path.join(getBranchModuleDir(branchId, moduleId), relative);
}

function getModuleLiveDir(branchId, moduleId) {
  return path.dirname(getModuleLivePath(branchId, moduleId));
}

function getModuleFilePath(branchId, moduleId) {
  return getModuleLivePath(branchId, moduleId);
}

function getModuleHistoryDir(branchId, moduleId) {
  const def = getModuleConfig(moduleId);
  const relative = def.historyPath || 'history';
  return path.join(getBranchModuleDir(branchId, moduleId), relative);
}

function getModulePurgeHistoryDir(branchId, moduleId) {
  return path.join(getModuleHistoryDir(branchId, moduleId), 'purge');
}

function getModuleArchivePath(branchId, moduleId, timestamp) {
  const historyDir = getModuleHistoryDir(branchId, moduleId);
  return path.join(historyDir, `${timestamp}.json`);
}

function getModuleEventStoreContext(branchId, moduleId) {
  const liveDir = getModuleLiveDir(branchId, moduleId);
  const historyDir = path.join(getModuleHistoryDir(branchId, moduleId), 'events');
  return getEventStoreContext({ branchId, moduleId, liveDir, historyDir });
}

function collectRequestedModules(searchParams) {
  const keys = ['module', 'moduleId', 'modules'];
  const values = new Set();
  for (const key of keys) {
    const rawValues = searchParams.getAll(key);
    for (const raw of rawValues) {
      if (!raw) continue;
      const parts = String(raw)
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      for (const part of parts) values.add(part);
    }
  }
  return Array.from(values);
}

function collectIncludeFlags(searchParams) {
  const include = new Set();
  const rawIncludes = [
    ...searchParams.getAll('include'),
    ...searchParams.getAll('include[]'),
    ...searchParams.getAll('with')
  ];
  for (const raw of rawIncludes) {
    if (!raw) continue;
    const parts = String(raw)
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
    for (const part of parts) include.add(part);
  }
  if (searchParams.get('seed') === '1' || searchParams.get('seed') === 'true') {
    include.add('seed');
  }
  if (searchParams.get('live') === '1' || searchParams.get('live') === 'true') {
    include.add('live');
  }
  return include;
}

function mergeSchemaDefinitions(primary, fallback) {
  const base = primary ? deepClone(primary) : null;
  const fall = fallback ? deepClone(fallback) : null;
  if (!base) return fall;
  if (!fall) return base;
  const ensureTables = (target, tables) => {
    if (!tables || !tables.length) return;
    const tableList =
      target.schema && Array.isArray(target.schema.tables)
        ? target.schema.tables
        : (target.schema = target.schema || {}, (target.schema.tables = []));
    const sqlMap = new Map();
    tableList.forEach((table) => {
      if (!table || !table.name) return;
      sqlMap.set(String(table.name), true);
    });
    tables.forEach((table) => {
      if (!table || !table.name) return;
      const name = String(table.name);
      if (!sqlMap.has(name)) {
        tableList.push(deepClone(table));
        sqlMap.set(name, true);
      }
    });
  };
  ensureTables(base, fall.schema && fall.schema.tables);
  if (!Array.isArray(base.tables) && Array.isArray(fall.tables)) {
    base.tables = deepClone(fall.tables);
  }
  return base;
}

async function loadModuleSchemaSnapshot(branchId, moduleId) {
  // ALWAYS use central schema, skip branch-specific schema
  // This ensures consistent schema across all branches
  const fallbackPath = getModuleSchemaFallbackPath(moduleId);
  let schema = null;
  let source = null;

  if (fallbackPath) {
    schema = await readJsonSafe(fallbackPath, null);
    if (schema) source = 'central';
  }

  return { schema, source };
}

async function loadModuleSeedSnapshot(branchId, moduleId) {
  // ALWAYS use central seed, skip branch-specific seed
  // This ensures consistent seed data across all branches
  const fallbackPath = getModuleSeedFallbackPath(moduleId);
  let seed = null;
  let source = null;

  if (fallbackPath) {
    seed = await readJsonSafe(fallbackPath, null);
    if (seed) source = 'central';
  }

  return { seed, source };
}

async function loadModuleLiveSnapshot(branchId, moduleId) {
  const livePath = getModuleLivePath(branchId, moduleId);
  const live = await readJsonSafe(livePath, null);
  return { live, source: live ? 'branch' : null };
}

async function recordRejectedMutation(branchId, moduleId, details = {}) {
  try {
    const context = getModuleEventStoreContext(branchId, moduleId);
    await logRejectedMutation(context, {
      branchId,
      moduleId,
      ...details
    });
  } catch (error) {
    logger.warn({ err: error, branchId, moduleId }, 'Failed to record rejected mutation');
  }
}

async function ensureBranchModuleLayout(branchId, moduleId) {
  const moduleDir = getBranchModuleDir(branchId, moduleId);
  await mkdir(moduleDir, { recursive: true });
  await mkdir(path.dirname(getModuleLivePath(branchId, moduleId)), { recursive: true });
  await mkdir(getModuleHistoryDir(branchId, moduleId), { recursive: true });
  await mkdir(path.join(getModuleHistoryDir(branchId, moduleId), 'events'), { recursive: true });
  await mkdir(getModulePurgeHistoryDir(branchId, moduleId), { recursive: true });
}

async function describeFile(filePath) {
  if (!filePath) {
    return { exists: false, mtimeMs: null };
  }
  try {
    const stats = await stat(filePath);
    if (stats.isFile()) {
      return { exists: true, mtimeMs: stats.mtimeMs };
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { exists: false, mtimeMs: null };
    }
    throw error;
  }
  return { exists: false, mtimeMs: null };
}

async function readJsonSafe(filePath, fallback = null) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    logger.warn({ err: error, filePath }, 'Failed to read JSON file');
    return fallback;
  }
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

async function fileExists(filePath) {
  try {
    await access(filePath, FS_CONSTANTS.F_OK);
    return true;
  } catch (_err) {
    return false;
  }
}

function jsonResponse(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
  });
  res.end(JSON.stringify(payload, null, 2));
}

function resolveTimestampInput(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeCursorInput(value) {
  const payload = {};
  const candidates = new Set();
  const register = (field, raw) => {
    if (raw === undefined || raw === null) return;
    let str;
    if (typeof raw === 'string') {
      str = raw.trim();
    } else if (typeof raw === 'number' && Number.isFinite(raw)) {
      str = String(raw);
    } else if (typeof raw === 'bigint') {
      str = raw.toString();
    } else {
      return;
    }
    if (!str) return;
    candidates.add(str);
    if (field) {
      payload[field] = str;
    }
  };

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const field of ['key', 'id', 'uuid', 'uid']) {
      register(field, value[field]);
    }
    if (value.primaryKey && typeof value.primaryKey === 'object') {
      for (const [field, raw] of Object.entries(value.primaryKey)) {
        register(field, raw);
      }
    }
    if (value.primary && typeof value.primary === 'object') {
      for (const [field, raw] of Object.entries(value.primary)) {
        register(field, raw);
      }
    }
    if (!Object.keys(payload).length && value.value !== undefined) {
      register('key', value.value);
    }
  } else if (value !== undefined && value !== null) {
    register('key', value);
    register('id', value);
  }

  return { candidates, object: Object.keys(payload).length ? payload : null };
}

function recordMatchesCandidates(ref, candidates) {
  if (!ref || !candidates || !candidates.size) return false;
  for (const candidate of candidates) {
    if (ref.key != null && String(ref.key) === candidate) return true;
    if (ref.id != null && String(ref.id) === candidate) return true;
    if (ref.uuid != null && String(ref.uuid) === candidate) return true;
    if (ref.uid != null && String(ref.uid) === candidate) return true;
    if (ref.primaryKey && typeof ref.primaryKey === 'object') {
      for (const value of Object.values(ref.primaryKey)) {
        if (value != null && String(value) === candidate) {
          return true;
        }
      }
    }
  }
  return false;
}

function buildRecordCursor(ref) {
  if (!ref || typeof ref !== 'object') return null;
  const cursor = {};
  if (ref.key != null) cursor.key = String(ref.key);
  if (ref.id != null) cursor.id = String(ref.id);
  if (ref.uuid != null) cursor.uuid = String(ref.uuid);
  if (ref.uid != null) cursor.uid = String(ref.uid);
  if (ref.primaryKey && typeof ref.primaryKey === 'object') {
    const primaryKey = {};
    for (const [field, value] of Object.entries(ref.primaryKey)) {
      if (value !== undefined && value !== null) {
        primaryKey[field] = String(value);
      }
    }
    if (Object.keys(primaryKey).length) {
      cursor.primaryKey = primaryKey;
    }
  }
  return Object.keys(cursor).length ? cursor : null;
}

function stringifyCursor(ref) {
  if (!ref || typeof ref !== 'object') return null;
  if (ref.key != null && String(ref.key)) return String(ref.key);
  if (ref.id != null && String(ref.id)) return String(ref.id);
  if (ref.uuid != null && String(ref.uuid)) return String(ref.uuid);
  if (ref.uid != null && String(ref.uid)) return String(ref.uid);
  if (ref.primaryKey && typeof ref.primaryKey === 'object') {
    for (const value of Object.values(ref.primaryKey)) {
      if (value != null) {
        const str = String(value);
        if (str) return str;
      }
    }
  }
  return null;
}

function computeInsertOnlyDelta(store, tableName, lastCursorValue) {
  const rows = Array.isArray(store?.tables) && store.tables.includes(tableName) ? store.listTable(tableName) : [];
  const normalized = normalizeCursorInput(lastCursorValue);
  let startIndex = 0;
  let matched = false;
  if (normalized.candidates.size) {
    for (let idx = rows.length - 1; idx >= 0; idx -= 1) {
      const ref = store.getRecordReference(tableName, rows[idx]);
      if (recordMatchesCandidates(ref, normalized.candidates)) {
        matched = true;
        startIndex = idx + 1;
        break;
      }
    }
  }
  const requiresFullSync = normalized.candidates.size > 0 && !matched && rows.length > 0;
  const deltaRows = rows.slice(startIndex);
  const lastRow = rows.length ? rows[rows.length - 1] : null;
  const lastCursor = lastRow ? buildRecordCursor(store.getRecordReference(tableName, lastRow)) : null;
  return {
    rows: deltaRows,
    total: rows.length,
    lastCursor,
    matched,
    requiresFullSync,
    clientCursor: normalized.object,
    hadCursor: normalized.candidates.size > 0
  };
}

function normalizeDeltaRequest(frameData, store) {
  const tableMap = {};
  const mapSources = [frameData?.lastTableIds, frameData?.lastIds, frameData?.tableCursors];
  for (const source of mapSources) {
    if (!source || typeof source !== 'object') continue;
    for (const [tableName, value] of Object.entries(source)) {
      if (typeof tableName !== 'string') continue;
      const trimmed = tableName.trim();
      if (!trimmed) continue;
      tableMap[trimmed] = value;
    }
  }
  const requested = new Set();
  const arraySources = [
    frameData?.tables,
    frameData?.tableNames,
    frameData?.requestTables,
    frameData?.includeTables,
    frameData?.tablesRequested
  ];
  for (const source of arraySources) {
    if (!Array.isArray(source)) continue;
    for (const value of source) {
      if (typeof value !== 'string') continue;
      const trimmed = value.trim();
      if (trimmed) requested.add(trimmed);
    }
  }
  Object.keys(tableMap).forEach((name) => requested.add(name));
  const availableTables = Array.isArray(store?.tables) ? store.tables : [];
  let tableNames = Array.from(requested).filter((name) => availableTables.includes(name));
  if (!tableNames.length) {
    tableNames = availableTables.slice();
  }
  const normalizedClientCursorMap = {};
  for (const [table, value] of Object.entries(tableMap)) {
    const normalized = normalizeCursorInput(value).object;
    if (normalized) {
      normalizedClientCursorMap[table] = normalized;
    }
  }
  return { tableNames, tableMap, normalizedClientCursorMap };
}

function findRecordUsingValue(store, tableName, value) {
  if (!store || !tableName) return null;
  let lookup = value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const hasCursorFields = ['key', 'id', 'uuid', 'uid', 'primaryKey', 'primary'].some(
      (field) => value[field] !== undefined
    );
    if (!hasCursorFields) {
      const ref = store.getRecordReference(tableName, value);
      lookup = ref ? { key: ref.key, id: ref.id, uuid: ref.uuid, uid: ref.uid, primaryKey: ref.primaryKey } : value;
    }
  }
  const normalized = normalizeCursorInput(lookup);
  if (!normalized.candidates.size) return null;
  const rows = store.listTable(tableName);
  for (const row of rows) {
    const ref = store.getRecordReference(tableName, row);
    if (recordMatchesCandidates(ref, normalized.candidates)) {
      return { record: row, ref };
    }
  }
  return null;
}

function resolveExistingRecordForConcurrency(store, tableName, record, concurrency = {}) {
  const sources = [];
  if (record && typeof record === 'object') {
    sources.push(record);
  }
  if (concurrency && typeof concurrency === 'object') {
    if (concurrency.recordRef) sources.push(concurrency.recordRef);
    if (concurrency.cursor) sources.push(concurrency.cursor);
    if (concurrency.lastKnownId) sources.push(concurrency.lastKnownId);
    if (concurrency.lastCursor) sources.push(concurrency.lastCursor);
    if (concurrency.lookup) sources.push(concurrency.lookup);
  }
  for (const source of sources) {
    const found = findRecordUsingValue(store, tableName, source);
    if (found) return found;
  }
  return null;
}

function extractPaymentState(record) {
  const queue = [record];
  const visited = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);
    const direct =
      current.paymentState ||
      current.payment_state ||
      current.paymentStatus ||
      current.payment_status ||
      current.state ||
      current.payment_state_id ||
      current.paymentStateId;
    if (typeof direct === 'string' && direct.trim()) {
      return direct.trim();
    }
    const nestedKeys = ['header', 'payload', 'meta', 'metadata', 'data', 'info'];
    for (const key of nestedKeys) {
      if (current[key] && typeof current[key] === 'object') {
        queue.push(current[key]);
      }
    }
  }
  return null;
}

function extractRecordUpdatedAt(record) {
  const queue = [record];
  const visited = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);
    const fields = [
      'updatedAt',
      'updated_at',
      'modifyDate',
      'modify_date',
      'savedAt',
      'saved_at',
      'timestamp',
      'ts',
      'lastUpdatedAt',
      'last_updated_at',
      'lastModifiedAt',
      'last_modified_at'
    ];
    for (const field of fields) {
      if (current[field] !== undefined && current[field] !== null) {
        const ts = resolveTimestampInput(current[field]);
        if (ts != null) return ts;
      }
    }
    const nestedKeys = ['meta', 'metadata', 'header', 'payload', 'data', 'info'];
    for (const key of nestedKeys) {
      if (current[key] && typeof current[key] === 'object') {
        queue.push(current[key]);
      }
    }
  }
  return null;
}

function extractClientSnapshotMarker(frameData = {}) {
  const candidates = [
    frameData.snapshotMarker,
    frameData.snapshot_marker,
    frameData.dayMarker,
    frameData.day_marker,
    frameData.businessDate,
    frameData.business_date,
    frameData.businessDay,
    frameData.snapshotDay
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function resolveServerSnapshotMarker(syncState, eventMeta = null) {
  if (eventMeta && typeof eventMeta.lastSnapshotMarker === 'string' && eventMeta.lastSnapshotMarker) {
    return eventMeta.lastSnapshotMarker;
  }
  if (eventMeta && typeof eventMeta.currentDay === 'string' && eventMeta.currentDay) {
    return eventMeta.currentDay;
  }
  const snapshotMeta = syncState?.moduleSnapshot?.meta;
  if (snapshotMeta && typeof snapshotMeta === 'object') {
    const snapshotCandidates = [
      snapshotMeta.snapshotMarker,
      snapshotMeta.businessDate,
      snapshotMeta.business_date,
      snapshotMeta.businessDay,
      snapshotMeta.business_day,
      snapshotMeta.currentDay,
      snapshotMeta.day
    ];
    for (const candidate of snapshotCandidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
  }
  if (syncState?.updatedAt) {
    return syncState.updatedAt.slice(0, 10);
  }
  return null;
}

function evaluateConcurrencyGuards(store, tableName, record, concurrency, options = {}) {
  const result = { conflict: null, requiresFullSync: false, existing: null };
  if (!store || !tableName) return result;
  const effectiveConcurrency = concurrency && typeof concurrency === 'object' ? concurrency : {};
  const { serverMarker = null, clientMarker = null } = options;

  const existingInfo = resolveExistingRecordForConcurrency(store, tableName, record, effectiveConcurrency);
  if (existingInfo) {
    result.existing = existingInfo.record;
  }

  const requireExisting = effectiveConcurrency.requireExisting === true || effectiveConcurrency.disallowCreate === true;
  if (!existingInfo && requireExisting) {
    result.conflict = { code: 'record-not-found', message: 'Existing record required but not found.' };
    result.requiresFullSync = true;
    return result;
  }

  if (effectiveConcurrency.requireSnapshotMarker) {
    const expected = String(effectiveConcurrency.requireSnapshotMarker).trim();
    if (expected && serverMarker && expected !== serverMarker) {
      result.conflict = { code: 'snapshot-mismatch', expected, actual: serverMarker };
      result.requiresFullSync = true;
      return result;
    }
  }

  if (
    effectiveConcurrency.enforceSnapshot === true &&
    clientMarker &&
    serverMarker &&
    clientMarker !== serverMarker
  ) {
    result.conflict = { code: 'snapshot-mismatch', expected: clientMarker, actual: serverMarker };
    result.requiresFullSync = true;
    return result;
  }

  if (!existingInfo) {
    return result;
  }

  const currentPaymentState = extractPaymentState(existingInfo.record);
  const expectedPaymentState =
    typeof effectiveConcurrency.expectedPaymentState === 'string' && effectiveConcurrency.expectedPaymentState.trim()
      ? effectiveConcurrency.expectedPaymentState.trim()
      : typeof effectiveConcurrency.paymentState === 'string' && effectiveConcurrency.paymentState.trim()
        ? effectiveConcurrency.paymentState.trim()
        : null;

  if (expectedPaymentState && currentPaymentState && currentPaymentState !== expectedPaymentState) {
    result.conflict = {
      code: 'payment-state-conflict',
      expected: expectedPaymentState,
      actual: currentPaymentState
    };
    return result;
  }

  const rejectStates = Array.isArray(effectiveConcurrency.rejectPaymentStates)
    ? effectiveConcurrency.rejectPaymentStates.map((entry) => String(entry).trim()).filter(Boolean)
    : [];
  if (rejectStates.length && currentPaymentState) {
    const lowerCurrent = currentPaymentState.toLowerCase();
    if (rejectStates.some((entry) => entry.toLowerCase() === lowerCurrent)) {
      result.conflict = { code: 'payment-state-rejected', actual: currentPaymentState, rejected: rejectStates };
      return result;
    }
  }

  const allowedStates = Array.isArray(effectiveConcurrency.allowedPaymentStates)
    ? effectiveConcurrency.allowedPaymentStates.map((entry) => String(entry).trim()).filter(Boolean)
    : [];
  if (allowedStates.length && currentPaymentState) {
    const lowerCurrent = currentPaymentState.toLowerCase();
    if (!allowedStates.some((entry) => entry.toLowerCase() === lowerCurrent)) {
      result.conflict = { code: 'payment-state-not-allowed', actual: currentPaymentState, allowed: allowedStates };
      return result;
    }
  }

  const thresholdTs = resolveTimestampInput(
    effectiveConcurrency.ifNotModifiedSince ??
      effectiveConcurrency.ifModifiedBefore ??
      effectiveConcurrency.expectedUpdatedAt ??
      null
  );
  if (thresholdTs != null) {
    const updatedTs = extractRecordUpdatedAt(existingInfo.record);
    if (updatedTs != null && updatedTs > thresholdTs) {
      result.conflict = {
        code: 'concurrent-update',
        updatedAt: new Date(updatedTs).toISOString(),
        threshold: new Date(thresholdTs).toISOString()
      };
      return result;
    }
  }

  if (effectiveConcurrency.lastKnownId) {
    const normalized = normalizeCursorInput(effectiveConcurrency.lastKnownId);
    if (normalized.candidates.size) {
      const matched = recordMatchesCandidates(existingInfo.ref, normalized.candidates);
      if (!matched) {
        result.conflict = { code: 'stale-cursor', provided: normalized.object || effectiveConcurrency.lastKnownId };
        result.requiresFullSync = true;
        return result;
      }
    }
  }

  return result;
}


let broadcastCycle = 0;

function nextBroadcastCycle() {
  broadcastCycle += 1;
  if (broadcastCycle > Number.MAX_SAFE_INTEGER - 1) {
    broadcastCycle = 1;
  }
  return broadcastCycle;
}

function recordWsSerialization(channel, { cached = false, bytes = 0 } = {}) {
  if (!metricsState.enabled) return;
  const normalizedChannel = channel || 'direct';
  if (cached) {
    metricsState.ws.cacheHits += 1;
  } else {
    metricsState.ws.serializations += 1;
  }
  if (Number.isFinite(bytes) && bytes > 0) {
    metricsState.ws.payloadBytes += bytes;
  }
  if (metricsState.prom.counters.wsSerializations) {
    metricsState.prom.counters.wsSerializations.inc({
      channel: normalizedChannel,
      result: cached ? 'cache-hit' : 'serialized'
    });
  }
  if (metricsState.prom.counters.wsPayloadBytes && Number.isFinite(bytes) && bytes > 0) {
    metricsState.prom.counters.wsPayloadBytes.inc({ channel: normalizedChannel }, bytes);
  }
}

function recordWsBroadcast(channel, deliveredCount = 0) {
  if (!metricsState.enabled) return;
  const normalizedChannel = channel || 'unknown';
  metricsState.ws.broadcasts += 1;
  if (Number.isFinite(deliveredCount) && deliveredCount > 0) {
    metricsState.ws.frames += deliveredCount;
  }
  if (metricsState.prom.counters.wsBroadcasts) {
    metricsState.prom.counters.wsBroadcasts.inc({ channel: normalizedChannel }, 1);
  }
  if (metricsState.prom.counters.wsFrames && Number.isFinite(deliveredCount) && deliveredCount > 0) {
    metricsState.prom.counters.wsFrames.inc({ channel: normalizedChannel }, deliveredCount);
  }
}

function recordHttpRequest(method, isAjax, durationMs = 0) {
  if (!metricsState.enabled) return;
  const normalizedMethod = String(method || 'GET').toUpperCase();
  metricsState.http.requests += 1;
  if (metricsState.prom.counters.httpRequests) {
    metricsState.prom.counters.httpRequests.inc({ kind: isAjax ? 'ajax' : 'http', method: normalizedMethod }, 1);
  }
  if (isAjax) {
    const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
    metricsState.ajax.requests += 1;
    metricsState.ajax.totalDurationMs += duration;
    if (metricsState.prom.histograms.ajaxDuration) {
      metricsState.prom.histograms.ajaxDuration.observe({ method: normalizedMethod }, duration);
    }
  }
}

async function renderMetrics() {
  if (!metricsState.enabled) {
    return '# HELP ws2_metrics_disabled WS2 metrics disabled\n# TYPE ws2_metrics_disabled gauge\nws2_metrics_disabled 1\n';
  }
  if (metricsState.prom.register && typeof metricsState.prom.register.metrics === 'function') {
    try {
      return await metricsState.prom.register.metrics();
    } catch (error) {
      logger.warn({ err: error }, 'Failed to collect Prometheus metrics; falling back to in-memory snapshot');
    }
  }
  const avgAjax = metricsState.ajax.requests
    ? metricsState.ajax.totalDurationMs / metricsState.ajax.requests
    : 0;
  const lines = [
    '# HELP ws2_ws_broadcast_total Total websocket broadcast payloads',
    '# TYPE ws2_ws_broadcast_total counter',
    `ws2_ws_broadcast_total ${metricsState.ws.broadcasts}`,
    '# HELP ws2_ws_frames_total Total websocket frames delivered',
    '# TYPE ws2_ws_frames_total counter',
    `ws2_ws_frames_total ${metricsState.ws.frames}`,
    '# HELP ws2_ws_serializations_total Total websocket payload serializations',
    '# TYPE ws2_ws_serializations_total counter',
    `ws2_ws_serializations_total ${metricsState.ws.serializations}`,
    '# HELP ws2_ws_serialization_cache_hits_total Total websocket serialization cache hits',
    '# TYPE ws2_ws_serialization_cache_hits_total counter',
    `ws2_ws_serialization_cache_hits_total ${metricsState.ws.cacheHits}`,
    '# HELP ws2_ws_payload_bytes_total Total websocket payload bytes delivered',
    '# TYPE ws2_ws_payload_bytes_total counter',
    `ws2_ws_payload_bytes_total ${metricsState.ws.payloadBytes}`,
    '# HELP ws2_http_requests_total Total HTTP requests handled by WS2',
    '# TYPE ws2_http_requests_total counter',
    `ws2_http_requests_total ${metricsState.http.requests}`,
    '# HELP ws2_ajax_requests_total Total AJAX/REST requests handled by WS2',
    '# TYPE ws2_ajax_requests_total counter',
    `ws2_ajax_requests_total ${metricsState.ajax.requests}`,
    '# HELP ws2_ajax_request_duration_avg_ms Average AJAX/REST duration in milliseconds',
    '# TYPE ws2_ajax_request_duration_avg_ms gauge',
    `ws2_ajax_request_duration_avg_ms ${avgAjax.toFixed(2)}`,
    '# HELP ws2_metrics_timestamp_seconds Timestamp when metrics snapshot generated',
    '# TYPE ws2_metrics_timestamp_seconds gauge',
    `ws2_metrics_timestamp_seconds ${Math.round(Date.now() / 1000)}`
  ];
  return `${lines.join('\n')}\n`;
}


const PUBSUB_TYPES = new Set(['auth', 'subscribe', 'publish', 'ping', 'pong']);
const LEGACY_POS_TOPIC_PREFIX = 'pos:sync:';
const SYNC_TOPIC_PREFIX = 'sync::';
const PUBSUB_TOPICS = new Map(); // topic => { subscribers:Set<string>, lastData:object|null }
const SYNC_STATES = new Map(); // key => { branchId, moduleId, version, moduleSnapshot, updatedAt }
const FULL_SYNC_FLAGS = new Map(); // key => { id, branchId, moduleId, enabled, reason, requestedBy, updatedAt }
const TRANS_HISTORY_LIMIT = Math.max(50, Number(process.env.WS2_TRANS_HISTORY_LIMIT) || 500);
const TRANS_MUTATION_HISTORY_LIMIT = Math.max(5, Number(process.env.WS2_TRANS_MUTATION_HISTORY_LIMIT) || 25);
const TRANS_HISTORY = new Map(); // key => { order:string[], records:Map<string,{ts:number,payload:object,mutationIds:Set<string>,lastAckMutationId?:string}> }
const TABLE_TOPIC_PREFIX = 'sync-table::';
const GLOBAL_TABLE_TOPIC_PREFIX = 'table::';

function syncStateKey(branchId, moduleId) {
  const safeBranch = branchId || 'default';
  const safeModule = moduleId || 'pos';
  return `${safeBranch}::${safeModule}`;
}

function parseSyncTopic(topic) {
  if (typeof topic !== 'string') return null;
  if (topic.startsWith(LEGACY_POS_TOPIC_PREFIX)) {
    const branchId = topic.slice(LEGACY_POS_TOPIC_PREFIX.length) || 'default';
    return { branchId, moduleId: 'pos' };
  }
  if (topic.startsWith(SYNC_TOPIC_PREFIX)) {
    const segments = topic.slice(SYNC_TOPIC_PREFIX.length).split('::');
    const branchId = segments[0] || 'default';
    const moduleId = segments[1] || 'pos';
    return { branchId, moduleId };
  }
  return null;
}

function getSyncTopics(branchId, moduleId) {
  const safeBranch = branchId || 'default';
  const safeModule = moduleId || 'pos';
  const topics = [`${SYNC_TOPIC_PREFIX}${safeBranch}::${safeModule}`];
  if (safeModule === 'pos') {
    topics.push(`${LEGACY_POS_TOPIC_PREFIX}${safeBranch}`);
  }
  return topics;
}

function fullSyncKey(branchId, moduleId = '*') {
  const safeBranch = branchId || 'default';
  const safeModule = moduleId || '*';
  return `${safeBranch}::${safeModule}`;
}

function listFullSyncFlags(filter = {}) {
  const entries = Array.from(FULL_SYNC_FLAGS.values());
  const branchId = filter.branchId || null;
  const moduleId = filter.moduleId || null;
  return entries.filter((entry) => {
    if (branchId && entry.branchId !== branchId) return false;
    if (moduleId && entry.moduleId !== moduleId && entry.moduleId !== '*') return false;
    return true;
  });
}

function serializeFullSyncFlag(entry) {
  if (!entry) return null;
  return {
    id: entry.id,
    branchId: entry.branchId,
    moduleId: entry.moduleId,
    enabled: entry.enabled,
    reason: entry.reason || null,
    requestedBy: entry.requestedBy || null,
    updatedAt: entry.updatedAt,
    meta: entry.meta || null,
    clearedBy: entry.clearedBy || null
  };
}

function isFullSyncFlagActive(branchId, moduleId) {
  return listFullSyncFlags({ branchId, moduleId }).some((entry) => entry.enabled);
}

function getActiveFullSyncFlags(branchId, moduleId = null) {
  return listFullSyncFlags({ branchId, moduleId }).filter((entry) => entry.enabled);
}

function upsertFullSyncFlag(branchId, moduleId = '*', options = {}) {
  const key = fullSyncKey(branchId, moduleId);
  const now = nowIso();
  const next = {
    id: options.id || FULL_SYNC_FLAGS.get(key)?.id || createId('fsync'),
    branchId,
    moduleId,
    enabled: options.enabled !== false,
    reason: options.reason || FULL_SYNC_FLAGS.get(key)?.reason || null,
    requestedBy: options.requestedBy || FULL_SYNC_FLAGS.get(key)?.requestedBy || null,
    updatedAt: now
  };
  if (options.meta && typeof options.meta === 'object') {
    next.meta = { ...FULL_SYNC_FLAGS.get(key)?.meta, ...options.meta };
  } else if (FULL_SYNC_FLAGS.get(key)?.meta) {
    next.meta = { ...FULL_SYNC_FLAGS.get(key).meta };
  }
  FULL_SYNC_FLAGS.set(key, next);
  return next;
}

function disableFullSyncFlag(branchId, moduleId = '*', options = {}) {
  const key = fullSyncKey(branchId, moduleId);
  const existing = FULL_SYNC_FLAGS.get(key);
  if (!existing) return null;
  const next = {
    ...existing,
    enabled: false,
    updatedAt: nowIso(),
    clearedBy: options.requestedBy || options.clearedBy || existing.clearedBy || null
  };
  FULL_SYNC_FLAGS.set(key, next);
  return next;
}

function transHistoryKey(branchId, moduleId) {
  const safeBranch = branchId || 'default';
  const safeModule = moduleId || 'pos';
  return `${safeBranch}::${safeModule}`;
}

function getTransTracker(key) {
  if (!key) return null;
  if (!TRANS_HISTORY.has(key)) {
    TRANS_HISTORY.set(key, { order: [], records: new Map() });
  }
  return TRANS_HISTORY.get(key);
}

function rememberTransRecord(key, transId, payload) {
  if (!key || !transId || !payload) return null;
  const tracker = getTransTracker(key);
  if (!tracker) return null;
  if (tracker.records.has(transId)) {
    const existing = tracker.records.get(transId);
    if (payload?.mutationId && existing) {
      if (!existing.mutationIds) existing.mutationIds = new Set();
      if (!existing.mutationIds.has(payload.mutationId)) {
        existing.mutationIds.add(payload.mutationId);
        if (existing.mutationIds.size > TRANS_MUTATION_HISTORY_LIMIT) {
          const trimmed = Array.from(existing.mutationIds).slice(-TRANS_MUTATION_HISTORY_LIMIT);
          existing.mutationIds = new Set(trimmed);
        }
        existing.lastAckMutationId = payload.mutationId;
      }
    }
    return existing;
  }
  const record = {
    ts: Date.now(),
    payload: deepClone(payload),
    mutationIds: new Set(),
    lastAckMutationId: payload?.mutationId || null
  };
  if (payload?.mutationId) {
    record.mutationIds.add(payload.mutationId);
  }
  tracker.records.set(transId, record);
  tracker.order.push(transId);
  if (tracker.order.length > TRANS_HISTORY_LIMIT) {
    const overflow = tracker.order.splice(0, tracker.order.length - TRANS_HISTORY_LIMIT);
    for (const oldId of overflow) {
      tracker.records.delete(oldId);
    }
  }
  return record;
}

function recallTransRecord(key, transId) {
  if (!key || !transId) return null;
  const tracker = TRANS_HISTORY.get(key);
  if (!tracker) return null;
  return tracker.records.get(transId) || null;
}

function normalizeTransId(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

async function ensureSyncState(branchId, moduleId) {
  const key = syncStateKey(branchId, moduleId);
  if (SYNC_STATES.has(key)) {
    return SYNC_STATES.get(key);
  }
  let moduleSnapshot = null;
  try {
    const store = await ensureModuleStore(branchId, moduleId);
    moduleSnapshot = store.getSnapshot();
  } catch (error) {
    logger.warn({ err: error, branchId, moduleId }, 'Falling back to empty sync snapshot');
  }
  if (!moduleSnapshot) {
    moduleSnapshot = {
      moduleId,
      branchId,
      version: 1,
      tables: {},
      meta: { lastUpdatedAt: nowIso(), branchId, moduleId, serverId: SERVER_ID }
    };
  }
  const state = {
    branchId,
    moduleId,
    version: Number(moduleSnapshot.version) || 1,
    moduleSnapshot,
    updatedAt: moduleSnapshot.meta?.lastUpdatedAt || nowIso()
  };
  SYNC_STATES.set(key, state);
  return state;
}

function summarizeTableCounts(snapshot = {}) {
  const counts = {};
  const tables = snapshot.tables && typeof snapshot.tables === 'object' ? snapshot.tables : {};
  for (const [tableName, rows] of Object.entries(tables)) {
    counts[tableName] = Array.isArray(rows) ? rows.length : 0;
  }
  return counts;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toIsoTimestamp(value, fallback = nowIso()) {
  if (value == null) return fallback;
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const date = new Date(numeric);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return fallback;
}

function snapshotsEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (_err) {
    return false;
  }
}

const POS_TEMP_STORE = 'order_temp';
const POS_KNOWN_STORES = [
  'orders',
  'orderLines',
  'orderNotes',
  'orderStatusLogs',
  'shifts',
  'posMeta',
  'syncLog',
  POS_TEMP_STORE
];
const POS_STORE_KEY_SET = new Set(POS_KNOWN_STORES);
const POS_STORE_KEY_RESOLVERS = {
  orders: (row) => (row && row.id != null ? String(row.id) : null),
  orderLines: (row) => {
    if (!row || typeof row !== 'object') return null;
    if (row.uid != null) return String(row.uid);
    if (row.orderId != null && row.id != null) return `${row.orderId}::${row.id}`;
    return null;
  },
  orderNotes: (row) => (row && row.id != null ? String(row.id) : null),
  orderStatusLogs: (row) => (row && row.id != null ? String(row.id) : null),
  shifts: (row) => (row && row.id != null ? String(row.id) : null),
  posMeta: (row) => (row && row.id != null ? String(row.id) : null),
  syncLog: (row) => {
    if (!row || typeof row !== 'object') return null;
    if (row.ts != null) return String(row.ts);
    if (row.id != null) return String(row.id);
    return null;
  }
};

function mergeStoreRows(existingRows = [], incomingRows = [], storeName) {
  const keyResolver = POS_STORE_KEY_RESOLVERS[storeName] || ((row) => (row && row.id != null ? String(row.id) : null));
  const keyed = new Map();
  const fallback = new Map();
  const register = (rawRow, preferIncoming) => {
    if (!rawRow || typeof rawRow !== 'object') return;
    const row = deepClone(rawRow);
    const key = keyResolver(row);
    if (key) {
      if (preferIncoming || !keyed.has(key)) {
        keyed.set(key, row);
      }
      return;
    }
    let serialized = null;
    try {
      serialized = JSON.stringify(row);
    } catch (_err) {
      serialized = null;
    }
    const fallbackKey = serialized || `row:${fallback.size + keyed.size}`;
    if (preferIncoming || !fallback.has(fallbackKey)) {
      fallback.set(fallbackKey, row);
    }
  };
  existingRows.forEach((row) => register(row, false));
  incomingRows.forEach((row) => register(row, true));
  return [...keyed.values(), ...fallback.values()];
}

function mergePosStores(existingStores, incomingStores) {
  const existing = isPlainObject(existingStores) ? existingStores : {};
  const incoming = isPlainObject(incomingStores) ? incomingStores : {};
  const merged = {};
  const names = new Set([...Object.keys(existing), ...Object.keys(incoming), ...POS_KNOWN_STORES]);
  names.delete(POS_TEMP_STORE);
  for (const name of names) {
    const currentRows = Array.isArray(existing[name]) ? existing[name] : [];
    if (!Object.prototype.hasOwnProperty.call(incoming, name)) {
      merged[name] = currentRows.map((row) => deepClone(row));
      continue;
    }
    const incomingRows = Array.isArray(incoming[name]) ? incoming[name] : [];
    merged[name] = mergeStoreRows(currentRows, incomingRows, name);
  }
  merged[POS_TEMP_STORE] = [];
  return merged;
}

function extractIncomingPosStores(payload) {
  const stores = {};
  if (!isPlainObject(payload)) return stores;
  const explicitStores = isPlainObject(payload.stores) ? payload.stores : {};
  for (const name of POS_KNOWN_STORES) {
    const explicitValue = explicitStores[name];
    if (Array.isArray(explicitValue)) {
      stores[name] = explicitValue;
      continue;
    }
    const rootValue = payload[name];
    if (Array.isArray(rootValue)) {
      stores[name] = rootValue;
    }
  }
  return stores;
}

function mergePosPayload(existingPayload, incomingPayload) {
  const base = isPlainObject(existingPayload) ? deepClone(existingPayload) : {};
  const incoming = isPlainObject(incomingPayload) ? deepClone(incomingPayload) : {};

  for (const [key, value] of Object.entries(incoming)) {
    if (key === 'stores' || POS_STORE_KEY_SET.has(key)) continue;
    if (Array.isArray(value)) {
      base[key] = value.map((entry) => deepClone(entry));
    } else if (isPlainObject(value)) {
      const currentValue = base[key];
      base[key] = isPlainObject(currentValue)
        ? { ...deepClone(currentValue), ...value }
        : value;
    } else {
      base[key] = value;
    }
  }

  const incomingStores = extractIncomingPosStores(incomingPayload);
  const mergedStores = mergePosStores(existingPayload?.stores, incomingStores);
  base.stores = mergedStores;

  for (const name of POS_KNOWN_STORES) {
    if (name === POS_TEMP_STORE) continue;
    if (Object.prototype.hasOwnProperty.call(base, name)) {
      delete base[name];
    }
  }

  return base;
}

function ensurePlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...value };
}

function toTimestamp(value, fallback = Date.now()) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDiscount(discount) {
  if (!discount || typeof discount !== 'object') return null;
  const type = discount.type === 'percent' ? 'percent' : discount.type === 'amount' ? 'amount' : null;
  if (!type) return null;
  const value = Number(discount.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (type === 'percent') {
    return { type, value: Math.min(100, Math.max(0, value)) };
  }
  return { type, value: Math.max(0, value) };
}

function normalizeOrderStatusLogEntry(entry, context) {
  if (!entry || !context || !context.orderId) return null;
  const changedAt = toTimestamp(
    entry.changed_at || entry.changedAt || entry.at || entry.timestamp,
    context.updatedAt
  );
  const statusId = entry.status_id || entry.statusId || entry.status || context.statusId || 'open';
  const stageId = entry.stage_id || entry.stageId || entry.stage || context.stageId || null;
  const paymentStateId =
    entry.payment_state_id || entry.paymentStateId || entry.paymentState || context.paymentStateId || null;
  const actorId = entry.actor_id || entry.actorId || entry.userId || entry.changedBy || context.actorId || null;
  const source = entry.source || entry.channel || entry.origin || null;
  const reason = entry.reason || entry.note || null;
  const metadata = ensurePlainObject(entry.metadata || entry.meta);
  const id = entry.id || `${context.orderId}::status::${changedAt}`;
  return {
    id,
    orderId: context.orderId,
    status: statusId,
    stage: stageId || undefined,
    paymentState: paymentStateId || undefined,
    actorId: actorId || undefined,
    source: source || undefined,
    reason: reason || undefined,
    metadata,
    changedAt
  };
}

function normalizeOrderLineStatusLogEntry(entry, context) {
  if (!entry || !context || !context.orderId || !context.lineId) return null;
  const changedAt = toTimestamp(
    entry.changed_at || entry.changedAt || entry.at || entry.timestamp,
    context.updatedAt
  );
  const statusId = entry.status_id || entry.statusId || entry.status || context.statusId || 'draft';
  const stationId =
    entry.station_id ||
    entry.stationId ||
    entry.section_id ||
    entry.sectionId ||
    entry.kitchen_section_id ||
    entry.kitchenSectionId ||
    context.kitchenSection ||
    null;
  const actorId = entry.actor_id || entry.actorId || entry.userId || entry.changedBy || context.actorId || null;
  const source = entry.source || entry.channel || entry.origin || null;
  const reason = entry.reason || entry.note || null;
  const metadata = ensurePlainObject(entry.metadata || entry.meta);
  const id = entry.id || `${context.lineId}::status::${changedAt}`;
  return {
    id,
    orderId: context.orderId,
    orderLineId: context.lineId,
    status: statusId,
    stationId: stationId || undefined,
    actorId: actorId || undefined,
    source: source || undefined,
    reason: reason || undefined,
    metadata,
    changedAt
  };
}

function normalizeOrderLineRecord(orderId, line, defaults) {
  if (!line) return null;
  const baseItemKey =
    line.itemId ||
    line.item_id ||
    line.menuItemId ||
    line.menu_item_id ||
    line.productId ||
    line.product_id ||
    createId('ln');
  const uid = line.uid || line.storageId || `${orderId}::${line.id || baseItemKey}`;
  const id = line.id || line.lineId || line.line_id || `${orderId}::${baseItemKey}`;
  const versionValue = Number(line.version);
  const qty = Number(line.qty);
  const price = Number(line.price);
  const total = Number(line.total);
  const baseStatus =
    line.status || line.statusId || line.status_id || defaults.status || 'draft';
  const stage = line.stage || line.stageId || line.stage_id || defaults.stage || 'new';
  const kitchenSection =
    line.kitchenSection ||
    line.kitchen_section ||
    line.stationId ||
    line.station_id ||
    line.sectionId ||
    line.section_id ||
    null;
  const createdAt = toTimestamp(line.createdAt, defaults.createdAt);
  const updatedAt = toTimestamp(line.updatedAt, defaults.updatedAt);
  const logContext = {
    orderId,
    lineId: id,
    statusId: baseStatus,
    kitchenSection,
    actorId: defaults.actorId || null,
    updatedAt
  };
  const statusLogs = [];
  const seen = new Set();
  const statusSources = [
    line.statusLogs,
    line.status_logs,
    line.statusHistory,
    line.status_history,
    line.events
  ];
  statusSources.forEach((source) => {
    if (!Array.isArray(source)) return;
    source.forEach((entry) => {
      const normalized = normalizeOrderLineStatusLogEntry(entry, logContext);
      if (normalized && normalized.id && !seen.has(normalized.id)) {
        seen.add(normalized.id);
        statusLogs.push(normalized);
      }
    });
  });
  if (!statusLogs.length) {
    const fallback = normalizeOrderLineStatusLogEntry(
      {
        status: baseStatus,
        stationId: kitchenSection,
        changedAt: updatedAt,
        actorId: logContext.actorId
      },
      logContext
    );
    if (fallback) statusLogs.push(fallback);
  }
  statusLogs.sort((a, b) => (a.changedAt || 0) - (b.changedAt || 0));
  const latest = statusLogs[statusLogs.length - 1] || {};
  const resolvedStatus = latest.status || baseStatus;
  const itemId =
    line.itemId ||
    line.item_id ||
    line.Item_Id ||  // PascalCase from schema!
    line.menuItemId ||
    line.menu_item_id ||
    line.productId ||
    line.product_id ||
    null;

  // 🔍 DEBUG: Log when item_id is null
  if (!itemId) {
    console.error('[Server][normalizeOrderLineRecord] ❌ item_id is NULL!', {
      lineId: line.id,
      orderId,
      lineKeys: Object.keys(line),
      itemId: line.itemId,
      item_id: line.item_id,
      menuItemId: line.menuItemId,
      fullLine: JSON.stringify(line, null, 2)
    });
  }

  const record = {
    uid,
    id,
    orderId,
    itemId,
    item_id: itemId,  // ✅ Also send snake_case for backend compatibility
    name:
      line.name ||
      line.itemName ||
      line.item_name ||
      line.item_label ||
      line.label ||
      null,
    description:
      line.description ||
      line.itemDescription ||
      line.item_description ||
      line.lineDescription ||
      line.line_description ||
      null,
    qty: Number.isFinite(qty) ? qty : 0,
    price: Number.isFinite(price) ? price : 0,
    total: Number.isFinite(total) ? total : (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(price) ? price : 0),
    status: resolvedStatus,
    stage,
    kitchenSection,
    kitchenSectionId: kitchenSection,  // ✅ camelCase variant
    kitchen_section_id: kitchenSection,  // ✅ snake_case for schema
    locked: line.locked !== undefined ? !!line.locked : !!defaults.lockLineEdits,
    notes: Array.isArray(line.notes) ? line.notes.slice() : line.notes ? [line.notes] : [],
    discount: normalizeDiscount(line.discount),
    createdAt,
    updatedAt,
    statusLogs
  };
  if (Number.isFinite(versionValue) && versionValue > 0) {
    record.version = Math.trunc(versionValue);
  } else {
    // ✅ FIX: Always set version=1 for new lines or lines without version
    // This prevents version conflicts when adding new items to existing orders
    record.version = 1;
  }
  return record;
}

function normalizeOrderNoteRecord(orderId, note, fallbackAuthor, fallbackTimestamp) {
  if (!note) return null;
  const message =
    typeof note === 'string'
      ? note.trim()
      : typeof note === 'object'
      ? (note.message || note.text || '').trim()
      : '';
  if (!message) return null;
  const createdAt = toTimestamp(note.createdAt || note.created_at, fallbackTimestamp);
  return {
    id: note.id || createId(`note-${orderId}`),
    orderId,
    message,
    authorId: note.authorId || note.author_id || fallbackAuthor || 'pos',
    authorName: note.authorName || note.author_name || '',
    createdAt
  };
}

function normalizeIncomingOrder(order, options = {}) {
  if (!order || !order.id) {
    throw new Error('POS order payload requires an id.');
  }
  const shiftId = order.shiftId || order.shift_id || order.metadata?.shiftId;
  if (!shiftId) {
    throw new Error('POS order payload requires a shiftId.');
  }
  const now = Date.now();
  const orderId = String(order.id);
  const createdAt = toTimestamp(order.createdAt, now);
  const updatedAt = toTimestamp(order.updatedAt, createdAt);
  const savedAt = toTimestamp(order.savedAt, updatedAt);
  const type = order.type || order.orderType || 'dine_in';
  const status = order.status || order.statusId || order.status_id || 'open';
  const stage =
    order.fulfillmentStage || order.stage || order.stageId || order.stage_id || 'new';
  const paymentState =
    order.paymentState || order.payment_state || order.paymentStateId || order.payment_state_id || 'unpaid';
  const discount = normalizeDiscount(order.discount);
  const rawPayments = Array.isArray(order.payments) ? order.payments : [];
  const payments = rawPayments.map((entry, idx) => ({
    id: entry.id || `pm-${orderId}-${idx + 1}`,
    method: entry.method || entry.id || entry.type || 'cash',
    amount: Number(entry.amount) || 0
  }));
  const headerVersion = Number(order.version);
  const metadata = ensurePlainObject(order.metadata);
  metadata.version = metadata.version || 2;
  metadata.linesCount = Array.isArray(order.lines) ? order.lines.length : metadata.linesCount || 0;
  metadata.notesCount = Array.isArray(order.notes) ? order.notes.length : metadata.notesCount || 0;
  metadata.posId = order.posId || metadata.posId || null;
  metadata.posLabel = order.posLabel || metadata.posLabel || null;
  const posNumberNumeric = Number(order.posNumber ?? metadata.posNumber);
  const posNumber = Number.isFinite(posNumberNumeric) ? posNumberNumeric : null;
  if (discount) metadata.discount = discount;
  if (posNumber !== null) metadata.posNumber = posNumber;
  const actorId =
    order.updatedBy || order.actorId || order.authorId || options.userId || metadata.actorId || order.userId || 'pos';
  const header = {
    id: orderId,
    type,
    status,
    fulfillmentStage: stage,
    paymentState,
    tableIds: Array.isArray(order.tableIds) ? order.tableIds.slice() : [],
    guests: Number.isFinite(Number(order.guests)) ? Number(order.guests) : 0,
    totals: ensurePlainObject(order.totals),
    discount,
    createdAt,
    updatedAt,
    savedAt,
    allowAdditions: order.allowAdditions !== undefined ? !!order.allowAdditions : true,
    lockLineEdits: order.lockLineEdits !== undefined ? !!order.lockLineEdits : true,
    isPersisted: true,
    dirty: false,
    origin: order.origin || 'pos',
    shiftId,
    posId: order.posId || metadata.posId || null,
    posLabel: order.posLabel || metadata.posLabel || null,
    posNumber,
    metadata,
    payments: payments.map((entry) => ({ ...entry })),
    customerId: order.customerId || null,
    customerAddressId: order.customerAddressId || null,
    customerName: order.customerName || '',
    customerPhone: order.customerPhone || '',
    customerAddress: order.customerAddress || '',
    customerAreaId: order.customerAreaId || null
  };
  if (Number.isFinite(headerVersion) && headerVersion > 0) {
    header.version = Math.trunc(headerVersion);
  }
  if (order.finalizedAt) header.finalizedAt = toTimestamp(order.finalizedAt, savedAt);
  if (order.finishedAt) header.finishedAt = toTimestamp(order.finishedAt, savedAt);

  const lineDefaults = {
    orderId,
    status,
    stage,
    lockLineEdits: header.lockLineEdits,
    createdAt,
    updatedAt,
    actorId
  };

  const lines = Array.isArray(order.lines)
    ? order.lines.map((line) => normalizeOrderLineRecord(orderId, line, lineDefaults)).filter(Boolean)
    : [];
  const notes = Array.isArray(order.notes)
    ? order.notes.map((note) => normalizeOrderNoteRecord(orderId, note, actorId, updatedAt)).filter(Boolean)
    : [];

  const statusLogSources = [
    order.statusLogs,
    order.status_logs,
    order.statusHistory,
    order.status_history,
    order.events
  ];
  const statusLogs = [];
  const seenStatus = new Set();
  statusLogSources.forEach((source) => {
    if (!Array.isArray(source)) return;
    source.forEach((entry) => {
      const normalized = normalizeOrderStatusLogEntry(entry, {
        orderId,
        statusId: status,
        stageId: stage,
        paymentStateId: paymentState,
        actorId,
        updatedAt
      });
      if (normalized && normalized.id && !seenStatus.has(normalized.id)) {
        seenStatus.add(normalized.id);
        statusLogs.push(normalized);
      }
    });
  });
  if (!statusLogs.length) {
    const fallback = normalizeOrderStatusLogEntry(
      { status, stage, paymentState, changedAt: updatedAt, actorId },
      {
        orderId,
        statusId: status,
        stageId: stage,
        paymentStateId: paymentState,
        actorId,
        updatedAt
      }
    );
    if (fallback) statusLogs.push(fallback);
  }
  statusLogs.sort((a, b) => (a.changedAt || 0) - (b.changedAt || 0));

  header.metadata.linesCount = lines.length;
  header.metadata.notesCount = notes.length;

  return { header, lines, notes, statusLogs };
}

function buildAckOrder(normalized) {
  if (!normalized || !normalized.header) return null;
  return {
    ...deepClone(normalized.header),
    lines: normalized.lines.map((line) => deepClone(line)),
    notes: normalized.notes.map((note) => deepClone(note)),
    statusLogs: normalized.statusLogs.map((log) => deepClone(log))
  };
}

async function applyModuleMutation(branchId, moduleId, table, action, record, options = {}) {
  return handleModuleEvent(
    branchId,
    moduleId,
    { action, table, record, source: options.source || 'pos-order-api', includeRecord: true },
    null,
    { source: options.source || 'pos-order-api', includeSnapshot: false }
  );
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePaymentRecord(orderId, shiftId, payment, fallbackTimestamp) {
  if (!payment) return null;
  const id = payment.id || createId(`pay-${orderId}`);
  const amount = Number(payment.amount);
  const timestamp = payment.capturedAt || payment.captured_at || fallbackTimestamp || nowIso();
  const paymentMethodId = payment.paymentMethodId || payment.method || payment.methodId || payment.id || 'cash';
  return {
    id,
    orderId,
    shiftId,
    paymentMethodId,
    amount: Number.isFinite(amount) ? amount : 0,
    capturedAt: timestamp,
    reference: payment.reference || payment.ref || null
  };
}

async function syncOrderLines(branchId, moduleId, store, orderId, lines, options = {}) {
  const existing = store
    .listTable('order_line')
    .filter((entry) => entry && entry.orderId === orderId);
  const existingIds = new Set(existing.map((entry) => entry.id));
  const retained = new Set();
  const results = [];
  for (const line of lines) {
    if (!line) continue;
    const payload = { ...line, orderId };
    const result = await applyModuleMutation(branchId, moduleId, 'order_line', 'module:save', payload, options);
    if (result?.record?.id) {
      retained.add(result.record.id);
      results.push({ record: result.record, source: payload });
    }
  }
  for (const entry of existing) {
    if (!entry || !entry.id) continue;
    if (retained.has(entry.id)) continue;
    await applyModuleMutation(branchId, moduleId, 'order_line', 'module:delete', { id: entry.id, orderId }, options);
  }
  return results;
}

async function syncOrderPayments(branchId, moduleId, store, orderId, payments, shiftId, options = {}) {
  const existing = store
    .listTable('order_payment')
    .filter((entry) => entry && entry.orderId === orderId);
  const retained = new Set();
  const results = [];
  const now = nowIso();
  for (const payment of payments) {
    const record = normalizePaymentRecord(orderId, shiftId, payment, now);
    if (!record) continue;
    const result = await applyModuleMutation(branchId, moduleId, 'order_payment', 'module:save', record, options);
    if (result?.record?.id) {
      retained.add(result.record.id);
      results.push(result.record);
    }
  }
  for (const entry of existing) {
    if (!entry || !entry.id) continue;
    if (retained.has(entry.id)) continue;
    await applyModuleMutation(branchId, moduleId, 'order_payment', 'module:delete', { id: entry.id, orderId }, options);
  }
  return results;
}

async function syncOrderStatusLogs(branchId, moduleId, store, orderId, statusLogs, options = {}) {
  const existing = store
    .listTable('order_status_log')
    .filter((entry) => entry && entry.orderId === orderId);
  const retained = new Set();
  for (const log of statusLogs) {
    if (!log) continue;
    const payload = { ...log, orderId };
    const result = await applyModuleMutation(branchId, moduleId, 'order_status_log', 'module:save', payload, options);
    if (result?.record?.id) retained.add(result.record.id);
  }
  for (const entry of existing) {
    if (!entry || !entry.id) continue;
    if (retained.has(entry.id)) continue;
    await applyModuleMutation(branchId, moduleId, 'order_status_log', 'module:delete', { id: entry.id, orderId }, options);
  }
}

async function syncOrderLineStatusLogs(branchId, moduleId, store, orderId, lineResults, options = {}) {
  const existing = store
    .listTable('order_line_status_log')
    .filter((entry) => entry && entry.orderId === orderId);
  const retained = new Set();
  for (const { record, source } of lineResults) {
    if (!record || !record.id) continue;
    const logs = ensureArray(source?.statusLogs);
    for (const log of logs) {
      if (!log) continue;
      const payload = { ...log, orderId, lineId: record.id };
      const result = await applyModuleMutation(
        branchId,
        moduleId,
        'order_line_status_log',
        'module:save',
        payload,
        options
      );
      if (result?.record?.id) retained.add(result.record.id);
    }
  }
  for (const entry of existing) {
    if (!entry || !entry.id) continue;
    if (retained.has(entry.id)) continue;
    await applyModuleMutation(branchId, moduleId, 'order_line_status_log', 'module:delete', { id: entry.id, orderId }, options);
  }
}

function generateJobOrderRecords(store, header, lines) {
  if (!header || !header.id) return null;
  if (!Array.isArray(lines) || lines.length === 0) return null;

  const orderId = header.id;
  const orderNumber = header.metadata?.invoiceSequence || header.id;
  const serviceMode = header.type || 'dine_in';
  const createdAt = header.createdAt || Date.now();
  const updatedAt = header.updatedAt || createdAt;

  // ✅ Query kitchen_sections from store
  const kitchenSections = store.listTable('kitchen_sections') || [];
  const sectionMap = new Map();
  kitchenSections.forEach(section => {
    if (section && section.id) {
      sectionMap.set(section.id, section);
    }
  });

  // ✅ Query menu_items from store
  const menuItems = store.listTable('menu_items') || [];
  const itemMap = new Map();
  menuItems.forEach(item => {
    if (item && item.id) {
      itemMap.set(item.id, item);
    }
  });

  // Helper function to extract localized string
  const extractLocalizedString = (value, lang, fallback = '') => {
    if (!value) return fallback;
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      if (lang === 'ar') return value.ar || value.en || fallback;
      return value.en || value.ar || fallback;
    }
    return fallback;
  };

  // Group lines by kitchen section (stationId)
  const jobsMap = new Map();
  const jobDetails = [];
  const jobModifiers = [];
  const historyEntries = [];

  lines.forEach((line, index) => {
    if (!line) return;

    const lineIndex = index + 1;
    const stationId = line.kitchenSectionId || line.kitchen_section_id || line.kitchenSection || 'expo';
    const jobId = `${orderId}-${stationId}`;

    // ✅ Lookup kitchen section data
    const section = sectionMap.get(stationId);

    // Handle multiple formats: section_name object, or nameAr/nameEn fields
    let sectionName = section?.section_name;
    if (!sectionName && section) {
      // Fallback to nameAr/nameEn if section_name doesn't exist
      sectionName = {
        ar: section.nameAr || section.name_ar || '',
        en: section.nameEn || section.name_en || ''
      };
    }

    const stationCode = section?.code || section?.stationCode || section?.station_code ||
                        extractLocalizedString(sectionName, 'en', String(stationId).substring(0, 8).toUpperCase());

    // Create or update job header for this station
    const existing = jobsMap.get(jobId) || {
      id: jobId,
      orderId,
      orderNumber,
      posRevision: `${orderId}@${updatedAt}`,
      orderTypeId: serviceMode,
      serviceMode,
      stationId,
      stationCode,  // ✅ Use real station code
      status: 'queued',
      progressState: 'awaiting',
      totalItems: 0,
      completedItems: 0,
      remainingItems: 0,
      hasAlerts: false,
      isExpedite: false,
      tableLabel: null,
      customerName: header.customerName || null,
      dueAt: header.dueAt || null,
      acceptedAt: null,
      startedAt: null,
      readyAt: null,
      completedAt: null,
      expoAt: null,
      syncChecksum: `${orderId}-${stationId}`,
      notes: Array.isArray(line.notes) ? line.notes.join('; ') : '',
      meta: { orderSource: 'pos', kdsTab: stationId },
      createdAt,
      updatedAt
    };

    const quantity = Number(line.qty) || 1;
    existing.totalItems += quantity;
    existing.remainingItems += quantity;
    jobsMap.set(jobId, existing);

    // Create job detail for this line
    const baseLineId = line.id || `${orderId}-line-${lineIndex}`;
    const detailId = `${jobId}-detail-${baseLineId}`;
    const itemId = line.itemId || line.item_id || baseLineId;

    // ✅ Lookup menu item data
    const menuItem = itemMap.get(itemId);
    const itemName = menuItem?.item_name || menuItem?.name || line.name;
    const itemSku = menuItem?.sku || line.sku || null;
    const categoryId = menuItem?.categoryId || menuItem?.category_id || '';

    // ✅ Extract localized strings (NOT objects)
    const itemNameAr = extractLocalizedString(itemName, 'ar', `عنصر ${lineIndex}`);
    const itemNameEn = extractLocalizedString(itemName, 'en', `Item ${lineIndex}`);

    const detail = {
      id: detailId,
      jobOrderId: jobId,
      itemId,
      itemCode: itemId,
      itemSku,  // ✅ Add SKU
      categoryId,  // ✅ Add category
      quantity,
      status: 'queued',
      startAt: null,
      finishAt: null,
      createdAt,
      updatedAt,
      itemNameAr,  // ✅ String, not object
      itemNameEn,  // ✅ String, not object
      prepNotes: Array.isArray(line.notes) ? line.notes.join('; ') : '',
      stationId,
      kitchenSectionId: stationId
    };
    jobDetails.push(detail);

    // Create job modifiers if any
    // Note: modifiers would need to be extracted from line data if available
    // For now, we'll skip this as the order_line table doesn't typically store modifiers

    // Create status history entry
    historyEntries.push({
      id: `HIS-${jobId}-${baseLineId}`,
      jobOrderId: jobId,
      status: 'queued',
      actorId: 'pos',
      actorName: 'POS',
      actorRole: 'pos',
      changedAt: createdAt,
      meta: { source: 'pos', lineId: line.id || baseLineId }
    });
  });

  const headers = Array.from(jobsMap.values());

  return {
    headers,
    details: jobDetails,
    modifiers: jobModifiers,
    history: historyEntries
  };
}

async function syncJobOrders(branchId, moduleId, store, orderId, header, lines, options = {}) {
  // ✅ CRITICAL FIX: DO NOT sync job_order from order_line!
  //
  // Problem: Race condition between WebSocket and REST API
  // 1. posv2.js sends job_order via WebSocket (store.insert) → Backend saves ✅
  // 2. posv2.js sends order via REST API → Backend calls syncJobOrders() → DELETES job_order! ❌
  //
  // Root cause:
  // - posv2.js creates job_order_header/detail from order_line (line 2977-2979)
  // - posv2.js sends job_order via WebSocket using store.insert() (line 3214-3232)
  // - posv2.js ALSO sends order via REST API
  // - Backend receives order → saves order_header/order_line → calls syncJobOrders()
  // - syncJobOrders() regenerates job_order from order_line → DELETES existing job_order!
  //
  // Solution:
  // - Disable syncJobOrders completely
  // - job_order data is managed by posv2.js via WebSocket only
  // - Backend receives job_order via module:insert events and persists automatically
  // - No need to regenerate from order_line
  //
  // Result:
  // ✅ No race condition
  // ✅ job_order persists correctly via WebSocket
  // ✅ No duplicate cooking (completed jobs preserved)
  // ✅ Timers work correctly (startedAt preserved)

  // 🔍 Log when this function is called (should be rare now)
  const existingHeaders = store.listTable('job_order_header').filter(h => h.orderId === orderId);
  logger.info({
    orderId,
    existingJobHeaders: existingHeaders.length,
    sampleIds: existingHeaders.slice(0, 3).map(h => ({ id: h.id, stationId: h.stationId }))
  }, '⚠️ [syncJobOrders] Called but DISABLED - existing job_order_header count');

  return;
}

// ✅ CLAUDE FIX: Global map to track in-flight save operations
const SAVE_IN_PROGRESS = new Map();

async function savePosOrder(branchId, moduleId, orderPayload, options = {}) {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔥 [CLAUDE BACKEND FIX] savePosOrder CALLED');
  console.log('═══════════════════════════════════════════════════════');

  if (!orderPayload || typeof orderPayload !== 'object') {
    throw new Error('Order payload is required');
  }

  const baseOrder = deepClone(orderPayload);

  // ✅ CRITICAL: Check if order already exists in store (prevent duplicates)
  if (baseOrder.id) {
    const store = await ensureModuleStore(branchId, moduleId);
    const existingOrder = store.listTable('order_header').find(h => h.id === baseOrder.id);

    if (existingOrder) {
      console.log('⚠️ [CLAUDE BACKEND FIX] Order already exists in store:', {
        orderId: baseOrder.id,
        existingVersion: existingOrder.version,
        incomingVersion: baseOrder.version,
        existingStatus: existingOrder.status,
        incomingStatus: baseOrder.status,
        existingLinesCount: store.listTable('order_line').filter(l => l.orderId === baseOrder.id).length
      });

      // If versions match exactly, this is likely a duplicate request
      // BUT: Allow if incoming order has MORE lines (adding items to existing order)
      if (baseOrder.version && existingOrder.version === baseOrder.version) {
        const existingLinesCount = store.listTable('order_line').filter(l => l.orderId === baseOrder.id).length;
        const incomingLinesCount = baseOrder.lines?.length || 0;

        console.log('🔍 [DUPLICATE CHECK]:', {
          existingLinesCount,
          incomingLinesCount,
          hasMoreLines: incomingLinesCount > existingLinesCount
        });

        // ALLOW if adding new items (more lines than before)
        if (incomingLinesCount > existingLinesCount) {
          console.log('✅ [CLAUDE BACKEND FIX] ALLOWING save - adding new items to order');
        } else {
          console.error('❌ [CLAUDE BACKEND FIX] DUPLICATE SAVE BLOCKED - Same version, same or fewer lines!');
          throw new Error('DUPLICATE_SAVE_DETECTED: Order with same ID and version already exists');
        }
      }
    }
  }

  // ✅ CRITICAL: Prevent duplicate in-flight requests
  const requestKey = baseOrder.id || `temp-${Date.now()}`;
  if (SAVE_IN_PROGRESS.has(requestKey)) {
    console.error('❌ [CLAUDE BACKEND FIX] DUPLICATE SAVE BLOCKED - Already saving!', { requestKey });
    throw new Error('DUPLICATE_SAVE_IN_PROGRESS: This order is currently being saved');
  }

  SAVE_IN_PROGRESS.set(requestKey, Date.now());
  console.log('🔒 [CLAUDE BACKEND FIX] Save lock acquired:', requestKey);

  try {
    // ✅ Only allocate sequence for truly NEW orders (no ID OR draft ID)
    const isDraftId = baseOrder.id && String(baseOrder.id).startsWith('draft-');
    const previousId = baseOrder.id;

    if (!baseOrder.id || isDraftId) {
      console.log('═══════════════════════════════════════════════════════');
      console.log('🔢 [CLAUDE BACKEND FIX] ALLOCATING SEQUENCE (NEW ORDER)');
      console.log('═══════════════════════════════════════════════════════');

      const allocation = await sequenceManager.nextValue(branchId, moduleId, 'order_header', 'id', { record: baseOrder });
      if (allocation?.formatted) {
        const oldId = baseOrder.id;
        baseOrder.id = allocation.formatted;
        if (!baseOrder.metadata || typeof baseOrder.metadata !== 'object') baseOrder.metadata = {};
        baseOrder.metadata.invoiceSequence = allocation.value;
        baseOrder.metadata.sequenceRule = allocation.rule || null;

        console.log('✅ [CLAUDE BACKEND FIX] Sequence allocated:', {
          oldId: isDraftId ? oldId : 'none',
          newId: baseOrder.id,
          sequence: allocation.value
        });

        // 🔍 Check if this ID already exists (shouldn't happen!)
        const store = await ensureModuleStore(branchId, moduleId);
        const duplicateCheck = store.listTable('order_header').find(h => h.id === baseOrder.id);
        if (duplicateCheck) {
          console.error('🚨 [SEQUENCE MANAGER BUG] Allocated ID already exists in store!', {
            allocatedId: baseOrder.id,
            existingOrder: {
              id: duplicateCheck.id,
              version: duplicateCheck.version,
              status: duplicateCheck.status,
              createdAt: duplicateCheck.createdAt
            }
          });
          throw new Error(`SEQUENCE_COLLISION: Allocated ID ${baseOrder.id} already exists in store!`);
        }
      }
    } else {
      console.log('♻️ [CLAUDE BACKEND FIX] Using existing ID (update):', baseOrder.id);
    }
  const actorId = options.actorId || baseOrder.updatedBy || baseOrder.closedBy || baseOrder.openedBy || null;
  const normalized = normalizeIncomingOrder(baseOrder, { actorId });

  // ✅ CRITICAL: Prevent saving empty orders (no lines)
  if (!normalized.lines || normalized.lines.length === 0) {
    console.error('❌ [CLAUDE BACKEND FIX] EMPTY ORDER BLOCKED - No order lines!');
    throw new Error('EMPTY_ORDER_NOT_ALLOWED: Order must have at least one order_line');
  }
  console.log('✅ [CLAUDE BACKEND FIX] Order validation passed:', {
    orderId: normalized.header.id,
    linesCount: normalized.lines.length
  });
  const headerResult = await applyModuleMutation(
    branchId,
    moduleId,
    'order_header',
    'module:save',
    normalized.header,
    { source: options.source || 'pos-order-api' }
  );
  const store = await ensureModuleStore(branchId, moduleId);
  const orderId = headerResult?.record?.id || normalized.header.id;
  const lineResults = await syncOrderLines(
    branchId,
    moduleId,
    store,
    orderId,
    normalized.lines,
    { source: options.source || 'pos-order-api' }
  );
  await syncOrderPayments(
    branchId,
    moduleId,
    store,
    orderId,
    normalized.header.payments || [],
    normalized.header.shiftId,
    { source: options.source || 'pos-order-api' }
  );
  await syncOrderStatusLogs(
    branchId,
    moduleId,
    store,
    orderId,
    normalized.statusLogs,
    { source: options.source || 'pos-order-api' }
  );
  await syncOrderLineStatusLogs(
    branchId,
    moduleId,
    store,
    orderId,
    lineResults,
    { source: options.source || 'pos-order-api' }
  );

  // ✅ Sync job order tables (job_order_header, job_order_detail, job_order_detail_modifier, job_order_status_history)
  await syncJobOrders(
    branchId,
    moduleId,
    store,
    orderId,
    normalized.header,
    normalized.lines,
    { source: options.source || 'pos-order-api' }
  );

    console.log('✅ [CLAUDE BACKEND FIX] Save completed successfully:', orderId);
    return { orderId, normalized, header: headerResult?.record };
  } finally {
    // ✅ CRITICAL: Always release lock
    SAVE_IN_PROGRESS.delete(requestKey);
    console.log('🔓 [CLAUDE BACKEND FIX] Save lock released:', requestKey);
  }
}

function buildPosOrderSnapshot(store, orderId) {
  const header = store.listTable('order_header').find((entry) => entry && entry.id === orderId);
  if (!header) return null;
  const lines = store
    .listTable('order_line')
    .filter((entry) => entry && entry.orderId === orderId)
    .map((entry) => ({ ...entry }));
  const payments = store
    .listTable('order_payment')
    .filter((entry) => entry && entry.orderId === orderId)
    .map((entry) => ({ ...entry }));
  const statusLogs = store
    .listTable('order_status_log')
    .filter((entry) => entry && entry.orderId === orderId)
    .map((entry) => ({ ...entry }));
  const lineStatusLogs = store
    .listTable('order_line_status_log')
    .filter((entry) => entry && entry.orderId === orderId)
    .map((entry) => ({ ...entry }));

  const lineStatusMap = new Map();
  for (const log of lineStatusLogs) {
    const key = log.lineId || log.line_id;
    if (!key) continue;
    if (!lineStatusMap.has(key)) lineStatusMap.set(key, []);
    lineStatusMap.get(key).push(log);
  }
  const linesWithStatus = lines.map((entry) => ({
    ...entry,
    statusLogs: lineStatusMap.get(entry.id) || []
  }));

  return {
    ...header,
    lines: linesWithStatus,
    payments,
    statusLogs
  };
}

async function fetchPosOrderSnapshot(branchId, moduleId, orderId) {
  const store = await ensureModuleStore(branchId, moduleId);
  return buildPosOrderSnapshot(store, orderId);
}

async function applyPosOrderCreate(branchId, moduleId, frameData, context = {}) {
  const order = frameData.order;
  if (!order || !order.id) {
    return { state: await ensureSyncState(branchId, moduleId), order: null, existing: false };
  }
  const baseState = await ensureSyncState(branchId, moduleId);
  const currentRows = Array.isArray(baseState?.moduleSnapshot?.tables?.pos_database)
    ? baseState.moduleSnapshot.tables.pos_database
    : [];
  const latestRecord = currentRows.length ? currentRows[currentRows.length - 1] : null;
  const currentPayload = latestRecord && typeof latestRecord.payload === 'object' ? latestRecord.payload : {};
  const currentStores = currentPayload.stores && typeof currentPayload.stores === 'object' ? currentPayload.stores : {};
  const orderId = String(order.id);
  const existingOrder = Array.isArray(currentStores.orders)
    ? currentStores.orders.find((entry) => entry && entry.id === orderId)
    : null;

  let normalized;
  try {
    normalized = normalizeIncomingOrder(order, { userId: context.userUuid || frameData.meta?.userId || null });
  } catch (error) {
    throw new Error(error.message || 'Failed to normalize POS order payload.');
  }

  const persistedAt = normalized.header.savedAt || normalized.header.updatedAt || Date.now();
  const syncEntry = {
    ts: persistedAt,
    type: 'order:create',
    orderId: normalized.header.id,
    shiftId: normalized.header.shiftId,
    userId: context.userUuid || frameData.meta?.userId || null,
    source: context.clientId || 'ws2'
  };

  const snapshotPatch = {
    payload: {
      stores: {
        orders: [normalized.header],
        orderLines: normalized.lines,
        orderNotes: normalized.notes,
        orderStatusLogs: normalized.statusLogs,
        syncLog: [syncEntry]
      },
      meta: {
        lastOrderId: normalized.header.id,
        lastOrderSavedAt: new Date(persistedAt).toISOString()
      }
    },
    meta: {
      lastOrderId: normalized.header.id,
      lastOrderSavedAt: new Date(persistedAt).toISOString()
    }
  };

  const nextState = await applySyncSnapshot(branchId, moduleId, snapshotPatch, {
    ...context,
    branchId,
    moduleId,
    orderId: normalized.header.id,
    action: 'create-order'
  });

  return {
    state: nextState,
    order: buildAckOrder(normalized),
    existing: !!existingOrder
  };
}

function normalizePosSnapshot(store, incomingSnapshot) {
  if (!isPlainObject(incomingSnapshot)) return null;
  if (!store.tables.includes('pos_database')) return null;

  let dataset = null;
  if (isPlainObject(incomingSnapshot.stores)) {
    dataset = incomingSnapshot;
  } else if (isPlainObject(incomingSnapshot.payload)) {
    dataset = incomingSnapshot.payload;
  } else if (
    isPlainObject(incomingSnapshot.settings) ||
    Array.isArray(incomingSnapshot.orders) ||
    isPlainObject(incomingSnapshot.meta)
  ) {
    dataset = incomingSnapshot;
  }

  if (!dataset) return null;

  const currentSnapshot = store.getSnapshot();
  const existingRows = Array.isArray(currentSnapshot.tables?.pos_database)
    ? currentSnapshot.tables.pos_database.map((row) => deepClone(row))
    : [];
  const previousRecord = existingRows.length ? existingRows[existingRows.length - 1] : null;
  const previousPayload = previousRecord && isPlainObject(previousRecord.payload) ? previousRecord.payload : {};
  const mergedPayload = mergePosPayload(previousPayload, dataset);

  if (previousRecord && snapshotsEqual(previousRecord.payload, mergedPayload)) {
    return currentSnapshot;
  }

  const nowTs = nowIso();
  const meta = isPlainObject(dataset.meta) ? dataset.meta : {};
  const baseId = previousRecord?.id || meta.snapshotId || meta.id || meta.exportId || incomingSnapshot.id || null;
  const recordId = baseId ? String(baseId) : createId(`${store.moduleId}-live`);
  const createdAt = previousRecord?.createdAt || toIsoTimestamp(meta.exportedAt, nowTs) || nowTs;
  const record = {
    id: recordId,
    branchId: store.branchId,
    payload: deepClone(mergedPayload),
    createdAt,
    updatedAt: nowTs
  };

  const versionCandidates = [];
  const datasetVersion = Number(dataset.version);
  if (Number.isFinite(datasetVersion)) {
    versionCandidates.push(datasetVersion);
  }
  const incomingVersion = Number(incomingSnapshot.version);
  if (Number.isFinite(incomingVersion)) {
    versionCandidates.push(incomingVersion);
  }
  if (Number.isFinite(Number(currentSnapshot.version))) {
    versionCandidates.push(Number(currentSnapshot.version) + 1);
    versionCandidates.push(Number(currentSnapshot.version));
  }
  const version = versionCandidates.length
    ? Math.max(...versionCandidates)
    : Number.isFinite(Number(currentSnapshot.version))
    ? Number(currentSnapshot.version)
    : 1;

  const nextMeta = currentSnapshot.meta && isPlainObject(currentSnapshot.meta) ? deepClone(currentSnapshot.meta) : {};
  if (isPlainObject(meta)) {
    Object.assign(nextMeta, deepClone(meta));
  }
  nextMeta.lastUpdatedAt = nowTs;
  nextMeta.lastCentralSyncAt = nowTs;
  if (Number.isFinite(datasetVersion)) {
    nextMeta.centralVersion = datasetVersion;
  } else if (Number.isFinite(incomingVersion)) {
    nextMeta.centralVersion = incomingVersion;
  }

  return {
    moduleId: store.moduleId,
    branchId: store.branchId,
    version,
    tables: { pos_database: [record] },
    meta: nextMeta
  };
}

function normalizeIncomingSnapshot(store, incomingSnapshot) {
  if (!incomingSnapshot || typeof incomingSnapshot !== 'object') return incomingSnapshot;
  if (!incomingSnapshot.tables && isPlainObject(incomingSnapshot.snapshot)) {
    return normalizeIncomingSnapshot(store, incomingSnapshot.snapshot);
  }
  if (isPlainObject(incomingSnapshot.tables)) {
    const normalized = {
      moduleId: store.moduleId,
      branchId: store.branchId,
      version: Number.isFinite(Number(incomingSnapshot.version))
        ? Number(incomingSnapshot.version)
        : store.version,
      tables: {},
      meta: isPlainObject(incomingSnapshot.meta) ? deepClone(incomingSnapshot.meta) : {}
    };
    const currentSnapshot = store.getSnapshot();
    const currentTables = currentSnapshot && typeof currentSnapshot.tables === 'object'
      ? currentSnapshot.tables
      : {};
    for (const tableName of store.tables) {
      let rows;
      if (Array.isArray(incomingSnapshot.tables?.[tableName])) {
        rows = incomingSnapshot.tables[tableName].map((row) => deepClone(row));
      } else if (Array.isArray(currentTables?.[tableName])) {
        rows = currentTables[tableName].map((row) => deepClone(row));
      } else {
        rows = [];
      }
      normalized.tables[tableName] = rows;
    }
    return normalized;
  }

  const posSnapshot = normalizePosSnapshot(store, incomingSnapshot);
  if (posSnapshot) {
    return posSnapshot;
  }

  return incomingSnapshot;
}

function ensureInsertOnlySnapshot(store, incomingSnapshot) {
  const currentSnapshot = store.getSnapshot();
  const currentVersion = Number(currentSnapshot?.version) || 0;
  const incomingVersion = Number(incomingSnapshot?.version);
  if (Number.isFinite(incomingVersion) && incomingVersion < currentVersion) {
    return {
      ok: false,
      reason: 'version-regression',
      currentVersion,
      incomingVersion
    };
  }

  const requiredTables = Array.isArray(store.tables) ? store.tables : [];
  const incomingTables = incomingSnapshot.tables && typeof incomingSnapshot.tables === 'object' ? incomingSnapshot.tables : {};

  for (const tableName of requiredTables) {
    if (!(tableName in incomingTables)) {
      const currentRows = Array.isArray(currentSnapshot.tables?.[tableName]) ? currentSnapshot.tables[tableName] : [];
      return {
        ok: false,
        reason: 'missing-table',
        tableName,
        currentCount: currentRows.length
      };
    }

    const incomingRows = incomingTables[tableName];
    if (!Array.isArray(incomingRows)) {
      return {
        ok: false,
        reason: 'invalid-table-format',
        tableName
      };
    }

    let tableDefinition = null;
    try {
      tableDefinition = store.schemaEngine.getTable(tableName);
    } catch (_err) {
      tableDefinition = null;
    }

    const primaryFields = Array.isArray(tableDefinition?.fields)
      ? tableDefinition.fields.filter((field) => field && field.primaryKey).map((field) => field.name)
      : [];

    if (primaryFields.length) {
      const seenKeys = new Set();
      for (let idx = 0; idx < incomingRows.length; idx += 1) {
        const row = incomingRows[idx];
        if (!row || typeof row !== 'object') {
          continue;
        }
        const parts = [];
        let valid = true;
        for (const fieldName of primaryFields) {
          const value = row[fieldName];
          if (value === undefined || value === null) {
            valid = false;
            break;
          }
          parts.push(String(value));
        }
        if (!valid) {
          return {
            ok: false,
            reason: 'missing-primary-key',
            tableName,
            index: idx
          };
        }
        const key = parts.join('::');
        if (seenKeys.has(key)) {
          return {
            ok: false,
            reason: 'duplicate-primary-key',
            tableName,
            key
          };
        }
        seenKeys.add(key);
      }
    }
  }

  return { ok: true };
}

function createInsertOnlyViolation(details) {
  const error = new Error('Incoming snapshot violates insert-only policy.');
  error.code = 'INSERT_ONLY_VIOLATION';
  error.details = details;
  return error;
}

async function applySyncSnapshot(branchId, moduleId, snapshot = {}, context = {}) {
  const key = syncStateKey(branchId, moduleId);
  let moduleSnapshot = snapshot && typeof snapshot === 'object' ? deepClone(snapshot) : null;
  try {
    if (moduleSnapshot) {
      const store = await ensureModuleStore(branchId, moduleId);
      moduleSnapshot = normalizeIncomingSnapshot(store, moduleSnapshot);
      const validation = ensureInsertOnlySnapshot(store, moduleSnapshot);
      if (!validation.ok) {
        throw createInsertOnlyViolation({ ...validation, branchId, moduleId });
      }
      moduleSnapshot = store.replaceTablesFromSnapshot(moduleSnapshot, { ...context, branchId, moduleId });
      await persistModuleStore(store);
    }
  } catch (error) {
    if (error?.code === 'INSERT_ONLY_VIOLATION') {
      const counts = { before: summarizeTableCounts(SYNC_STATES.get(key)?.moduleSnapshot || {}), after: summarizeTableCounts(moduleSnapshot || {}) };
      logger.warn({ branchId, moduleId, violation: error.details, counts }, 'Rejected destructive sync snapshot');
      await recordRejectedMutation(branchId, moduleId, {
        reason: 'insert-only-violation',
        source: context.origin || context.source || 'snapshot',
        mutationId: context.mutationId || null,
        transId: context.transId || null,
        table: error.details?.tableName || null,
        meta: { ...error.details, counts }
      });
      throw error;
    }
    logger.warn({ err: error, branchId, moduleId }, 'Failed to persist sync snapshot');
    moduleSnapshot = null;
  }
  if (!moduleSnapshot) {
    const fallback = await ensureSyncState(branchId, moduleId);
    moduleSnapshot = fallback.moduleSnapshot;
  }
  const nextState = {
    branchId,
    moduleId,
    version: Number(moduleSnapshot?.version) || (SYNC_STATES.get(key)?.version || 1),
    moduleSnapshot,
    updatedAt: moduleSnapshot?.meta?.lastUpdatedAt || nowIso()
  };
  SYNC_STATES.set(key, nextState);
  return nextState;
}

async function loadTopicBootstrap(topic) {
  const descriptor = parseSyncTopic(topic);
  if (!descriptor) {
    return null;
  }
  try {
    const state = await ensureSyncState(descriptor.branchId, descriptor.moduleId);
    const payload = buildSyncPublishData(state, { meta: { reason: 'bootstrap' } });
    return deepClone(payload);
  } catch (error) {
    logger.warn({ err: error, topic, descriptor }, 'Failed to generate pubsub bootstrap payload');
    return null;
  }
}

async function ensurePubsubTopic(topic) {
  if (!PUBSUB_TOPICS.has(topic)) {
    PUBSUB_TOPICS.set(topic, { subscribers: new Set(), lastData: null });
  }
  const record = PUBSUB_TOPICS.get(topic);
  if (record.lastData === undefined || record.lastData === null) {
    const bootstrap = await loadTopicBootstrap(topic);
    if (bootstrap) {
      record.lastData = bootstrap;
    }
  }
  return record;
}

async function registerPubsubSubscriber(topic, client) {
  const record = await ensurePubsubTopic(topic);
  record.subscribers.add(client.id);
  if (!client.pubsubTopics) {
    client.pubsubTopics = new Set();
  }
  client.pubsubTopics.add(topic);
  if (record.lastData === undefined || record.lastData === null) {
    const bootstrap = await loadTopicBootstrap(topic);
    if (bootstrap) {
      record.lastData = bootstrap;
    } else {
      logger.debug({ topic }, 'No bootstrap payload available for pubsub subscription');
    }
  }
  return record;
}

function unregisterPubsubSubscriptions(client) {
  if (!client || !client.pubsubTopics) return;
  for (const topic of client.pubsubTopics) {
    const record = PUBSUB_TOPICS.get(topic);
    if (record) {
      record.subscribers.delete(client.id);
      if (!record.subscribers.size) {
        PUBSUB_TOPICS.delete(topic);
      }
    }
  }
  client.pubsubTopics.clear();
}

function buildSyncPublishData(state, overrides = {}) {
  const snapshot = overrides.snapshot ? deepClone(overrides.snapshot) : deepClone(state.moduleSnapshot);
  const baseFrame = overrides.frameData && typeof overrides.frameData === 'object' ? deepClone(overrides.frameData) : {};
  const version = Number.isFinite(overrides.version) ? Number(overrides.version) : Number(state.version) || 1;
  const meta = {
    branchId: state.branchId,
    moduleId: state.moduleId,
    serverId: SERVER_ID,
    version,
    updatedAt: overrides.updatedAt || state.updatedAt,
    ...(baseFrame.meta || {}),
    ...(overrides.meta || {})
  };
  const activeFlags = getActiveFullSyncFlags(state.branchId, state.moduleId);
  if (activeFlags.length) {
    meta.fullSyncRequired = true;
    meta.fullSyncFlags = activeFlags.map((entry) => serializeFullSyncFlag(entry));
  }
  const payload = {
    action: overrides.action || baseFrame.action || 'snapshot',
    branchId: state.branchId,
    moduleId: state.moduleId,
    version,
    snapshot,
    mutationId: overrides.mutationId || baseFrame.mutationId || null,
    meta
  };
  delete baseFrame.action;
  delete baseFrame.snapshot;
  delete baseFrame.version;
  delete baseFrame.mutationId;
  delete baseFrame.meta;
  Object.assign(payload, baseFrame);
  return payload;
}

async function broadcastPubsub(topic, data) {
  const record = await ensurePubsubTopic(topic);
  const envelope = record.lastData ? buildDeltaEnvelope(record.lastData, data) : buildSnapshotEnvelope(data);
  if (!envelope) {
    return;
  }
  record.lastData = deepClone(data);
  const frame = { type: 'publish', topic, data: envelope };
  const cycle = nextBroadcastCycle();
  let delivered = 0;
  for (const clientId of record.subscribers) {
    const target = clients.get(clientId);
    if (!target) continue;
    if (sendToClient(target, frame, { cycle, channel: 'pubsub' })) {
      delivered += 1;
    }
  }
  recordWsBroadcast('pubsub', delivered);
}

function isPubsubFrame(payload) {
  if (!payload || typeof payload !== 'object') return false;
  return PUBSUB_TYPES.has(payload.type);
}

async function broadcastSyncUpdate(branchId, moduleId, state, options = {}) {
  const payload = buildSyncPublishData(state, options);
  const topics = getSyncTopics(branchId, moduleId);
  for (const topic of topics) {
    await broadcastPubsub(topic, payload);
  }
  const frameData = options.frameData && typeof options.frameData === 'object' ? options.frameData : {};
  const branchTopics = resolveBranchTopicsFromFrame(frameData, payload);
  if (branchTopics.size) {
    const detail = buildBranchDeltaDetail(branchId, payload, frameData);
    await broadcastBranchTopics(branchId, branchTopics, detail);
  }
  return payload;
}

function getTableNoticeTopics(branchId, moduleId, tableName) {
  const safeBranch = branchId || 'default';
  const safeModule = moduleId || 'pos';
  const safeTable = tableName || 'default';
  return [
    `${TABLE_TOPIC_PREFIX}${safeBranch}::${safeModule}::${safeTable}`,
    `${TABLE_TOPIC_PREFIX}${safeBranch}::${safeTable}`,
    `${GLOBAL_TABLE_TOPIC_PREFIX}${safeTable}`
  ];
}

function normalizeTableIdentifier(value) {
  if (value == null) return '';
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const TRANSACTION_TABLE_ALIAS_ENTRIES = [
  ['order_header', 'order_header'],
  ['orders', 'order_header'],
  ['order', 'order_header'],
  ['order_headers', 'order_header'],
  ['orderheader', 'order_header'],
  ['order_line', 'order_line'],
  ['order_lines', 'order_line'],
  ['orders_lines', 'order_line'],
  ['orderline', 'order_line'],
  ['orderlines', 'order_line'],
  ['line_items', 'order_line'],
  ['payments', 'order_payment'],
  ['payment', 'order_payment'],
  ['order_payments', 'order_payment'],
  ['pos_payments', 'order_payment'],
  ['pos_payment', 'order_payment'],
  ['pos_shift', 'pos_shift'],
  ['pos_shifts', 'pos_shift'],
  ['shifts', 'pos_shift'],
  ['shift', 'pos_shift']
];

const TRANSACTION_TABLE_ALIAS_MAP = new Map(
  TRANSACTION_TABLE_ALIAS_ENTRIES.map(([alias, target]) => [normalizeTableIdentifier(alias), target])
);

function resolveTransactionTableName(input) {
  if (input === undefined || input === null) return null;
  const normalized = normalizeTableIdentifier(input);
  if (!normalized) return null;
  if (TRANSACTION_TABLE_ALIAS_MAP.has(normalized)) {
    return TRANSACTION_TABLE_ALIAS_MAP.get(normalized);
  }
  return String(input).trim();
}

function normalizeTransactionTableList(input, { fallbackToDefaults = true } = {}) {
  const values = [];
  const seen = new Set();
  let includeDefaults = false;
  let sawExplicit = false;

  const addValue = (raw) => {
    if (raw === undefined || raw === null) return;
    const trimmed = String(raw).trim();
    if (!trimmed) return;
    sawExplicit = true;
    if (trimmed === '*') {
      includeDefaults = true;
      return;
    }
    const resolved = resolveTransactionTableName(trimmed);
    if (!resolved) return;
    const name = String(resolved).trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    values.push(name);
  };

  if (Array.isArray(input)) {
    for (const entry of input) addValue(entry);
  } else if (typeof input === 'string') {
    input
      .split(/[,;\s]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => addValue(part));
  } else if (input && typeof input === 'object') {
    for (const value of Object.values(input)) addValue(value);
  }

  if (!sawExplicit && fallbackToDefaults) {
    includeDefaults = true;
  }

  if (includeDefaults || (values.length === 0 && fallbackToDefaults)) {
    for (const table of DEFAULT_TRANSACTION_TABLES) {
      if (!seen.has(table)) {
        seen.add(table);
        values.push(table);
      }
    }
  }

  return values;
}

function resolveBranchTopicSuffixFromTable(tableName) {
  const normalized = normalizeTableIdentifier(tableName);
  if (!normalized) return null;
  if (
    normalized === 'orders' ||
    normalized === 'order' ||
    normalized === 'order_headers' ||
    normalized === 'orderheaders' ||
    normalized === 'job_orders' ||
    normalized === 'joborders'
  ) {
    return 'pos:kds:orders';
  }
  if (
    normalized === 'jobs' ||
    normalized === 'kds_jobs' ||
    normalized === 'kdsjobs' ||
    normalized === 'job_queue' ||
    normalized === 'jobqueue'
  ) {
    return 'kds:jobs:updates';
  }
  if (
    normalized === 'payments' ||
    normalized === 'payment_records' ||
    normalized === 'paymentrecords' ||
    normalized === 'order_payments' ||
    normalized === 'pos_payments' ||
    normalized === 'pospayments'
  ) {
    return 'pos:payments';
  }
  return null;
}

function resolveBranchTopicsFromFrame(frame = {}, payload = {}) {
  const topics = new Set();
  if (!frame || typeof frame !== 'object') frame = {};
  const orderCandidates = [frame.order, frame.orders, frame.jobOrders];
  if (orderCandidates.some((value) => value && (Array.isArray(value) || typeof value === 'object'))) {
    topics.add('pos:kds:orders');
  }
  if (frame.orderId || frame.orderID) {
    topics.add('pos:kds:orders');
  }
  if (frame.jobId || frame.job || frame.jobs || frame.jobOrders) {
    topics.add('kds:jobs:updates');
  }
  if (frame.payment || frame.payments || frame.paymentId || frame.paymentID) {
    topics.add('pos:payments');
  }
  const tableCandidates = [
    frame.table,
    frame.tableName,
    frame.targetTable,
    frame.meta?.table,
    frame.meta?.tableName,
    payload?.meta?.table,
    payload?.table
  ];
  for (const candidate of tableCandidates) {
    const suffix = resolveBranchTopicSuffixFromTable(candidate);
    if (suffix) topics.add(suffix);
  }
  return topics;
}

function buildBranchDeltaDetail(branchId, payload = {}, frame = {}) {
  const detail = {
    type: 'branch:delta',
    branchId,
    moduleId: payload?.moduleId || frame?.moduleId || 'pos',
    action: payload?.action || frame?.action || 'update',
    version: payload?.version || null,
    mutationId: payload?.mutationId || frame?.mutationId || null
  };
  if (frame?.orderId || frame?.order_id) {
    detail.orderId = frame.orderId || frame.order_id;
  }
  if (frame?.order && typeof frame.order === 'object' && frame.order.id !== undefined) {
    detail.orderId = frame.order.id;
  }
  if (frame?.jobId || frame?.job_id) {
    detail.jobId = frame.jobId || frame.job_id;
  }
  if (frame?.paymentId || frame?.payment_id) {
    detail.paymentId = frame.paymentId || frame.payment_id;
  }
  if (payload?.meta && typeof payload.meta === 'object') {
    detail.meta = deepClone(payload.meta);
  } else if (frame?.meta && typeof frame.meta === 'object') {
    detail.meta = deepClone(frame.meta);
  }
  return detail;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let idx = 0; idx < a.length; idx += 1) {
      if (!deepEqual(a[idx], b[idx])) return false;
    }
    return true;
  }
  if (typeof a === 'object') {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b || {});
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

function buildSnapshotEnvelope(state) {
  if (state === undefined) {
    return { mode: 'snapshot', snapshot: null };
  }
  if (!isPlainObject(state)) {
    return { mode: 'snapshot', snapshot: deepClone(state) };
  }
  return { mode: 'snapshot', snapshot: deepClone(state) };
}

function buildDeltaEnvelope(previous, next) {
  if (!isPlainObject(previous) || !isPlainObject(next)) {
    return buildSnapshotEnvelope(next);
  }
  const set = {};
  const remove = [];
  let changed = false;
  for (const [key, value] of Object.entries(next)) {
    if (!deepEqual(previous[key], value)) {
      set[key] = deepClone(value);
      changed = true;
    }
  }
  for (const key of Object.keys(previous)) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) {
      remove.push(key);
      changed = true;
    }
  }
  if (!changed) return null;
  const envelope = { mode: 'delta', set };
  if (remove.length) envelope.remove = remove;
  return envelope;
}

async function broadcastBranchTopics(branchId, suffixes, detail = {}) {
  if (!suffixes || !suffixes.size) return;
  const safeBranch = branchId || 'default';
  for (const suffix of suffixes) {
    if (!suffix) continue;
    const topic = `${safeBranch}:${suffix}`;
    const payload = {
      ...deepClone(detail),
      branchId: safeBranch,
      topic: suffix,
      publishedAt: nowIso()
    };
    await broadcastPubsub(topic, payload);
  }
}

async function broadcastTableNotice(branchId, moduleId, tableName, notice = {}) {
  const payload = {
    type: 'table:update',
    branchId,
    moduleId,
    table: tableName,
    ...deepClone(notice)
  };
  const topics = getTableNoticeTopics(branchId, moduleId, tableName);
  for (const topic of topics) {
    await broadcastPubsub(topic, payload);
  }
  const branchSuffix = resolveBranchTopicSuffixFromTable(tableName);
  if (branchSuffix) {
    const detail = {
      type: 'branch:table-notice',
      table: normalizeTableIdentifier(tableName),
      moduleId,
      action: notice.action || payload.action || 'table:update',
      eventId: notice.eventId || null,
      sequence: notice.sequence || null,
      recordRef: notice.recordRef || null
    };
    if (notice.meta && typeof notice.meta === 'object') {
      detail.meta = deepClone(notice.meta);
    }
    await broadcastBranchTopics(branchId, new Set([branchSuffix]), detail);
  }
  return payload;
}

async function handlePubsubFrame(client, frame) {
  if (!client) return;
  client.protocol = 'pubsub';
  switch (frame.type) {
    case 'ping':
      sendToClient(client, { type: 'pong' });
      return;
    case 'pong':
      return;
    case 'auth':
      client.authenticated = true;
      sendToClient(client, { type: 'ack', event: 'auth' });
      return;
    case 'subscribe': {
      const topic = typeof frame.topic === 'string' ? frame.topic.trim() : '';
      if (!topic) {
        sendToClient(client, { type: 'error', code: 'invalid-topic', message: 'Subscription topic required.' });
        return;
      }
      const record = await registerPubsubSubscriber(topic, client);
      sendToClient(client, { type: 'ack', event: 'subscribe', topic });
      if (record.lastData !== undefined && record.lastData !== null) {
        const snapshotEnvelope = buildSnapshotEnvelope(record.lastData);
        sendToClient(
          client,
          { type: 'publish', topic, data: snapshotEnvelope },
          { cycle: nextBroadcastCycle(), channel: 'pubsub' }
        );
      }
      return;
    }
    case 'publish': {
      const topic = typeof frame.topic === 'string' ? frame.topic.trim() : '';
      if (!topic) return;
      const descriptor = parseSyncTopic(topic);
      const frameData = frame.data && typeof frame.data === 'object' ? frame.data : {};
      const userFromFrame = typeof frameData.userId === 'string' && frameData.userId.trim()
        ? frameData.userId.trim()
        : null;
      if (userFromFrame) client.userUuid = userFromFrame;
      const transId = normalizeTransId(frameData.trans_id || frameData.transId || frameData.mutationId || null);
      if (descriptor) {
        const trackerKey = transHistoryKey(descriptor.branchId, descriptor.moduleId);
        if (!transId) {
          sendToClient(client, {
            type: 'error',
            code: 'missing-trans-id',
            message: 'Publish frames must include a trans_id.',
            topic
          });
          return;
        }
        const duplicate = recallTransRecord(trackerKey, transId);
        if (duplicate && duplicate.payload) {
          const cached = duplicate.payload;
          const ackPayload = deepClone(cached);
          const requestedMutationId = typeof frameData.mutationId === 'string' && frameData.mutationId.trim()
            ? frameData.mutationId.trim()
            : null;
          const previousMutationId = cached && typeof cached === 'object' && cached.mutationId
            ? cached.mutationId
            : duplicate.lastAckMutationId || null;
          if (ackPayload && typeof ackPayload === 'object') {
            if (requestedMutationId) {
              ackPayload.mutationId = requestedMutationId;
            }
            const baseMeta = ackPayload.meta && typeof ackPayload.meta === 'object'
              ? { ...ackPayload.meta }
              : {};
            const duplicateMeta = {
              ...baseMeta,
              duplicateTrans: true,
              transId,
              previousMutationId: previousMutationId || null,
              ackedMutationId: requestedMutationId || previousMutationId || null
            };
            if (frameData.meta && typeof frameData.meta === 'object') {
              ackPayload.meta = { ...duplicateMeta, ...frameData.meta };
            } else {
              ackPayload.meta = duplicateMeta;
            }
          }
          if (requestedMutationId) {
            if (!duplicate.mutationIds) duplicate.mutationIds = new Set();
            if (!duplicate.mutationIds.has(requestedMutationId)) {
              duplicate.mutationIds.add(requestedMutationId);
              if (duplicate.mutationIds.size > TRANS_MUTATION_HISTORY_LIMIT) {
                const trimmed = Array.from(duplicate.mutationIds).slice(-TRANS_MUTATION_HISTORY_LIMIT);
                duplicate.mutationIds = new Set(trimmed);
              }
            }
            duplicate.lastAckMutationId = requestedMutationId;
          }
          logger.info({
            clientId: client.id,
            branchId: descriptor.branchId,
            moduleId: descriptor.moduleId,
            transId,
            requestedMutationId,
            previousMutationId
          }, 'Duplicate trans_id acknowledged without reapplying payload.');
          await recordRejectedMutation(descriptor.branchId, descriptor.moduleId, {
            reason: 'duplicate-trans-id',
            source: 'ws-publish',
            transId,
            mutationId: requestedMutationId || previousMutationId || null,
            meta: {
              previousMutationId: previousMutationId || null,
              clientId: client.id,
              topic,
              duplicateTrans: true
            },
            payload: frameData
          });
          sendToClient(client, { type: 'publish', topic, data: ackPayload });
          return;
        }
        let state = await ensureSyncState(descriptor.branchId, descriptor.moduleId);
        if (
          descriptor.moduleId === 'pos' &&
          frameData.action === 'create-order' &&
          frameData.order &&
          typeof frameData.order === 'object'
        ) {
          try {
            const result = await applyPosOrderCreate(descriptor.branchId, descriptor.moduleId, frameData, {
              clientId: client.id,
              userUuid: client.userUuid || userFromFrame || null,
              transId,
              meta: frameData.meta || {}
            });
            state = result.state;
          if (result.order) {
            frameData.order = result.order;
            frameData.meta = {
              ...(frameData.meta && typeof frameData.meta === 'object' ? frameData.meta : {}),
              persisted: true,
              persistedAt: result.order.savedAt || result.order.updatedAt || Date.now(),
              persistedAtIso: new Date(
                result.order.savedAt || result.order.updatedAt || Date.now()
              ).toISOString(),
              branchId: descriptor.branchId,
              moduleId: descriptor.moduleId,
              existing: result.existing
            };
            if (result.existing) {
              frameData.existing = true;
              await recordRejectedMutation(descriptor.branchId, descriptor.moduleId, {
                reason: 'duplicate-order',
                source: 'ws-pos-order',
                transId,
                mutationId: frameData.mutationId || null,
                meta: {
                  orderId: result.order.id,
                  clientId: client.id,
                  existing: true,
                  topic
                },
                payload: frameData
              });
            }
          }
          } catch (error) {
            logger.warn(
              { err: error, branchId: descriptor.branchId, moduleId: descriptor.moduleId, orderId: frameData.order?.id },
              'Failed to persist POS order from publish frame'
            );
            sendToClient(client, {
              type: 'error',
              code: 'order-persist-failed',
              message: error?.message || 'Failed to persist order on server.'
            });
            return;
          }
        }
        if (frameData.snapshot && typeof frameData.snapshot === 'object') {
          try {
            state = await applySyncSnapshot(descriptor.branchId, descriptor.moduleId, frameData.snapshot, {
              origin: 'ws',
              clientId: client.id,
              userUuid: client.userUuid || userFromFrame || null,
              transId
            });
          } catch (error) {
            if (error?.code === 'INSERT_ONLY_VIOLATION') {
              sendToClient(client, {
                type: 'error',
                code: 'insert-only-violation',
                message: error.message,
                details: error.details || null
              });
              return;
            }
            logger.warn({ err: error, branchId: descriptor.branchId, moduleId: descriptor.moduleId }, 'Failed to apply sync snapshot from WS');
            sendToClient(client, {
              type: 'error',
              code: 'sync-snapshot-failed',
              message: error?.message || 'Failed to apply snapshot.'
            });
            return;
          }
        }
        const published = await broadcastSyncUpdate(descriptor.branchId, descriptor.moduleId, state, {
          action: frameData.action,
          mutationId: frameData.mutationId,
          meta: frameData.meta,
          frameData
        });
        rememberTransRecord(trackerKey, transId, published);
      } else {
        await broadcastPubsub(topic, frameData);
      }
      return;
    }
    default: {
      const message = frame.type ? `Unsupported frame type "${frame.type}"` : 'Unsupported frame type';
      sendToClient(client, { type: 'error', code: 'unsupported-frame', message });
    }
  }
}

function traversePath(source, segments = []) {
  if (!segments.length) return source;
  let current = source;
  for (const segment of segments) {
    if (current == null) return undefined;
    if (Array.isArray(current)) {
      const idx = Number(segment);
      if (!Number.isFinite(idx)) return undefined;
      current = current[idx];
    } else if (typeof current === 'object') {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      if (!data) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

await mkdir(HISTORY_DIR, { recursive: true });
await mkdir(BRANCHES_DIR, { recursive: true });

initializeSqlite({ rootDir: ROOT_DIR });

const schemaEngine = new SchemaEngine();
const schemaPaths = new Set([path.resolve(DEFAULT_SCHEMA_PATH)]);
if (ENV_SCHEMA_PATH) {
  schemaPaths.add(path.resolve(ENV_SCHEMA_PATH));
}
for (const schemaPath of schemaPaths) {
  try {
    await schemaEngine.loadFromFile(schemaPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      logger.warn({ schemaPath }, 'Schema file missing, skipping preload');
      continue;
    }
    throw error;
  }
}
const modulesConfig = (await readJsonSafe(MODULES_CONFIG_PATH, { modules: {} })) || { modules: {} };
const branchConfig = (await readJsonSafe(BRANCHES_CONFIG_PATH, { branches: {}, patterns: [], defaults: [] })) || { branches: {}, patterns: [], defaults: [] };

const moduleStores = new Map(); // key => `${branchId}::${moduleId}`
const clients = new Map();
const branchClients = new Map();
const moduleSchemaCache = new Map(); // key => `${branchId}::${moduleId}`
const moduleSeedCache = new Map();

function getModuleConfig(moduleId) {
  const def = modulesConfig.modules?.[moduleId];
  if (!def) {
    throw new Error(`Module "${moduleId}" not defined in modules.json`);
  }
  if (!Array.isArray(def.tables) || !def.tables.length) {
    throw new Error(`Module "${moduleId}" has no tables defined`);
  }
  return def;
}

async function ensureModuleSchema(branchId, moduleId) {
  const cacheKey = `${branchId}::${moduleId}`;
  const cached = moduleSchemaCache.get(cacheKey);

  const loadSchema = async (filePath, source, mtimeMs) => {
    await schemaEngine.loadFromFile(filePath);
    const moduleDefinition = getModuleConfig(moduleId);
    for (const tableName of moduleDefinition.tables || []) {
      try {
        schemaEngine.getTable(tableName);
      } catch (error) {
        if (error?.message?.includes('Unknown table')) {
          throw new Error(
            `Schema for module "${moduleId}" is missing required table "${tableName}" for branch "${branchId}"`
          );
        }
        throw error;
      }
    }
    moduleSchemaCache.set(cacheKey, { source, mtimeMs, validated: true });
  };

  // ALWAYS use central schema, skip branch-specific schema
  // This ensures consistent schema across all branches
  const fallbackPath = getModuleSchemaFallbackPath(moduleId);
  const fallbackDescriptor = await describeFile(fallbackPath);
  if (fallbackDescriptor.exists) {
    if (cached?.source === 'central' && cached?.validated && cached?.mtimeMs === fallbackDescriptor.mtimeMs) {
      return;
    }
    await loadSchema(fallbackPath, 'central', fallbackDescriptor.mtimeMs);
    return;
  }

  throw new Error(`Central schema for module "${moduleId}" not found`);
}

async function ensureModuleSeed(branchId, moduleId) {
  const cacheKey = `${branchId}::${moduleId}`;
  const cached = moduleSeedCache.get(cacheKey);

  const readSeed = async (filePath, source, mtimeMs) => {
    const payload = await readJsonSafe(filePath, null);
    const normalized = payload && typeof payload === 'object' ? payload : null;
    moduleSeedCache.set(cacheKey, { source, mtimeMs, seed: normalized });
    return normalized;
  };

  // Try branch-specific seed first, then fallback to central seed
  const branchPath = getModuleSeedPath(branchId, moduleId);
  const branchDescriptor = await describeFile(branchPath);
  if (branchDescriptor.exists) {
    if (cached?.source === 'branch' && cached?.mtimeMs === branchDescriptor.mtimeMs) {
      return cached.seed ?? null;
    }
    return readSeed(branchPath, 'branch', branchDescriptor.mtimeMs);
  }

  const fallbackPath = getModuleSeedFallbackPath(moduleId);
  const fallbackDescriptor = await describeFile(fallbackPath);
  if (fallbackDescriptor.exists) {
    if (cached?.source === 'central' && cached?.mtimeMs === fallbackDescriptor.mtimeMs) {
      return cached.seed ?? null;
    }
    return readSeed(fallbackPath, 'central', fallbackDescriptor.mtimeMs);
  }

  moduleSeedCache.set(cacheKey, { source: 'missing', mtimeMs: null, seed: null });
  return null;
}

function getBranchModules(branchId) {
  if (branchConfig.branches && branchConfig.branches[branchId] && Array.isArray(branchConfig.branches[branchId].modules)) {
    return branchConfig.branches[branchId].modules.slice();
  }
  for (const pattern of branchConfig.patterns || []) {
    if (!pattern.match || !Array.isArray(pattern.modules)) continue;
    const regex = new RegExp(pattern.match);
    if (regex.test(branchId)) {
      return pattern.modules.slice();
    }
  }
  return Array.isArray(branchConfig.defaults) ? branchConfig.defaults.slice() : [];
}

function moduleKey(branchId, moduleId) {
  return `${branchId}::${moduleId}`;
}

async function persistModuleStore(store) {
  const filePath = getModuleFilePath(store.branchId, store.moduleId);
  store.meta = store.meta || {};
  const totalCount = Object.values(store.data || {}).reduce((acc, value) => {
    if (Array.isArray(value)) return acc + value.length;
    return acc;
  }, 0);
  store.meta.counter = totalCount;
  if ('labCounter' in store.meta) {
    store.meta.labCounter = totalCount;
  }
  const payload = store.toJSON();
  await writeJson(filePath, payload);
  logger.debug({ branchId: store.branchId, moduleId: store.moduleId, version: store.version }, 'Persisted module store');
}

async function archiveModuleFile(branchId, moduleId) {
  const filePath = getModuleFilePath(branchId, moduleId);
  if (!(await fileExists(filePath))) return null;
  const timestamp = nowIso().replace(/[:.]/g, '-');
  const target = getModuleArchivePath(branchId, moduleId, timestamp);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await rename(filePath, target);
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error;
    const snapshot = await readJsonSafe(filePath);
    await writeJson(target, snapshot);
    await rm(filePath, { force: true }).catch(() => {});
  }
  return target;
}

async function ensureModuleStore(branchId, moduleId) {
  const key = moduleKey(branchId, moduleId);
  if (moduleStores.has(key)) {
    return moduleStores.get(key);
  }
  await ensureBranchModuleLayout(branchId, moduleId);
  await ensureModuleSchema(branchId, moduleId);
  const moduleSeed = await ensureModuleSeed(branchId, moduleId);
  const moduleDefinition = getModuleConfig(moduleId);
  const filePath = getModuleFilePath(branchId, moduleId);
  const existing = await readJsonSafe(filePath, null);
  let seed = {};
  if (existing && typeof existing === 'object') {
    seed = {
      version: existing.version || 1,
      meta: existing.meta || {},
      tables: existing.tables || {}
    };
  }
  const store = new HybridStore(schemaEngine, branchId, moduleId, moduleDefinition, seed, moduleSeed, {
    cacheTtlMs: HYBRID_CACHE_TTL_MS
  });
  moduleStores.set(key, store);
  if (!existing) {
    await persistModuleStore(store);
  }
  return store;
}

async function ensureBranchModules(branchId) {
  const modules = getBranchModules(branchId);
  const stores = [];
  for (const moduleId of modules) {
    try {
      const store = await ensureModuleStore(branchId, moduleId);
      stores.push(store);
    } catch (error) {
      logger.warn({ err: error, branchId, moduleId }, 'Failed to ensure module store');
    }
  }
  return stores;
}

async function hydrateModulesFromDisk() {
  const branchDirs = await readdir(BRANCHES_DIR, { withFileTypes: true }).catch(() => []);
  for (const dirEntry of branchDirs) {
    if (!dirEntry.isDirectory()) continue;
    const branchId = safeDecode(dirEntry.name);
    const modulesDir = path.join(getBranchDir(branchId), 'modules');
    const moduleEntries = await readdir(modulesDir, { withFileTypes: true }).catch(() => []);
    for (const entry of moduleEntries) {
      if (!entry.isDirectory()) continue;
      const moduleId = safeDecode(entry.name);
      if (!modulesConfig.modules?.[moduleId]) {
        logger.warn({ branchId, moduleId }, 'Skipping module not present in modules config');
        continue;
      }
      try {
        await ensureModuleStore(branchId, moduleId);
        logger.info({ branchId, moduleId }, 'Hydrated module from disk');
      } catch (error) {
        logger.warn({ err: error, branchId, moduleId }, 'Failed to hydrate module from disk');
      }
    }
  }
}

await hydrateModulesFromDisk();
startEventArchiveService().catch((error) => {
  logger.warn({ err: error }, 'Failed to start event archive service');
});

async function buildBranchSnapshot(branchId) {
  const modules = getBranchModules(branchId);
  await Promise.all(
    modules.map((moduleId) =>
      ensureModuleStore(branchId, moduleId).catch((error) => {
        logger.warn({ err: error, branchId, moduleId }, 'Failed to ensure module during snapshot');
        return null;
      })
    )
  );
  const snapshot = {};
  for (const moduleId of modules) {
    const key = moduleKey(branchId, moduleId);
    if (moduleStores.has(key)) {
      snapshot[moduleId] = moduleStores.get(key).getSnapshot();
    }
  }
  return {
    branchId,
    modules: snapshot,
    updatedAt: nowIso(),
    serverId: SERVER_ID
  };
}

function listBranchSummaries() {
  const summaries = new Map();
  for (const [key, store] of moduleStores.entries()) {
    const [branchId, moduleId] = key.split('::');
    if (!summaries.has(branchId)) {
      summaries.set(branchId, { id: branchId, modules: [] });
    }
    const entry = summaries.get(branchId);
    entry.modules.push({ moduleId, version: store.version, meta: deepClone(store.meta || {}) });
  }
  return Array.from(summaries.values());
}

let eventArchivePool = null;
let eventArchiveTimer = null;
let eventArchiveTableReady = false;

function listEventStoreContexts() {
  const contexts = [];
  for (const key of moduleStores.keys()) {
    const [branchId, moduleId] = key.split('::');
    contexts.push(getModuleEventStoreContext(branchId, moduleId));
  }
  return contexts;
}

async function ensureEventArchiveTable(pool) {
  if (eventArchiveTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ws2_event_journal (
      id TEXT PRIMARY KEY,
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      table_name TEXT,
      action TEXT NOT NULL,
      record JSONB,
      meta JSONB,
      publish_state JSONB,
      created_at TIMESTAMPTZ NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL,
      sequence BIGINT
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS ws2_event_journal_branch_module_idx ON ws2_event_journal (branch_id, module_id, sequence)'
  );
  eventArchiveTableReady = true;
}

async function uploadEventArchive(pool, context, filePath) {
  const entries = await readLogFile(filePath);
  if (!entries.length) {
    await discardLogFile(filePath);
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const insertSql =
      'INSERT INTO ws2_event_journal (id, branch_id, module_id, table_name, action, record, meta, publish_state, created_at, recorded_at, sequence) ' +
      'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ' +
      'ON CONFLICT (id) DO UPDATE SET meta = EXCLUDED.meta, publish_state = EXCLUDED.publish_state, recorded_at = EXCLUDED.recorded_at';
    for (const entry of entries) {
      await client.query(insertSql, [
        entry.id,
        entry.branchId || context.branchId,
        entry.moduleId || context.moduleId,
        entry.table || null,
        entry.action || 'module:insert',
        entry.record || null,
        entry.meta || {},
        entry.publishState || {},
        entry.createdAt ? new Date(entry.createdAt) : new Date(),
        entry.recordedAt ? new Date(entry.recordedAt) : new Date(),
        entry.sequence || null
      ]);
    }
    await client.query('COMMIT');
    await discardLogFile(filePath);
    logger.info(
      { branchId: context.branchId, moduleId: context.moduleId, filePath, events: entries.length },
      'Archived event log batch to PostgreSQL'
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function runEventArchiveCycle(pool) {
  const contexts = listEventStoreContexts();
  if (!contexts.length) return;
  await ensureEventArchiveTable(pool);
  for (const context of contexts) {
    try {
      await rotateEventLog(context);
    } catch (error) {
      logger.warn({ err: error, branchId: context.branchId, moduleId: context.moduleId }, 'Failed to rotate event log');
    }
    const archives = await listArchivedLogs(context);
    for (const filePath of archives) {
      try {
        await uploadEventArchive(pool, context, filePath);
      } catch (error) {
        logger.warn({ err: error, branchId: context.branchId, moduleId: context.moduleId, filePath }, 'Failed to archive event log');
      }
    }
  }
}

async function startEventArchiveService() {
  if (EVENT_ARCHIVER_DISABLED) {
    logger.info('Event archive service disabled via configuration flag');
    return;
  }
  if (!EVENTS_PG_URL) {
    logger.info('Event archive service disabled: PostgreSQL URL missing');
    return;
  }
  if (!eventArchivePool) {
    eventArchivePool = new Pool({ connectionString: EVENTS_PG_URL });
    eventArchivePool.on('error', (err) => {
      logger.warn({ err }, 'PostgreSQL pool error');
    });
  }
  const runCycle = async () => {
    try {
      await runEventArchiveCycle(eventArchivePool);
    } catch (error) {
      logger.warn({ err: error }, 'Event archive cycle failed');
    }
  };
  await runCycle();
  eventArchiveTimer = setInterval(runCycle, EVENT_ARCHIVE_INTERVAL_MS);
  eventArchiveTimer.unref();
  logger.info({ intervalMs: EVENT_ARCHIVE_INTERVAL_MS }, 'Event archive service started');
}

async function serveStaticAsset(req, res, url) {
  if (!STATIC_DIR) return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let pathname = url.pathname;
  if (!pathname || pathname === '/') pathname = '/index.html';
  const decoded = decodeURIComponent(pathname);
  const normalized = path.normalize(decoded).replace(/^[/\\]+/, '');
  const absolutePath = path.join(STATIC_DIR, normalized);
  if (!absolutePath.startsWith(STATIC_DIR)) return false;
  try {
    const data = await readFile(absolutePath);
    const ext = path.extname(absolutePath).toLowerCase();
    const headers = {
      'content-type': CONTENT_TYPES[ext] || 'application/octet-stream',
      ...STATIC_CACHE_HEADERS,
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    };
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
    } else {
      res.end(data);
    }
    return true;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      return false;
    }
    logger.warn({ err: error, pathname: decoded }, 'Failed to serve static asset');
    jsonResponse(res, 500, { error: 'static-asset-error' });
    return true;
  }
}

function resolveSyncRequest(pathname, searchParams) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2 || segments[0] !== 'api') return null;
  if (segments[1] === 'pos-sync') {
    const branchId = safeDecode(segments[2] || searchParams.get('branch') || 'default');
    const next = (segments[3] || '').toLowerCase();
    const mode = next === 'delta' ? 'delta' : 'snapshot';
    return { branchId, moduleId: 'pos', mode };
  }
  if (segments[1] === 'sync') {
    const branchId = safeDecode(segments[2] || searchParams.get('branch') || 'default');
    const moduleId = safeDecode(segments[3] || searchParams.get('module') || 'pos');
    const next = (segments[4] || '').toLowerCase();
    const mode = next === 'delta' ? 'delta' : 'snapshot';
    return { branchId, moduleId, mode };
  }
  return null;
}

async function handleSyncApi(req, res, url) {
  const descriptor = resolveSyncRequest(url.pathname, url.searchParams);
  if (!descriptor) {
    jsonResponse(res, 404, { error: 'sync-endpoint-not-found', path: url.pathname });
    return true;
  }
  const { branchId, moduleId, mode = 'snapshot' } = descriptor;

  if (mode === 'delta') {
    if (req.method !== 'POST') {
      jsonResponse(res, 405, { error: 'method-not-allowed' });
      return true;
    }
    let body = null;
    try {
      body = await readBody(req);
    } catch (error) {
      jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
      return true;
    }
    const frameData = body && typeof body === 'object' ? body : {};
    const store = await ensureModuleStore(branchId, moduleId);
    const state = await ensureSyncState(branchId, moduleId);
    const eventContext = getModuleEventStoreContext(branchId, moduleId);
    let eventMeta = null;
    try {
      eventMeta = await loadEventMeta(eventContext);
    } catch (error) {
      logger.warn({ err: error, branchId, moduleId }, 'Failed to load event meta for delta request');
    }
    const clientMarker = extractClientSnapshotMarker(frameData);
    const { tableNames, tableMap, normalizedClientCursorMap } = normalizeDeltaRequest(frameData, store);
    const deltaPayload = {};
    const stats = {};
    const responseLastRefs = {};
    const responseLastIds = {};
    const cursorMisses = [];
    let requiresFullSync = tableNames.length === 0;

    for (const tableName of tableNames) {
      if (!store.tables.includes(tableName)) continue;
      const tableResult = computeInsertOnlyDelta(store, tableName, tableMap[tableName]);
      deltaPayload[tableName] = tableResult.rows;
      stats[tableName] = {
        total: tableResult.total,
        returned: tableResult.rows.length,
        cursorMatched: tableResult.matched === true
      };
      if (tableResult.requiresFullSync) {
        requiresFullSync = true;
        cursorMisses.push(tableName);
      }
      if (!normalizedClientCursorMap[tableName]) {
        const normalizedInput = normalizeCursorInput(tableMap[tableName]).object;
        if (normalizedInput) {
          normalizedClientCursorMap[tableName] = normalizedInput;
        }
      }
      responseLastRefs[tableName] = tableResult.lastCursor || null;
      responseLastIds[tableName] = stringifyCursor(tableResult.lastCursor);
    }

    const serverMarker = resolveServerSnapshotMarker(state, eventMeta);
    if (clientMarker && serverMarker && clientMarker !== serverMarker) {
      requiresFullSync = true;
    }
    if (eventMeta && typeof eventMeta.lastClosedDate === 'string' && clientMarker) {
      const lastClosed = eventMeta.lastClosedDate.trim();
      if (lastClosed && clientMarker < lastClosed) {
        requiresFullSync = true;
      }
    }

    const clientVersionRaw = frameData.version ?? frameData.clientVersion ?? frameData.snapshotVersion;
    const clientVersion = Number(clientVersionRaw);

    const now = nowIso();
    const metaPatch = {
      lastServedTableIds: responseLastRefs,
      lastClientTableIds: normalizedClientCursorMap,
      lastSnapshotMarker: serverMarker || null,
      lastClientSnapshotMarker: clientMarker || null,
      lastClientSyncAt: now
    };
    await updateEventMeta(eventContext, metaPatch).catch((error) => {
      logger.warn({ err: error, branchId, moduleId }, 'Failed to update event meta after delta request');
    });

    const payload = {
      branchId,
      moduleId,
      version: state.version,
      updatedAt: state.updatedAt,
      serverId: SERVER_ID,
      snapshotMarker: serverMarker || null,
      requiresFullSync,
      cursorMisses,
      lastTableIds: responseLastIds,
      lastTableRefs: responseLastRefs,
      deltas: deltaPayload,
      stats
    };
    if (Number.isFinite(clientVersion)) {
      payload.clientVersion = clientVersion;
    }
    if (clientMarker) {
      payload.clientSnapshotMarker = clientMarker;
    }
    jsonResponse(res, 200, payload);
    return true;
  }

  if (req.method === 'GET') {
    const state = await ensureSyncState(branchId, moduleId);
    jsonResponse(res, 200, {
      branchId,
      moduleId,
      version: state.version,
      updatedAt: state.updatedAt,
      serverId: SERVER_ID,
      snapshot: deepClone(state.moduleSnapshot)
    });
    return true;
  }

  if (req.method === 'POST') {
    let body = null;
    try {
      body = await readBody(req);
    } catch (error) {
      jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
      return true;
    }
    const frameData = body && typeof body === 'object' ? body : {};
    const snapshot = frameData.snapshot && typeof frameData.snapshot === 'object' ? frameData.snapshot : null;
    let state;
    try {
      state = await applySyncSnapshot(branchId, moduleId, snapshot, { origin: 'http', requestId: frameData.requestId || null });
    } catch (error) {
      if (error?.code === 'INSERT_ONLY_VIOLATION') {
        jsonResponse(res, 409, {
          error: 'insert-only-violation',
          message: error.message,
          details: error.details || null
        });
        return true;
      }
      logger.warn({ err: error, branchId, moduleId }, 'Failed to apply sync snapshot via HTTP');
      jsonResponse(res, 500, { error: 'sync-snapshot-failed', message: error?.message || 'Failed to apply snapshot.' });
      return true;
    }
    await broadcastSyncUpdate(branchId, moduleId, state, {
      action: frameData.action,
      mutationId: frameData.mutationId,
      meta: frameData.meta,
      frameData
    });
    jsonResponse(res, 200, {
      status: 'ok',
      branchId,
      moduleId,
      version: state.version,
      updatedAt: state.updatedAt
    });
    return true;
  }

  jsonResponse(res, 405, { error: 'method-not-allowed' });
  return true;
}

async function handleManagementApi(req, res, url) {
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 2 || segments[0] !== 'api' || segments[1] !== 'manage') {
    return false;
  }
  const resource = segments[2] || '';

  const normalizeModules = (input, fallback = ['*']) => {
    const values = [];
    if (Array.isArray(input)) {
      for (const value of input) {
        if (typeof value === 'string' && value.trim()) {
          values.push(value.trim());
        }
      }
    } else if (typeof input === 'string' && input.trim()) {
      values.push(input.trim());
    }
    if (!values.length) return fallback.slice();
    return Array.from(new Set(values));
  };

  if (resource === 'full-sync') {
    if (req.method === 'GET') {
      const branchParam = url.searchParams.get('branch') || url.searchParams.get('branchId');
      const moduleParam = url.searchParams.get('module') || url.searchParams.get('moduleId');
      const branchId = branchParam && branchParam.trim() ? branchParam.trim() : null;
      const moduleId = moduleParam && moduleParam.trim() ? moduleParam.trim() : null;
      const flags = listFullSyncFlags({ branchId, moduleId }).map((entry) => serializeFullSyncFlag(entry));
      jsonResponse(res, 200, { branchId, moduleId, flags });
      return true;
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      let body = {};
      try {
        body = await readBody(req);
      } catch (error) {
        jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
        return true;
      }
      const branchRaw = body.branchId || body.branch;
      const branchId = typeof branchRaw === 'string' && branchRaw.trim() ? branchRaw.trim() : null;
      if (!branchId) {
        jsonResponse(res, 400, { error: 'missing-branch-id' });
        return true;
      }
      const requestedBy = typeof body.requestedBy === 'string' && body.requestedBy.trim() ? body.requestedBy.trim() : null;
      const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;
      const modules = normalizeModules(body.modules || body.moduleIds || body.moduleId || body.module, ['*']);
      const enabled = body.enabled !== false && body.status !== 'disable' && body.action !== 'disable';
      const responses = [];
      for (const moduleId of modules) {
        const normalizedModule = moduleId && moduleId.trim ? moduleId.trim() : '*';
        let entry;
        if (enabled) {
          entry = upsertFullSyncFlag(branchId, normalizedModule, {
            reason,
            requestedBy,
            enabled: true,
            meta: body.meta && typeof body.meta === 'object' ? body.meta : undefined
          });
        } else {
          entry = disableFullSyncFlag(branchId, normalizedModule, { requestedBy });
        }
        if (entry) {
          emitFullSyncDirective(entry, { toggledVia: 'management-api' });
          responses.push(serializeFullSyncFlag(entry));
        }
      }
      jsonResponse(res, 200, { branchId, flags: responses, enabled });
      return true;
    }

    if (req.method === 'DELETE') {
      let body = {};
      try {
        body = await readBody(req);
      } catch (_error) {
        body = {};
      }
      const branchParam = body.branchId || body.branch || url.searchParams.get('branch') || url.searchParams.get('branchId');
      const branchId = typeof branchParam === 'string' && branchParam.trim() ? branchParam.trim() : null;
      if (!branchId) {
        jsonResponse(res, 400, { error: 'missing-branch-id' });
        return true;
      }
      const requestedBy = typeof body.requestedBy === 'string' && body.requestedBy.trim()
        ? body.requestedBy.trim()
        : null;
      const moduleParam = body.moduleId || body.module || body.modules || url.searchParams.get('module') || url.searchParams.get('moduleId');
      const modules = normalizeModules(moduleParam, ['*']);
      const disabled = [];
      for (const moduleId of modules) {
        const entry = disableFullSyncFlag(branchId, moduleId, { requestedBy });
        if (entry) {
          emitFullSyncDirective(entry, { toggledVia: 'management-api' });
          disabled.push(serializeFullSyncFlag(entry));
        }
      }
      jsonResponse(res, 200, { branchId, flags: disabled, enabled: false });
      return true;
    }

    jsonResponse(res, 405, { error: 'method-not-allowed' });
    return true;
  }

  if (resource === 'daily-reset' || resource === 'reset') {
    if (req.method !== 'POST') {
      jsonResponse(res, 405, { error: 'method-not-allowed' });
      return true;
    }
    let body = {};
    try {
      body = await readBody(req);
    } catch (error) {
      jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
      return true;
    }
    const branchRaw = body.branchId || body.branch;
    const branchId = typeof branchRaw === 'string' && branchRaw.trim() ? branchRaw.trim() : null;
    if (!branchId) {
      jsonResponse(res, 400, { error: 'missing-branch-id' });
      return true;
    }
    const requestedBy = typeof body.requestedBy === 'string' && body.requestedBy.trim() ? body.requestedBy.trim() : null;
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'daily-reset';
    const moduleParam = body.moduleId || body.module || body.modules;
    let modules = normalizeModules(moduleParam, []);
    if (!modules.length) {
      modules = getBranchModules(branchId);
    }
    if (!modules.length) {
      jsonResponse(res, 404, { error: 'modules-not-found', branchId });
      return true;
    }
    const flagOnReset = body.flagFullSync !== false;
    const results = [];
    for (const moduleId of modules) {
      try {
        const { store, historyEntry } = await resetModule(branchId, moduleId, { requestedBy, reason });
        const summary = {
          moduleId,
          version: store.version,
          resetAt: nowIso(),
          status: 'ok'
        };
        if (historyEntry) {
          const { filePath, ...historySummary } = historyEntry;
          summary.historyEntry = historySummary;
        }
        if (flagOnReset) {
          const flag = upsertFullSyncFlag(branchId, moduleId, { reason, requestedBy, enabled: true });
          emitFullSyncDirective(flag, { toggledVia: 'management-api', reason: 'post-reset' });
          summary.fullSyncFlag = serializeFullSyncFlag(flag);
        }
        results.push(summary);
      } catch (error) {
        logger.warn({ err: error, branchId, moduleId }, 'Failed to perform daily reset');
        results.push({ moduleId, status: 'error', error: error.message });
      }
    }
    jsonResponse(res, 200, { branchId, requestedBy, reason, results });
    return true;
  }

  if (resource === 'purge-live-data' || resource === 'purge-transactions' || resource === 'reset-live') {
    if (req.method !== 'POST') {
      jsonResponse(res, 405, { error: 'method-not-allowed' });
      return true;
    }
    let body = {};
    try {
      body = await readBody(req);
    } catch (error) {
      jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
      return true;
    }
    const branchRaw = body.branchId || body.branch;
    const branchId = typeof branchRaw === 'string' && branchRaw.trim() ? branchRaw.trim() : null;
    if (!branchId) {
      jsonResponse(res, 400, { error: 'missing-branch-id' });
      return true;
    }
    const requestedBy = typeof body.requestedBy === 'string' && body.requestedBy.trim() ? body.requestedBy.trim() : null;
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'purge-live-data';
    const moduleRaw = body.moduleId || body.module || body.targetModule;
    const moduleId = typeof moduleRaw === 'string' && moduleRaw.trim() ? moduleRaw.trim() : 'pos';
    const tablesInput =
      body.tables ??
      body.table ??
      body.tableNames ??
      body.targetTables ??
      body.transactionTables ??
      body.purgeTables ??
      null;
    const hasExplicitTables =
      Object.prototype.hasOwnProperty.call(body, 'tables') ||
      Object.prototype.hasOwnProperty.call(body, 'table') ||
      Object.prototype.hasOwnProperty.call(body, 'tableNames') ||
      Object.prototype.hasOwnProperty.call(body, 'targetTables') ||
      Object.prototype.hasOwnProperty.call(body, 'transactionTables') ||
      Object.prototype.hasOwnProperty.call(body, 'purgeTables');
    const tables = normalizeTransactionTableList(tablesInput, { fallbackToDefaults: !hasExplicitTables });
    if (!tables.length) {
      jsonResponse(res, 400, { error: 'no-tables-resolved', message: 'No tables matched the purge criteria.' });
      return true;
    }
    const resetEvents = body.resetEvents !== false;
    const broadcast = body.broadcast !== false;
    let result;
    try {
      result = await purgeModuleLiveData(branchId, moduleId, tables, {
        requestedBy,
        reason,
        resetEvents,
        broadcast
      });
    } catch (error) {
      const status = error?.code === 'MODULE_STORE_NOT_FOUND' ? 404 : 500;
      logger.warn({ err: error, branchId, moduleId }, 'Failed to purge module live data');
      jsonResponse(res, status, { error: 'purge-failed', message: error.message });
      return true;
    }
    jsonResponse(res, 200, {
      status: 'ok',
      branchId,
      moduleId,
      requestedBy,
      reason,
      resetEvents,
      broadcast,
      version: result.version,
      totalRemoved: result.totalRemoved,
      changed: result.changed,
      tables: result.cleared,
      eventMeta: result.eventMeta,
      historyEntry: result.historyEntry ? summarizePurgeHistoryEntry(result.historyEntry) : null
    });
    return true;
  }

  if (resource === 'purge-history') {
    if (req.method === 'GET') {
      const branchParam = url.searchParams.get('branch') || url.searchParams.get('branchId');
      const moduleParam =
        url.searchParams.get('module') ||
        url.searchParams.get('moduleId') ||
        url.searchParams.get('targetModule') ||
        'pos';
      const entryId = url.searchParams.get('entryId') || url.searchParams.get('id') || null;
      const branchId = branchParam && branchParam.trim() ? branchParam.trim() : null;
      if (!branchId) {
        jsonResponse(res, 400, { error: 'missing-branch-id' });
        return true;
      }
      const moduleId = moduleParam && moduleParam.trim() ? moduleParam.trim() : 'pos';
      try {
        if (entryId) {
          const entry = await readPurgeHistoryEntry(branchId, moduleId, entryId);
          if (!entry) {
            jsonResponse(res, 404, { error: 'history-entry-not-found', entryId });
            return true;
          }
          jsonResponse(res, 200, {
            branchId,
            moduleId,
            entryId,
            entry,
            summary: summarizePurgeHistoryEntry(entry)
          });
          return true;
        }
        const entries = await listPurgeHistorySummaries(branchId, moduleId);
        jsonResponse(res, 200, { branchId, moduleId, entries });
      } catch (error) {
        logger.warn({ err: error, branchId, moduleId }, 'Failed to list purge history entries');
        jsonResponse(res, 500, { error: 'history-unavailable', message: error.message });
      }
      return true;
    }

    if (req.method === 'POST') {
      let body = {};
      try {
        body = await readBody(req);
      } catch (error) {
        jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
        return true;
      }
      const branchRaw = body.branchId || body.branch;
      const branchId = typeof branchRaw === 'string' && branchRaw.trim() ? branchRaw.trim() : null;
      if (!branchId) {
        jsonResponse(res, 400, { error: 'missing-branch-id' });
        return true;
      }
      const moduleRaw = body.moduleId || body.module || body.targetModule;
      const moduleId = typeof moduleRaw === 'string' && moduleRaw.trim() ? moduleRaw.trim() : 'pos';
      const entryId =
        body.entryId ||
        body.id ||
        body.historyId ||
        body.historyEntryId ||
        null;
      if (!entryId) {
        jsonResponse(res, 400, { error: 'missing-entry-id' });
        return true;
      }
      const mode = body.mode === 'replace' ? 'replace' : 'append';
      const broadcast = body.broadcast !== false;
      const requestedBy = typeof body.requestedBy === 'string' && body.requestedBy.trim() ? body.requestedBy.trim() : null;
      const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'restore-purge-history';
      try {
        const result = await restorePurgeHistoryEntry(branchId, moduleId, entryId, {
          mode,
          broadcast,
          requestedBy,
          reason
        });
        jsonResponse(res, 200, { ...result, mode });
      } catch (error) {
        const status = error?.code === 'HISTORY_NOT_FOUND' ? 404 : 500;
        logger.warn({ err: error, branchId, moduleId, entryId }, 'Failed to restore purge history entry');
        jsonResponse(res, status, { error: 'history-restore-failed', message: error.message, entryId });
      }
      return true;
    }

    jsonResponse(res, 405, { error: 'method-not-allowed' });
    return true;
  }

  jsonResponse(res, 404, { error: 'management-endpoint-not-found', path: url.pathname });
  return true;
}

async function handleBranchesApi(req, res, url) {
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 2) {
    if (req.method === 'GET') {
      jsonResponse(res, 200, { branches: listBranchSummaries() });
      return;
    }
    jsonResponse(res, 405, { error: 'method-not-allowed' });
    return;
  }

  const branchId = safeDecode(segments[2]);

  if (segments.length === 3) {
    if (req.method === 'GET') {
      const snapshot = await buildBranchSnapshot(branchId);
      jsonResponse(res, 200, snapshot);
      return;
    }
    jsonResponse(res, 405, { error: 'method-not-allowed' });
    return;
  }

  if (segments[3] !== 'modules' || segments.length < 5) {
    jsonResponse(res, 404, { error: 'not-found' });
    return;
  }

  const moduleId = segments[4];
  const modules = getBranchModules(branchId);
  if (!modules.includes(moduleId)) {
    jsonResponse(res, 404, { error: 'module-not-found' });
    return;
  }

  const store = await ensureModuleStore(branchId, moduleId);
  const snapshot = store.getSnapshot();

  if (segments.length === 5) {
    if (req.method === 'GET') {
      jsonResponse(res, 200, snapshot);
      return;
    }
    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        jsonResponse(res, 200, { received: body, snapshot });
      } catch (error) {
        jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
      }
      return;
    }
    jsonResponse(res, 405, { error: 'method-not-allowed' });
    return;
  }

  const tail = segments.slice(5);
  if (tail.length === 1 && tail[0] === 'sequences') {
    if (req.method !== 'POST') {
      jsonResponse(res, 405, { error: 'method-not-allowed' });
      return;
    }
    let body = {};
    try {
      body = await readBody(req);
    } catch (error) {
      jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
      return;
    }
    const tableName =
      (typeof body.table === 'string' && body.table.trim()) ||
      (typeof body.tableName === 'string' && body.tableName.trim()) ||
      null;
    const fieldName =
      (typeof body.field === 'string' && body.field.trim()) ||
      (typeof body.fieldName === 'string' && body.fieldName.trim()) ||
      null;
    if (!tableName || !fieldName) {
      jsonResponse(res, 400, { error: 'missing-table-or-field' });
      return;
    }
    try {
      const allocation = await sequenceManager.nextValue(branchId, moduleId, tableName, fieldName, {
        record: body.record || null,
        autoCreate: true
      });
      if (!allocation) {
        jsonResponse(res, 404, { error: 'sequence-not-configured', table: tableName, field: fieldName });
        return;
      }
      jsonResponse(res, 200, {
        branchId,
        moduleId,
        table: tableName,
        field: fieldName,
        value: allocation.value,
        id: allocation.formatted,
        rule: allocation.rule || null
      });
    } catch (error) {
      logger.warn({ err: error, branchId, moduleId, table: tableName, field: fieldName }, 'Failed to allocate sequence');
      jsonResponse(res, 500, { error: 'sequence-allocation-failed', message: error.message });
    }
    return;
  }

  // ✅ NEW: Reset sequence counter based on existing orders
  if (tail.length === 1 && tail[0] === 'reset') {
    if (req.method !== 'POST' && req.method !== 'GET') {
      jsonResponse(res, 405, { error: 'method-not-allowed' });
      return;
    }

    try {
      console.log('🔄 [RESET] Resetting sequence counter for', { branchId, moduleId });

      // Get all order_header IDs
      const orderHeaders = store.listTable('order_header');
      console.log(`📊 [RESET] Found ${orderHeaders.length} orders in store`);

      // Extract numeric part from IDs (assuming format: PREFIX-NNNNNN)
      const numericIds = orderHeaders
        .map(h => {
          const id = String(h.id || '');
          const match = id.match(/(\d+)$/); // Extract trailing numbers
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => n > 0);

      const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;
      const nextId = maxId + 1;

      console.log(`📈 [RESET] Max existing ID: ${maxId}, Next ID will be: ${nextId}`);

      // ✅ DIRECT FILE WRITE - Much faster than calling nextValue() repeatedly
      const { readFile: fsRead, writeFile: fsWrite, mkdir: fsMkdir } = await import('fs/promises');
      const path = await import('path');

      const branchKey = encodeURIComponent(branchId);
      const stateFilePath = path.join(BRANCHES_DIR, branchKey, 'sequence-state.json');
      const sequenceKey = `${moduleId}:order_header:id`;

      console.log(`📁 [RESET] State file path: ${stateFilePath}`);

      // Read current state
      let currentState = {};
      try {
        const raw = await fsRead(stateFilePath, 'utf8');
        currentState = JSON.parse(raw);
        console.log(`📖 [RESET] Current state:`, currentState);
      } catch (err) {
        console.log(`📝 [RESET] No existing state file, will create new one`);
      }

      // Update the counter
      currentState[sequenceKey] = {
        last: nextId,
        updatedAt: new Date().toISOString()
      };

      // Ensure directory exists
      await fsMkdir(path.dirname(stateFilePath), { recursive: true });

      // Write updated state
      await fsWrite(stateFilePath, JSON.stringify(currentState, null, 2), 'utf8');

      console.log(`✅ [RESET] Sequence reset successful! File written with counter: ${nextId}`);

      // ✅ Clear sequence manager cache so it re-reads the file
      if (sequenceManager.branchStateCache) {
        sequenceManager.branchStateCache.delete(branchId);
        sequenceManager.branchStateCache.delete('default');
        console.log(`🗑️ [RESET] Cleared sequence manager cache`);
      }

      // Test allocation to verify
      const testAllocation = await sequenceManager.nextValue(branchId, moduleId, 'order_header', 'id', {
        record: {},
        autoCreate: true
      });

      jsonResponse(res, 200, {
        success: true,
        maxExistingId: maxId,
        resetToValue: nextId,
        nextInvoiceId: testAllocation?.formatted || `unknown`,
        actualNextValue: testAllocation?.value || nextId + 1,
        stateFilePath
      });

    } catch (error) {
      logger.error({ err: error, branchId, moduleId }, 'Failed to reset sequence');
      jsonResponse(res, 500, { error: 'reset-failed', message: error.message, stack: error.stack });
    }
    return;
  }

  if (moduleId === 'pos' && tail.length >= 1 && tail[0] === 'orders') {
    if (tail.length === 1 && req.method === 'GET') {
      const params = url.searchParams;
      const readBoolean = (name, fallback) => {
        const raw = params.get(name);
        if (raw == null) return fallback;
        const normalized = String(raw).trim().toLowerCase();
        if (["1", "true", "yes", "on"].includes(normalized)) return true;
        if (["0", "false", "no", "off"].includes(normalized)) return false;
        return fallback;
      };
      const readList = (name) => {
        const values = params.getAll(name);
        const results = [];
        for (const value of values) {
          if (typeof value !== 'string') continue;
          value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .forEach((entry) => results.push(entry));
        }
        return results;
      };
      const onlyActive = readBoolean('onlyActive', true);
      const includeTokens = new Set(readList('include').map((token) => token.toLowerCase()));
      if (readBoolean('includeLines', false)) includeTokens.add('lines');
      if (readBoolean('includePayments', false)) includeTokens.add('payments');
      if (readBoolean('includeStatusLogs', false)) includeTokens.add('statuslogs');
      if (readBoolean('includeLineStatus', false) || readBoolean('includeLineStatusLogs', false)) {
        includeTokens.add('linestatuslogs');
        includeTokens.add('lines');
      }

      const limitParam = Number(params.get('limit') || params.get('take'));
      const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.trunc(limitParam) : null;
      const statusFilters = readList('status').map((entry) => entry.toLowerCase());
      const stageFilters = readList('stage').map((entry) => entry.toLowerCase());
      const typeFilters = readList('type').map((entry) => entry.toLowerCase());
      const shiftFilters = readList('shiftId').map((entry) => entry.toLowerCase());
      const updatedAfterParam = params.get('updatedAfter') || params.get('updated_after');
      const savedAfterParam = params.get('savedAfter') || params.get('saved_after');
      const updatedAfter = updatedAfterParam != null ? toTimestamp(updatedAfterParam, null) : null;
      const savedAfter = savedAfterParam != null ? toTimestamp(savedAfterParam, null) : null;

      const cloneRow = (row) => (row && typeof row === 'object' ? deepClone(row) : row);

      const headers = store.listTable('order_header').map(cloneRow);
      const normalizeToken = (value) => (value == null ? '' : String(value).trim().toLowerCase());

      const retainStatus = (status) => {
        if (!status) {
          if (statusFilters.length) {
            return statusFilters.includes('') || statusFilters.includes('open');
          }
          return true;
        }
        if (statusFilters.length) {
          return statusFilters.includes(status);
        }
        if (!onlyActive) return true;
        return !['closed', 'complete', 'completed', 'cancelled', 'void', 'refunded', 'returned'].includes(status);
      };

      const retainStage = (stage) => {
        if (!stage) return stageFilters.length === 0;
        if (!stageFilters.length) return true;
        return stageFilters.includes(stage);
      };

      const retainType = (type) => {
        if (!type) return typeFilters.length === 0;
        if (!typeFilters.length) return true;
        return typeFilters.includes(type);
      };

      const retainShift = (shiftId) => {
        if (!shiftFilters.length) return true;
        if (!shiftId) return false;
        return shiftFilters.includes(String(shiftId).toLowerCase());
      };

      const filtered = headers.filter((order) => {
        if (!order || typeof order !== 'object') return false;
        const statusToken =
          normalizeToken(order.status || order.status_id || order.state) || 'open';
        if (!retainStatus(statusToken)) return false;
        const stageToken =
          normalizeToken(order.fulfillmentStage || order.stage || order.stage_id) || 'new';
        if (!retainStage(stageToken)) return false;
        const typeToken =
          normalizeToken(order.type || order.orderType || order.order_type) || 'dine_in';
        if (!retainType(typeToken)) return false;
        const shiftToken = normalizeToken(order.shiftId || order.shift_id);
        if (!retainShift(shiftToken)) return false;
        if (updatedAfter != null) {
          const ts = toTimestamp(order.updatedAt || order.updated_at, null);
          if (ts == null || ts < updatedAfter) return false;
        }
        if (savedAfter != null) {
          const ts = toTimestamp(order.savedAt || order.saved_at, null);
          if (ts == null || ts < savedAfter) return false;
        }
        return true;
      });

      const includeLines = includeTokens.has('lines');
      const includePayments = includeTokens.has('payments');
      const includeStatusLogs = includeTokens.has('statuslogs');
      const includeLineStatusLogs = includeTokens.has('linestatuslogs');

      const mapByOrderId = (rows, idSelector) => {
        const map = new Map();
        for (const row of ensureArray(rows)) {
          if (!row || typeof row !== 'object') continue;
          const id = idSelector(row);
          if (!id) continue;
          const key = String(id);
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(cloneRow(row));
        }
        return map;
      };

      const linesByOrder = includeLines
        ? mapByOrderId(store.listTable('order_line'), (row) => row.orderId || row.order_id)
        : new Map();
      const paymentsByOrder = includePayments
        ? mapByOrderId(store.listTable('order_payment'), (row) => row.orderId || row.order_id)
        : new Map();
      const statusLogsByOrder = includeStatusLogs
        ? mapByOrderId(store.listTable('order_status_log'), (row) => row.orderId || row.order_id)
        : new Map();

      const lineStatusRaw = includeLineStatusLogs
        ? store.listTable('order_line_status_log').map(cloneRow)
        : [];
      const lineStatusByOrder = new Map();
      if (includeLineStatusLogs) {
        for (const entry of ensureArray(lineStatusRaw)) {
          if (!entry || typeof entry !== 'object') continue;
          const orderId = entry.orderId || entry.order_id;
          const lineId = entry.lineId || entry.line_id;
          if (!orderId || !lineId) continue;
          const orderKey = String(orderId);
          if (!lineStatusByOrder.has(orderKey)) lineStatusByOrder.set(orderKey, new Map());
          const linesMap = lineStatusByOrder.get(orderKey);
          const lineKey = String(lineId);
          if (!linesMap.has(lineKey)) linesMap.set(lineKey, []);
          linesMap.get(lineKey).push(cloneRow(entry));
        }
      }

      const sorted = filtered.slice().sort((a, b) => {
        const aTs = toTimestamp(a.updatedAt || a.updated_at || a.savedAt || a.saved_at, 0);
        const bTs = toTimestamp(b.updatedAt || b.updated_at || b.savedAt || b.saved_at, 0);
        return bTs - aTs;
      });

      const limited = limit ? sorted.slice(0, limit) : sorted;

      const orders = limited.map((order) => {
        const cloned = cloneRow(order);
        const orderId = cloned && cloned.id != null ? String(cloned.id) : null;
        if (includeLines) {
          const bucket = orderId ? linesByOrder.get(orderId) || [] : [];
          cloned.lines = bucket.map((line) => {
            if (!includeLineStatusLogs) return line;
            const lineId = line && line.id != null ? String(line.id) : null;
            if (!lineId) return line;
            const logsMap = orderId ? lineStatusByOrder.get(orderId) : null;
            const logs = logsMap && logsMap.get(lineId);
            if (!logs || !logs.length) return line;
            return { ...line, statusLogs: logs.map((entry) => cloneRow(entry)) };
          });
        }
        if (includePayments) {
          const bucket = orderId ? paymentsByOrder.get(orderId) || [] : [];
          cloned.payments = bucket.map(cloneRow);
        }
        if (includeStatusLogs) {
          const bucket = orderId ? statusLogsByOrder.get(orderId) || [] : [];
          cloned.statusLogs = bucket.map(cloneRow);
        }
        return cloned;
      });

      jsonResponse(res, 200, {
        branchId,
        moduleId,
        orders,
        meta: {
          count: orders.length,
          total: filtered.length,
          onlyActive,
          include: Array.from(includeTokens.values()),
          limit
        }
      });
      return;
    }
    if (tail.length === 1 && req.method === 'POST') {
      let body = {};
      try {
        body = await readBody(req);
      } catch (error) {
        jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
        return;
      }
      const orderPayload = body.order || body.data || body.record || null;
      if (!orderPayload || typeof orderPayload !== 'object') {
        jsonResponse(res, 400, { error: 'missing-order-payload' });
        return;
      }
      try {
        const result = await savePosOrder(branchId, moduleId, orderPayload, {
          source: 'pos-order-api',
          actorId: body.actorId || body.userId || orderPayload.updatedBy || null
        });
        const snapshot = await fetchPosOrderSnapshot(branchId, moduleId, result.orderId);
        jsonResponse(res, 201, {
          branchId,
          moduleId,
          orderId: result.orderId,
          order: snapshot,
          normalized: buildAckOrder(result.normalized)
        });
      } catch (error) {
        if (isVersionConflict(error)) {
          logger.info({ err: error, branchId, moduleId, details: versionConflictDetails(error) }, 'POS order persist rejected due to version conflict');
          jsonResponse(res, 409, {
            error: 'order-version-conflict',
            message: error.message,
            details: versionConflictDetails(error)
          });
          return;
        }
        logger.warn({ err: error, branchId, moduleId }, 'Failed to persist POS order via API');
        jsonResponse(res, 500, { error: 'order-persist-failed', message: error.message });
      }
      return;
    }
    if (tail.length === 2 && req.method === 'GET') {
      const orderId = tail[1];
      try {
        const snapshot = await fetchPosOrderSnapshot(branchId, moduleId, orderId);
        if (!snapshot) {
          jsonResponse(res, 404, { error: 'order-not-found', orderId });
          return;
        }
        jsonResponse(res, 200, { branchId, moduleId, orderId, order: snapshot });
      } catch (error) {
        logger.warn({ err: error, branchId, moduleId, orderId }, 'Failed to load order snapshot');
        jsonResponse(res, 500, { error: 'order-fetch-failed', message: error.message });
      }
      return;
    }
  }
  if (tail.length === 1 && tail[0] === 'save') {
    if (req.method !== 'POST') {
      jsonResponse(res, 405, { error: 'method-not-allowed' });
      return;
    }
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
      return;
    }
    const payload = body && typeof body === 'object' ? body : {};
    const tableName =
      (typeof payload.table === 'string' && payload.table.trim()) ||
      (typeof payload.tableName === 'string' && payload.tableName.trim()) ||
      (typeof payload.targetTable === 'string' && payload.targetTable.trim()) ||
      null;
    if (!tableName) {
      jsonResponse(res, 400, { error: 'missing-table-name' });
      return;
    }
    if (!store.tables.includes(tableName)) {
      jsonResponse(res, 404, { error: 'table-not-found' });
      return;
    }
    const recordSource = payload.record || payload.data || null;
    if (!recordSource || typeof recordSource !== 'object') {
      jsonResponse(res, 400, { error: 'missing-record' });
      return;
    }
    const record = deepClone(recordSource);
    const concurrencyInput =
      (payload.concurrency && typeof payload.concurrency === 'object' && payload.concurrency) ||
      (payload.expected && typeof payload.expected === 'object' && payload.expected) ||
      (payload.guard && typeof payload.guard === 'object' && payload.guard) ||
      {};

    const clientMarker = extractClientSnapshotMarker(payload);
    const eventContext = getModuleEventStoreContext(branchId, moduleId);
    let eventMeta = null;
    try {
      eventMeta = await loadEventMeta(eventContext);
    } catch (error) {
      logger.warn({ err: error, branchId, moduleId }, 'Failed to load event meta for save request');
    }
    const state = await ensureSyncState(branchId, moduleId);
    const serverMarker = resolveServerSnapshotMarker(state, eventMeta);
    const concurrencyResult = evaluateConcurrencyGuards(store, tableName, record, concurrencyInput, {
      serverMarker,
      clientMarker
    });

    if (concurrencyResult.requiresFullSync) {
      jsonResponse(res, 409, {
        error: 'full-sync-required',
        branchId,
        moduleId,
        table: tableName,
        details: concurrencyResult.conflict || { code: 'full-sync-required' },
        snapshotMarker: serverMarker || null,
        clientSnapshotMarker: clientMarker || null
      });
      return;
    }

    if (concurrencyResult.conflict) {
      jsonResponse(res, 409, {
        error: 'concurrency-conflict',
        branchId,
        moduleId,
        table: tableName,
        details: concurrencyResult.conflict,
        snapshotMarker: serverMarker || null,
        clientSnapshotMarker: clientMarker || null
      });
      return;
    }

    const includeRecord = payload.includeRecord !== false;
    const source = typeof payload.source === 'string' && payload.source.trim() ? payload.source.trim() : 'rest-save';
    const eventPayload = {
      action: 'module:save',
      table: tableName,
      record,
      meta: payload.meta,
      source
    };
    if (includeRecord) {
      eventPayload.includeRecord = true;
    }

    let result;
    try {
      result = await handleModuleEvent(branchId, moduleId, eventPayload, null, {
        source,
        includeSnapshot: false
      });
    } catch (error) {
      if (isVersionConflict(error)) {
        jsonResponse(res, 409, {
          error: 'version-conflict',
          message: error.message,
          details: versionConflictDetails(error)
        });
        return;
      }
      logger.warn({ err: error, branchId, moduleId }, 'Save endpoint failed to persist event');
      jsonResponse(res, 400, { error: 'module-event-failed', message: error.message });
      return;
    }

    const clientTableIdPatch = {};
    if (payload.lastTableIds && typeof payload.lastTableIds === 'object') {
      for (const [tableKey, value] of Object.entries(payload.lastTableIds)) {
        if (typeof tableKey !== 'string') continue;
        const normalized = normalizeCursorInput(value).object;
        if (normalized) {
          clientTableIdPatch[tableKey] = normalized;
        }
      }
    }
    if (payload.lastKnownId || payload.cursor) {
      const normalized = normalizeCursorInput(payload.lastKnownId || payload.cursor).object;
      if (normalized) {
        clientTableIdPatch[tableName] = normalized;
      }
    }

    const metaPatch = {
      lastSnapshotMarker: serverMarker || null,
      lastClientSnapshotMarker: clientMarker || null,
      lastClientSyncAt: nowIso()
    };
    if (Object.keys(clientTableIdPatch).length) {
      metaPatch.lastClientTableIds = clientTableIdPatch;
    }
    const servedCursor = result?.notice?.recordRef ? buildRecordCursor(result.notice.recordRef) : null;
    if (servedCursor) {
      metaPatch.lastServedTableIds = { [tableName]: servedCursor };
    }
    await updateEventMeta(eventContext, metaPatch).catch((error) => {
      logger.warn({ err: error, branchId, moduleId }, 'Failed to update event meta after save request');
    });

    jsonResponse(res, 200, {
      status: result?.ack?.created ? 'created' : 'saved',
      branchId,
      moduleId,
      table: tableName,
      record: result?.record || null,
      ack: result?.ack || null,
      notice: result?.notice || null,
      snapshotMarker: serverMarker || null,
      clientSnapshotMarker: clientMarker || null
    });
    return;
  }
  if (tail.length === 1 && tail[0] === 'reset') {
    if (req.method !== 'POST' && req.method !== 'GET') {
      jsonResponse(res, 405, { error: 'method-not-allowed' });
      return;
    }
    await resetModule(branchId, moduleId, { reason: 'branch-api-reset' });
    const snapshot = await buildBranchSnapshot(branchId);
    jsonResponse(res, 200, snapshot);
    return;
  }

  if (tail.length === 2 && tail[0] === 'events' && tail[1] === 'batch') {
    if (req.method !== 'POST') {
      jsonResponse(res, 405, { error: 'method-not-allowed' });
      return;
    }
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
      return;
    }
    if (!body || !Object.prototype.hasOwnProperty.call(body, 'lastAckId')) {
      jsonResponse(res, 400, { error: 'missing-last-ack-id' });
      return;
    }
    const lastAckId = body.lastAckId;
    if (lastAckId !== null && typeof lastAckId !== 'string') {
      jsonResponse(res, 400, { error: 'invalid-last-ack-id' });
      return;
    }
    const incomingEvents = Array.isArray(body.events) ? body.events : [];
    const normalizedEvents = [];
    for (let idx = 0; idx < incomingEvents.length; idx += 1) {
      const rawEvent = incomingEvents[idx];
      if (!rawEvent || typeof rawEvent !== 'object') {
        jsonResponse(res, 400, { error: 'invalid-event-payload', index: idx });
        return;
      }
      const action = typeof rawEvent.action === 'string' ? rawEvent.action : 'module:insert';
      if (action !== 'module:insert') {
        jsonResponse(res, 400, { error: 'unsupported-event-action', index: idx, action });
        return;
      }
      const tableName = rawEvent.table || rawEvent.tableName || rawEvent.targetTable;
      if (!tableName || typeof tableName !== 'string') {
        jsonResponse(res, 400, { error: 'missing-table-name', index: idx });
        return;
      }
      normalizedEvents.push({
        ...rawEvent,
        action,
        tableName,
        record: rawEvent.record || rawEvent.data || {}
      });
    }
    const eventContext = getModuleEventStoreContext(branchId, moduleId);
    const eventMeta = await loadEventMeta(eventContext);
    const expectedAck = eventMeta.lastEventId || null;
    if (lastAckId !== expectedAck) {
      jsonResponse(res, 409, { error: 'last-ack-mismatch', expected: expectedAck, received: lastAckId });
      return;
    }
    if (eventMeta.lastAckId !== lastAckId) {
      await updateEventMeta(eventContext, { lastAckId });
    }
    const broadcast = body.broadcast !== false;
    const ingested = [];
    for (const entry of normalizedEvents) {
      try {
        const result = await handleModuleEvent(
          branchId,
          moduleId,
          {
            ...entry,
            table: entry.tableName,
            record: entry.record,
            eventId: entry.eventId || entry.id || null
          },
          null,
          { source: 'rest-batch', broadcast }
        );
        ingested.push(result);
      } catch (error) {
        if (isVersionConflict(error)) {
          jsonResponse(res, 409, {
            error: 'version-conflict',
            message: error.message,
            index: ingested.length,
            details: versionConflictDetails(error)
          });
          return;
        }
        logger.warn({ err: error, branchId, moduleId }, 'Batch event failed');
        jsonResponse(res, 400, { error: 'module-event-failed', message: error.message, index: ingested.length });
        return;
      }
    }
    const latestMeta = await loadEventMeta(eventContext);
    jsonResponse(res, 200, {
      branchId,
      moduleId,
      ingested: ingested.length,
      lastAckId: latestMeta.lastAckId,
      lastEventId: latestMeta.lastEventId,
      sequences: ingested.map((item) => ({
        id: item?.logEntry?.id || null,
        sequence: item?.logEntry?.sequence || null,
        table: item?.logEntry?.table || null,
        createdAt: item?.logEntry?.createdAt || null
      }))
    });
    return;
  }

  if (tail.length === 1 && tail[0] === 'events') {
    if (req.method === 'GET') {
      const events = Array.isArray(snapshot.tables?.pos_database)
        ? snapshot.tables.pos_database.map((row) => ({
            id: row.id,
            branchId: row.branchId,
            createdAt: row.createdAt || null,
            updatedAt: row.updatedAt || null,
            payload: row.payload ? deepClone(row.payload) : null
          }))
        : [];
      const eventContext = getModuleEventStoreContext(branchId, moduleId);
      const eventLogMeta = await loadEventMeta(eventContext).catch(() => null);
      jsonResponse(res, 200, {
        branchId,
        moduleId,
        version: snapshot.version,
        updatedAt: snapshot.meta?.lastUpdatedAt || null,
        serverId: SERVER_ID,
        events,
        eventLog: eventLogMeta ? deepClone(eventLogMeta) : null,
        snapshot: deepClone(snapshot)
      });
      return;
    }
    if (req.method !== 'POST') {
      jsonResponse(res, 405, { error: 'method-not-allowed' });
      return;
    }
    try {
      const body = await readBody(req);
      const result = await handleModuleEvent(branchId, moduleId, body, null, { source: 'rest' });
      jsonResponse(res, 200, result);
    } catch (error) {
      if (isVersionConflict(error)) {
        jsonResponse(res, 409, {
          error: 'version-conflict',
          message: error.message,
          details: versionConflictDetails(error)
        });
        return;
      }
      logger.warn({ err: error, branchId, moduleId }, 'Module event failed (REST)');
      jsonResponse(res, 400, { error: 'module-event-failed', message: error.message });
    }
    return;
  }

  if (tail[0] === 'tables' && tail.length >= 2) {
    const tableName = tail[1];
    if (!store.tables.includes(tableName)) {
      jsonResponse(res, 404, { error: 'table-not-found' });
      return;
    }
    const tableTail = tail.slice(2);
    if (tableTail.length && !(tableTail.length === 1 && tableTail[0] === 'records')) {
      jsonResponse(res, 404, { error: 'not-found' });
      return;
    }

    const parseTimestamp = (value) => {
      if (value == null) return null;
      if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string' && value.trim()) {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && numeric > 1e9) {
          return numeric;
        }
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
      return null;
    };

    if (req.method === 'GET') {
      const baseRows = store.listTable(tableName);
      const params = url.searchParams;
      const limit = Math.max(0, Number(params.get('limit') || params.get('take') || 0) || 0);
      const afterId = params.get('afterId') || params.get('after_id') || params.get('after') || params.get('lastId');
      const afterKey = params.get('afterKey') || params.get('cursor');
      const afterCreatedParam =
        params.get('afterCreatedAt') ||
        params.get('after_created_at') ||
        params.get('since') ||
        params.get('begin_date') ||
        params.get('create_date') ||
        params.get('created_after');
      const updatedAfterParam = params.get('updated_after') || params.get('updatedAfter');
      const order = (params.get('order') || params.get('sort') || 'asc').toLowerCase();

      const rows = baseRows.slice();
      const resolveRefMatch = (value) => {
        if (value == null) return -1;
        const target = String(value);
        return rows.findIndex((row) => {
          const ref = store.getRecordReference(tableName, row);
          if (!ref) return false;
          if (ref.key && String(ref.key) === target) return true;
          if (ref.id !== undefined && String(ref.id) === target) return true;
          if (ref.uid !== undefined && String(ref.uid) === target) return true;
          if (ref.uuid !== undefined && String(ref.uuid) === target) return true;
          return false;
        });
      };

      let filtered = rows;
      const cursorMatch = resolveRefMatch(afterKey || afterId);
      if (cursorMatch >= 0) {
        filtered = filtered.slice(cursorMatch + 1);
      }

      const createdAfterTs = parseTimestamp(afterCreatedParam);
      if (createdAfterTs != null) {
        filtered = filtered.filter((row) => {
          const createdCandidates = [row.createdAt, row.created_at, row.createDate, row.create_date];
          for (const candidate of createdCandidates) {
            const ts = parseTimestamp(candidate);
            if (ts != null && ts > createdAfterTs) {
              return true;
            }
          }
          return false;
        });
      }

      const updatedAfterTs = parseTimestamp(updatedAfterParam);
      if (updatedAfterTs != null) {
        filtered = filtered.filter((row) => {
          const updateCandidates = [row.updatedAt, row.updated_at, row.modifyDate, row.modify_date];
          for (const candidate of updateCandidates) {
            const ts = parseTimestamp(candidate);
            if (ts != null && ts > updatedAfterTs) {
              return true;
            }
          }
          return false;
        });
      }

      if (order === 'desc') {
        filtered = filtered.slice().reverse();
      }

      const limited = limit > 0 ? filtered.slice(0, limit) : filtered;
      const lastRecord = limited.length ? limited[limited.length - 1] : null;
      const cursor = lastRecord ? store.getRecordReference(tableName, lastRecord) : null;
      jsonResponse(res, 200, {
        branchId,
        moduleId,
        table: tableName,
        count: limited.length,
        cursor,
        rows: limited,
        meta: {
          limit: limit || null,
          order,
          afterId: afterId || null,
          afterKey: afterKey || null,
          afterCreatedAt: createdAfterTs != null ? new Date(createdAfterTs).toISOString() : null,
          updatedAfter: updatedAfterTs != null ? new Date(updatedAfterTs).toISOString() : null
        }
      });
      return;
    }

    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      let body = null;
      try {
        body = await readBody(req);
      } catch (error) {
        if (req.method !== 'DELETE') {
          jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
          return;
        }
      }
      const requestRecord = body && typeof body === 'object' ? body.record || body.data || body : {};
      const requestMeta = body && typeof body === 'object' && body.meta && typeof body.meta === 'object' ? body.meta : null;
      let response;
      try {
        if (req.method === 'POST') {
          response = await handleModuleEvent(
            branchId,
            moduleId,
            { action: 'module:insert', table: tableName, record: requestRecord, meta: requestMeta, source: 'rest-crud', includeRecord: true },
            null,
            { source: 'rest-crud', includeSnapshot: false }
          );
          jsonResponse(res, 201, {
            status: 'created',
            branchId,
            moduleId,
            table: tableName,
            record: response.record,
            ack: response.ack,
            notice: response.notice
          });
          return;
        }
        if (req.method === 'PATCH') {
          response = await handleModuleEvent(
            branchId,
            moduleId,
            { action: 'module:merge', table: tableName, record: requestRecord, meta: requestMeta, source: 'rest-crud', includeRecord: true },
            null,
            { source: 'rest-crud', includeSnapshot: false }
          );
          jsonResponse(res, 200, {
            status: 'updated',
            branchId,
            moduleId,
            table: tableName,
            record: response.record,
            ack: response.ack,
            notice: response.notice
          });
          return;
        }
        if (req.method === 'PUT') {
          response = await handleModuleEvent(
            branchId,
            moduleId,
            { action: 'module:save', table: tableName, record: requestRecord, meta: requestMeta, source: 'rest-crud', includeRecord: true },
            null,
            { source: 'rest-crud', includeSnapshot: false }
          );
          jsonResponse(res, 200, {
            status: response.ack?.created ? 'created' : 'saved',
            branchId,
            moduleId,
            table: tableName,
            record: response.record,
            ack: response.ack,
            notice: response.notice
          });
          return;
        }
        if (req.method === 'DELETE') {
          const recordInput = { ...requestRecord };
          const queryId =
            url.searchParams.get('id') ||
            url.searchParams.get('recordId') ||
            url.searchParams.get('record_id') ||
            url.searchParams.get('key');
          if (queryId && recordInput.id === undefined && recordInput.key === undefined) {
            recordInput.id = queryId;
          }
          if (!Object.keys(recordInput).length) {
            jsonResponse(res, 400, { error: 'missing-record-key' });
            return;
          }
          response = await handleModuleEvent(
            branchId,
            moduleId,
            { action: 'module:delete', table: tableName, record: recordInput, meta: requestMeta, source: 'rest-crud' },
            null,
            { source: 'rest-crud', includeSnapshot: false }
          );
          jsonResponse(res, 200, {
            status: 'deleted',
            branchId,
            moduleId,
            table: tableName,
            recordRef: response.recordRef,
            notice: response.notice,
            ack: response.ack
          });
          return;
        }
      } catch (error) {
        const notFound = typeof error?.message === 'string' && /not\sfound/i.test(error.message);
        if (isVersionConflict(error)) {
          jsonResponse(res, 409, {
            error: 'version-conflict',
            message: error.message,
            details: versionConflictDetails(error)
          });
          return;
        }
        const code = error?.code === 'MODULE_STORE_NOT_FOUND' || notFound ? 404 : 400;
        jsonResponse(res, code, { error: 'module-event-failed', message: error.message });
        return;
      }
    }

    jsonResponse(res, 405, { error: 'method-not-allowed' });
    return;
  }

  if (req.method === 'GET') {
    const value = traversePath(snapshot, tail);
    if (value === undefined) {
      jsonResponse(res, 404, { error: 'path-not-found' });
      return;
    }
    jsonResponse(res, 200, value);
    return;
  }

  jsonResponse(res, 405, { error: 'method-not-allowed' });
}

async function clearModuleEventState(branchId, moduleId, tables = [], options = {}) {
  const context = getModuleEventStoreContext(branchId, moduleId);
  let meta = null;
  try {
    meta = await loadEventMeta(context);
  } catch (error) {
    logger.warn({ err: error, branchId, moduleId }, 'Failed to load event meta before purge');
  }
  const tableSet = new Set();
  if (Array.isArray(tables)) {
    for (const name of tables) {
      if (typeof name !== 'string') continue;
      const trimmed = name.trim();
      if (trimmed) tableSet.add(trimmed);
    }
  }
  const preserveEntries = (source = {}) => {
    const result = {};
    for (const [key, value] of Object.entries(source)) {
      if (tableSet.size && tableSet.has(key)) continue;
      result[key] = value;
    }
    return result;
  };
  const now = nowIso();
  const patch = {
    lastEventId: null,
    lastEventAt: null,
    lastAckId: null,
    totalEvents: 0,
    tableCursors: preserveEntries(meta?.tableCursors),
    lastServedTableIds: preserveEntries(meta?.lastServedTableIds),
    lastClientTableIds: preserveEntries(meta?.lastClientTableIds),
    lastSnapshotMarker: null,
    lastClientSnapshotMarker: null,
    lastClientSyncAt: null,
    liveCreatedAt: now,
    updatedAt: now
  };
  if (options.reason || options.requestedBy) {
    patch.purgeState = {
      at: now,
      reason: options.reason || null,
      requestedBy: options.requestedBy || null,
      tables: Array.from(tableSet)
    };
  }
  try {
    await updateEventMeta(context, patch);
  } catch (error) {
    logger.warn({ err: error, branchId, moduleId }, 'Failed to update event meta after purge');
    throw error;
  }
  await discardLogFile(context.logPath).catch(() => {});
  await discardLogFile(context.rejectionLogPath).catch(() => {});
  return patch;
}

function summarizePurgeHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const tables = Array.isArray(entry.summary)
    ? entry.summary
    : Array.isArray(entry.tables)
      ? entry.tables.map((table) => ({
          name: table.name || table.table || null,
          count: table.count ?? (Array.isArray(table.records) ? table.records.length : 0),
          sample: table.sample || table.samples || []
        }))
      : [];
  return {
    id: entry.id || null,
    branchId: entry.branchId || null,
    moduleId: entry.moduleId || null,
    createdAt: entry.createdAt || null,
    reason: entry.reason || null,
    requestedBy: entry.requestedBy || null,
    totalRecords: entry.totalRecords ?? tables.reduce((sum, table) => sum + Number(table.count || 0), 0),
    tables
  };
}

async function recordPurgeHistoryEntry(store, tableNames = [], options = {}) {
  if (!store) return null;
  const tables = Array.isArray(tableNames) ? tableNames.slice() : [];
  const recognized = [];
  let totalRecords = 0;
  for (const tableName of tables) {
    if (typeof tableName !== 'string') continue;
    const normalized = tableName.trim();
    if (!normalized || !store.tables.includes(normalized)) continue;
    const records = store.listTable(normalized);
    const sample = records.slice(0, 5).map((record) => store.getRecordReference(normalized, record));
    const entry = {
      name: normalized,
      count: records.length,
      records,
      primaryKeyFields: store.resolvePrimaryKeyFields(normalized),
      sample
    };
    totalRecords += records.length;
    recognized.push(entry);
  }
  if (!recognized.length) return null;

  const createdAt = nowIso();
  const id = createId('purge');
  const payload = {
    id,
    type: 'purge',
    branchId: store.branchId,
    moduleId: store.moduleId,
    createdAt,
    reason: options.reason || null,
    requestedBy: options.requestedBy || null,
    clearedTables: tables,
    originalVersion: store.version,
    totalRecords,
    tables: recognized,
    summary: recognized.map((entry) => ({ name: entry.name, count: entry.count, sample: entry.sample }))
  };

  const fileName = `${createdAt.replace(/[:.]/g, '-')}_${id}.json`;
  const filePath = path.join(getModulePurgeHistoryDir(store.branchId, store.moduleId), fileName);
  await writeJson(filePath, payload);
  return { ...summarizePurgeHistoryEntry(payload), filePath };
}

async function listPurgeHistorySummaries(branchId, moduleId) {
  const dir = getModulePurgeHistoryDir(branchId, moduleId);
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const summaries = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const filePath = path.join(dir, entry.name);
    const payload = await readJsonSafe(filePath, null);
    if (!payload) continue;
    const summary = summarizePurgeHistoryEntry(payload);
    if (!summary) continue;
    summaries.push(summary);
  }
  summaries.sort((a, b) => {
    const aTime = a?.createdAt ? Date.parse(a.createdAt) : 0;
    const bTime = b?.createdAt ? Date.parse(b.createdAt) : 0;
    return bTime - aTime;
  });
  return summaries;
}

async function findPurgeHistoryFile(branchId, moduleId, entryId) {
  if (!entryId) return null;
  const dir = getModulePurgeHistoryDir(branchId, moduleId);
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    if (entry.name.includes(entryId)) {
      return path.join(dir, entry.name);
    }
  }
  return null;
}

async function readPurgeHistoryEntry(branchId, moduleId, entryId) {
  const filePath = await findPurgeHistoryFile(branchId, moduleId, entryId);
  if (!filePath) return null;
  const payload = await readJsonSafe(filePath, null);
  if (!payload) return null;
  return payload;
}

async function restorePurgeHistoryEntry(branchId, moduleId, entryId, options = {}) {
  const payload = await readPurgeHistoryEntry(branchId, moduleId, entryId);
  if (!payload) {
    const error = new Error('History entry not found');
    error.code = 'HISTORY_NOT_FOUND';
    throw error;
  }
  const store = await ensureModuleStore(branchId, moduleId);
  const tableMap = new Map();
  for (const tableEntry of payload.tables || []) {
    const tableName = tableEntry?.name || tableEntry?.table;
    if (typeof tableName !== 'string' || !tableName.trim()) continue;
    tableMap.set(tableName.trim(), Array.isArray(tableEntry.records) ? tableEntry.records : []);
  }
  const restoreResult = store.restoreTables(tableMap, { mode: options.mode });
  await persistModuleStore(store);

  const meta = {
    reason: options.reason || 'restore-purge-history',
    requestedBy: options.requestedBy || null,
    historyEntryId: payload.id,
    mode: restoreResult.mode
  };

  if (options.broadcast !== false) {
    for (const entry of restoreResult.restored) {
      if (!entry || !entry.table || entry.skipped) continue;
      try {
        await broadcastTableNotice(branchId, moduleId, entry.table, {
          action: 'table:restore',
          restored: entry.restored,
          duplicates: entry.duplicates || 0,
          mode: restoreResult.mode,
          meta
        });
      } catch (error) {
        logger.warn({ err: error, branchId, moduleId, table: entry.table }, 'Failed to broadcast restore notice');
      }
    }
    broadcastToBranch(branchId, {
      type: 'server:event',
      action: 'module:restore',
      branchId,
      moduleId,
      version: store.version,
      restored: restoreResult.restored,
      totalRestored: restoreResult.totalRestored,
      meta
    });
  }

  return {
    branchId,
    moduleId,
    entryId: payload.id,
    restored: restoreResult.restored,
    totalRestored: restoreResult.totalRestored,
    changed: restoreResult.changed,
    historyEntry: summarizePurgeHistoryEntry(payload)
  };
}

async function purgeModuleLiveData(branchId, moduleId, tableNames = [], options = {}) {
  const store = await ensureModuleStore(branchId, moduleId);
  const tables = Array.isArray(tableNames) ? tableNames.slice() : [];
  const historyEntry = await recordPurgeHistoryEntry(store, tables, {
    reason: options.reason,
    requestedBy: options.requestedBy
  });
  const { cleared, totalRemoved, changed } = store.clearTables(tables);
  await persistModuleStore(store);

  const recognized = cleared.filter((entry) => entry && entry.status !== 'skipped');
  const targetTables = recognized.map((entry) => entry.table).filter(Boolean);
  const noticeMeta = {
    reason: options.reason || 'purge-live-data',
    requestedBy: options.requestedBy || null,
    serverId: SERVER_ID,
    resetEvents: options.resetEvents !== false,
    historyEntryId: historyEntry?.id || null
  };

  if (options.broadcast !== false) {
    for (const entry of recognized) {
      try {
        await broadcastTableNotice(branchId, moduleId, entry.table, {
          action: 'table:purge',
          removed: entry.removed || 0,
          status: entry.status,
          meta: noticeMeta
        });
      } catch (error) {
        logger.warn({ err: error, branchId, moduleId, table: entry.table }, 'Failed to broadcast purge notice');
      }
    }
  }

  let eventMetaPatch = null;
  if (options.resetEvents !== false && targetTables.length) {
    eventMetaPatch = await clearModuleEventState(branchId, moduleId, targetTables, options);
  }

  if (options.broadcast !== false) {
    const eventPayload = {
      type: 'server:event',
      action: 'module:purge',
      branchId,
      moduleId,
      version: store.version,
      tables: cleared,
      totalRemoved,
      meta: {
        ...noticeMeta,
        eventMetaReset: Boolean(eventMetaPatch)
      }
    };
    broadcastToBranch(branchId, eventPayload);
  }

  if (changed) {
    logger.info({ branchId, moduleId, tables: cleared, totalRemoved }, 'Purged module transaction tables');
  } else {
    logger.debug({ branchId, moduleId, tables: cleared }, 'No transaction records removed during purge');
  }

  return {
    branchId,
    moduleId,
    version: store.version,
    cleared,
    totalRemoved,
    changed,
    eventMeta: eventMetaPatch,
    historyEntry
  };
}

async function resetModule(branchId, moduleId, options = {}) {
  const store = await ensureModuleStore(branchId, moduleId);
  const moduleSeed = await ensureModuleSeed(branchId, moduleId);
  if (typeof store.refreshPersistedTables === 'function') {
    try {
      store.refreshPersistedTables(true);
    } catch (error) {
      logger.warn({ err: error, branchId, moduleId }, 'Failed to refresh persisted tables before reset');
    }
  }

  // 🔄 [RESET FIX] Purge live transaction data BEFORE resetting sequences
  // This ensures both live data AND sequences are reset, not just sequences alone
  const transactionTables = normalizeTransactionTableList(null, { fallbackToDefaults: true });
  logger.info({ branchId, moduleId, tables: transactionTables }, 'Purging transaction tables before reset');

  let purgeHistoryEntry = null;
  try {
    purgeHistoryEntry = await recordPurgeHistoryEntry(store, transactionTables, {
      reason: options.reason || 'module-reset',
      requestedBy: options.requestedBy || null
    });
  } catch (error) {
    logger.warn({ err: error, branchId, moduleId }, 'Failed to record purge history entry before reset');
  }

  // Clear transaction tables
  const { cleared, totalRemoved } = store.clearTables(transactionTables);
  logger.info({ branchId, moduleId, cleared, totalRemoved }, 'Cleared transaction tables during reset');

  // Broadcast purge event for live data clearance
  if (totalRemoved > 0) {
    broadcastToBranch(branchId, {
      type: 'server:event',
      action: 'module:purge',
      branchId,
      moduleId,
      version: store.version,
      tables: cleared,
      totalRemoved,
      meta: {
        serverId: SERVER_ID,
        reason: options.reason || 'module-reset',
        historyEntryId: purgeHistoryEntry?.id || null,
        requestedBy: options.requestedBy || null,
        stage: 'pre-reset'
      }
    });
  }

  // 🔄 [RESET FIX] Now perform module reset (sequences + apply seed data)
  let historyEntry = null;
  try {
    historyEntry = await recordPurgeHistoryEntry(store, store.tables, {
      reason: options.reason || 'module-reset',
      requestedBy: options.requestedBy || null
    });
  } catch (error) {
    logger.warn({ err: error, branchId, moduleId }, 'Failed to record reset history entry');
  }
  await archiveModuleFile(branchId, moduleId);
  store.reset();
  if (moduleSeed) {
    store.applySeed(moduleSeed, { reason: 'reset-seed' });
  }
  await persistModuleStore(store);
  const snapshot = store.getSnapshot();
  broadcastToBranch(branchId, {
    type: 'server:event',
    action: 'module:reset',
    moduleId,
    branchId,
    version: store.version,
    snapshot,
    record: null,
    meta: {
      serverId: SERVER_ID,
      reason: options.reason || 'module-reset',
      moduleId,
      historyEntryId: historyEntry?.id || null,
      requestedBy: options.requestedBy || null,
      purgedTables: cleared,
      totalPurged: totalRemoved
    }
  });
  return { store, historyEntry, purgeHistoryEntry, totalRemoved };
}

async function handleModuleEvent(branchId, moduleId, payload = {}, client = null, options = {}) {
  const action = typeof payload.action === 'string' ? payload.action : 'module:insert';
  const tableName = payload.table || payload.tableName || payload.targetTable;
  if (!tableName) throw new Error('Missing table name for module event');
  let recordPayload = payload.record || payload.data || {};
  if (['module:insert', 'module:merge', 'module:save'].includes(action)) {
    try {
      recordPayload = await sequenceManager.applyAutoSequences(branchId, moduleId, tableName, recordPayload);
    } catch (error) {
      logger.warn({ err: error, branchId, moduleId, table: tableName }, 'Failed to apply sequence manager to record payload');
    }
  }
  const store = await ensureModuleStore(branchId, moduleId);
  const contextInfo = {
    clientId: client?.id || null,
    userId: payload.userId || null,
    source: options.source || payload.source || null
  };

  let effectiveAction = action;
  let recordResult = null;
  let removedRecord = null;
  let saveResult = null;

  switch (action) {
    case 'module:insert': {
      recordResult = store.insert(tableName, recordPayload, contextInfo);
      // 🔍 Log job_order_header insertions
      if (tableName === 'job_order_header') {
        logger.info({
          table: tableName,
          action,
          recordId: recordPayload.id,
          orderId: recordPayload.orderId,
          stationId: recordPayload.stationId
        }, '🚀 [BACKEND] Received job_order_header via WebSocket - inserted to store');
      }
      break;
    }
    case 'module:merge': {
      recordResult = store.merge(tableName, recordPayload, contextInfo);
      break;
    }
    case 'module:save': {
      saveResult = store.save(tableName, recordPayload, contextInfo);
      recordResult = saveResult.record;
      effectiveAction = saveResult.created ? 'module:insert' : 'module:merge';
      break;
    }
    case 'module:delete': {
      const removal = store.remove(tableName, recordPayload, contextInfo);
      removedRecord = removal?.record || null;
      effectiveAction = 'module:delete';
      // 🔍 Log job_order_header deletions
      if (tableName === 'job_order_header') {
        logger.warn({
          table: tableName,
          action,
          recordId: recordPayload.id,
          orderId: removedRecord?.orderId
        }, '❌ [BACKEND] job_order_header DELETED');
      }
      break;
    }
    default:
      throw new Error(`Unsupported module action: ${action}`);
  }

  await persistModuleStore(store);

  // 🔍 Log after persist
  if (tableName === 'job_order_header') {
    const allJobHeaders = store.listTable('job_order_header');
    logger.info({
      table: tableName,
      action: effectiveAction,
      totalInStore: allJobHeaders.length,
      sampleIds: allJobHeaders.slice(0, 3).map(h => ({ id: h.id, orderId: h.orderId }))
    }, '✅ [BACKEND] job_order_header count after persist');
  }

  const timestamp = nowIso();
  const baseMeta = {
    serverId: SERVER_ID,
    branchId,
    moduleId,
    table: tableName,
    timestamp
  };
  if (contextInfo.source) {
    baseMeta.source = contextInfo.source;
  }
  if (payload.meta && typeof payload.meta === 'object') {
    baseMeta.clientMeta = deepClone(payload.meta);
  }

  const recordRef = store.getRecordReference(tableName, recordResult || removedRecord || recordPayload);
  if (recordRef?.key) {
    baseMeta.recordKey = recordRef.key;
  }
  if (recordRef?.id !== undefined) {
    baseMeta.recordId = recordRef.id;
  }

  const eventContext = getModuleEventStoreContext(branchId, moduleId);
  const recordForLog = effectiveAction === 'module:delete' ? removedRecord : recordResult;
  const logEntry = await appendModuleEvent(eventContext, {
    id: payload.eventId || payload.id || null,
    action: effectiveAction,
    branchId,
    moduleId,
    table: tableName,
    record: recordForLog,
    meta: { ...baseMeta, recordRef },
    publishState: payload.publishState
  });
  await updateEventMeta(eventContext, { lastAckId: logEntry.id });

  const enrichedMeta = { ...baseMeta, eventId: logEntry.id, sequence: logEntry.sequence, recordRef };
  const entry = {
    id: recordRef?.id || recordRef?.key || logEntry.id,
    table: tableName,
    action: effectiveAction,
    recordRef,
    meta: enrichedMeta,
    created: saveResult ? saveResult.created : effectiveAction === 'module:insert',
    deleted: effectiveAction === 'module:delete'
  };
  if (options.includeRecord === true || payload.includeRecord === true) {
    entry.record = deepClone(recordForLog);
  }

  const notice = {
    action: effectiveAction,
    recordRef,
    eventId: logEntry.id,
    sequence: logEntry.sequence,
    version: store.version,
    timestamp,
    created: entry.created === true,
    deleted: entry.deleted === true,
    meta: enrichedMeta
  };

  const ack = {
    type: 'server:ack',
    action: effectiveAction,
    branchId,
    moduleId,
    version: store.version,
    table: tableName,
    recordRef,
    eventId: logEntry.id,
    sequence: logEntry.sequence,
    publishState: logEntry.publishState,
    meta: enrichedMeta,
    entry
  };
  if (entry.created !== undefined) ack.created = entry.created;
  if (entry.deleted) ack.deleted = true;

  const event = {
    type: 'server:event',
    action: effectiveAction,
    branchId,
    moduleId,
    version: store.version,
    table: tableName,
    recordRef,
    eventId: logEntry.id,
    sequence: logEntry.sequence,
    publishState: logEntry.publishState,
    meta: enrichedMeta,
    entry,
    notice
  };

  if (options.includeSnapshot || payload.includeSnapshot) {
    event.snapshot = store.getSnapshot();
  }

  if (client) {
    sendToClient(client, ack);
  }
  if (options.broadcast !== false) {
    // Ensure the originator also receives the canonical mutation event
    broadcastToBranch(branchId, event);
  }
  await broadcastTableNotice(branchId, moduleId, tableName, notice);

  return { ack, event, logEntry, recordRef, notice, record: recordResult, removed: removedRecord };
}

function registerClient(client) {
  clients.set(client.id, client);
  if (!client.branchId) return;
  if (!branchClients.has(client.branchId)) {
    branchClients.set(client.branchId, new Set());
  }
  branchClients.get(client.branchId).add(client.id);
}

function unregisterClient(client) {
  if (!client) return;
  unregisterPubsubSubscriptions(client);
  clients.delete(client.id);
  if (client.branchId && branchClients.has(client.branchId)) {
    const set = branchClients.get(client.branchId);
    set.delete(client.id);
    if (!set.size) branchClients.delete(client.branchId);
  }
}

function sendToClient(client, payload, options = {}) {
  if (!client || !client.ws) return false;
  if (client.ws.readyState !== client.ws.OPEN) return false;
  const { cycle = null, channel = 'direct', binary = false } = options;
  try {
    const serialization = serializeOnce(payload, { cycle, binary });
    const data = serialization.data;
    client.ws.send(data);
    recordWsSerialization(channel, serialization);
    return true;
  } catch (error) {
    logger.warn({ err: error, clientId: client.id }, 'Failed to send message to client');
    return false;
  }
}

function broadcastToBranch(branchId, payload, exceptClient = null) {
  const set = branchClients.get(branchId);
  if (!set) return;
  const cycle = nextBroadcastCycle();
  let delivered = 0;
  for (const clientId of set) {
    const target = clients.get(clientId);
    if (!target) continue;
    if (exceptClient && target.id === exceptClient.id) continue;
    if (sendToClient(target, payload, { cycle, channel: 'branch' })) {
      delivered += 1;
    }
  }
  recordWsBroadcast('branch', delivered);
}

function emitFullSyncDirective(flag, extras = {}) {
  if (!flag) return;
  const payload = {
    type: 'server:directive',
    directive: 'full-sync-flag',
    id: flag.id,
    branchId: flag.branchId,
    moduleId: flag.moduleId,
    enabled: flag.enabled,
    reason: flag.reason || null,
    requestedBy: flag.requestedBy || null,
    updatedAt: flag.updatedAt,
    meta: flag.meta || null,
    ...extras
  };
  if (flag.clearedBy) {
    payload.clearedBy = flag.clearedBy;
  }
  broadcastToBranch(flag.branchId, payload);
}

async function sendSnapshot(client, meta = {}) {
  if (!client.branchId) return;
  const modules = await ensureBranchModules(client.branchId);
  const snapshot = {};
  for (const store of modules) {
    snapshot[store.moduleId] = store.getSnapshot();
  }
  const activeFlags = getActiveFullSyncFlags(client.branchId);
  const flagPayload = activeFlags.map((entry) => serializeFullSyncFlag(entry));
  const metaPayload = { ...meta, serverId: SERVER_ID, branchId: client.branchId };
  if (flagPayload.length) {
    metaPayload.fullSyncRequired = true;
    metaPayload.fullSyncFlags = flagPayload;
  }
  sendToClient(client, {
    type: 'server:snapshot',
    branchId: client.branchId,
    modules: snapshot,
    fullSyncFlags: flagPayload,
    meta: metaPayload
  });
}

async function handleHello(client, payload) {
  const branchId = typeof payload.branchId === 'string' && payload.branchId.trim() ? payload.branchId.trim() : 'lab:test-pad';
  client.branchId = branchId;
  client.role = typeof payload.role === 'string' ? payload.role : 'unknown';
  if (typeof payload.userId === 'string' && payload.userId.trim()) {
    client.userUuid = payload.userId.trim();
  }
  client.status = 'ready';
  registerClient(client);
  await ensureBranchModules(branchId);
  sendServerLog(client, 'info', 'Client registered', { branchId, role: client.role });
  await sendSnapshot(client, { reason: 'initial-sync', requestId: payload.requestId });
}

function sendServerLog(client, level, message, context = {}) {
  sendToClient(client, {
    type: 'server:log',
    level,
    message,
    context,
    ts: nowIso(),
    serverId: SERVER_ID
  });
}

async function handleMessage(client, raw) {
  let payload = raw;
  if (payload instanceof Buffer) payload = payload.toString('utf8');
  if (typeof payload !== 'string') {
    sendServerLog(client, 'warn', 'Received non-string message');
    return;
  }
  const parsed = safeJsonParse(payload);
  if (!parsed || typeof parsed !== 'object') {
    sendServerLog(client, 'warn', 'Received invalid JSON payload', { preview: payload.slice(0, 80) });
    return;
  }
  if (isPubsubFrame(parsed)) {
    await handlePubsubFrame(client, parsed);
    return;
  }
  switch (parsed.type) {
    case 'client:hello':
      await handleHello(client, parsed);
      break;
    case 'client:request:snapshot':
      await sendSnapshot(client, { reason: 'explicit-request', requestId: parsed.requestId });
      break;
    case 'client:request:history':
      await sendSnapshot(client, { reason: 'history-request', requestId: parsed.requestId });
      break;
    case 'client:publish': {
      if (!client.branchId) {
        sendServerLog(client, 'error', 'Client attempted publish before hello handshake');
        return;
      }
      const branchId = client.branchId;
      const moduleId = parsed.moduleId || parsed.module || null;
      if (!moduleId) {
        sendServerLog(client, 'error', 'Module ID missing in publish payload');
        return;
      }
      // 🔍 DEBUG: Log job_order WebSocket events
      const tableName = parsed.table || parsed.tableName;
      if (tableName && tableName.startsWith('job_order_')) {
        console.log(`[WebSocket][client:publish] Received ${tableName}:`, {
          action: parsed.action,
          recordId: parsed.record?.id,
          branchId,
          moduleId
        });
      }
      try {
        await handleModuleEvent(branchId, moduleId, parsed, client, { source: parsed.source || 'ws-client' });
      } catch (error) {
        logger.warn({ err: error, clientId: client.id, branchId, moduleId, table: tableName }, 'Module event failed');
        sendServerLog(client, 'error', error.message || 'Module event failed');
        // 🔍 DEBUG: Log job_order errors
        if (tableName && tableName.startsWith('job_order_')) {
          console.error(`[WebSocket][client:publish] ERROR for ${tableName}:`, error.message);
        }
      }
      break;
    }
    case 'client:query': {
      // ✅ Dynamic read operations with FK population
      if (!client.branchId) {
        sendServerLog(client, 'error', 'Client attempted query before hello handshake');
        return;
      }
      const branchId = client.branchId;
      const moduleId = parsed.moduleId || parsed.module || null;
      if (!moduleId) {
        sendServerLog(client, 'error', 'Module ID missing in query payload');
        return;
      }
      try {
        const store = await ensureModuleStore(branchId, moduleId);
        const tableName = parsed.table || parsed.tableName;
        const queryType = parsed.queryType || 'list'; // 'get' or 'list'
        const populate = parsed.populate !== false; // default: true

        let result = null;

        if (queryType === 'get') {
          // Get single record
          const id = parsed.id || parsed.recordId;
          if (!id) {
            throw new Error('Missing record ID for get query');
          }
          result = store.getRecord(tableName, id, { populate });
        } else {
          // List all records (with optional filter)
          const options = { populate };
          if (parsed.filter && typeof parsed.filter === 'object') {
            // Simple filter support
            options.filter = (record) => {
              for (const [key, value] of Object.entries(parsed.filter)) {
                if (record[key] !== value) return false;
              }
              return true;
            };
          }
          result = store.queryTable(tableName, options);
        }

        // Send result back to client
        client.ws.send(JSON.stringify({
          type: 'server:query:result',
          requestId: parsed.requestId,
          table: tableName,
          queryType,
          result,
          timestamp: nowIso()
        }));
      } catch (error) {
        logger.warn({ err: error, clientId: client.id, branchId, moduleId }, 'Query failed');
        client.ws.send(JSON.stringify({
          type: 'server:query:error',
          requestId: parsed.requestId,
          error: error.message || 'Query failed',
          timestamp: nowIso()
        }));
      }
      break;
    }
    default:
      sendServerLog(client, 'warn', 'Unknown message type', { type: parsed.type });
  }
}

function getConnectionState(client) {
  return {
    id: client.id,
    branchId: client.branchId,
    role: client.role,
    connectedAt: client.connectedAt,
    attempts: client.attempts,
    state: client.state || 'open'
  };
}

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const requestStart = Date.now();
  const isAjax = url.pathname.startsWith('/api/');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': req.headers['access-control-request-headers'] || '*',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-max-age': '600'
    });
    res.end();
    return;
  }
  if (metricsState.enabled) {
    res.on('finish', () => {
      const duration = Date.now() - requestStart;
      recordHttpRequest(req.method, isAjax, duration);
    });
  }
  if (req.method === 'GET' && url.pathname === '/metrics') {
    try {
      const body = await renderMetrics();
      res.writeHead(200, {
        'content-type': 'text/plain; version=0.0.4; charset=utf-8',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
      });
      res.end(body);
    } catch (error) {
      logger.warn({ err: error }, 'Failed to render metrics response');
      res.writeHead(500, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
      });
      res.end(JSON.stringify({ error: 'metrics-unavailable' }));
    }
    return;
  }
  if (await serveStaticAsset(req, res, url)) return;
  if (req.method === 'GET' && url.pathname === '/healthz') {
    jsonResponse(res, 200, { status: 'ok', serverId: SERVER_ID, now: nowIso() });
    return;
  }
  if (url.pathname.startsWith('/api/manage')) {
    const handled = await handleManagementApi(req, res, url);
    if (handled) return;
  }
  if (url.pathname === '/api/schema') {
    if (req.method !== 'GET') {
      jsonResponse(res, 405, { error: 'method-not-allowed' });
      return;
    }
    const branchParam = url.searchParams.get('branch') || url.searchParams.get('branchId') || 'lab:test-pad';
    const branchId = decodeURIComponent(branchParam);
    const requestedModules = collectRequestedModules(url.searchParams);
    const moduleIds = requestedModules.length
      ? requestedModules
      : Object.keys(modulesConfig.modules || {});
    if (!moduleIds.length) {
      jsonResponse(res, 404, { error: 'modules-not-found' });
      return;
    }
    const includeFlags = collectIncludeFlags(url.searchParams);
    const includeSchema = includeFlags.size === 0 || includeFlags.has('schema');
    const includeSeed = includeFlags.has('seed');
    const includeLive = includeFlags.has('live');
    const includeConfig = includeFlags.size === 0 || includeFlags.has('config');
    const payload = { branchId, modules: {} };
    const warnings = [];
    for (const moduleId of moduleIds) {
      const def = modulesConfig.modules?.[moduleId];
      if (!def) {
        warnings.push({ moduleId, warning: 'module-not-defined' });
        continue;
      }
      const entry = {
        moduleId,
        branchId,
        label: def.label || null,
        description: def.description || null,
        tables: Array.isArray(def.tables) ? def.tables.slice() : []
      };
      if (includeConfig) {
        entry.config = { ...def };
      }
      if (includeSchema) {
        const { schema, source } = await loadModuleSchemaSnapshot(branchId, moduleId);
        entry.schema = schema || null;
        entry.schemaSource = source;
        if (!schema) {
          warnings.push({ moduleId, warning: 'schema-not-found' });
        }
      }
      if (includeSeed) {
        const { seed, source } = await loadModuleSeedSnapshot(branchId, moduleId);
        entry.seed = seed || null;
        entry.seedSource = source;
        if (!seed) {
          warnings.push({ moduleId, warning: 'seed-not-found' });
        }
      }
      if (includeLive) {
        const { live, source } = await loadModuleLiveSnapshot(branchId, moduleId);
        entry.live = live || null;
        entry.liveSource = source;
        if (!live) {
          warnings.push({ moduleId, warning: 'live-not-found' });
        }
      }
      payload.modules[moduleId] = entry;
    }
    if (warnings.length) {
      payload.warnings = warnings;
    }
    jsonResponse(res, 200, payload);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/state') {
    const branchParam = url.searchParams.get('branch') || 'lab:test-pad';
    const branchId = decodeURIComponent(branchParam);
    try {
      const snapshot = await buildBranchSnapshot(branchId);
      jsonResponse(res, 200, snapshot);
    } catch (error) {
      logger.warn({ err: error, branchId }, 'Failed to build state response');
      jsonResponse(res, 500, { error: 'state-unavailable', message: error.message });
    }
    return;
  }
  if (url.pathname.startsWith('/api/pos-sync') || url.pathname.startsWith('/api/sync')) {
    const handled = await handleSyncApi(req, res, url);
    if (handled) return;
  }
  if (url.pathname.startsWith('/api/branch/')) {
    const aliasPath = `/api/branches/${url.pathname.slice('/api/branch/'.length)}`.replace(/\/+/g, '/');
    const aliasUrl = new URL(`${aliasPath}${url.search}`, url.origin);
    await handleBranchesApi(req, res, aliasUrl);
    return;
  }
  if (url.pathname.startsWith('/api/branches')) {
    await handleBranchesApi(req, res, url);
    return;
  }

  // Query API - Structured SQL query interface
  if (url.pathname === '/api/query' && req.method === 'POST') {
    const startTime = Date.now();
    try {
      const body = await readBody(req);

      // Validate request
      if (!body.table || typeof body.table !== 'string') {
        jsonResponse(res, 400, { error: 'Missing or invalid "table" field' });
        return;
      }

      // Extract context
      const branchId = body.branchId || body.branch_id || null;
      const moduleId = body.moduleId || body.module_id || null;

      // Build query
      const query = createQuery({ branchId, moduleId }).table(body.table);

      if (body.select && Array.isArray(body.select)) {
        query.select(body.select);
      }

      if (body.where && typeof body.where === 'object') {
        query.where(body.where);
      }

      if (body.orderBy && Array.isArray(body.orderBy)) {
        query.orderBy(body.orderBy);
      }

      if (body.limit !== undefined) {
        query.limit(body.limit);
      }

      if (body.offset !== undefined) {
        query.offset(body.offset);
      }

      // Execute query
      const result = query.execute();

      const duration = Date.now() - startTime;
      recordHttpRequest('POST', true, duration);

      jsonResponse(res, 200, result);
    } catch (error) {
      logger.error({ err: error, url: url.pathname }, 'Query API error');
      const statusCode = error.message.includes('not queryable') ? 403 : 500;
      jsonResponse(res, statusCode, {
        error: error.message,
        type: 'query-error'
      });
    }
    return;
  }

  // Raw SQL Execute API (Admin only - for debugging)
  if (url.pathname === '/api/query/raw' && req.method === 'POST') {
    const startTime = Date.now();
    try {
      const body = await readBody(req);

      if (!body.sql || typeof body.sql !== 'string') {
        jsonResponse(res, 400, { error: 'Missing or invalid "sql" field' });
        return;
      }

      const params = Array.isArray(body.params) ? body.params : [];
      const branchId = body.branchId || body.branch_id || null;
      const moduleId = body.moduleId || body.module_id || null;

      const result = executeRawQuery(body.sql, params, { branchId, moduleId });

      const duration = Date.now() - startTime;
      recordHttpRequest('POST', true, duration);

      jsonResponse(res, 200, result);
    } catch (error) {
      logger.error({ err: error, url: url.pathname }, 'Raw query API error');
      jsonResponse(res, 500, {
        error: error.message,
        type: 'raw-query-error'
      });
    }
    return;
  }

  // Database Schema API
  if (url.pathname === '/api/schema/database' && req.method === 'GET') {
    try {
      const schema = getDatabaseSchema();
      jsonResponse(res, 200, schema);
    } catch (error) {
      logger.error({ err: error }, 'Schema API error');
      jsonResponse(res, 500, {
        error: error.message,
        type: 'schema-error'
      });
    }
    return;
  }

  jsonResponse(res, 404, { error: 'not-found', path: url.pathname });
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  const clientId = createId('client');
  const cookies = parseCookies(req.headers?.cookie || '');
  const cookieUser = typeof cookies.UserUniid === 'string' && cookies.UserUniid.trim() ? cookies.UserUniid.trim() : null;
  const client = {
    id: clientId,
    ws,
    branchId: null,
    role: 'unknown',
    status: 'connecting',
    connectedAt: nowIso(),
    attempts: 0,
    remoteAddress: req.socket?.remoteAddress,
    protocol: 'unknown',
    pubsubTopics: new Set(),
    userUuid: cookieUser || null,
    cookies
  };
  clients.set(client.id, client);
  logger.info({ clientId, address: client.remoteAddress }, 'Client connected');
  sendToClient(client, {
    type: 'server:hello',
    serverId: SERVER_ID,
    now: nowIso(),
    defaults: { branchId: 'lab:test-pad' }
  });
  ws.on('message', (message) => {
    handleMessage(client, message).catch((error) => {
      logger.warn({ err: error, clientId: client.id }, 'Failed to handle message');
    });
  });
  ws.on('close', (code, reason) => {
    unregisterClient(client);
    logger.info({ clientId, code, reason: reason?.toString() }, 'Client disconnected');
  });
  ws.on('error', (error) => {
    logger.warn({ clientId, err: error }, 'WebSocket error');
  });
});

httpServer.listen(PORT, HOST, () => {
  logger.info({ host: HOST, port: PORT, serverId: SERVER_ID }, 'Schema-driven WS server ready');
});
