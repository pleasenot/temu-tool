/**
 * Content script injected into Temu product pages
 * Adds a floating "Collect" button
 */

function isProductPage() {
  const url = window.location.href;
  return /temu\.com.*\/.*g-/.test(url) || document.querySelector('h1') !== null;
}

function createCollectButton() {
  const btn = document.createElement('button');
  btn.id = 'temu-lister-collect-btn';
  btn.textContent = '\u91c7\u96c6';
  btn.style.cssText = [
    'position: fixed',
    'bottom: 80px',
    'right: 30px',
    'z-index: 99999',
    'width: 56px',
    'height: 56px',
    'border-radius: 50%',
    'background: #2563eb',
    'color: white',
    'border: none',
    'cursor: pointer',
    'font-size: 14px',
    'font-weight: bold',
    'box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4)',
    'transition: all 0.2s',
    'display: flex',
    'align-items: center',
    'justify-content: center'
  ].join(';');

  btn.addEventListener('mouseenter', function() {
    btn.style.transform = 'scale(1.1)';
    btn.style.boxShadow = '0 6px 16px rgba(37, 99, 235, 0.5)';
  });

  btn.addEventListener('mouseleave', function() {
    btn.style.transform = 'scale(1)';
    btn.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.4)';
  });

  btn.addEventListener('click', function() {
    btn.textContent = '...';
    btn.style.background = '#6b7280';

    var product = scrapeProduct();

    if (!product || !product.title) {
      btn.textContent = '\u5931\u8d25';
      btn.style.background = '#ef4444';
      setTimeout(function() {
        btn.textContent = '\u91c7\u96c6';
        btn.style.background = '#2563eb';
      }, 2000);
      return;
    }

    chrome.runtime.sendMessage(
      { type: 'product:collect', payload: product },
      function(response) {
        if (response && response.success) {
          btn.textContent = '\u5df2\u91c7\u96c6';
          btn.style.background = '#22c55e';
        } else {
          btn.textContent = '\u5931\u8d25';
          btn.style.background = '#ef4444';
        }

        setTimeout(function() {
          btn.textContent = '\u91c7\u96c6';
          btn.style.background = '#2563eb';
        }, 2000);
      }
    );
  });

  return btn;
}

function init() {
  if (document.getElementById('temu-lister-collect-btn')) return;
  setTimeout(function() {
    if (isProductPage()) {
      document.body.appendChild(createCollectButton());
    }
  }, 1500);
}

init();

var lastUrl = window.location.href;
var observer = new MutationObserver(function() {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    var oldBtn = document.getElementById('temu-lister-collect-btn');
    if (oldBtn) oldBtn.remove();
    setTimeout(init, 1500);
  }
});

observer.observe(document.body, { childList: true, subtree: true });
