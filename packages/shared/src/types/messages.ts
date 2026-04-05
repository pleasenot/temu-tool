// WebSocket message protocol between Extension <-> Electron <-> Web UI

export interface WsMessage {
  type: string;
  id: string;
  timestamp: number;
  payload: unknown;
}

// Extension -> Electron: Product collected from Temu page
export interface ProductCollectMessage extends WsMessage {
  type: 'product:collect';
  payload: {
    title: string;
    url: string;
    price?: number;
    currency?: string;
    category?: string;
    imageUrls: string[];
    specifications?: Record<string, string>;
    skuVariants?: Array<{ name: string; options: string[] }>;
  };
}

// Electron -> Extension: Acknowledge collection
export interface ProductCollectAckMessage extends WsMessage {
  type: 'product:collect:ack';
  payload: {
    success: boolean;
    productId?: string;
    error?: string;
  };
}

// Electron -> Web UI: Mockup progress update
export interface MockupProgressMessage extends WsMessage {
  type: 'mockup:progress';
  payload: {
    current: number;
    total: number;
    productTitle: string;
    templateName: string;
    status: 'processing' | 'completed' | 'error';
    error?: string;
  };
}

// Electron -> Web UI: Listing progress update
export interface ListingProgressMessage extends WsMessage {
  type: 'listing:progress';
  payload: {
    current: number;
    total: number;
    productTitle: string;
    status: 'filling' | 'waiting_confirm' | 'submitted' | 'error';
    error?: string;
  };
}

// Electron -> Web UI: CAPTCHA needed
export interface CaptchaNeededMessage extends WsMessage {
  type: 'listing:captcha';
  payload: {
    message: string;
  };
}

// Extension -> Electron: Auth handshake
export interface AuthMessage extends WsMessage {
  type: 'auth';
  payload: {
    token: string;
    source: 'extension' | 'web';
  };
}
