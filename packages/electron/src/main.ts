import 'dotenv/config';
import { app, Tray, Menu, nativeImage, shell } from 'electron';
import path from 'path';
import { startHttpServer } from './server/http-server';
import { startWsServer } from './server/ws-server';
import { initDatabase } from './services/database';
import { migrateLegacyPlaintextSecrets } from './services/secure-settings';
import { isEncryptionAvailable } from './services/encryption';

// Disable GPU to avoid crashes in environments without GPU support
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('no-sandbox');

const HTTP_PORT = 23790;
const WS_PORT = 23789;

let tray: Tray | null = null;

function createTray() {
  // Create a minimal 16x16 tray icon
  const icon = nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAADklEQVQ4jWNgGAWDFQAAAhAAAbksmMoAAAAASUVORK5CYII=',
      'base64'
    ),
    { width: 16, height: 16 }
  );
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
  await initDatabase();

  // One-shot migration: encrypt any legacy plaintext secrets in the settings
  // table. Safe to call repeatedly. Logs a warning if the OS keychain isn't
  // available — in that case secrets stay plaintext as a fallback.
  if (isEncryptionAvailable()) {
    migrateLegacyPlaintextSecrets();
  } else {
    console.warn(
      '[security] safeStorage encryption not available on this system — secrets will be stored as plaintext.'
    );
  }

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
app.on('window-all-closed', () => {
  // Do nothing - keep running in tray mode
});
