import { create } from 'zustand';
import { useEffect } from 'react';
import { connectWebSocket } from '../../api/client';

export interface WsMessage {
  type: string;
  id: string;
  timestamp: number;
  payload?: any;
}

type Handler = (msg: WsMessage) => void;

interface WsStore {
  handlers: Map<string, Set<Handler>>;
  connected: boolean;
}

const wsStore = create<WsStore>()(() => ({
  handlers: new Map(),
  connected: false,
}));

export function useWsConnected() {
  return wsStore((s) => s.connected);
}

let initialized = false;
function init() {
  if (initialized) return;
  initialized = true;

  connectWebSocket((msg: WsMessage) => {
    // First message implies WS bus is alive
    if (!wsStore.getState().connected) wsStore.setState({ connected: true });

    const handlers = wsStore.getState().handlers.get(msg.type);
    if (handlers) handlers.forEach((h) => h(msg));
    const wildcard = wsStore.getState().handlers.get('*');
    if (wildcard) wildcard.forEach((h) => h(msg));
  });
}

/**
 * Subscribe to a single WebSocket event type. Handler is invoked on every
 * matching message until the component unmounts.
 *
 *   useWsEvent('video-gen:progress', (msg) => { ... });
 */
export function useWsEvent(type: string, handler: Handler) {
  useEffect(() => {
    init();
    const map = wsStore.getState().handlers;
    let bucket = map.get(type);
    if (!bucket) {
      bucket = new Set();
      map.set(type, bucket);
    }
    bucket.add(handler);
    return () => {
      bucket!.delete(handler);
    };
  }, [type, handler]);
}

/** Mount once at the top of the tree to ensure WS is initialized. */
export function WebSocketBus() {
  useEffect(() => {
    init();
  }, []);
  return null;
}
