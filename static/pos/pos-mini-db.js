import { createDBAuto } from '../lib/mishkah.simple-store.js';

const TABLE_ALIAS_GROUPS = {
  pos_database: ['pos_dataset', 'pos_data', 'dataset', 'pos_snapshot'],
  pos_shift: ['pos_shifts', 'shift_header', 'shiftHeaders', 'shifts'],
  order_header: ['order_headers', 'orderHeader', 'order_header_live', 'pos_order_header'],
  order_line: ['order_lines', 'order_line_items', 'orderDetails', 'order_items', 'orderLines'],
  order_line_modifier: ['order_line_modifiers', 'orderModifiers', 'order_line_addons'],
  order_line_status_log: ['order_line_status_history', 'line_status_history'],
  order_status_log: ['order_status_history', 'orderStatusHistory'],
  order_payment: ['order_payments', 'orderPayments', 'payment_transactions'],
  order_delivery: ['order_deliveries', 'deliveries'],
  job_order_header: ['job_order_headers', 'production_order_header'],
  job_order_detail: ['job_order_details', 'jobOrderDetails', 'production_order_detail'],
  job_order_detail_modifier: ['job_order_modifiers', 'jobOrderModifiers'],
  job_order_status_history: ['job_order_status_log', 'jobStatusHistory'],
  expo_pass_ticket: ['expo_pass_tickets', 'expo_tickets', 'expoPassTickets'],
  menu_item: ['menu_items', 'menuItems', 'menuItem', 'items'],
  menu_category: ['menu_categories', 'menuCategories', 'menuCategory', 'categories'],
  kitchen_section: ['kitchen_sections', 'kitchenStations'],
  dining_table: ['dining_tables', 'restaurant_tables', 'tables'],
  table_lock: ['table_locks', 'locks', 'tableLocks'],
  customer_profile: ['customer_profiles', 'customers', 'customerProfiles'],
  customer_address: ['customer_addresses', 'addresses', 'customerAddresses']
};

const DEFAULT_TABLES = [
    'pos_database',
    'employees',
    'order_types',
    'order_statuses',
    'order_stages',
    'order_payment_states',
    'order_line_statuses',
    'payment_methods',
    'menu_category',
    'category_sections',
    'menu_item',
    'kitchen_sections',
    'dining_table',
    'tableLocks',
    'auditEvents',
    'settings',
    'shift_settings',
    'removals',
    'stores'
  ];

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function toTableName(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    const name = entry.trim();
    return name.length ? name : null;
  }
  if (typeof entry === 'object') {
    const name =
      entry.name ||
      entry.table ||
      entry.tableName ||
      entry.sqlName ||
      entry.id ||
      null;
    return name ? String(name).trim() : null;
  }
  return null;
}

function cloneValue(value) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (_err) {
      // fall through
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_err) {
    if (Array.isArray(value)) return value.map(cloneValue);
    const out = {};
    for (const key of Object.keys(value)) out[key] = cloneValue(value[key]);
    return out;
  }
}

function extractRows(source) {
  if (Array.isArray(source)) return source.slice();
  if (!source || typeof source !== 'object') return [];
  if (Array.isArray(source.rows)) return source.rows.slice();
  if (Array.isArray(source.list)) return source.list.slice();
  if (Array.isArray(source.items)) return source.items.slice();
  if (Array.isArray(source.data)) return source.data.slice();
  if (Array.isArray(source.values)) return source.values.slice();
  if (Array.isArray(source.records)) return source.records.slice();
  return [];
}

function normalizeSchemaTables(schema, moduleEntry, requiredTables = []) {
  if (!schema || typeof schema !== 'object') return schema;
  const schemaContainer = schema.schema && typeof schema.schema === 'object' ? schema.schema : {};
  const existing = ensureArray(schemaContainer.tables);
  const normalizedMap = new Map();

  for (const entry of existing) {
    if (entry && typeof entry === 'object') {
      const key = toTableName(entry);
      if (key && !normalizedMap.has(key)) {
        normalizedMap.set(key, entry);
      }
      continue;
    }
    const fallbackName = toTableName(entry);
    if (fallbackName && !normalizedMap.has(fallbackName)) {
      normalizedMap.set(fallbackName, { name: fallbackName });
    }
  }

  const registerName = (name) => {
    const key = toTableName(name);
    if (!key || normalizedMap.has(key)) return;
    normalizedMap.set(key, { name: key });
  };

  ensureArray(schema.tables).forEach(registerName);
  ensureArray(moduleEntry?.tables).forEach(registerName);
  ensureArray(requiredTables).forEach(registerName);

  if (!normalizedMap.size) {
    return schema;
  }

  const nextTables = Array.from(normalizedMap.values());
  if (existing.length === nextTables.length && existing.every((entry, idx) => entry === nextTables[idx])) {
    return schema;
  }

  schema.schema = schemaContainer;
  schema.schema.tables = nextTables;
  if (!Array.isArray(schema.tables) || schema.tables !== nextTables) {
    schema.tables = nextTables;
  }
  return schema;
}

function buildAliasRegistry(schemaTables = []) {
  const registry = new Map();
  const register = (canonical, alias) => {
    if (!canonical || !alias) return;
    const key = String(alias).trim().toLowerCase();
    if (!key) return;
    registry.set(key, canonical);
  };
  for (const [canonical, aliases] of Object.entries(TABLE_ALIAS_GROUPS)) {
    register(canonical, canonical);
    ensureArray(aliases).forEach((alias) => register(canonical, alias));
  }
  schemaTables.forEach((entry) => {
    const canonical = toTableName(entry);
    if (!canonical) return;
    register(canonical, canonical);
    register(canonical, entry?.table);
    register(canonical, entry?.tableName);
    register(canonical, entry?.sqlName);
    ensureArray(entry?.aliases).forEach((alias) => register(canonical, alias));
    ensureArray(entry?.synonyms).forEach((alias) => register(canonical, alias));
  });
  return registry;
}

function canonicalizeTableName(name, registry) {
  if (name == null) return null;
  const text = String(name).trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (registry.has(lower)) return registry.get(lower);
  return text;
}

async function fetchJson(url, { cache = 'no-store' } = {}) {
  const response = await fetch(url, { cache });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

async function fetchModuleSchemaRemote(branchId, moduleId) {
  const params = new URLSearchParams({
    branch: branchId,
    module: moduleId
  });
  const payload = await fetchJson(`/api/schema?${params.toString()}`);
  const moduleEntry = payload?.modules?.[moduleId];
  if (!moduleEntry || !moduleEntry.schema) {
    throw new Error(`Schema for module "${moduleId}" not found in /api/schema response`);
  }
  return { schema: moduleEntry.schema, moduleEntry };
}

async function fetchModuleSchemaLocal(branchId, moduleId) {
  const basePath = `/data/branches/${encodeURIComponent(branchId)}/modules/${encodeURIComponent(moduleId)}`;
  const schemaUrl = `${basePath}/schema/definition.json`;
  const schema = await fetchJson(schemaUrl);
  const moduleEntry = {
    id: moduleId,
    moduleId,
    branchId,
    schema,
    tables: schema?.schema?.tables || schema?.tables || []
  };
  return { schema, moduleEntry };
}

async function fetchModuleDataset(branchId, moduleId) {
  const basePath = `/data/branches/${encodeURIComponent(branchId)}/modules/${encodeURIComponent(moduleId)}`;
  const candidates = [`${basePath}/live/data.json`, `${basePath}/seeds/initial.json`];
  for (const url of candidates) {
    try {
      return await fetchJson(url);
    } catch (_err) {
      // try next candidate
    }
  }
  return null;
}

function createOfflineStore({ branchId, moduleId, schema, tables, meta, logger, role = 'pos-mini-offline' }) {
  const schemaTables = Array.isArray(schema?.schema?.tables)
    ? schema.schema.tables
    : Array.isArray(schema?.tables)
    ? schema.tables
    : [];
  const aliasRegistry = buildAliasRegistry(schemaTables);
  const tableData = new Map();
  const rawTables = tables && typeof tables === 'object' ? tables : {};

  const pushTable = (key, rows) => {
    const canonical = canonicalizeTableName(key, aliasRegistry) || key;
    tableData.set(canonical, ensureArray(rows).map(cloneValue));
  };

  for (const [key, value] of Object.entries(rawTables)) {
    pushTable(key, extractRows(value));
  }

  schemaTables.forEach((entry) => {
    const canonical = toTableName(entry);
    if (!canonical) return;
    if (!tableData.has(canonical)) {
      tableData.set(canonical, []);
    }
  });

  const config = {
    branchId,
    moduleId,
    role,
    historyLimit: 0,
    autoConnect: false,
    logger: logger || console,
    objects: {}
  };

  const definitions = new Map();
  const watchers = new Map();
  const statusWatchers = new Set();
  let status = 'ready';

  const emitStatus = () => {
    for (const handler of Array.from(statusWatchers)) {
      try {
        handler({ status });
      } catch (error) {
        config.logger?.warn?.('[PosMiniDB][offline] status listener failed', error);
      }
    }
  };

  const resolveTableName = (name, hint) => {
    const preferred = hint || name;
    const canonical = canonicalizeTableName(preferred, aliasRegistry);
    if (canonical && tableData.has(canonical)) return canonical;
    if (canonical && !tableData.has(canonical)) {
      tableData.set(canonical, []);
      return canonical;
    }
    const lower = String(preferred || '').trim().toLowerCase();
    if (lower) {
      for (const key of tableData.keys()) {
        if (key.toLowerCase() === lower) return key;
      }
    }
    const fallback = preferred || name;
    if (!tableData.has(fallback)) tableData.set(fallback, []);
    return fallback;
  };

  const ensureDefinition = (name, options = {}) => {
    if (definitions.has(name)) return definitions.get(name);
    const table = resolveTableName(name, options.table || options.tableName || options.sqlName);
    const def = { name, table };
    definitions.set(name, def);
    config.objects[name] = { table };
    if (!watchers.has(name)) watchers.set(name, new Set());
    return def;
  };

  const emit = (name) => {
    const def = ensureDefinition(name);
    const rows = tableData.get(def.table) || [];
    const payload = rows.map(cloneValue);
    const set = watchers.get(name);
    if (!set || !set.size) return;
    for (const handler of Array.from(set)) {
      try {
        handler(payload.map(cloneValue), { table: def.table });
      } catch (error) {
        config.logger?.warn?.('[PosMiniDB][offline] watcher failed', error);
      }
    }
  };

  const api = {
    config,
    meta: meta || {},
    register(name, options = {}) {
      ensureDefinition(name, options);
      emit(name);
      return api;
    },
    watch(name, handler, { immediate = true } = {}) {
      if (typeof handler !== 'function') return () => {};
      ensureDefinition(name);
      const set = watchers.get(name);
      set.add(handler);
      if (immediate) {
        const def = definitions.get(name);
        const rows = tableData.get(def.table) || [];
        handler(rows.map(cloneValue), { table: def.table });
      }
      return () => {
        const target = watchers.get(name);
        if (!target) return;
        target.delete(handler);
        if (!target.size) watchers.delete(name);
      };
    },
    status(handler) {
      if (typeof handler !== 'function') return () => {};
      statusWatchers.add(handler);
      handler({ status });
      return () => statusWatchers.delete(handler);
    },
    ready() {
      return Promise.resolve({ status });
    },
    async connect() {
      status = 'ready';
      emitStatus();
      return { status };
    },
    disconnect() {
      status = 'closed';
      emitStatus();
    },
    list(name) {
      ensureDefinition(name);
      const def = definitions.get(name);
      const rows = tableData.get(def.table) || [];
      return rows.map(cloneValue);
    },
    snapshot() {
      const tablesSnapshot = {};
      for (const [key, rows] of tableData.entries()) {
        tablesSnapshot[key] = rows.map(cloneValue);
      }
      return {
        branchId,
        moduleId,
        tables: tablesSnapshot,
        meta: meta || {}
      };
    }
  };

  api.store = api;
  return api;
}

function normalizeSchemaPayload(schema, moduleEntry, tables) {
  const normalized = normalizeSchemaTables(schema, moduleEntry, tables);
  const tableEntries = Array.isArray(normalized?.schema?.tables)
    ? normalized.schema.tables
    : [];
  if (!tableEntries.length) {
    const synthesized = tables
      .map((name) => toTableName(name))
      .filter(Boolean)
      .map((name) => ({ name }));
    if (!normalized.schema || typeof normalized.schema !== 'object') {
      normalized.schema = {};
    }
    normalized.schema.tables = synthesized;
    normalized.tables = synthesized;
  } else if (!Array.isArray(normalized.tables) || normalized.tables !== tableEntries) {
    normalized.tables = tableEntries;
  }
  return normalized;
}

async function createRemotePosDb({ branchId, moduleId, tables, logger, role, historyLimit }) {
  const { schema, moduleEntry } = await fetchModuleSchemaRemote(branchId, moduleId);
  const normalizedSchema = normalizeSchemaPayload(schema, moduleEntry, tables);
  const db = createDBAuto(normalizedSchema, tables, {
    branchId,
    moduleId,
    historyLimit: historyLimit || 200,
    role: role || 'pos-mini',
    autoReconnect: true,
    logger: logger || console
  });
  await db.ready();
  return { db, schema: normalizedSchema, moduleEntry };
}

async function createOfflinePosDb({ branchId, moduleId, tables, logger, role }, cause) {
  const schemaPayload = await fetchModuleSchemaLocal(branchId, moduleId);
  const normalizedSchema = normalizeSchemaPayload(schemaPayload.schema, schemaPayload.moduleEntry, tables);
  const dataset = await fetchModuleDataset(branchId, moduleId);
  const offlineDb = createOfflineStore({
    branchId,
    moduleId,
    schema: normalizedSchema,
    tables: dataset?.tables || {},
    meta: dataset?.meta || {},
    logger,
    role
  });
  if (cause) {
    offlineDb.remoteError = cause;
  }
  return {
    db: offlineDb,
    schema: normalizedSchema,
    moduleEntry: schemaPayload.moduleEntry
  };
}

export async function createPosDb(options = {}) {
  const branchId = options.branchId || 'dar';
  const moduleId = options.moduleId || 'pos';
  const tables = options.tables || DEFAULT_TABLES;
  try {
    return await createRemotePosDb({
      branchId,
      moduleId,
      tables,
      logger: options.logger,
      role: options.role,
      historyLimit: options.historyLimit
    });
  } catch (error) {
    const logger = options.logger || console;
    logger?.warn?.('[PosMiniDB] Falling back to offline dataset', error);
    return await createOfflinePosDb(
      { branchId, moduleId, tables, logger, role: options.role || 'pos-mini-offline' },
      error
    );
  }
}

export default { createPosDb };
