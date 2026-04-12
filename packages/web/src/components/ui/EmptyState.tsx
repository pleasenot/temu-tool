import { ReactNode } from 'react';

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-16 px-6 ${className}`}>
      {icon && <div className="text-ink-muted mb-4 [&_svg]:w-12 [&_svg]:h-12">{icon}</div>}
      <div className="font-display text-2xl text-ink-primary mb-2">{title}</div>
      {description && (
        <div className="text-ink-secondary text-sm max-w-md mb-6 leading-relaxed">{description}</div>
      )}
      {action}
    </div>
  );
}
