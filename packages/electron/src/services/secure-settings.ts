import { dbAll, dbGet, dbRun } from './database';
import { encrypt, decrypt, isEncrypted } from './encryption';

// Keys whose stored value must be encrypted at rest.
const SECURE_KEYS = new Set([
  'temu_password',
  'ps_password',
]);

export function isSecureKey(key: string): boolean {
  return SECURE_KEYS.has(key);
}

/** Read a setting, transparently decrypting if it's a secure key. */
export function getSetting(key: string): string | undefined {
  const row = dbGet('SELECT value FROM settings WHERE key = ?', [key]) as
    | { value: string }
    | undefined;
  if (!row) return undefined;
  return SECURE_KEYS.has(key) ? decrypt(row.value) : row.value;
}

/** Write a setting, transparently encrypting if it's a secure key. */
export function setSetting(key: string, value: string): void {
  const stored = SECURE_KEYS.has(key) ? encrypt(value) : value;
  const existing = dbGet('SELECT 1 FROM settings WHERE key = ?', [key]);
  if (existing) {
    dbRun('UPDATE settings SET value = ? WHERE key = ?', [stored, key]);
  } else {
    dbRun('INSERT INTO settings (key, value) VALUES (?, ?)', [key, stored]);
  }
}

/** Has-value check that doesn't expose the secret. */
export function hasSetting(key: string): boolean {
  const row = dbGet('SELECT value FROM settings WHERE key = ?', [key]) as
    | { value: string }
    | undefined;
  return !!row?.value;
}

/**
 * One-shot migration: any legacy plaintext rows for SECURE_KEYS get
 * re-written as encrypted blobs. Safe to call repeatedly — already-encrypted
 * rows are skipped. Call once on app startup after initDatabase().
 */
export function migrateLegacyPlaintextSecrets(): void {
  const rows = dbAll('SELECT key, value FROM settings') as Array<{
    key: string;
    value: string;
  }>;
  for (const { key, value } of rows) {
    if (!SECURE_KEYS.has(key)) continue;
    if (!value) continue;
    if (isEncrypted(value)) continue;
    // Re-encrypt in place.
    const encrypted = encrypt(value);
    if (encrypted !== value) {
      dbRun('UPDATE settings SET value = ? WHERE key = ?', [encrypted, key]);
    }
  }
}
