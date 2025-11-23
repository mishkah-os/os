#!/usr/bin/env node
/**
 * Test script to verify seed loading for dining_tables
 */

import { readFile } from 'fs/promises';
import path from 'path';

const INITIAL_JSON_PATH = path.join(
  process.cwd(),
  'data/branches/dar/modules/pos/seeds/initial.json'
);

async function main() {
  try {
    console.log('📖 Reading initial.json from:', INITIAL_JSON_PATH);
    const content = await readFile(INITIAL_JSON_PATH, 'utf-8');
    const data = JSON.parse(content);

    console.log('\n📊 Seed structure:');
    console.log('  - version:', data.version);
    console.log('  - tables count:', Object.keys(data.tables || {}).length);

    if (data.tables) {
      console.log('\n📋 Tables in seed:');
      for (const [tableName, records] of Object.entries(data.tables)) {
        const count = Array.isArray(records) ? records.length : (records ? 1 : 0);
        console.log(`  - ${tableName}: ${count} records`);
      }
    }

    if (data.tables?.dining_tables) {
      console.log('\n✅ dining_tables found in seed!');
      console.log('   Count:', data.tables.dining_tables.length);
      console.log('   First table:', JSON.stringify(data.tables.dining_tables[0], null, 2));
    } else {
      console.log('\n❌ dining_tables NOT found in seed!');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
