import { create } from 'zustand';
import { ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';

interface ToastEntry {
  id: string;
  message: ReactNode;
  tone: ToastTone;
}

interface ToastStore {
  toasts: ToastEntry[];
  push: (message: ReactNode, tone?: ToastTone) => void;
  dismiss: (id: string) => void;
}

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, tone = 'info') => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Imperative toast API. Call from anywhere — no provider needed beyond <ToastStack/>. */
export const toast = {
  success: (m: ReactNode) => useToastStore.getState().push(m, 'success'),
  error: (m: ReactNode) => useToastStore.getState().push(m, 'error'),
  info: (m: ReactNode) => useToastStore.getState().push(m, 'info'),
};

const TONES: Record<
  ToastTone,
  { Icon: typeof CheckCircle2; ring: string; color: string }
> = {
  success: { Icon: CheckCircle2, ring: 'ring-status-success/40', color: 'text-status-success' },
  error: { Icon: AlertCircle, ring: 'ring-status-danger/40', color: 'text-status-danger' },
  info: { Icon: Info, ring: 'ring-gold-ring', color: 'text-gold' },
};

export function ToastStack() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const cfg = TONES[t.tone];
        const Icon = cfg.Icon;
        return (
          <div
            key={t.id}
            className={`pointer-events-auto enter-stagger flex items-start gap-2 bg-surface-elevated border border-edge ring-1 ${cfg.ring} rounded-lg shadow-modal px-4 py-3 max-w-sm`}
          >
            <Icon size={18} className={`${cfg.color} shrink-0 mt-0.5`} />
            <div className="text-sm text-ink-primary flex-1">{t.message}</div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="关闭"
              className="text-ink-muted hover:text-ink-primary transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
