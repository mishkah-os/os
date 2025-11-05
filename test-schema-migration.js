#!/usr/bin/env node

/**
 * Test script for schema migration system
 */

import { initializeSqlite } from './src/db/sqlite.js';

console.log('========================================');
console.log('Testing Schema Migration System');
console.log('========================================\n');

try {
  // Initialize SQLite with auto-migration enabled
  console.log('Initializing SQLite with auto-migration...\n');

  const db = initializeSqlite({
    enableAutoMigration: true,
    rootDir: process.cwd()
  });

  console.log('\n========================================');
  console.log('✅ Test completed successfully!');
  console.log('========================================\n');

  console.log('Check the following locations for logs:');
  console.log('  - data/branches/{branchId}/modules/{moduleId}/logs/\n');

  process.exit(0);
} catch (error) {
  console.error('\n========================================');
  console.error('❌ Test failed!');
  console.error('========================================\n');
  console.error(error);
  process.exit(1);
}
