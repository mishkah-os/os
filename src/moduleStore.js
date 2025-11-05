import { deepClone, nowIso } from './utils.js';
import { populateRecordFks, populateRecordsFks } from './schema/fk-resolver.js';

const VERSIONED_TABLES = new Set(['order_header', 'order_line']);

export class VersionConflictError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'VersionConflictError';
    this.code = 'VERSION_CONFLICT';
    this.table = options.table || null;
    this.key = options.key || null;
    this.expectedVersion = options.expectedVersion ?? null;
    this.currentVersion = options.currentVersion ?? null;
    this.reason = options.reason || null;
    if (options.details && typeof options.details === 'object') {
      this.details = options.details;
    }
  }
}

export default class ModuleStore {
  constructor(schemaEngine, branchId, moduleId, definition = {}, seed = {}, seedData = null) {
    this.schemaEngine = schemaEngine;
    this.branchId = branchId;
    this.moduleId = moduleId;
    this.definition = definition || {};
    this.tables = Array.isArray(definition.tables) ? definition.tables.slice() : [];
    this.versionedTables = new Set();
    for (const tableName of this.tables) {
      const normalized = typeof tableName === 'string' ? tableName.toLowerCase() : null;
      if (normalized && VERSIONED_TABLES.has(normalized)) {
        this.versionedTables.add(normalized);
      }
    }
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
      for (const record of this.data[tableName]) {
        this.initializeRecordVersion(tableName, record);
      }
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

  isVersionedTable(tableName) {
    if (!tableName) return false;
    const normalized = String(tableName).toLowerCase();
    return this.versionedTables.has(normalized);
  }

  normalizeVersionInput(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const normalized = Math.trunc(numeric);
    if (normalized <= 0) return null;
    return normalized;
  }

  initializeRecordVersion(tableName, record) {
    if (!this.isVersionedTable(tableName)) return;
    if (!record || typeof record !== 'object') return;
    const provided = this.normalizeVersionInput(record.version);
    record.version = provided || 1;
  }

  resolveConcurrencyConflict(tableName, key, expectedVersion, currentVersion, reason = 'mismatch') {
    const normalizedTable = String(tableName || '').toLowerCase();
    const isHeader = normalizedTable === 'order_header';
    const friendly = isHeader ? 'order' : 'order item';
    const message = `Another device has already updated this ${friendly}. Please reload and try again.`;
    throw new VersionConflictError(message, { table: tableName, key, expectedVersion, currentVersion, reason });
  }

  resolveNextVersion(tableName, currentRecord, patch, key) {
    if (!this.isVersionedTable(tableName)) return null;
    const currentVersion = this.normalizeVersionInput(currentRecord?.version) || 1;
    const expectedVersion = this.normalizeVersionInput(patch?.version);

    // Missing version in request
    if (!expectedVersion) {
      this.resolveConcurrencyConflict(tableName, key, expectedVersion, currentVersion, 'missing-version');
    }

    // CRITICAL FIX: Support optimistic locking properly
    // Frontend sends expectedVersion = currentVersion + 1 for updates
    // Backend should validate: expectedVersion === currentVersion + 1

    // Case 1: New record (version=1, currentVersion=1)
    // This happens when a new order is created or when converting draft→real
    if (expectedVersion === 1 && currentVersion === 1) {
      // Allow: This is a new record or a retry after conflict
      return currentVersion + 1;
    }

    // Case 2: Update (expectedVersion should be currentVersion + 1)
    if (expectedVersion !== currentVersion + 1) {
      // Version mismatch: frontend is out of sync or another device updated
      this.resolveConcurrencyConflict(tableName, key, expectedVersion, currentVersion, 'stale-version');
    }

    return currentVersion + 1;
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
    this.initializeRecordVersion(tableName, created);
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
    const nextVersion = this.resolveNextVersion(tableName, current, patch, key);
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
    if (nextVersion !== null) {
      next.version = nextVersion;
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

    // CRITICAL FIX: Support UPSERT for versioned tables
    // If record exists but incoming request has version=1, treat as UPSERT (replace)
    // This handles case where Frontend allocated invoice ID that already exists in DB
    if (index >= 0 && this.isVersionedTable(tableName)) {
      const incomingVersion = this.normalizeVersionInput(record?.version);
      const currentRecord = this.data[tableName][index];
      const currentVersion = this.normalizeVersionInput(currentRecord?.version) || 1;

      // CRITICAL: If incoming version=1 (new order), allow REPLACE regardless of current version
      // This handles:
      // 1. Retry after conflict (currentVersion=1, incomingVersion=1)
      // 2. Invoice ID collision (currentVersion>1, incomingVersion=1)
      // 3. Sequence counter out of sync
      if (incomingVersion === 1) {
        // UPSERT: Replace the entire record (not just update)
        const enrichedContext = { branchId: this.branchId, ...context };
        const replaced = this.schemaEngine.createRecord(tableName, record, enrichedContext);
        this.initializeRecordVersion(tableName, replaced);
        this.data[tableName][index] = replaced;
        this.version += 1;
        this.touchMeta();
        console.log(`[ModuleStore] UPSERT: Replaced ${tableName} record (key=${key}, oldVersion=${currentVersion}, newVersion=1)`);
        return { record: deepClone(replaced), created: false, replaced: true };
      }
    }

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

  clearTables(tableNames = []) {
    const normalized = [];
    const seen = new Set();
    if (Array.isArray(tableNames)) {
      for (const entry of tableNames) {
        if (entry === undefined || entry === null) continue;
        const name = String(entry).trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        normalized.push(name);
      }
    }
    if (!normalized.length) {
      return { cleared: [], totalRemoved: 0, changed: false };
    }

    const cleared = [];
    let changed = false;
    let totalRemoved = 0;

    for (const tableName of normalized) {
      if (!this.tables.includes(tableName)) {
        cleared.push({ table: tableName, status: 'skipped', reason: 'table-not-registered' });
        continue;
      }
      const target = Array.isArray(this.data[tableName]) ? this.data[tableName] : [];
      const removed = target.length;
      if (!Array.isArray(this.data[tableName])) {
        this.data[tableName] = [];
      } else if (removed) {
        target.splice(0, target.length);
      }
      if (!removed) {
        cleared.push({ table: tableName, status: 'empty', removed: 0 });
        continue;
      }
      totalRemoved += removed;
      changed = true;
      cleared.push({ table: tableName, status: 'cleared', removed });
    }

    if (changed) {
      this.version += 1;
      this.touchMeta({ recount: true });
    }

    return { cleared, totalRemoved, changed };
  }

  restoreTables(tableRecords = {}, options = {}) {
    if (!tableRecords || typeof tableRecords !== 'object') {
      return { restored: [], totalRestored: 0, changed: false, mode: options.mode || 'append' };
    }
    const mode = options.mode === 'replace' ? 'replace' : 'append';
    const restored = [];
    let totalRestored = 0;
    let changed = false;

    const entries = Array.isArray(tableRecords)
      ? tableRecords
      : Object.entries(tableRecords).map(([table, records]) => ({ table, records }));

    for (const entry of entries) {
      const tableName = entry?.table || entry?.name;
      if (typeof tableName !== 'string' || !tableName.trim()) continue;
      const normalizedName = tableName.trim();
      if (!this.tables.includes(normalizedName)) {
        restored.push({ table: normalizedName, restored: 0, skipped: true, reason: 'table-not-registered', mode });
        continue;
      }
      const incoming = Array.isArray(entry?.records) ? entry.records : [];
      const target = Array.isArray(this.data[normalizedName]) ? this.data[normalizedName] : (this.data[normalizedName] = []);
      const result = { table: normalizedName, mode, restored: 0, duplicates: 0, skipped: false };

      if (mode === 'replace') {
        const clones = [];
        for (const record of incoming) {
          if (!record || typeof record !== 'object') continue;
          clones.push(deepClone(record));
        }
        for (const record of clones) {
          this.initializeRecordVersion(normalizedName, record);
        }
        result.restored = clones.length;
        totalRestored += clones.length;
        if (clones.length || target.length) {
          target.splice(0, target.length, ...clones);
          changed = changed || Boolean(clones.length || target.length);
        }
        restored.push(result);
        continue;
      }

      const existingKeys = new Set();
      for (const row of target) {
        const { key } = this.resolveRecordKey(normalizedName, row, { require: false });
        if (key) existingKeys.add(key);
      }

      for (const record of incoming) {
        if (!record || typeof record !== 'object') continue;
        const clone = deepClone(record);
        this.initializeRecordVersion(normalizedName, clone);
        const { key } = this.resolveRecordKey(normalizedName, clone, { require: false });
        if (key && existingKeys.has(key)) {
          result.duplicates += 1;
          continue;
        }
        if (key) existingKeys.add(key);
        target.push(clone);
        result.restored += 1;
      }
      if (result.restored) {
        totalRestored += result.restored;
        changed = true;
      }
      restored.push(result);
    }

    if (changed) {
      this.version += 1;
      this.touchMeta({ recount: true });
    }

    return { restored, totalRestored, changed, mode };
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
      const mergedRows = [...keyed.values(), ...fallback.values()];
      for (const row of mergedRows) {
        this.initializeRecordVersion(tableName, row);
      }
      this.data[tableName] = mergedRows;
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
        this.initializeRecordVersion(tableName, record);
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

  /**
   * يقرأ record واحد من الجدول بناءً على الـ primary key
   * مع دعم FK population تلقائياً
   *
   * @param {string} tableName - اسم الجدول
   * @param {string|Object} idOrCriteria - الـ id أو criteria للبحث
   * @param {Object} options - خيارات (populate: true/false)
   * @returns {Object|null} - الـ record أو null إذا لم يوجد
   */
  getRecord(tableName, idOrCriteria, options = {}) {
    this.ensureTable(tableName);

    // إذا كان id بسيط، نحوله إلى criteria
    const criteria = typeof idOrCriteria === 'string' || typeof idOrCriteria === 'number'
      ? { id: idOrCriteria }
      : idOrCriteria;

    // نبحث عن الـ record
    const { key } = this.resolveRecordKey(tableName, criteria, { require: false });
    if (!key) {
      return null;
    }

    const index = this.findRecordIndex(tableName, key);
    if (index < 0) {
      return null;
    }

    const record = deepClone(this.data[tableName][index]);

    // FK population إذا مطلوب (default: true)
    const populate = options.populate !== false;
    if (populate) {
      return populateRecordFks(this.schemaEngine, this, tableName, record, options);
    }

    return record;
  }

  /**
   * يقرأ جميع records من جدول مع دعم FK population
   *
   * @param {string} tableName - اسم الجدول
   * @param {Object} options - خيارات (populate: true/false, filter: function)
   * @returns {Array} - مصفوفة من الـ records
   */
  queryTable(tableName, options = {}) {
    this.ensureTable(tableName);

    // نقرأ جميع الـ records
    let records = this.data[tableName].map((entry) => deepClone(entry));

    // تطبيق filter إذا موجود
    if (typeof options.filter === 'function') {
      records = records.filter(options.filter);
    }

    // FK population إذا مطلوب (default: true)
    const populate = options.populate !== false;
    if (populate) {
      return populateRecordsFks(this.schemaEngine, this, tableName, records, options);
    }

    return records;
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
