var WS_URL = 'ws://localhost:23789';

var ws = null;
var pendingMessages = [];
var pendingAcks = {}; // id -> sendResponse callback

function connectWs() {
  return new Promise(function(resolve, reject) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      resolve(ws);
      return;
    }

    var socket = new WebSocket(WS_URL);

    socket.onopen = function() {
      ws = socket;
      socket.send(JSON.stringify({
        type: 'auth',
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        payload: { source: 'extension' }
      }));

      for (var i = 0; i < pendingMessages.length; i++) {
        socket.send(JSON.stringify(pendingMessages[i]));
      }
      pendingMessages = [];

      resolve(socket);
    };

    socket.onerror = function() {
      reject(new Error('Cannot connect to Temu Lister backend'));
    };

    socket.onclose = function() {
      ws = null;
    };

    socket.onmessage = function(event) {
      try {
        var msg = JSON.parse(event.data);
        if (msg.type === 'product:collect:ack') {
          var reqId = msg.payload && msg.payload.requestId;
          if (reqId && pendingAcks[reqId]) {
            pendingAcks[reqId](msg.payload);
            delete pendingAcks[reqId];
          }
        }
      } catch (e) {}
    };
  });
}

chrome.runtime.onMessage.addListener(function(message, _sender, sendResponse) {
  if (message.type === 'product:collect') {
    var reqId = crypto.randomUUID();
    var wsMsg = {
      type: 'product:collect',
      id: reqId,
      timestamp: Date.now(),
      payload: Object.assign({ requestId: reqId }, message.payload)
    };

    pendingAcks[reqId] = sendResponse;
    // Timeout safety net
    setTimeout(function() {
      if (pendingAcks[reqId]) {
        pendingAcks[reqId]({ success: false, error: '后端无响应' });
        delete pendingAcks[reqId];
      }
    }, 10000);

    connectWs()
      .then(function(socket) {
        socket.send(JSON.stringify(wsMsg));
      })
      .catch(function(err) {
        if (pendingAcks[reqId]) {
          pendingAcks[reqId]({ success: false, error: err.message });
          delete pendingAcks[reqId];
        }
      });

    return true;
  }

  if (message.type === 'check-connection') {
    connectWs()
      .then(function() { sendResponse({ connected: true }); })
      .catch(function() { sendResponse({ connected: false }); });
    return true;
  }
});
