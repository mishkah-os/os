import { readFile } from 'fs/promises';
import { deepClone, createId, nowIso } from '../utils.js';

function normalizeType(type) {
  if (!type) return 'string';
  const lower = type.toLowerCase();
  if (['char', 'varchar', 'text'].includes(lower)) return 'string';
  if (['integer', 'int', 'smallint', 'bigint'].includes(lower)) return 'integer';
  if (['number', 'numeric', 'decimal', 'float', 'double'].includes(lower)) return 'number';
  if (lower === 'boolean' || lower === 'bool') return 'boolean';
  if (lower === 'json' || lower === 'jsonb' || lower === 'object') return 'json';
  if (lower === 'date') return 'date';
  if (lower === 'time') return 'time';
  if (lower.includes('timestamp') || lower === 'datetime') return 'timestamp';
  return lower;
}

function defaultForType(type, field = {}, context = {}) {
  const normalized = normalizeType(type);
  if (field.defaultValue !== undefined) {
    if (normalized === 'json') return deepClone(field.defaultValue);
    if (normalized === 'number') return Number(field.defaultValue);
    return field.defaultValue;
  }
  switch (normalized) {
    case 'string':
      return field.nullable ? null : '';
    case 'integer':
    case 'number':
      return field.nullable ? null : 0;
    case 'boolean':
      return field.nullable ? null : false;
    case 'json':
      return {};
    case 'timestamp':
      return nowIso();
    case 'date': {
      const now = new Date();
      return now.toISOString().slice(0, 10);
    }
    default:
      return field.nullable ? null : null;
  }
}

export default class SchemaEngine {
  constructor() {
    this.tables = new Map();
  }

  async loadFromFile(filePath) {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    this.registerSchema(parsed);
  }

  registerSchema(schema) {
    if (!schema || typeof schema !== 'object') return;
    const tables = schema?.schema?.tables || [];
    for (const table of tables) {
      if (!table?.name) continue;
      this.tables.set(table.name, table);
    }
  }

  getTable(tableName) {
    const table = this.tables.get(tableName);
    if (!table) {
      throw new Error(`Unknown table: ${tableName}`);
    }
    return table;
  }

  listTables() {
    return Array.from(this.tables.keys());
  }

  createModuleDataset(tableNames = []) {
    const dataset = {};
    for (const tableName of tableNames) {
      dataset[tableName] = [];
    }
    return dataset;
  }

  createRecord(tableName, input = {}, context = {}) {
    const table = this.getTable(tableName);
    const record = {};

    for (const field of table.fields || []) {
      const fieldName = field.name;
      let value = input[fieldName];

      if (value === undefined || value === null || value === '') {
        value = this.generateAutoValue(field, context);
        if (value === undefined) {
          value = defaultForType(field.type, field, context);
        }
      } else {
        value = this.coerceValue(field, value);
      }

      record[fieldName] = value;
    }

    return record;
  }

  generateAutoValue(field, context = {}) {
    const name = field.name;
    const type = normalizeType(field.type);

    if (field.primaryKey) {
      return createId(name || 'rec');
    }

    if (name === 'branchId' && context.branchId) {
      return context.branchId;
    }

    if ((name === 'createdAt' || name === 'updatedAt' || name === 'serverAt' || name.endsWith('At')) && type === 'timestamp') {
      return nowIso();
    }

    if (name === 'clientId' && context.clientId) {
      return context.clientId;
    }

    return undefined;
  }

  coerceValue(field, value) {
    const type = normalizeType(field.type);
    if (value === null || value === undefined) return value;
    switch (type) {
      case 'integer':
      case 'number':
        return Number(value);
      case 'boolean':
        return typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
      case 'json':
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch (_err) {
            return {};
          }
        }
        return deepClone(value);
      default:
        return value;
    }
  }
}
