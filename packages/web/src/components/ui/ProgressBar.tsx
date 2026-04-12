export interface ProgressBarProps {
  value?: number; // 0–100
  indeterminate?: boolean;
  className?: string;
}

export function ProgressBar({ value = 0, indeterminate, className = '' }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-1.5 w-full bg-surface-hover rounded-full overflow-hidden ${className}`}>
      <div
        className="h-full bg-gold rounded-full"
        style={{
          width: indeterminate ? '40%' : `${pct}%`,
          animation: 'pulse-gold 1.6s ease-in-out infinite alternate',
          transition: 'width 300ms ease-out',
        }}
      />
    </div>
  );
}
