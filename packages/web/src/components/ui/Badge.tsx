import { ReactNode } from 'react';

export type BadgeTone = 'gold' | 'violet' | 'success' | 'warn' | 'danger' | 'neutral';

export interface BadgeProps {
  children?: ReactNode;
  variant?: 'count' | 'status' | 'pip';
  tone?: BadgeTone;
  className?: string;
}

const SOLID_BG: Record<BadgeTone, string> = {
  gold: 'bg-gold text-surface-base',
  violet: 'bg-violet-accent text-surface-base',
  success: 'bg-status-success text-surface-base',
  warn: 'bg-status-warn text-surface-base',
  danger: 'bg-status-danger text-surface-base',
  neutral: 'bg-surface-hover text-ink-secondary',
};

const SOFT_BG: Record<BadgeTone, string> = {
  gold: 'bg-gold-soft text-gold border border-gold/30',
  violet: 'bg-violet-accent/15 text-violet-accent border border-violet-accent/30',
  success: 'bg-status-success/15 text-status-success border border-status-success/30',
  warn: 'bg-status-warn/15 text-status-warn border border-status-warn/30',
  danger: 'bg-status-danger/15 text-status-danger border border-status-danger/30',
  neutral: 'bg-surface-hover text-ink-secondary border border-edge',
};

const PIP_BG: Record<BadgeTone, string> = {
  gold: 'bg-gold',
  violet: 'bg-violet-accent',
  success: 'bg-status-success',
  warn: 'bg-status-warn',
  danger: 'bg-status-danger',
  neutral: 'bg-ink-muted',
};

export function Badge({ children, variant = 'count', tone = 'neutral', className = '' }: BadgeProps) {
  if (variant === 'pip') {
    return (
      <span
        className={`inline-block w-2 h-2 rounded-full ${PIP_BG[tone]} ${className}`}
        aria-hidden
      />
    );
  }
  if (variant === 'status') {
    return (
      <span
        className={[
          'inline-flex items-center font-mono text-[10px] font-semibold rounded-sm px-1.5 py-0.5 leading-none',
          SOFT_BG[tone],
          className,
        ].join(' ')}
      >
        {children}
      </span>
    );
  }
  return (
    <span
      className={[
        'inline-flex items-center font-mono text-[10px] font-semibold rounded-sm px-1.5 py-0.5 leading-none tabular',
        SOLID_BG[tone],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  );
}
