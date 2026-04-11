import { Router, type Router as RouterType } from 'express';
import { dbAll } from '../../services/database';
import { setSetting, isSecureKey } from '../../services/secure-settings';
import { isEncrypted } from '../../services/encryption';

export const settingsRouter: RouterType = Router();

// GET /api/settings
// Note: secret values (ps_password, temu_password) are never returned
// in plaintext — only a boolean "is set" flag. MiniMax API key lives in
// packages/electron/.env, not in the settings table.
settingsRouter.get('/', (_req, res) => {
  const rows = dbAll('SELECT key, value FROM settings') as Array<{ key: string; value: string }>;

  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  const hasSecret = (key: string) => {
    const v = settings[key];
    return !!v && (isEncrypted(v) || v.length > 0);
  };

  res.json({
    success: true,
    data: {
      photoshop: {
        host: settings.ps_host || '127.0.0.1',
        port: parseInt(settings.ps_port || '49494'),
        password: hasSecret('ps_password') ? '***' : '',
      },
      temu: {
        username: settings.temu_username || '',
        hasPassword: hasSecret('temu_password'),
      },
      directories: {
        templates: settings.templates_dir || '',
        input: settings.input_dir || '',
        output: settings.output_dir || '',
      },
    },
  });
});

// PUT /api/settings - bulk update; secret keys are auto-encrypted
settingsRouter.put('/', (req, res) => {
  const updates = req.body;

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined && value !== null) {
      setSetting(key, String(value));
    }
  }

  res.json({ success: true });
});

// PUT /api/settings/:key - single key update
settingsRouter.put('/:key', (req, res) => {
  const { value } = req.body;
  setSetting(req.params.key, String(value));
  res.json({ success: true, encrypted: isSecureKey(req.params.key) });
});
