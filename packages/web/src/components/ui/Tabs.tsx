import { ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ items, value, onChange, className = '' }: TabsProps) {
  return (
    <div className={`flex border-b border-edge-subtle gap-1 ${className}`}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            className={[
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors relative -mb-px border-b-2',
              active
                ? 'text-gold border-gold'
                : 'text-ink-secondary border-transparent hover:text-ink-primary',
              item.disabled && 'opacity-40 cursor-not-allowed',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
