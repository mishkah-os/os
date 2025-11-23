#!/usr/bin/env node
/**
 * Script to add dining_tables seed data to initial.json
 * This generates 30 default tables with different zones and seating capacities
 */

import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const INITIAL_JSON_PATH = path.join(
  process.cwd(),
  'data/branches/dar/modules/pos/seeds/initial.json'
);

// Generate dining tables seed data
function generateDiningTables() {
  const tables = [];
  const zones = ['indoor', 'outdoor', 'vip', 'terrace'];
  const seatingOptions = [2, 4, 6, 8];

  for (let i = 1; i <= 30; i++) {
    const zoneIndex = Math.floor((i - 1) / 8);
    const zone = zones[Math.min(zoneIndex, zones.length - 1)];
    const seats = seatingOptions[i % seatingOptions.length];

    tables.push({
      id: `T${String(i).padStart(2, '0')}`,
      name: `طاولة ${i}`,
      displayOrder: i,
      seats: seats,
      zone: zone,
      state: 'active',
      note: null,
      version: 1
    });
  }

  return tables;
}

async function main() {
  try {
    console.log('📖 Reading initial.json...');
    const content = await readFile(INITIAL_JSON_PATH, 'utf-8');
    const data = JSON.parse(content);

    console.log('🏗️  Generating dining tables seed data...');
    const diningTables = generateDiningTables();

    console.log(`✅ Generated ${diningTables.length} dining tables`);
    console.log('   Zones:', [...new Set(diningTables.map(t => t.zone))].join(', '));
    console.log('   Seating capacities:', [...new Set(diningTables.map(t => t.seats))].join(', '));

    // Add dining_tables to the tables object
    if (!data.tables) {
      data.tables = {};
    }

    data.tables.dining_tables = diningTables;

    console.log('💾 Writing updated initial.json...');
    await writeFile(INITIAL_JSON_PATH, JSON.stringify(data, null, 2), 'utf-8');

    console.log('✅ Successfully added dining_tables to initial.json');
    console.log(`   Total tables in seed: ${Object.keys(data.tables).length}`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
