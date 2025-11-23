#!/usr/bin/env node
/**
 * Script to create dining_tables SQLite database directly
 */

import Database from 'better-sqlite3';
import { readFile, mkdir } from 'fs/promises';
import path from 'path';

const DB_PATH = '/home/user/os/data/branches/dar/modules/pos/dining_tables.db';

async function main() {
  try {
    // Ensure directory exists
    await mkdir(path.dirname(DB_PATH), { recursive: true });

    console.log('📂 Creating database at:', DB_PATH);
    const db = new Database(DB_PATH);

    // Create table
    console.log('🏗️  Creating dining_tables table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS dining_tables (
        display_order INTEGER NOT NULL DEFAULT 0,
        table_id TEXT PRIMARY KEY NOT NULL,
        table_name TEXT NOT NULL,
        note TEXT,
        seats INTEGER NOT NULL DEFAULT 2,
        state TEXT NOT NULL DEFAULT 'active',
        zone TEXT,
        version INTEGER NOT NULL DEFAULT 1
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_dining_table_zone ON dining_tables(zone)
    `);

    // Read seed data
    console.log('📖 Reading seed data...');
    const seedPath = '/home/user/os/data/branches/dar/modules/pos/seeds/initial.json';
    const seedContent = await readFile(seedPath, 'utf-8');
    const seedData = JSON.parse(seedContent);

    const tables = seedData.tables.dining_tables;
    if (!tables || !Array.isArray(tables)) {
      console.error('❌ No dining_tables found in seed data');
      process.exit(1);
    }

    console.log(`✅ Found ${tables.length} tables in seed data`);

    // Insert tables
    const insert = db.prepare(`
      INSERT INTO dining_tables (
        display_order, table_id, table_name, note, seats, state, zone, version
      ) VALUES (
        @displayOrder, @id, @name, @note, @seats, @state, @zone, @version
      )
    `);

    const insertMany = db.transaction((tables) => {
      for (const table of tables) {
        insert.run(table);
      }
    });

    console.log('💾 Inserting tables...');
    insertMany(tables);

    console.log('✅ Successfully inserted', tables.length, 'tables');

    // Verify
    const count = db.prepare('SELECT COUNT(*) as count FROM dining_tables').get();
    console.log('🔍 Verification: Found', count.count, 'tables in database');

    db.close();
    console.log('✅ Database created successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
