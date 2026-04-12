import { ReactNode } from 'react';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}

export function Tooltip({ content, children, side = 'top', className = '' }: TooltipProps) {
  return (
    <span className={`relative inline-flex group ${className}`}>
      {children}
      <span
        className={[
          'absolute left-1/2 -translate-x-1/2 z-50 whitespace-nowrap',
          'px-2 py-1 text-xs rounded-md',
          'bg-surface-elevated border border-edge text-ink-primary shadow-modal',
          'opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity',
          side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
        ].join(' ')}
        role="tooltip"
      >
        {content}
      </span>
    </span>
  );
}
