import { HTMLAttributes, forwardRef } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  selected?: boolean;
  padded?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { hoverable, selected, padded, className = '', ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={[
        'rounded-xl border bg-surface-card shadow-card transition-all duration-200',
        selected
          ? 'border-gold shadow-glow-gold'
          : 'border-edge',
        hoverable &&
          'hover:bg-surface-hover hover:-translate-y-0.5 hover:shadow-lg hover:border-edge-strong cursor-pointer',
        padded && 'p-5',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  );
});
