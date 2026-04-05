import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';

let db: Database.Database;

export function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'temu-lister.db');
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');

  createTables();
  return db;
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

function createTables() {
  db.exec(`
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
    );

    CREATE TABLE IF NOT EXISTS product_images (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      original_url TEXT,
      local_path TEXT,
      sort_order INTEGER DEFAULT 0,
      width INTEGER,
      height INTEGER,
      file_size INTEGER
    );

    CREATE TABLE IF NOT EXISTS mockup_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      psd_path TEXT NOT NULL,
      smart_object_layer_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mockup_images (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      source_image_id TEXT REFERENCES product_images(id),
      template_id TEXT REFERENCES mockup_templates(id),
      output_path TEXT,
      sort_order INTEGER DEFAULT 0,
      width INTEGER,
      height INTEGER,
      file_size INTEGER,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS pricing_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      default_values TEXT NOT NULL,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS product_pricing (
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      template_id TEXT NOT NULL REFERENCES pricing_templates(id),
      overrides TEXT,
      PRIMARY KEY (product_id, template_id)
    );

    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id),
      temu_listing_id TEXT,
      status TEXT DEFAULT 'pending',
      submitted_at TEXT,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS cookies (
      domain TEXT PRIMARY KEY,
      data BLOB
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}
