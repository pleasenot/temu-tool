/**
 * Temu product page scraper
 * Strategy:
 *   1) Extract goodsId from the URL (e.g. g-606252767782692)
 *   2) Walk inline JSON, find the node whose goodsId matches, take ONLY its images
 *   3) Fall back to DOM gallery scoped to the main product container (never whole page)
 */

function scrapeProduct() {
  var result = {
    title: '',
    url: window.location.href,
    price: undefined,
    currency: 'USD',
    category: undefined,
    imageUrls: [],
    specifications: {},
    skuVariants: []
  };

  var goodsId = extractGoodsId(window.location.href);

  // Title
  var titleEl =
    document.querySelector('h1') ||
    document.querySelector('[class*="ProductTitle"]') ||
    document.querySelector('[class*="goods-name"]');
  if (titleEl) result.title = (titleEl.textContent || '').trim();

  // Price
  var priceEl = document.querySelector('[class*="price"], [class*="Price"]');
  if (priceEl) {
    var m = (priceEl.textContent || '').match(/[\d.]+/);
    if (m) result.price = parseFloat(m[0]);
  }

  // Category breadcrumbs
  var crumbs = document.querySelectorAll('[class*="breadcrumb"] a, nav a');
  var parts = [];
  crumbs.forEach(function(a) {
    var t = (a.textContent || '').trim();
    if (t && parts.indexOf(t) === -1) parts.push(t);
  });
  if (parts.length) result.category = parts.join(' > ');

  // 0) URL params: top_gallery_url is the guaranteed main image
  collectFromUrlParams(result);

  // 1) Inline JSON, scoped to matching goodsId
  collectFromInlineJson(result, goodsId);

  // 2) DOM scan: any <img> whose URL matches img.kwcdn.com/product/ — strict whitelist
  collectProductImgsFromDom(result);

  result.imageUrls = normalizeImages(result.imageUrls);
  return result;
}

function extractGoodsId(url) {
  var m = url.match(/[-/]g-(\d{6,})/) || url.match(/goods_id=(\d{6,})/);
  return m ? m[1] : null;
}

function isProductImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.indexOf('data:') === 0) return false;
  // Must be from Temu product CDN under /product/ path
  if (!/img\.kwcdn\.com\/product\//.test(url) && !/img\.temu\.com\/.*product/.test(url)) return false;
  // Must be an actual image
  if (!/\.(jpe?g|png|webp)(\?|$|\/)/i.test(url)) return false;
  return true;
}

function collectFromUrlParams(result) {
  try {
    var u = new URL(window.location.href);
    var top = u.searchParams.get('top_gallery_url');
    if (top) pushImage(result.imageUrls, decodeURIComponent(top));
  } catch (e) {}
}

function collectProductImgsFromDom(result) {
  // Scope to the main product container (ancestor of H1) to avoid
  // picking up recommendation/related-products feeds further down the page.
  var h1 = document.querySelector('h1');
  var container = document.body;
  if (h1) {
    var node = h1;
    for (var i = 0; i < 8 && node.parentElement; i++) {
      node = node.parentElement;
      if (node.offsetWidth > 800 && node.offsetHeight > 400) { container = node; break; }
    }
  }
  var imgs = container.querySelectorAll('img');
  imgs.forEach(function(img) {
    var src = img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-original') || '';
    if (src) pushImage(result.imageUrls, src);
    var srcset = img.getAttribute('srcset');
    if (srcset) {
      srcset.split(',').forEach(function(s) {
        var part = s.trim().split(' ')[0];
        if (part) pushImage(result.imageUrls, part);
      });
    }
  });
  // Also scan inline background-image styles inside the same container
  container.querySelectorAll('[style*="background-image"]').forEach(function(d) {
    var m = (d.getAttribute('style') || '').match(/url\(["']?([^"')]+)["']?\)/);
    if (m && m[1]) pushImage(result.imageUrls, m[1]);
  });
}

function pushImage(arr, url) {
  if (!isProductImageUrl(url)) return;
  if (arr.indexOf(url) === -1) arr.push(url);
}

function normalizeImages(list) {
  // Dedupe by file hash (32-hex token in the URL identifies image content)
  // and pick the largest variant for each hash.
  var bestByHash = {};
  var order = [];
  for (var i = 0; i < list.length; i++) {
    var u = list[i];
    if (u.indexOf('//') === 0) u = 'https:' + u;
    // Strip query string to get base URL
    var base = u.split('?')[0];
    var hashMatch = base.match(/[a-f0-9]{32}/i);
    var key = hashMatch ? hashMatch[0] : base;
    // Score: larger declared size = better; absence of size suffix also good
    var sizeMatch = base.match(/_(\d{2,4})x(\d{2,4})\./);
    var score = sizeMatch ? parseInt(sizeMatch[1], 10) : 9999;
    if (!bestByHash[key]) {
      bestByHash[key] = { url: base, score: score };
      order.push(key);
    } else if (score > bestByHash[key].score) {
      bestByHash[key].url = base;
      bestByHash[key].score = score;
    }
  }
  var out = [];
  for (var j = 0; j < order.length; j++) out.push(bestByHash[order[j]].url);
  return out.slice(0, 20);
}

function collectFromInlineJson(result, goodsId) {
  var scripts = document.querySelectorAll('script');
  for (var i = 0; i < scripts.length; i++) {
    var s = scripts[i];
    var txt = s.textContent || '';
    if (!txt) continue;

    // Only parse pure JSON script tags
    if (s.type === 'application/json' || s.id === '__NEXT_DATA__' || s.id === '__RAW_DATA__') {
      try {
        var data = JSON.parse(txt);
        var node = goodsId ? findGoodsNode(data, goodsId, 0) : null;
        if (node) {
          // Found the matching goods node — only collect from it
          collectImagesFromNode(node, result);
          collectMetaFromNode(node, result);
        }
      } catch (e) {}
    }
  }
}

// DFS to find a node whose goodsId/productId matches
function findGoodsNode(node, goodsId, depth) {
  if (!node || depth > 10 || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) {
      var r = findGoodsNode(node[i], goodsId, depth + 1);
      if (r) return r;
    }
    return null;
  }
  // Check if this node IS the goods node
  var idFields = ['goodsId', 'goods_id', 'productId', 'product_id', 'itemId'];
  for (var j = 0; j < idFields.length; j++) {
    var v = node[idFields[j]];
    if (v != null && String(v) === String(goodsId)) {
      // Make sure it actually has product-like fields (not just a reference)
      if (node.goodsName || node.title || node.images || node.imageList || node.hdThumbUrl || node.gallery) {
        return node;
      }
    }
  }
  for (var key in node) {
    if (Object.prototype.hasOwnProperty.call(node, key)) {
      var sub = findGoodsNode(node[key], goodsId, depth + 1);
      if (sub) return sub;
    }
  }
  return null;
}

function collectImagesFromNode(node, result) {
  if (!node || typeof node !== 'object') return;
  // Direct image array fields on this goods node
  var imgFields = ['images', 'imageList', 'gallery', 'detailImages', 'topGallery', 'imgList', 'hdThumbList'];
  for (var i = 0; i < imgFields.length; i++) {
    var arr = node[imgFields[i]];
    if (Array.isArray(arr)) {
      for (var k = 0; k < arr.length; k++) {
        var it = arr[k];
        if (typeof it === 'string') pushImage(result.imageUrls, it);
        else if (it && typeof it === 'object') {
          var u = it.url || it.imgUrl || it.hdThumbUrl || it.thumbUrl || it.src;
          if (u) pushImage(result.imageUrls, u);
        }
      }
    }
  }
  // Single-image fields
  var singleFields = ['hdThumbUrl', 'thumbUrl', 'imageUrl', 'imgUrl'];
  for (var s = 0; s < singleFields.length; s++) {
    var su = node[singleFields[s]];
    if (typeof su === 'string') pushImage(result.imageUrls, su);
  }
}

function collectMetaFromNode(node, result) {
  if (!result.title) {
    var t = node.goodsName || node.title || node.name;
    if (typeof t === 'string') result.title = t;
  }
  if (result.price === undefined) {
    var p = node.minPrice || node.price || node.salePrice;
    if (typeof p === 'number') result.price = p;
    else if (typeof p === 'string' && /^[\d.]+$/.test(p)) result.price = parseFloat(p);
  }
  if (!result.category && typeof node.categoryName === 'string') {
    result.category = node.categoryName;
  }
  // SKU variants
  var sks = node.skuList || node.variants || node.saleProps;
  if (Array.isArray(sks)) {
    for (var s2 = 0; s2 < sks.length; s2++) {
      var sk = sks[s2];
      var vals = sk && (sk.values || sk.options);
      if (sk && sk.name && Array.isArray(vals)) {
        result.skuVariants.push({
          name: sk.name,
          options: vals.map(function(v2) {
            return typeof v2 === 'string' ? v2 : (v2 && (v2.name || v2.value));
          }).filter(Boolean)
        });
      }
    }
  }
}

// DOM fallback: find the main product container (ancestor of the H1) and only look inside it
function collectFromMainGallery(result) {
  var h1 = document.querySelector('h1');
  if (!h1) return;
  // Walk up until we find a sizable container
  var container = h1;
  for (var i = 0; i < 6 && container.parentElement; i++) {
    container = container.parentElement;
    if (container.offsetWidth > 600) break;
  }
  if (!container) return;
  var imgs = container.querySelectorAll('img');
  imgs.forEach(function(img) {
    var src = img.currentSrc || img.src || img.getAttribute('data-src') || '';
    var w = img.naturalWidth || img.width || 0;
    var h = img.naturalHeight || img.height || 0;
    // Product images are reasonably large and square-ish
    if (w < 200 || h < 200) return;
    var ratio = w / h;
    if (ratio < 0.6 || ratio > 1.7) return;
    pushImage(result.imageUrls, src);
  });
}
