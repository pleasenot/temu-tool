import { Router } from 'express';
import { dbAll, dbGet, dbRun } from '../../services/database';

export const settingsRouter = Router();

// GET /api/settings
settingsRouter.get('/', (_req, res) => {
  const rows = dbAll('SELECT key, value FROM settings') as Array<{ key: string; value: string }>;

  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  res.json({
    success: true,
    data: {
      photoshop: {
        host: settings.ps_host || '127.0.0.1',
        port: parseInt(settings.ps_port || '49494'),
        password: settings.ps_password ? '***' : '',
      },
      minimax: {
        apiKey: settings.minimax_api_key ? '***' : '',
      },
      temu: {
        username: settings.temu_username || '',
        hasPassword: !!settings.temu_password,
      },
      directories: {
        templates: settings.templates_dir || '',
        input: settings.input_dir || '',
        output: settings.output_dir || '',
      },
    },
  });
});

// PUT /api/settings
settingsRouter.put('/', (req, res) => {
  const updates = req.body;

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined && value !== null) {
      const existing = dbGet('SELECT 1 FROM settings WHERE key = ?', [key]);
      if (existing) {
        dbRun('UPDATE settings SET value = ? WHERE key = ?', [String(value), key]);
      } else {
        dbRun('INSERT INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
      }
    }
  }

  res.json({ success: true });
});

// PUT /api/settings/:key
settingsRouter.put('/:key', (req, res) => {
  const { value } = req.body;

  const existing = dbGet('SELECT 1 FROM settings WHERE key = ?', [req.params.key]);
  if (existing) {
    dbRun('UPDATE settings SET value = ? WHERE key = ?', [String(value), req.params.key]);
  } else {
    dbRun('INSERT INTO settings (key, value) VALUES (?, ?)', [req.params.key, String(value)]);
  }

  res.json({ success: true });
});
