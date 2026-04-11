import { app } from 'electron';
import path from 'path';
import fs from 'fs';

let uploadsDir: string;
let videosDir: string;

export function getUploadsDir(): string {
  if (!uploadsDir) {
    uploadsDir = path.join(app.getPath('userData'), 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  }
  return uploadsDir;
}

export function getVideosDir(): string {
  if (!videosDir) {
    videosDir = path.join(getUploadsDir(), 'videos');
    if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });
  }
  return videosDir;
}
