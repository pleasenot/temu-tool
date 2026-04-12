import { create } from 'zustand';
import { useState } from 'react';
import { ChevronDown, ChevronUp, X, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ProgressBar } from '../ui/ProgressBar';

export type TaskKind = 'video-gen' | 'title-ai' | 'mockup' | 'image' | 'generic';
export type TaskStatus = 'running' | 'success' | 'failed';

export interface TaskUpdatePatch {
  progress?: number;
  text?: string;
  current?: number;
  total?: number;
}

export interface TaskEntry {
  id: string;
  kind: TaskKind;
  title: string;
  status: TaskStatus;
  progress: number;
  text?: string;
  current?: number;
  total?: number;
  startedAt: number;
  errorMsg?: string;
}

interface TaskStore {
  tasks: Record<string, TaskEntry>;
  start: (opts: { kind: TaskKind; title: string; total?: number; id?: string }) => string;
  update: (id: string, patch: TaskUpdatePatch) => void;
  done: (id: string) => void;
  fail: (id: string, errorMsg: string) => void;
  dismiss: (id: string) => void;
}

export const useTaskStore = create<TaskStore>()((set) => ({
  tasks: {},
  start: ({ kind, title, total, id }) => {
    const taskId = id ?? Math.random().toString(36).slice(2);
    set((s) => ({
      tasks: {
        ...s.tasks,
        [taskId]: {
          id: taskId,
          kind,
          title,
          status: 'running',
          progress: 0,
          total,
          current: 0,
          startedAt: Date.now(),
        },
      },
    }));
    return taskId;
  },
  update: (id, patch) =>
    set((s) => {
      const t = s.tasks[id];
      if (!t) return s;
      const next: TaskEntry = { ...t, ...patch };
      // Auto-derive progress from current/total if progress not provided
      if (patch.progress === undefined && patch.current !== undefined) {
        const denom = patch.total ?? t.total;
        if (denom && denom > 0) {
          next.progress = Math.round((patch.current / denom) * 100);
        }
      }
      return { tasks: { ...s.tasks, [id]: next } };
    }),
  done: (id) =>
    set((s) => {
      const t = s.tasks[id];
      if (!t) return s;
      const next: TaskEntry = { ...t, status: 'success', progress: 100 };
      // Auto-dismiss after 2s
      setTimeout(() => {
        useTaskStore.setState((s2) => {
          const copy = { ...s2.tasks };
          delete copy[id];
          return { tasks: copy };
        });
      }, 2000);
      return { tasks: { ...s.tasks, [id]: next } };
    }),
  fail: (id, errorMsg) =>
    set((s) => {
      const t = s.tasks[id];
      if (!t) return s;
      return { tasks: { ...s.tasks, [id]: { ...t, status: 'failed', errorMsg } } };
    }),
  dismiss: (id) =>
    set((s) => {
      const copy = { ...s.tasks };
      delete copy[id];
      return { tasks: copy };
    }),
}));

/**
 * Imperative task registry — call from anywhere, no provider/context needed.
 *   const id = taskRegistry.start({ kind: 'video-gen', title: '生成视频 × 3', total: 3 });
 *   taskRegistry.update(id, { current: 1 });
 *   taskRegistry.done(id);
 */
export const taskRegistry = {
  start: (opts: { kind: TaskKind; title: string; total?: number; id?: string }) =>
    useTaskStore.getState().start(opts),
  update: (id: string, patch: TaskUpdatePatch) => useTaskStore.getState().update(id, patch),
  done: (id: string) => useTaskStore.getState().done(id),
  fail: (id: string, msg: string) => useTaskStore.getState().fail(id, msg),
  dismiss: (id: string) => useTaskStore.getState().dismiss(id),
};

const KIND_LABEL: Record<TaskKind, string> = {
  'video-gen': '视频生成',
  'title-ai': 'AI 标题',
  mockup: '套图',
  image: '图片',
  generic: '任务',
};

export function TaskTray() {
  const tasksMap = useTaskStore((s) => s.tasks);
  const dismiss = useTaskStore((s) => s.dismiss);
  const tasks = Object.values(tasksMap);
  const [expanded, setExpanded] = useState(true);

  if (tasks.length === 0) return null;

  const running = tasks.filter((t) => t.status === 'running').length;
  const failed = tasks.filter((t) => t.status === 'failed').length;

  return (
    <div className="fixed bottom-4 right-4 z-[55] w-80 enter-stagger">
      <div className="rounded-lg border border-edge bg-surface-raised shadow-modal overflow-hidden">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors"
        >
          <span className="flex items-center gap-2 font-mono text-ink-primary">
            <span className="inline-block w-2 h-2 rounded-full bg-gold animate-pulse" />
            {running > 0 ? `${running} 个任务运行中` : '所有任务完成'}
            {failed > 0 && <span className="text-status-danger">· {failed} 失败</span>}
          </span>
          {expanded ? (
            <ChevronDown size={16} className="text-ink-muted" />
          ) : (
            <ChevronUp size={16} className="text-ink-muted" />
          )}
        </button>

        {expanded && (
          <div className="border-t border-edge-subtle max-h-80 overflow-y-auto">
            {tasks.map((t) => {
              const StatusIcon =
                t.status === 'success'
                  ? CheckCircle2
                  : t.status === 'failed'
                  ? AlertTriangle
                  : Loader2;
              const iconColor =
                t.status === 'success'
                  ? 'text-status-success'
                  : t.status === 'failed'
                  ? 'text-status-danger'
                  : 'text-gold';
              return (
                <div
                  key={t.id}
                  className={`px-4 py-3 border-b border-edge-subtle last:border-b-0 ${
                    t.status === 'failed' ? 'ring-1 ring-status-danger/40' : ''
                  }`}
                >
                  <div className="flex items-start gap-2 mb-1.5">
                    <StatusIcon
                      size={14}
                      className={`${iconColor} shrink-0 mt-0.5 ${
                        t.status === 'running' ? 'animate-spin' : ''
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-ink-muted font-mono uppercase tracking-wider">
                        {KIND_LABEL[t.kind]}
                      </div>
                      <div className="text-sm text-ink-primary truncate">{t.title}</div>
                    </div>
                    <button
                      onClick={() => dismiss(t.id)}
                      className="text-ink-muted hover:text-ink-primary"
                      aria-label="忽略"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  {t.status === 'running' && <ProgressBar value={t.progress} />}
                  <div className="mt-1.5 flex justify-between text-[10px] font-mono text-ink-muted tabular">
                    <span>{t.text || (t.total ? `${t.current ?? 0} / ${t.total}` : '')}</span>
                    <span>
                      {t.status === 'running'
                        ? `${t.progress}%`
                        : t.status === 'success'
                        ? '完成'
                        : '失败'}
                    </span>
                  </div>
                  {t.errorMsg && (
                    <div className="mt-1 text-[10px] text-status-danger leading-relaxed">
                      {t.errorMsg}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
