#!/usr/bin/env node
/**
 * Migration script to add pos_shift table to existing SQLite database
 * and migrate any existing pos_shift data from JSON files
 *
 * Usage: node scripts/migrate-pos-shift.js [--dry-run]
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { readFile, readdir } from 'fs/promises';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const BRANCHES_DIR = path.join(DATA_DIR, 'branches');
const DB_PATH = path.join(DATA_DIR, 'hybrid-store.sqlite');

const isDryRun = process.argv.includes('--dry-run');

function log(message, ...args) {
  console.log(`[MIGRATE] ${message}`, ...args);
}

async function readJsonSafe(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function checkTableExists(db, tableName) {
  const result = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).get(tableName);
  return Boolean(result);
}

async function createPosShiftTable(db) {
  log('Creating pos_shift table...');

  if (isDryRun) {
    log('[DRY RUN] Would create pos_shift table');
    return;
  }

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

  log('✓ pos_shift table created successfully');
}

async function migrateBranchData(db, branchId, moduleId = 'pos') {
  const modulePath = path.join(BRANCHES_DIR, encodeURIComponent(branchId), 'modules', moduleId, 'live', 'data.json');
  const data = await readJsonSafe(modulePath);

  if (!data || !data.tables || !data.tables.pos_shift) {
    return 0;
  }

  const shifts = data.tables.pos_shift;
  if (!Array.isArray(shifts) || shifts.length === 0) {
    return 0;
  }

  log(`Found ${shifts.length} pos_shift records for branch ${branchId}`);

  if (isDryRun) {
    log(`[DRY RUN] Would migrate ${shifts.length} pos_shift records`);
    return shifts.length;
  }

  const stmt = db.prepare(`
    INSERT INTO pos_shift (branch_id, module_id, id, pos_id, status, is_closed, opened_at, closed_at, created_at, updated_at, version, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  `);

  const transaction = db.transaction((shifts) => {
    for (const shift of shifts) {
      const posId = shift.posId || shift.pos_id || null;
      const status = shift.status || null;
      const isClosed = shift.isClosed || shift.is_closed || false;
      const openedAt = shift.openedAt || shift.opened_at || null;
      const closedAt = shift.closedAt || shift.closed_at || null;
      const createdAt = shift.createdAt || shift.created_at || null;
      const updatedAt = shift.updatedAt || shift.updated_at || shift.savedAt || shift.saved_at || createdAt;
      const version = Number.isFinite(Number(shift.version)) ? Math.trunc(Number(shift.version)) : 1;

      stmt.run(
        branchId.toLowerCase(),
        moduleId.toLowerCase(),
        String(shift.id),
        posId ? String(posId) : null,
        status ? String(status) : null,
        isClosed ? 1 : 0,
        openedAt,
        closedAt,
        createdAt,
        updatedAt,
        version,
        JSON.stringify(shift)
      );
    }
  });

  transaction(shifts);
  log(`✓ Migrated ${shifts.length} pos_shift records for branch ${branchId}`);
  return shifts.length;
}

async function main() {
  log(isDryRun ? 'Running in DRY RUN mode' : 'Running migration');
  log(`Database path: ${DB_PATH}`);

  // Open database
  let db;
  try {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    log('✓ Database opened successfully');
  } catch (error) {
    log(`✗ Failed to open database: ${error.message}`);
    process.exit(1);
  }

  try {
    // Check if pos_shift table exists
    const tableExists = await checkTableExists(db, 'pos_shift');

    if (tableExists) {
      log('✓ pos_shift table already exists');
      const count = db.prepare('SELECT COUNT(*) as count FROM pos_shift').get();
      log(`  Current records in pos_shift: ${count.count}`);
    } else {
      log('✗ pos_shift table does not exist');
      await createPosShiftTable(db);
    }

    // Find all branches
    const branchDirs = await readdir(BRANCHES_DIR, { withFileTypes: true }).catch(() => []);
    const branches = branchDirs
      .filter(entry => entry.isDirectory())
      .map(entry => decodeURIComponent(entry.name));

    if (branches.length === 0) {
      log('No branches found');
      return;
    }

    log(`Found ${branches.length} branches`);

    // Migrate data from each branch
    let totalMigrated = 0;
    for (const branchId of branches) {
      try {
        const migrated = await migrateBranchData(db, branchId);
        totalMigrated += migrated;
      } catch (error) {
        log(`✗ Error migrating branch ${branchId}: ${error.message}`);
      }
    }

    if (totalMigrated > 0) {
      log(`✓ Migration complete: ${totalMigrated} total records migrated`);
    } else {
      log('✓ No records needed migration');
    }

    // Final verification
    if (!isDryRun) {
      const finalCount = db.prepare('SELECT COUNT(*) as count FROM pos_shift').get();
      log(`✓ Final pos_shift record count: ${finalCount.count}`);

      // Show sample of records by branch
      const byBranch = db.prepare(`
        SELECT branch_id, COUNT(*) as count
        FROM pos_shift
        GROUP BY branch_id
      `).all();

      if (byBranch.length > 0) {
        log('Records by branch:');
        byBranch.forEach(row => {
          log(`  - ${row.branch_id}: ${row.count} records`);
        });
      }
    }

  } catch (error) {
    log(`✗ Migration failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    db.close();
    log('✓ Database closed');
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
