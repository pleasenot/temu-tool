import { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-[#818cf8] to-[#6366f1] text-white hover:brightness-110 active:brightness-95 shadow-[0_2px_12px_rgba(129,140,248,0.25)] border border-[rgba(255,255,255,0.1)]',
  secondary:
    'bg-surface-card text-ink-primary border border-edge hover:bg-surface-hover hover:border-edge-strong',
  ghost:
    'bg-transparent text-ink-secondary hover:text-ink-primary hover:bg-surface-hover border border-transparent',
  danger:
    'bg-status-danger/10 text-status-danger border border-status-danger/30 hover:bg-status-danger/20',
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-6 text-base gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, leftIcon, rightIcon, className = '', children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center rounded-lg font-body font-medium whitespace-nowrap',
        'transition-all duration-200 ease-out',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface-base',
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? (
        <span
          className="inline-block w-3.5 h-3.5 border-2 border-current border-r-transparent rounded-full animate-spin"
          aria-hidden
        />
      ) : (
        leftIcon
      )}
      {children}
      {rightIcon}
    </button>
  );
});
