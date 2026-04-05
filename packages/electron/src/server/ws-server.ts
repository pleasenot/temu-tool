import { WebSocketServer, WebSocket } from 'ws';
import type { WsMessage, ProductCollectMessage, ProductCollectAckMessage } from '@temu-lister/shared';
import { v4 as uuid } from 'uuid';
import { dbRun } from '../services/database';

type ClientType = 'extension' | 'web' | 'unknown';

interface ConnectedClient {
  ws: WebSocket;
  type: ClientType;
  id: string;
}

const clients = new Map<string, ConnectedClient>();

let wss: WebSocketServer;

export function startWsServer(port: number) {
  wss = new WebSocketServer({ port, host: '127.0.0.1' });

  wss.on('connection', (ws) => {
    const clientId = uuid();
    const client: ConnectedClient = { ws, type: 'unknown', id: clientId };
    clients.set(clientId, client);

    console.log(`WebSocket client connected: ${clientId}`);

    ws.on('message', (data) => {
      try {
        const msg: WsMessage = JSON.parse(data.toString());
        handleMessage(client, msg);
      } catch (err) {
        console.error('Invalid WebSocket message:', err);
      }
    });

    ws.on('close', () => {
      clients.delete(clientId);
      console.log(`WebSocket client disconnected: ${clientId}`);
    });
  });

  console.log(`WebSocket server listening on ws://localhost:${port}`);
}

function handleMessage(client: ConnectedClient, msg: WsMessage) {
  switch (msg.type) {
    case 'auth':
      client.type = (msg.payload as { source: ClientType }).source;
      console.log(`Client ${client.id} authenticated as ${client.type}`);
      break;

    case 'product:collect':
      handleProductCollect(client, msg as ProductCollectMessage);
      break;

    default:
      console.log(`Unknown message type: ${msg.type}`);
  }
}

function handleProductCollect(client: ConnectedClient, msg: ProductCollectMessage) {
  try {
    const { title, url, price, currency, category, imageUrls, specifications, skuVariants } = msg.payload;
    const productId = uuid();
    const now = new Date().toISOString();

    dbRun(
      `INSERT INTO products (id, title, original_url, price, currency, category, specifications, sku_variants, scraped_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'collected')`,
      [
        productId, title, url, price || null, currency || 'USD',
        category || null,
        specifications ? JSON.stringify(specifications) : null,
        skuVariants ? JSON.stringify(skuVariants) : null,
        now,
      ]
    );

    // Save image records
    for (let i = 0; i < imageUrls.length; i++) {
      const imageId = uuid();
      dbRun(
        'INSERT INTO product_images (id, product_id, original_url, sort_order) VALUES (?, ?, ?, ?)',
        [imageId, productId, imageUrls[i], i]
      );
    }

    // Send ACK back to extension
    const ack: ProductCollectAckMessage = {
      type: 'product:collect:ack',
      id: uuid(),
      timestamp: Date.now(),
      payload: { success: true, productId },
    };
    client.ws.send(JSON.stringify(ack));

    // Notify web UI clients
    broadcastToWeb({
      type: 'product:new',
      id: uuid(),
      timestamp: Date.now(),
      payload: { productId, title },
    });
  } catch (err) {
    const ack: ProductCollectAckMessage = {
      type: 'product:collect:ack',
      id: uuid(),
      timestamp: Date.now(),
      payload: { success: false, error: String(err) },
    };
    client.ws.send(JSON.stringify(ack));
  }
}

export function broadcastToWeb(msg: WsMessage) {
  const data = JSON.stringify(msg);
  for (const client of clients.values()) {
    if (client.type === 'web' && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  }
}
