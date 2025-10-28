/**
 * Mishkah Realtime Simple DSL
 *
 * Tiny layer on top of mishkah.store.js for ultra-minimal usage.
 * Example:
 *   import { createDB } from './mishkah.simple-store.js';
 *   const db = createDB({
 *     branchId: 'lab:test-pad',
 *     moduleId: 'scratchpad',
 *     objects: {
 *       notes: {
 *         table: 'scratchpad_entry',
 *         toRecord: (value, ctx) => ctx.ensure({
 *           id: ctx.uuid('note'),
 *           clientUuid: ctx.uuid('client'),
 *           note: typeof value === 'string' ? value : value?.note,
 *           payload: {
 *             note: typeof value === 'string' ? value : value?.note,
 *             source: value?.source || 'dsl',
 *             createdAt: ctx.now()
 *           },
 *           createdAt: ctx.now(),
 *           serverAt: ctx.now()
 *         }),
 *         fromRecord: (record) => ({
 *           id: record.id,
 *           note: record.note,
 *           payload: record.payload,
 *           createdAt: record.createdAt,
 *           serverAt: record.serverAt,
 *           clientUuid: record.clientUuid
 *         })
 *       }
 *     }
 *   });
 *   await db.connect();
 *   await db.store('notes', 'hello world');
 *   db.watch('notes', (list) => console.log(list));
 */

import { createStore } from './mishkah.store.js';

const noop = () => {};
const nowIso = () => new Date().toISOString();
const enqueueMicrotask =
  typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (fn) => Promise.resolve().then(fn);

function clone(value) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (_err) {
      /* fall through */
    }
  }
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeDefinition(name, def, baseContext) {
  const normalized = {
    name,
    table: def?.table || name,
    moduleId: def?.moduleId || baseContext.moduleId,
    idPrefix: def?.idPrefix || def?.prefix || 'rec',
    defaults: clone(def?.defaults) || {},
    meta: def?.meta || {}
  };

  normalized.fromRecord =
    typeof def?.fromRecord === 'function'
      ? def.fromRecord
      : (record) => clone(record);

  normalized.toRecord =
    typeof def?.toRecord === 'function'
      ? def.toRecord
      : (value, ctx) => {
          let record;
          if (value == null) {
            record = {};
          } else if (typeof value === 'object' && !Array.isArray(value)) {
            record = { ...value };
          } else {
            record = { value };
          }
          if (!record.id) record.id = ctx.uuid(normalized.idPrefix);
          if (!record.branchId) record.branchId = ctx.branchId;
          if (!record.createdAt) record.createdAt = ctx.now();
          if (!record.serverAt) record.serverAt = ctx.now();
          return ctx.ensure(record);
        };

  normalized.ensure =
    typeof def?.ensure === 'function'
      ? def.ensure
      : (record) => Object.assign({}, normalized.defaults, record);

  return normalized;
}

function createContext(store, config) {
  return {
    branchId: config.branchId,
    moduleId: config.moduleId,
    now: nowIso,
    uuid: (prefix = 'rec') => store.uuid(prefix),
    ensure: (record) => {
      const base = { branchId: config.branchId };
      return { ...base, ...record };
    }
  };
}

export function createDB(options = {}) {
  const config = {
    branchId: options.branchId || 'lab:test-pad',
    moduleId: options.moduleId || 'pos',
    role: options.role || 'ws2-simple',
    historyLimit: Number.isFinite(options.historyLimit) ? options.historyLimit : 50,
    autoConnect: options.autoConnect !== false,
    logger: options.logger || console
  };

  const store = createStore({
    branchId: config.branchId,
    moduleId: config.moduleId,
    role: config.role,
    historyLimit: config.historyLimit,
    autoReconnect: options.autoReconnect !== false,
    logger: config.logger,
    wsUrl: options.wsUrl,
    wsPath: options.wsPath
  });

  const baseCtx = createContext(store, config);
  const definitions = new Map();
  const tableIndex = new Map();
  const watchers = new Map();
  const statusWatchers = new Set();
  const cache = new Map();

  function indexDefinition(def) {
    const key = `${def.moduleId}::${def.table}`;
    if (!tableIndex.has(key)) {
      tableIndex.set(key, new Set());
    }
    tableIndex.get(key).add(def.name);
  }

  let api = null;

  function register(name, defOptions = {}) {
    const normalized = normalizeDefinition(name, defOptions, config);
    definitions.set(name, normalized);
    indexDefinition(normalized);
    if (!watchers.has(name)) watchers.set(name, new Set());
    cache.set(name, []);
    emit(name);
    return api;
  }

  function emit(name) {
    const def = definitions.get(name);
    if (!def) return;
    const tables = store.tables(def.moduleId);
    const rows = Array.isArray(tables?.[def.table]) ? tables[def.table] : [];
    const plain = rows.map((row) => def.fromRecord(row, baseCtx));
    cache.set(name, plain);
    const subs = watchers.get(name);
    if (!subs || !subs.size) return;
    for (const handler of Array.from(subs)) {
      try {
        handler(clone(plain), { rows: clone(rows), table: def.table });
      } catch (error) {
        config.logger?.warn?.('[MishkahSimpleDB] watcher failed', error);
      }
    }
  }

  function emitAll() {
    for (const name of definitions.keys()) {
      emit(name);
    }
  }

  function emitStatus(status) {
    for (const handler of Array.from(statusWatchers)) {
      try {
        handler(status);
      } catch (error) {
        config.logger?.warn?.('[MishkahSimpleDB] status listener failed', error);
      }
    }
  }

  if (options.objects && typeof options.objects === 'object') {
    for (const [name, def] of Object.entries(options.objects)) {
      register(name, def);
    }
  }

  store.on('snapshot', () => {
    emitAll();
  });

  store.on('event', (payload) => {
    if (!payload) return;
    const key = `${payload.moduleId || config.moduleId}::${payload.table}`;
    const targets = tableIndex.get(key);
    if (!targets) return;
    for (const name of targets) {
      emit(name);
    }
  });

  store.on('status', (payload) => {
    emitStatus(payload?.status || 'idle');
  });

  api = {
    config,
    store,
    register,
    async connect() {
      await store.connect();
      return store.ready();
    },
    disconnect() {
      store.disconnect();
    },
    ready() {
      return store.ready();
    },
    status(handler) {
      if (typeof handler !== 'function') return noop;
      statusWatchers.add(handler);
      return () => statusWatchers.delete(handler);
    },
    watch(name, handler, { immediate = true } = {}) {
      if (typeof handler !== 'function') return noop;
      if (!definitions.has(name)) {
        register(name);
      }
      const set = watchers.get(name) || new Set();
      set.add(handler);
      watchers.set(name, set);
      if (immediate) {
        const current = cache.get(name) || [];
        handler(clone(current), { table: definitions.get(name)?.table || name });
      }
      return () => {
        const target = watchers.get(name);
        if (!target) return;
        target.delete(handler);
        if (!target.size) watchers.delete(name);
      };
    },
    list(name) {
      return clone(cache.get(name) || []);
    },
    async insert(name, value, meta = {}) {
      if (!definitions.has(name)) {
        register(name);
      }
      const def = definitions.get(name);
      const ensureRecord = (record) => {
        const withBranch = baseCtx.ensure(record);
        return def.ensure(withBranch, baseCtx);
      };
      const ctx = {
        ...baseCtx,
        ensure: ensureRecord
      };
      const record = def.toRecord(value, ctx);
      const enriched = ensureRecord(record);
      return store.insert(def.table, enriched, meta);
    },
    async update(name, value, meta = {}) {
      if (!definitions.has(name)) register(name);
      const def = definitions.get(name);
      const ensureRecord = (record) => {
        const withBranch = baseCtx.ensure(record);
        return def.ensure(withBranch, baseCtx);
      };
      const ctx = {
        ...baseCtx,
        ensure: ensureRecord
      };
      const record = def.toRecord(value, ctx);
      const enriched = ensureRecord(record);
      return store.merge(def.table, enriched, meta);
    },
    async delete(name, recordRef, meta = {}) {
      if (!definitions.has(name)) register(name);
      const def = definitions.get(name);
      return store.remove(def.table, recordRef, meta);
    }
  };

  if (config.autoConnect) {
    enqueueMicrotask(() => {
      api.connect().catch((error) => {
        config.logger?.error?.('[MishkahSimpleDB] auto connect failed', error);
      });
    });
  }

  return api;
}

function normalizeSchemaTables(schema) {
  if (!schema || typeof schema !== 'object') return [];
  if (Array.isArray(schema.tables) && schema.tables.length) return schema.tables;
  if (schema.schema && Array.isArray(schema.schema.tables)) return schema.schema.tables;
  return [];
}

function buildTableIndex(tables = []) {
  const index = new Map();
  for (const table of tables) {
    if (!table || typeof table !== 'object') continue;
    const names = new Set();
    if (table.name) names.add(String(table.name));
    if (table.tableName) names.add(String(table.tableName));
    if (table.sqlName) names.add(String(table.sqlName));
    if (table.id) names.add(String(table.id));
    for (const key of names) {
      if (!index.has(key)) index.set(key, table);
    }
  }
  return index;
}

function normalizeAutoEntry(entry) {
  if (typeof entry === 'string') {
    const name = entry.trim();
    return name ? { name, table: name } : null;
  }
  if (entry && typeof entry === 'object') {
    const name =
      entry.name ||
      entry.object ||
      entry.alias ||
      entry.key ||
      entry.table ||
      entry.sqlName ||
      entry.tableName ||
      null;
    if (!name) return null;
    const table =
      entry.table ||
      entry.tableName ||
      entry.sqlName ||
      entry.name ||
      entry.object ||
      name;
    return { name: String(name), table: String(table) };
  }
  return null;
}

export function createDBAuto(schema, entries = [], options = {}) {
  const tables = normalizeSchemaTables(schema);
  const index = buildTableIndex(tables);
  const selection =
    Array.isArray(entries) && entries.length
      ? entries
      : tables.map((table) => table && table.name).filter(Boolean);

  const objects = { ...(options.objects || {}) };
  for (const raw of selection) {
    const info = normalizeAutoEntry(raw);
    if (!info) continue;
    if (objects[info.name]) continue;
    let tableEntry = index.get(info.table);
    if (!tableEntry && index.has(info.name)) {
      tableEntry = index.get(info.name);
    }
    if (!tableEntry) {
      throw new Error(`[createDBAuto] Table "${info.table}" not found in schema.`);
    }
    const resolvedTableName = tableEntry.name || tableEntry.tableName || tableEntry.sqlName || info.table;
    objects[info.name] = { table: resolvedTableName };
  }

  const config = {
    ...options,
    objects
  };
  return createDB(config);
}

export default { createDB, createDBAuto };
