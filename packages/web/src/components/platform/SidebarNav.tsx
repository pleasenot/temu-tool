import { NavLink } from 'react-router-dom';
import { navItems, type NavSection } from './navItems';
import { useWsConnected } from './WebSocketBus';

const SECTIONS: NavSection[] = ['WORKSHOP', 'SYSTEM'];

export function SidebarNav() {
  const connected = useWsConnected();

  return (
    <nav className="w-64 shrink-0 flex flex-col border-r border-edge-subtle relative overflow-hidden">
      {/* Glass background with gradient mesh */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: `
            radial-gradient(ellipse at 20% 0%, rgba(129, 140, 248, 0.08) 0%, transparent 60%),
            radial-gradient(ellipse at 80% 100%, rgba(192, 132, 252, 0.05) 0%, transparent 60%),
            linear-gradient(180deg, #0d1020 0%, #0a0c18 100%)
          `,
        }}
      />

      <div className="px-6 pt-7 pb-6">
        <div className="font-display text-[22px] font-bold tracking-tight text-ink-primary leading-none">
          <span className="gradient-text">TEMU</span>
          <span className="text-ink-primary ml-1.5 font-light opacity-60">LISTER</span>
        </div>
        <div className="font-mono text-[10px] text-ink-muted mt-2.5 tracking-[0.15em]">v0.1.0</div>
      </div>

      <div className="flex-1 px-3 space-y-7 overflow-y-auto">
        {SECTIONS.map((section) => {
          const items = navItems.filter((i) => i.section === section);
          if (items.length === 0) return null;
          return (
            <div key={section}>
              <div className="px-3 mb-2.5 text-[10px] font-mono tracking-[0.2em] text-ink-muted uppercase">
                {section}
              </div>
              <div className="space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.id}
                      to={item.to}
                      className={({ isActive }) =>
                        [
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm relative transition-all duration-200',
                          isActive
                            ? 'bg-gold-soft text-gold shadow-sm'
                            : 'text-ink-secondary hover:text-ink-primary hover:bg-surface-hover',
                        ].join(' ')
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span
                              className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r"
                              style={{
                                background: 'linear-gradient(180deg, #818cf8, #c084fc)',
                              }}
                            />
                          )}
                          <Icon size={18} className={isActive ? 'text-gold' : 'opacity-60'} />
                          <span className="flex-1 font-medium">{item.label}</span>
                          {item.badge && (
                            <span className="font-mono text-[10px] text-ink-muted tabular">
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-5 py-4 border-t border-edge-subtle">
        <div className="flex items-center gap-2.5">
          <span
            className={`inline-block w-2 h-2 rounded-full transition-colors ${
              connected ? 'bg-status-success shadow-[0_0_8px_rgba(52,211,153,0.4)]' : 'bg-ink-muted'
            }`}
            aria-hidden
          />
          <span className="font-mono text-[10px] text-ink-secondary">
            Minimax · Temu {connected ? '已连接' : '待连接'}
          </span>
        </div>
      </div>
    </nav>
  );
}
