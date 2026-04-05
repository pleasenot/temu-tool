const WS_URL = 'ws://localhost:23789';

let ws = null;
let pendingMessages = [];

function connectWs() {
  return new Promise((resolve, reject) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      resolve(ws);
      return;
    }

    const socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      ws = socket;
      // Authenticate as extension
      socket.send(JSON.stringify({
        type: 'auth',
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        payload: { source: 'extension' },
      }));

      // Send any pending messages
      for (const msg of pendingMessages) {
        socket.send(JSON.stringify(msg));
      }
      pendingMessages = [];

      resolve(socket);
    };

    socket.onerror = () => {
      reject(new Error('Cannot connect to Temu Lister backend'));
    };

    socket.onclose = () => {
      ws = null;
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'product:collect:ack') {
          chrome.runtime.sendMessage(msg).catch(() => {});
        }
      } catch {}
    };
  });
}

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'product:collect') {
    const wsMsg = {
      type: 'product:collect',
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      payload: message.payload,
    };

    connectWs()
      .then((socket) => {
        socket.send(JSON.stringify(wsMsg));
        sendResponse({ success: true });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });

    return true;
  }

  if (message.type === 'check-connection') {
    connectWs()
      .then(() => sendResponse({ connected: true }))
      .catch(() => sendResponse({ connected: false }));
    return true;
  }
});
