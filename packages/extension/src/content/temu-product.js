/**
 * Content script injected into Temu product pages
 * Adds a floating "Collect" button
 */

function isProductPage() {
  var url = window.location.href;
  return /temu\.com.*\/.*g-/.test(url) || document.querySelector('h1') !== null;
}

function createCollectButton() {
  var btn = document.createElement('button');
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
      showToast('\u672a\u80fd\u8bc6\u522b\u5546\u54c1\u4fe1\u606f\uff0c\u8bf7\u5728\u5546\u54c1\u8be6\u60c5\u9875\u4f7f\u7528', false);
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
          showToast('\u91c7\u96c6\u6210\u529f\uff01\u5df2\u4fdd\u5b58\u5230\u540e\u53f0', true);
        } else {
          btn.textContent = '\u5931\u8d25';
          btn.style.background = '#ef4444';
          var err = (response && response.error) || '\u672a\u8fde\u63a5\u540e\u53f0\u670d\u52a1';
          showToast('\u91c7\u96c6\u5931\u8d25\uff1a' + err, false);
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

function showToast(text, ok) {
  var existing = document.getElementById('temu-lister-toast');
  if (existing) existing.remove();
  var toast = document.createElement('div');
  toast.id = 'temu-lister-toast';
  toast.textContent = text;
  toast.style.cssText = [
    'position: fixed',
    'top: 24px',
    'left: 50%',
    'transform: translateX(-50%) translateY(-20px)',
    'z-index: 999999',
    'padding: 14px 24px',
    'border-radius: 8px',
    'background: ' + (ok ? '#16a34a' : '#dc2626'),
    'color: white',
    'font-size: 14px',
    'font-weight: 600',
    'box-shadow: 0 8px 24px rgba(0,0,0,0.2)',
    'opacity: 0',
    'transition: all 0.3s ease'
  ].join(';');
  document.body.appendChild(toast);
  // animate in
  setTimeout(function() {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  }, 10);
  // animate out
  setTimeout(function() {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-20px)';
    setTimeout(function() { toast.remove(); }, 300);
  }, 2500);
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
