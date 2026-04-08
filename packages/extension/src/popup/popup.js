// Set Chinese text via JS to avoid encoding issues
document.getElementById('title').textContent = 'Temu \u94fa\u8d27\u5de5\u5177';
document.getElementById('subtitle').textContent = '\u6279\u91cf\u91c7\u96c6 \u00b7 \u5957\u56fe \u00b7 \u4e0a\u54c1';
document.getElementById('openDashboard').textContent = '\u6253\u5f00\u7ba1\u7406\u540e\u53f0';
document.getElementById('collectCurrent').textContent = '\u91c7\u96c6\u5f53\u524d\u9875\u9762';
document.getElementById('infoText').textContent = '\u786e\u4fdd Temu Lister \u684c\u9762\u5e94\u7528\u5df2\u542f\u52a8';
document.getElementById('statusText').textContent = '\u68c0\u67e5\u8fde\u63a5\u4e2d...';

// Check connection status
chrome.runtime.sendMessage({ type: 'check-connection' }, function(response) {
  var dot = document.getElementById('statusDot');
  var text = document.getElementById('statusText');

  if (response && response.connected) {
    dot.classList.add('connected');
    text.textContent = '\u5df2\u8fde\u63a5\u5230\u672c\u5730\u670d\u52a1';
  } else {
    dot.classList.add('disconnected');
    text.textContent = '\u672a\u8fde\u63a5 - \u8bf7\u542f\u52a8\u684c\u9762\u5e94\u7528';
  }
});

// Open management dashboard
document.getElementById('openDashboard').addEventListener('click', function() {
  chrome.tabs.create({ url: 'http://localhost:23790' });
});

// Collect current page
document.getElementById('collectCurrent').addEventListener('click', function() {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    var tab = tabs[0];
    if (!tab || !tab.id || !tab.url || tab.url.indexOf('temu.com') === -1) {
      alert('\u8bf7\u5728 Temu \u4ea7\u54c1\u9875\u9762\u4f7f\u7528\u6b64\u529f\u80fd');
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: function() {
        var btn = document.getElementById('temu-lister-collect-btn');
        if (btn) btn.click();
        else alert('\u8bf7\u5728\u4ea7\u54c1\u8be6\u60c5\u9875\u4f7f\u7528');
      }
    });
  });
});
