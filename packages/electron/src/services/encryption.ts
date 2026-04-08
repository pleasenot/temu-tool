import { safeStorage } from 'electron';

// Prefix marks encrypted values so we can distinguish them from legacy
// plaintext rows during the migration window. Bump the version suffix if
// the encryption scheme ever changes.
const PREFIX = 'enc:v1:';

export function isEncrypted(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encrypt(plain: string): string {
  if (!plain) return '';
  if (!safeStorage.isEncryptionAvailable()) {
    // Fall back to plaintext so the app still functions on systems where
    // safeStorage isn't backed by an OS keychain. The caller is responsible
    // for warning the user about this in the UI.
    return plain;
  }
  const buf = safeStorage.encryptString(plain);
  return PREFIX + buf.toString('base64');
}

export function decrypt(value: string | undefined | null): string {
  if (!value) return '';
  if (!isEncrypted(value)) return value; // legacy plaintext
  if (!safeStorage.isEncryptionAvailable()) return '';
  try {
    const buf = Buffer.from(value.slice(PREFIX.length), 'base64');
    return safeStorage.decryptString(buf);
  } catch {
    return '';
  }
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}
