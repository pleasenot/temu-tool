/**
 * Content script injected into Temu product pages
 * Adds a floating "Collect" button
 */

// Inline the scraper since Chrome MV3 content scripts can't use ES modules
// (scraper.js functions are loaded separately via manifest)

function isProductPage() {
  const url = window.location.href;
  return /temu\.com.*\/.*g-/.test(url) || document.querySelector('h1') !== null;
}

function createCollectButton() {
  const btn = document.createElement('button');
  btn.id = 'temu-lister-collect-btn';
  btn.textContent = '采集';
  btn.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 30px;
    z-index: 99999;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: #2563eb;
    color: white;
    border: none;
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'scale(1.1)';
    btn.style.boxShadow = '0 6px 16px rgba(37, 99, 235, 0.5)';
  });

  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)';
    btn.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.4)';
  });

  btn.addEventListener('click', async () => {
    btn.textContent = '...';
    btn.style.background = '#6b7280';

    const product = scrapeProduct();

    if (!product || !product.title) {
      btn.textContent = '失败';
      btn.style.background = '#ef4444';
      setTimeout(() => {
        btn.textContent = '采集';
        btn.style.background = '#2563eb';
      }, 2000);
      return;
    }

    chrome.runtime.sendMessage(
      { type: 'product:collect', payload: product },
      (response) => {
        if (response?.success) {
          btn.textContent = '已采集';
          btn.style.background = '#22c55e';
        } else {
          btn.textContent = '失败';
          btn.style.background = '#ef4444';
        }

        setTimeout(() => {
          btn.textContent = '采集';
          btn.style.background = '#2563eb';
        }, 2000);
      }
    );
  });

  return btn;
}

function init() {
  if (document.getElementById('temu-lister-collect-btn')) return;
  setTimeout(() => {
    if (isProductPage()) {
      document.body.appendChild(createCollectButton());
    }
  }, 1500);
}

init();

let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    document.getElementById('temu-lister-collect-btn')?.remove();
    setTimeout(init, 1500);
  }
});

observer.observe(document.body, { childList: true, subtree: true });
