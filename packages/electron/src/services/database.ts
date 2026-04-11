import initSqlJs, { type Database } from 'sql.js';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

let db: Database;
let dbPath: string;

export async function initDatabase() {
  const SQL = await initSqlJs();
  dbPath = path.join(app.getPath('userData'), 'temu-lister.db');

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  createTables();
  return db;
}

export function getDb(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/** Persist database to disk */
export function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

/** Auto-save after write operations */
function autoSave() {
  // Debounce saves to avoid excessive disk writes
  if ((autoSave as any)._timer) clearTimeout((autoSave as any)._timer);
  (autoSave as any)._timer = setTimeout(saveDatabase, 1000);
}

/**
 * Helper: run a SQL statement that modifies data (INSERT/UPDATE/DELETE)
 * Auto-saves after execution.
 */
export function dbRun(sql: string, params: any[] = []): void {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
  autoSave();
}

/**
 * Helper: get all rows from a SELECT query
 */
export function dbAll(sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);

  const results: any[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Helper: get a single row from a SELECT query
 */
export function dbGet(sql: string, params: any[] = []): any | undefined {
  const rows = dbAll(sql, params);
  return rows[0];
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      original_url TEXT,
      price REAL,
      currency TEXT DEFAULT 'USD',
      category TEXT,
      specifications TEXT,
      sku_variants TEXT,
      scraped_at TEXT NOT NULL,
      status TEXT DEFAULT 'collected'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS product_images (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      original_url TEXT,
      local_path TEXT,
      sort_order INTEGER DEFAULT 0,
      width INTEGER,
      height INTEGER,
      file_size INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS mockup_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      psd_path TEXT NOT NULL,
      smart_object_layer_name TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS mockup_images (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      source_image_id TEXT,
      template_id TEXT,
      output_path TEXT,
      sort_order INTEGER DEFAULT 0,
      width INTEGER,
      height INTEGER,
      file_size INTEGER,
      created_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pricing_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      default_values TEXT NOT NULL,
      created_at TEXT,
      updated_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS product_pricing (
      product_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      overrides TEXT,
      PRIMARY KEY (product_id, template_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      temu_listing_id TEXT,
      status TEXT DEFAULT 'pending',
      submitted_at TEXT,
      error_message TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS product_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ref_product_id TEXT,
      cat_id INTEGER,
      cat_name TEXT,
      cat_ids TEXT,
      properties TEXT,
      spec_config TEXT,
      sku_config TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `);

  // Migrate: add new template fields (idempotent — ALTER TABLE throws if column exists)
  const newCols = [
    'size_info TEXT', 'image_index INTEGER', 'product_code TEXT',
    'volume_len_cm REAL', 'volume_width_cm REAL', 'volume_height_cm REAL',
    'weight_g REAL', 'declared_price REAL', 'retail_price REAL',
  ];
  for (const col of newCols) {
    try { db.run(`ALTER TABLE product_templates ADD COLUMN ${col}`); } catch {}
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS cookies (
      domain TEXT PRIMARY KEY,
      data TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  autoSave();
}
