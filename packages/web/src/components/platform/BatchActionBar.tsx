import { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';

export interface BatchAction {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  primary?: boolean;
  onClick: () => void;
}

export interface BatchActionBarProps {
  count: number;
  actions: BatchAction[];
  onClear?: () => void;
  label?: ReactNode;
}

/**
 * Sticky-bottom selection bar. Renders nothing when count === 0.
 * Page-agnostic — pages declare actions as a config array.
 */
export function BatchActionBar({ count, actions, onClear, label }: BatchActionBarProps) {
  if (count <= 0) return null;
  return (
    <div className="enter-stagger bg-surface-elevated/90 backdrop-blur-xl border border-edge rounded-xl shadow-modal px-5 py-3.5 flex items-center gap-3">
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-mono text-base text-gold tabular">{count}</span>
        <span className="text-sm text-ink-secondary">{label ?? '已选'}</span>
      </div>
      <div className="flex-1 flex items-center justify-end gap-2 flex-wrap">
        {actions.map((a) => (
          <Button
            key={a.id}
            size="sm"
            variant={a.primary ? 'primary' : 'secondary'}
            disabled={a.disabled}
            leftIcon={a.icon}
            onClick={a.onClick}
          >
            {a.label}
          </Button>
        ))}
        {onClear && (
          <button
            onClick={onClear}
            className="text-ink-muted hover:text-ink-primary p-1.5 rounded-md hover:bg-surface-hover transition-colors"
            aria-label="清除选择"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
