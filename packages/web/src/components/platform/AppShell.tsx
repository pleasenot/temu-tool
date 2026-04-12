import { ReactNode } from 'react';
import { SidebarNav } from './SidebarNav';
import { TaskTray } from './TaskTray';
import { ToastStack } from '../ui/Toast';
import { WebSocketBus } from './WebSocketBus';
import { WsTaskBridge } from './WsTaskBridge';

/**
 * Single root layout. All pages render inside. Owns global overlays:
 * Toast stack (top-right), Task tray (bottom-right), WebSocket bus (invisible),
 * and the WS-to-TaskTray bridge that routes long-running batch progress.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface-base text-ink-primary">
      <SidebarNav />
      <main className="flex-1 min-w-0 relative">{children}</main>
      <ToastStack />
      <TaskTray />
      <WebSocketBus />
      <WsTaskBridge />
    </div>
  );
}
