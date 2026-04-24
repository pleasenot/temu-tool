import { useWsEvent, type WsMessage } from './WebSocketBus';
import { taskRegistry, type TaskKind } from './TaskTray';

interface BatchState {
  taskId: string;
  total: number;
  succ: number;
  fail: number;
  seen: Set<string>;
}

/**
 * Bridge a per-product progress WS stream into a single TaskTray task.
 *
 * The backend broadcasts one event per item with `{ current, total, status }`.
 * We reuse a single task per (kind, total) "session" and tally success/fail counts.
 * Module-level state survives across re-renders so handlers stay referentially stable.
 */
function makeBridgeHandler(kind: TaskKind, titleFn: (total: number) => string) {
  const slot: { current: BatchState | null } = { current: null };
  return (msg: WsMessage) => {
    const p = msg.payload || {};
    const total = typeof p.total === 'number' ? p.total : null;
    const status = p.status as string | undefined;
    if (!total || total <= 0) return;

    let s = slot.current;
    if (!s || s.total !== total) {
      const taskId = taskRegistry.start({ kind, title: titleFn(total), total });
      s = slot.current = { taskId, total, succ: 0, fail: 0, seen: new Set() };
    }

    const isFailed = status === 'failed' || status === 'error';
    const isSucceeded = status === 'success' || status === 'completed' || status === 'submitted';
    const isFinished = isSucceeded || isFailed;
    if (isFinished) {
      const current = typeof p.current === 'number' ? p.current : 0;
      const key = p.jobId !== undefined ? String(p.jobId) : current > 0 ? String(current) : msg.id;
      if (!s.seen.has(key)) {
        s.seen.add(key);
        if (isFailed) s.fail++;
        else s.succ++;
      }
    }

    const done = s.succ + s.fail;
    const currentForDisplay =
      status === 'processing' && typeof p.current === 'number'
        ? Math.max(done, Math.max(0, p.current - 1))
        : done;
    taskRegistry.update(s.taskId, { current: currentForDisplay, total });

    if (done >= total) {
      if (s.fail > 0) {
        taskRegistry.fail(s.taskId, `${s.fail} 个失败`);
      } else {
        taskRegistry.done(s.taskId);
      }
      slot.current = null;
    }
  };
}

const videoHandler = makeBridgeHandler('video-gen', (n) => `生成视频 × ${n}`);
const titleHandler = makeBridgeHandler('title-ai', (n) => `AI 优化标题 × ${n}`);
const mockupHandler = makeBridgeHandler('mockup', (n) => `套图 × ${n}`);

export function WsTaskBridge() {
  useWsEvent('video-gen:progress', videoHandler);
  useWsEvent('title-ai:progress', titleHandler);
  useWsEvent('mockup:progress', mockupHandler);
  return null;
}
