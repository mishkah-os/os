import { deepClone, nowIso } from './utils.js';

export default class ModuleStore {
  constructor(schemaEngine, branchId, moduleId, definition = {}, seed = {}, seedData = null) {
    this.schemaEngine = schemaEngine;
    this.branchId = branchId;
    this.moduleId = moduleId;
    this.definition = definition || {};
    this.tables = Array.isArray(definition.tables) ? definition.tables.slice() : [];
    this.version = Number(seed.version || 1);
    this.meta = deepClone(seed.meta || {});
    if (!this.meta.lastUpdatedAt) this.meta.lastUpdatedAt = nowIso();
    if (typeof this.meta.counter !== 'number') this.meta.counter = 0;
    if (typeof this.meta.labCounter !== 'number') this.meta.labCounter = this.meta.counter;
    this.primaryKeyCache = new Map();
    this.seedData = seedData ? deepClone(seedData) : null;

    const seedTables = seed.tables || {};
    this.data = schemaEngine.createModuleDataset(this.tables);
    for (const tableName of this.tables) {
      const records = Array.isArray(seedTables[tableName]) ? seedTables[tableName].map((entry) => deepClone(entry)) : [];
      this.data[tableName] = records;
    }

    if (this.seedData) {
      this.applySeed(this.seedData, { reason: 'initial-seed' });
    }
  }

  ensureTable(tableName) {
    if (!this.tables.includes(tableName)) {
      throw new Error(`Table "${tableName}" not registered in module "${this.moduleId}"`);
    }
  }

  getSnapshot() {
    return {
      moduleId: this.moduleId,
      branchId: this.branchId,
      version: this.version,
      tables: deepClone(this.data),
      meta: deepClone(this.meta)
    };
  }

  listTable(tableName) {
    this.ensureTable(tableName);
    return this.data[tableName].map((entry) => deepClone(entry));
  }

  insert(tableName, record = {}, context = {}) {
    this.ensureTable(tableName);
    const enrichedContext = { branchId: this.branchId, ...context };
    const created = this.schemaEngine.createRecord(tableName, record, enrichedContext);
    this.data[tableName].push(created);
    this.version += 1;
    this.touchMeta({ increment: 1 });
    return deepClone(created);
  }

  resolvePrimaryKeyFields(tableName) {
    if (this.primaryKeyCache.has(tableName)) {
      return this.primaryKeyCache.get(tableName);
    }
    let fields = [];
    try {
      const table = this.schemaEngine.getTable(tableName);
      fields = Array.isArray(table?.fields)
        ? table.fields.filter((field) => field && field.primaryKey).map((field) => field.name)
        : [];
      if (!fields.length) {
        const hasId = Array.isArray(table?.fields) && table.fields.find((field) => field && field.name === 'id');
        if (hasId) {
          fields = ['id'];
        }
      }
      if (!fields.length && Array.isArray(table?.fields) && table.fields.length) {
        fields = [table.fields[0].name];
      }
    } catch (_err) {
      fields = ['id'];
    }
    if (!fields.length) {
      fields = ['id'];
    }
    this.primaryKeyCache.set(tableName, fields);
    return fields;
  }

  resolveRecordKey(tableName, input = {}, { require = false } = {}) {
    const fields = this.resolvePrimaryKeyFields(tableName);
    const primary = {};
    for (const name of fields) {
      const value = input?.[name];
      if (value === undefined || value === null || value === '') {
        if (require) {
          throw new Error(`Missing primary key field "${name}" for table "${tableName}"`);
        }
        return { key: null, fields, primary };
      }
      primary[name] = value;
    }
    const key = fields.map((name) => String(primary[name])).join('::');
    return { key, fields, primary };
  }

  findRecordIndex(tableName, key) {
    if (!key) return -1;
    const rows = Array.isArray(this.data[tableName]) ? this.data[tableName] : [];
    for (let idx = 0; idx < rows.length; idx += 1) {
      const candidateKey = this.resolveRecordKey(tableName, rows[idx], { require: false }).key;
      if (candidateKey === key) {
        return idx;
      }
    }
    return -1;
  }

  touchMeta(options = {}) {
    const increment = Number(options.increment) || 0;
    this.meta.lastUpdatedAt = nowIso();
    if (increment) {
      this.meta.counter = (this.meta.counter || 0) + increment;
    }
    if (options.recount === true) {
      const total = Object.values(this.data || {}).reduce((acc, value) => {
        if (Array.isArray(value)) return acc + value.length;
        return acc;
      }, 0);
      this.meta.counter = total;
      if ('labCounter' in this.meta) {
        this.meta.labCounter = total;
      }
    } else if (increment && 'labCounter' in this.meta) {
      this.meta.labCounter = (this.meta.labCounter || 0) + increment;
    }
  }

  updateRecord(tableName, patch = {}, context = {}) {
    if (!patch || typeof patch !== 'object') {
      throw new Error('Update payload must be an object.');
    }
    this.ensureTable(tableName);
    const { key } = this.resolveRecordKey(tableName, patch, { require: true });
    const index = this.findRecordIndex(tableName, key);
    if (index < 0) {
      throw new Error(`Record not found in table "${tableName}".`);
    }
    const tableDef = this.schemaEngine.getTable(tableName);
    const current = this.data[tableName][index];
    const next = { ...current };
    for (const field of tableDef.fields || []) {
      const fieldName = field.name;
      if (!Object.prototype.hasOwnProperty.call(patch, fieldName)) continue;
      const value = patch[fieldName];
      if (value === undefined) continue;
      next[fieldName] = this.schemaEngine.coerceValue(field, value);
    }
    const hasUpdatedAt = Array.isArray(tableDef.fields) && tableDef.fields.some((field) => field.name === 'updatedAt');
    if (hasUpdatedAt && !Object.prototype.hasOwnProperty.call(patch, 'updatedAt')) {
      next.updatedAt = nowIso();
    }
    this.data[tableName][index] = next;
    this.version += 1;
    this.touchMeta();
    return deepClone(next);
  }

  merge(tableName, patch = {}, context = {}) {
    return this.updateRecord(tableName, patch, context);
  }

  save(tableName, record = {}, context = {}) {
    const { key } = this.resolveRecordKey(tableName, record, { require: false });
    if (!key) {
      const created = this.insert(tableName, record, context);
      return { record: created, created: true };
    }
    const index = this.findRecordIndex(tableName, key);
    if (index < 0) {
      const created = this.insert(tableName, record, context);
      return { record: created, created: true };
    }
    const updated = this.updateRecord(tableName, record, context);
    return { record: updated, created: false };
  }

  remove(tableName, criteria = {}, context = {}) {
    this.ensureTable(tableName);
    const { key } = this.resolveRecordKey(tableName, criteria, { require: true });
    const index = this.findRecordIndex(tableName, key);
    if (index < 0) {
      throw new Error(`Record not found in table "${tableName}".`);
    }
    const [removed] = this.data[tableName].splice(index, 1);
    this.version += 1;
    this.touchMeta({ recount: true });
    return { record: deepClone(removed), context };
  }

  getRecordReference(tableName, record = {}) {
    const { key, fields, primary } = this.resolveRecordKey(tableName, record, { require: false });
    const ref = {
      table: tableName,
      key,
      primaryKey: { ...primary }
    };
    if (record && record.id !== undefined) {
      ref.id = record.id;
    }
    if (record && record.uuid !== undefined) {
      ref.uuid = record.uuid;
    }
    if (record && record.uid !== undefined) {
      ref.uid = record.uid;
    }
    if (!key && fields && fields.length === 1) {
      const fieldName = fields[0];
      if (record && record[fieldName] !== undefined) {
        ref.key = String(record[fieldName]);
      }
    }
    return ref;
  }

  replaceTablesFromSnapshot(snapshot = {}, context = {}) {
    if (!snapshot || typeof snapshot !== 'object') return this.getSnapshot();
    const tables = snapshot.tables && typeof snapshot.tables === 'object' ? snapshot.tables : {};
    for (const tableName of this.tables) {
      const incomingRows = Array.isArray(tables[tableName]) ? tables[tableName] : [];
      let tableDefinition = null;
      try {
        tableDefinition = this.schemaEngine.getTable(tableName);
      } catch (_err) {
        tableDefinition = null;
      }
      const primaryFields = Array.isArray(tableDefinition?.fields)
        ? tableDefinition.fields.filter((field) => field && field.primaryKey).map((field) => field.name)
        : [];
      const buildKey = (record) => {
        if (!primaryFields.length || !record || typeof record !== 'object') return null;
        const parts = [];
        for (const fieldName of primaryFields) {
          const value = record[fieldName];
          if (value === undefined || value === null) {
            return null;
          }
          parts.push(String(value));
        }
        return parts.join('::');
      };
      const keyed = new Map();
      const fallback = new Map();
      for (const rawRow of incomingRows) {
        if (!rawRow || typeof rawRow !== 'object') continue;
        const row = deepClone(rawRow);
        const key = buildKey(row);
        if (key) {
          keyed.set(key, row);
          continue;
        }
        let serialized = null;
        try {
          serialized = JSON.stringify(row);
        } catch (_err) {
          serialized = null;
        }
        const fallbackKey = serialized || `row:${fallback.size + keyed.size}`;
        fallback.set(fallbackKey, row);
      }
      this.data[tableName] = [...keyed.values(), ...fallback.values()];
    }
    const total = Object.values(this.data).reduce((acc, value) => {
      if (Array.isArray(value)) return acc + value.length;
      return acc;
    }, 0);
    const providedVersion = Number(snapshot.version);
    this.version = Number.isFinite(providedVersion) ? providedVersion : this.version + 1;
    const incomingMeta = snapshot.meta && typeof snapshot.meta === 'object' ? deepClone(snapshot.meta) : {};
    const nextMeta = { ...deepClone(this.meta || {}), ...incomingMeta };
    nextMeta.branchId = this.branchId;
    nextMeta.moduleId = this.moduleId;
    nextMeta.lastUpdatedAt = nowIso();
    nextMeta.counter = total;
    if ('labCounter' in nextMeta) {
      nextMeta.labCounter = total;
    } else if (typeof nextMeta.labCounter !== 'number') {
      nextMeta.labCounter = total;
    }
    this.meta = nextMeta;
    return this.getSnapshot();
  }

  reset() {
    this.version = 1;
    this.meta = {
      counter: 0,
      labCounter: 0,
      lastUpdatedAt: nowIso()
    };
    const dataset = this.schemaEngine.createModuleDataset(this.tables);
    this.data = dataset;
    if (this.seedData) {
      this.applySeed(this.seedData, { reason: 'reset-seed' });
    }
  }

  applySeed(seed, context = {}) {
    if (!seed || typeof seed !== 'object') return;
    const tables = seed.tables || {};
    let applied = false;
    for (const tableName of this.tables) {
      const rows = Array.isArray(tables[tableName]) ? tables[tableName] : [];
      if (!rows.length) continue;
      const target = this.data[tableName];
      if (target.length) continue;
      rows.forEach((row) => {
        const record = this.schemaEngine.createRecord(tableName, row, { branchId: this.branchId, ...context });
        target.push(record);
        this.meta.counter = (this.meta.counter || 0) + 1;
        this.meta.labCounter = this.meta.counter;
      });
      applied = true;
    }
    if (applied) {
      this.meta.lastUpdatedAt = nowIso();
    }
  }

  toJSON() {
    return {
      moduleId: this.moduleId,
      branchId: this.branchId,
      version: this.version,
      tables: deepClone(this.data),
      meta: deepClone(this.meta),
      savedAt: nowIso()
    };
  }
}
