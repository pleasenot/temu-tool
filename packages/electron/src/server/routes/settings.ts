import { Router } from 'express';
import { getDb } from '../../services/database';

export const settingsRouter = Router();

// GET /api/settings
settingsRouter.get('/', (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;

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
  const db = getDb();
  const updates = req.body;

  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );

  const updateAll = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && value !== null) {
        upsert.run(key, String(value));
      }
    }
  });

  updateAll();
  res.json({ success: true });
});

// PUT /api/settings/:key
settingsRouter.put('/:key', (req, res) => {
  const db = getDb();
  const { value } = req.body;

  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(req.params.key, String(value));

  res.json({ success: true });
});
