import { app } from 'electron';
import path from 'path';
import fs from 'fs';

let uploadsDir: string;

export function getUploadsDir(): string {
  if (!uploadsDir) {
    uploadsDir = path.join(app.getPath('userData'), 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  }
  return uploadsDir;
}
