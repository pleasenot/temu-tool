import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { dbRun, dbGet } from './database';
import { getVideosDir } from './storage';
import { MiniMaxClient } from './minimax-client';
import { broadcastToWeb } from '../server/ws-server';

interface QueueEntry {
  videoRowId: string;
  productId: string;
  taskId: string;
  attempts: number;
  total: number;   // total products in this batch (for progress display)
  index: number;   // 1-based index within the batch
}

// In-memory poll state. Persisted rows live in product_videos.
const queue = new Map<string, QueueEntry>();

const POLL_INTERVAL_MS = 10_000;
const MAX_POLLS = 30; // 30 * 10s = 5 minutes

let pollerStarted = false;
let client: MiniMaxClient | null = null;

function getClient(): MiniMaxClient {
  if (!client) client = new MiniMaxClient();
  return client;
}

function startPollerOnce() {
  if (pollerStarted) return;
  pollerStarted = true;
  setInterval(pollOnce, POLL_INTERVAL_MS).unref?.();
}

async function pollOnce() {
  if (queue.size === 0) return;
  const entries = Array.from(queue.values());
  for (const entry of entries) {
    entry.attempts += 1;
    try {
      const status = await getClient().queryVideoTask(entry.taskId);
      if (status.status === 'processing') {
        if (entry.attempts >= MAX_POLLS) {
          markFailed(entry, '轮询超时（5 分钟仍未完成）');
        }
        continue;
      }
      if (status.status === 'failed') {
        markFailed(entry, status.errorMsg || 'Minimax 返回 failed');
        continue;
      }
      // success — download and save
      if (!status.fileId) {
        markFailed(entry, 'Minimax 返回 success 但缺少 file_id');
        continue;
      }
      try {
        const buf = await getClient().downloadFile(status.fileId);
        const filename = `${entry.productId}-${entry.taskId}.mp4`;
        const filePath = path.join(getVideosDir(), filename);
        fs.writeFileSync(filePath, buf);
        const publicUrl = `/uploads/videos/${filename}`;
        dbRun(
          `UPDATE product_videos SET status = 'success', file_path = ? WHERE id = ?`,
          [publicUrl, entry.videoRowId]
        );
        broadcastToWeb({
          type: 'video-gen:progress',
          id: uuid(),
          timestamp: Date.now(),
          payload: {
            productId: entry.productId,
            status: 'success',
            current: entry.index,
            total: entry.total,
            filePath: publicUrl,
          },
        });
      } catch (err) {
        markFailed(entry, `下载失败: ${String(err)}`);
      } finally {
        queue.delete(entry.videoRowId);
      }
    } catch (err) {
      if (entry.attempts >= MAX_POLLS) {
        markFailed(entry, `轮询错误: ${String(err)}`);
      }
      // else: leave in queue for next tick
    }
  }
}

function markFailed(entry: QueueEntry, errorMsg: string) {
  dbRun(
    `UPDATE product_videos SET status = 'failed', error_msg = ? WHERE id = ?`,
    [errorMsg.slice(0, 500), entry.videoRowId]
  );
  broadcastToWeb({
    type: 'video-gen:progress',
    id: uuid(),
    timestamp: Date.now(),
    payload: {
      productId: entry.productId,
      status: 'failed',
      current: entry.index,
      total: entry.total,
      error: errorMsg,
    },
  });
  queue.delete(entry.videoRowId);
}

/**
 * Enqueue one product for image-to-video generation.
 * Creates a product_videos row (status=processing), calls imageToVideo,
 * and pushes into the in-memory queue for the background poller.
 */
export async function enqueueVideoGeneration(opts: {
  productId: string;
  imageUrl: string;
  prompt: string;
  duration?: 6 | 10;
  resolution?: '768P' | '1080P';
  index: number;
  total: number;
}): Promise<{ videoRowId: string; taskId: string }> {
  startPollerOnce();

  const duration = opts.duration ?? 6;
  // 768P is what the Max-极速版 token plan supports; 1080P needs a higher tier.
  const resolution = opts.resolution ?? '768P';

  const { taskId } = await getClient().imageToVideo({
    imageUrl: opts.imageUrl,
    prompt: opts.prompt,
    duration,
    resolution,
  });

  const videoRowId = uuid();
  dbRun(
    `INSERT INTO product_videos (id, product_id, file_path, minimax_task_id, status, duration, resolution)
     VALUES (?, ?, ?, ?, 'processing', ?, ?)`,
    [videoRowId, opts.productId, '', taskId, duration, resolution]
  );

  queue.set(videoRowId, {
    videoRowId,
    productId: opts.productId,
    taskId,
    attempts: 0,
    total: opts.total,
    index: opts.index,
  });

  broadcastToWeb({
    type: 'video-gen:progress',
    id: uuid(),
    timestamp: Date.now(),
    payload: {
      productId: opts.productId,
      status: 'processing',
      current: opts.index,
      total: opts.total,
    },
  });

  return { videoRowId, taskId };
}

// Test hook — allows unit tests / debug routes to observe queue size.
export function _queueSize(): number {
  return queue.size;
}

// Re-export for routes that want to validate state.
export function _hasEntry(videoRowId: string): boolean {
  return queue.has(videoRowId);
}

// Guard against unused warning.
void dbGet;
