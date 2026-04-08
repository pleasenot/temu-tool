import { Outlet, NavLink } from 'react-router-dom';

const navItems = [
  { path: '/products', label: '产品管理', icon: '📦' },
  { path: '/mockup', label: '批量套图', icon: '🖼️' },
  { path: '/pricing', label: '核价模板', icon: '💰' },
  { path: '/listing', label: '自动上品', icon: '🚀' },
  { path: '/account', label: '账号管理', icon: '👤' },
  { path: '/settings', label: '设置', icon: '⚙️' },
];

export function MainLayout() {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <nav className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-800">Temu 铺货工具</h1>
          <p className="text-xs text-gray-500 mt-1">批量采集 · 套图 · 上品</p>
        </div>

        <div className="flex-1 py-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>

        <div className="p-4 border-t border-gray-200 text-xs text-gray-400">
          v1.0.0
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
}
