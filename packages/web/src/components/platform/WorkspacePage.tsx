import { ReactNode } from 'react';

interface RootProps {
  children: ReactNode;
  className?: string;
}

function Root({ children, className = '' }: RootProps) {
  return (
    <div className={`flex flex-col h-full min-h-0 px-10 py-8 ${className}`}>
      {children}
    </div>
  );
}

interface HeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

function Header({ title, subtitle, actions }: HeaderProps) {
  return (
    <div className="flex items-end justify-between pb-5 mb-5 border-b border-edge-subtle gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-bold text-ink-primary leading-none tracking-tight truncate">
          {title}
        </h1>
        {subtitle && (
          <div className="font-mono text-xs text-ink-secondary mt-2.5 tabular">{subtitle}</div>
        )}
      </div>
      {actions && <div className="flex items-center gap-2.5 shrink-0">{actions}</div>}
    </div>
  );
}

function Toolbar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-3 mb-5 min-h-[36px] ${className}`}>{children}</div>
  );
}

function Content({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex-1 min-h-0 overflow-y-auto pr-1 -mr-1 ${className}`}>{children}</div>
  );
}

function Footer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mt-4 sticky bottom-0 ${className}`}>{children}</div>;
}

/**
 * Compound component. Use as <WorkspacePage>...slots...</WorkspacePage>.
 */
export const WorkspacePage = Object.assign(Root, {
  Header,
  Toolbar,
  Content,
  Footer,
});
