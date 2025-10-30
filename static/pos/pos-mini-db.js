import { createDBAuto } from '../lib/mishkah.simple-store.js';

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

async function fetchModuleSchema(branchId, moduleId) {
  const params = new URLSearchParams({
    branch: branchId,
    module: moduleId
  });
  const response = await fetch(`/api/schema?${params.toString()}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load schema (${response.status})`);
  }
  const payload = await response.json();
  const moduleEntry = payload?.modules?.[moduleId];
  if (!moduleEntry || !moduleEntry.schema) {
    throw new Error(`Schema for module "${moduleId}" not found in /api/schema response`);
  }
  const schema = normalizeSchemaTables(moduleEntry.schema, moduleEntry);
  return { schema, moduleEntry };
}

export async function createPosDb(options = {}) {
  const branchId = options.branchId || 'dar';
  const moduleId = options.moduleId || 'pos';
  const tables = options.tables || [
    'pos_database',
    'pos_shift',
    'order_header',
    'order_line',
    'order_line_modifier',
    'order_line_status_log',
    'order_payment',
    'order_delivery',
    'order_status_log',
    'job_order_header',
    'job_order_detail',
    'job_order_detail_modifier',
    'job_order_status_history',
    'expo_pass_ticket',
    'kitchen_section',
    'dining_table',
    'table_lock',
    'customer_profile',
    'customer_address'
  ];

  const { schema, moduleEntry } = await fetchModuleSchema(branchId, moduleId);
  const normalizedSchema = normalizeSchemaTables(schema, moduleEntry, tables);
  const tableEntries = Array.isArray(normalizedSchema?.schema?.tables)
    ? normalizedSchema.schema.tables
    : [];

  if (!tableEntries.length) {
    const synthesized = tables
      .map((name) => toTableName(name))
      .filter(Boolean)
      .map((name) => ({ name }));
    if (!normalizedSchema.schema || typeof normalizedSchema.schema !== 'object') {
      normalizedSchema.schema = {};
    }
    normalizedSchema.schema.tables = synthesized;
    normalizedSchema.tables = synthesized;
  } else if (!Array.isArray(normalizedSchema.tables) || normalizedSchema.tables !== tableEntries) {
    normalizedSchema.tables = tableEntries;
  }

  const db = createDBAuto(normalizedSchema, tables, {
    branchId,
    moduleId,
    historyLimit: options.historyLimit || 200,
    role: options.role || 'pos-mini',
    autoReconnect: true,
    logger: options.logger || console
  });
  await db.ready();
  return { db, schema, moduleEntry };
}

export default { createPosDb };
