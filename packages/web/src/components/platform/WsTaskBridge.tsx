import { useWsEvent, type WsMessage } from './WebSocketBus';
import { taskRegistry, type TaskKind } from './TaskTray';

interface BatchState {
  taskId: string;
  total: number;
  succ: number;
  fail: number;
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
      s = slot.current = { taskId, total, succ: 0, fail: 0 };
    }

    // Any non-processing status = a finished item. Treat 'failed' / 'error' as failure.
    const isFailed = status === 'failed' || status === 'error';
    const isFinished = status === 'success' || isFailed;
    if (isFinished) {
      if (isFailed) s.fail++;
      else s.succ++;
    }

    const done = s.succ + s.fail;
    taskRegistry.update(s.taskId, { current: done, total });

    if (done >= total) {
      if (s.fail > 0 && s.succ === 0) {
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
