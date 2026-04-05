import { app, Tray, Menu, nativeImage, shell } from 'electron';
import path from 'path';
import { startHttpServer } from './server/http-server';
import { startWsServer } from './server/ws-server';
import { initDatabase } from './services/database';

const HTTP_PORT = 23790;
const WS_PORT = 23789;

let tray: Tray | null = null;

function createTray() {
  // Use a simple 16x16 icon (will be replaced with a real icon later)
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开管理后台',
      click: () => {
        shell.openExternal(`http://localhost:${HTTP_PORT}`);
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Temu 批量铺货工具');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    shell.openExternal(`http://localhost:${HTTP_PORT}`);
  });
}

app.whenReady().then(async () => {
  // Initialize database
  initDatabase();

  // Start HTTP server (serves React SPA + REST API)
  startHttpServer(HTTP_PORT);

  // Start WebSocket server (extension + web UI communication)
  startWsServer(WS_PORT);

  // Create system tray
  createTray();

  console.log(`Temu Lister running:`);
  console.log(`  Web UI: http://localhost:${HTTP_PORT}`);
  console.log(`  WebSocket: ws://localhost:${WS_PORT}`);
});

// Prevent Electron from quitting when all windows are closed (tray mode)
app.on('window-all-closed', (e: Event) => {
  e.preventDefault();
});
