import { deepClone } from '../utils.js';

function normalizeLang(lang, fallback = 'ar') {
  if (!lang || typeof lang !== 'string') return fallback;
  const normalized = lang.trim().toLowerCase();
  return normalized || fallback;
}

function extractReferenceId(record, baseName) {
  if (!record || typeof record !== 'object') return null;
  const directKey = `${baseName}_id`;
  if (record[directKey]) return record[directKey];
  const camelKey = `${baseName}Id`;
  if (record[camelKey]) return record[camelKey];
  for (const key of Object.keys(record)) {
    if (key === 'id') continue;
    if (key.toLowerCase().endsWith('_id') && record[key]) {
      return record[key];
    }
  }
  return record.id || null;
}

function isIgnoredField(key, baseName) {
  const normalized = key.toLowerCase();
  return (
    normalized === 'id' ||
    normalized === 'lang' ||
    normalized === `${baseName.toLowerCase()}_id` ||
    normalized === 'created_date' ||
    normalized === 'modified_date'
  );
}

function flattenTranslationsMap(map) {
  const output = {};
  for (const [table, records] of map.entries()) {
    const tableObj = {};
    for (const [recordId, fields] of records.entries()) {
      tableObj[recordId] = deepClone(fields);
    }
    output[table] = tableObj;
  }
  return output;
}

function mergeWithFallback(primary, fallback) {
  const merged = new Map();
  const tables = new Set([...(fallback?.keys?.() ? fallback.keys() : []), ...(primary?.keys?.() ? primary.keys() : [])]);
  for (const table of tables) {
    const primaryRecords = primary?.get(table) || new Map();
    const fallbackRecords = fallback?.get(table) || new Map();
    const recordIds = new Set([...(fallbackRecords.keys ? fallbackRecords.keys() : []), ...(primaryRecords.keys ? primaryRecords.keys() : [])]);
    const recordMap = new Map();
    for (const recordId of recordIds) {
      const fallbackFields = fallbackRecords.get(recordId) || {};
      const primaryFields = primaryRecords.get(recordId) || {};
      recordMap.set(recordId, { ...fallbackFields, ...primaryFields });
    }
    merged.set(table, recordMap);
  }
  return merged;
}

export function loadTranslationsPayload(store, { lang = 'ar', fallbackLang = 'ar' } = {}) {
  const normalizedLang = normalizeLang(lang);
  const normalizedFallback = normalizeLang(fallbackLang);
  const translationsByLang = new Map();
  const translationTables = (store?.tables || []).filter((name) => typeof name === 'string' && name.endsWith('_lang'));

  for (const tableName of translationTables) {
    const baseName = tableName.replace(/_lang$/i, '');
    const records = store.listTable(tableName) || [];
    for (const record of records) {
      const language = normalizeLang(record?.lang, normalizedFallback);
      const refId = extractReferenceId(record, baseName);
      if (!refId) continue;
      if (!translationsByLang.has(language)) {
        translationsByLang.set(language, new Map());
      }
      const tableMap = translationsByLang.get(language);
      if (!tableMap.has(baseName)) {
        tableMap.set(baseName, new Map());
      }
      const recordMap = tableMap.get(baseName);
      if (!recordMap.has(refId)) {
        recordMap.set(refId, {});
      }
      const fieldMap = recordMap.get(refId);
      for (const [key, value] of Object.entries(record || {})) {
        if (isIgnoredField(key, baseName)) continue;
        if (value === null || value === undefined) continue;
        fieldMap[key] = value;
      }
      recordMap.set(refId, fieldMap);
      tableMap.set(baseName, recordMap);
      translationsByLang.set(language, tableMap);
    }
  }

  const fallbackMap = translationsByLang.get(normalizedFallback) || new Map();
  const primaryMap = translationsByLang.get(normalizedLang) || new Map();
  const merged = mergeWithFallback(primaryMap, fallbackMap);

  return {
    lang: normalizedLang,
    fallbackLang: normalizedFallback,
    translations: flattenTranslationsMap(merged),
    availableLanguages: Array.from(translationsByLang.keys())
  };
}
