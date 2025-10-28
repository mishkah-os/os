import { createDBAuto } from '../lib/mishkah.simple-store.js';

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
  return { schema: moduleEntry.schema, moduleEntry };
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
  const db = createDBAuto(schema, tables, {
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
