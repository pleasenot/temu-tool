// Check connection status
chrome.runtime.sendMessage({ type: 'check-connection' }, (response) => {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');

  if (response?.connected) {
    dot.classList.add('connected');
    text.textContent = '已连接到本地服务';
  } else {
    dot.classList.add('disconnected');
    text.textContent = '未连接 - 请启动桌面应用';
  }
});

// Open management dashboard
document.getElementById('openDashboard').addEventListener('click', () => {
  chrome.tabs.create({ url: 'http://localhost:23790' });
});

// Collect current page
document.getElementById('collectCurrent').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id || !tab.url?.includes('temu.com')) {
    alert('请在 Temu 产品页面使用此功能');
    return;
  }

  // Execute the scraper in the content script context
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const btn = document.getElementById('temu-lister-collect-btn');
      if (btn) btn.click();
      else alert('请在产品详情页使用');
    },
  });
});
