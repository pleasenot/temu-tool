import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnBackdrop?: boolean;
}

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
};

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md enter-stagger"
      onClick={(e) => closeOnBackdrop && e.target === e.currentTarget && onClose()}
    >
      <div
        className={`relative ${SIZES[size]} w-full mx-4 max-h-[90vh] flex flex-col rounded-2xl bg-surface-elevated/95 backdrop-blur-xl border border-edge shadow-modal`}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-edge-subtle">
            <div className="font-display text-lg font-semibold text-ink-primary">{title}</div>
            <button
              onClick={onClose}
              aria-label="关闭"
              className="text-ink-muted hover:text-ink-primary p-1.5 rounded-lg hover:bg-surface-hover transition-all duration-200"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-edge-subtle">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
