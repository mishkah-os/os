#!/usr/bin/env node
/**
 * Script to insert dining tables via API
 */

import { readFile } from 'fs/promises';
import path from 'path';

const API_URL = 'http://localhost:3200/api/batch';
const BRANCH_ID = 'dar';
const MODULE_ID = 'pos';
const TABLE_NAME = 'dining_tables';

async function main() {
  try {
    // Read dining tables from seeds
    const seedPath = path.join(
      process.cwd(),
      'data/branches/dar/modules/pos/seeds/initial.json'
    );

    console.log('📖 Reading seed data...');
    const seedContent = await readFile(seedPath, 'utf-8');
    const seedData = JSON.parse(seedContent);

    const diningTables = seedData.tables.dining_tables;
    if (!diningTables || !Array.isArray(diningTables)) {
      console.error('❌ No dining_tables found in seed data');
      process.exit(1);
    }

    console.log(`✅ Found ${diningTables.length} tables in seed data`);

    // Insert via batch API
    console.log(`\n📤 Inserting ${diningTables.length} tables via API...`);

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        branchId: BRANCH_ID,
        moduleId: MODULE_ID,
        table: TABLE_NAME,
        records: diningTables
      })
    });

    const result = await response.json();

    if (response.ok) {
      console.log('✅ Successfully inserted tables!');
      console.log(`   Inserted: ${result.inserted || result.success?.length || 0} tables`);
      if (result.errors && result.errors.length > 0) {
        console.log(`   Errors: ${result.errors.length}`);
        result.errors.forEach((err, idx) => {
          console.log(`     ${idx + 1}. ${err.message || err}`);
        });
      }
    } else {
      console.error('❌ API Error:', result);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
