/**
 * Temu product page scraper
 */

function scrapeProduct() {
  var nextData = tryNextData();
  if (nextData) return nextData;
  return scrapeDom();
}

function tryNextData() {
  try {
    var scriptEl = document.querySelector('script#__NEXT_DATA__');
    if (!scriptEl) return null;

    var data = JSON.parse(scriptEl.textContent || '');
    var pageProps = data && data.props && data.props.pageProps;
    if (!pageProps) return null;

    var goodsInfo = pageProps.goodsInfo || pageProps.goods || pageProps.productInfo;
    if (!goodsInfo) return null;

    return {
      title: goodsInfo.goodsName || goodsInfo.title || goodsInfo.name || '',
      url: window.location.href,
      price: goodsInfo.minPrice || goodsInfo.price,
      currency: goodsInfo.currency || 'USD',
      category: goodsInfo.categoryName || goodsInfo.category,
      imageUrls: extractImagesFromData(goodsInfo),
      specifications: extractSpecsFromData(goodsInfo),
      skuVariants: extractVariantsFromData(goodsInfo)
    };
  } catch (e) {
    return null;
  }
}

function extractImagesFromData(data) {
  var images = [];
  var imgFields = ['images', 'imageList', 'gallery', 'thumbList', 'imgList'];
  for (var i = 0; i < imgFields.length; i++) {
    var field = imgFields[i];
    if (Array.isArray(data[field])) {
      for (var j = 0; j < data[field].length; j++) {
        var img = data[field][j];
        var url = typeof img === 'string' ? img : (img.url || img.src || img.imgUrl);
        if (url) images.push(url.indexOf('//') === 0 ? 'https:' + url : url);
      }
      if (images.length > 0) return images;
    }
  }
  return images;
}

function extractSpecsFromData(data) {
  var specs = {};
  var specFields = ['specifications', 'specs', 'attributes', 'properties'];
  for (var i = 0; i < specFields.length; i++) {
    var field = specFields[i];
    if (Array.isArray(data[field])) {
      for (var j = 0; j < data[field].length; j++) {
        var spec = data[field][j];
        if (spec.name && spec.value) {
          specs[spec.name] = spec.value;
        }
      }
      if (Object.keys(specs).length > 0) return specs;
    }
  }
  return specs;
}

function extractVariantsFromData(data) {
  var variants = [];
  var variantFields = ['skuList', 'variants', 'options', 'saleProps'];
  for (var i = 0; i < variantFields.length; i++) {
    var field = variantFields[i];
    if (Array.isArray(data[field])) {
      for (var j = 0; j < data[field].length; j++) {
        var variant = data[field][j];
        var vals = variant.values || variant.options;
        if (variant.name && Array.isArray(vals)) {
          variants.push({
            name: variant.name,
            options: vals.map(function(v) { return typeof v === 'string' ? v : (v.name || v.value); })
          });
        }
      }
      if (variants.length > 0) return variants;
    }
  }
  return variants;
}

function scrapeDom() {
  var titleEl = document.querySelector('h1, [class*="ProductTitle"], [class*="goods-name"]');
  var title = titleEl ? (titleEl.textContent || '').trim() : '';
  if (!title) return null;

  var priceEl = document.querySelector('[class*="price"], [class*="Price"]');
  var priceText = priceEl ? (priceEl.textContent || '').trim() : '';
  var priceMatch = priceText.match(/[\d.]+/);
  var price = priceMatch ? parseFloat(priceMatch[0]) : undefined;

  var imageUrls = [];
  var imgEls = document.querySelectorAll(
    '[class*="gallery"] img, [class*="carousel"] img, [class*="slider"] img, [class*="thumb"] img'
  );
  imgEls.forEach(function(img) {
    var src = img.src || img.getAttribute('data-src') || '';
    if (src && imageUrls.indexOf(src) === -1) {
      var highRes = src.replace(/\/_\d+x\d+/, '').replace(/\/thumb\//, '/');
      imageUrls.push(highRes);
    }
  });

  if (imageUrls.length === 0) {
    document.querySelectorAll('img[src*="img.temu"]').forEach(function(img) {
      var src = img.src;
      if (src && imageUrls.indexOf(src) === -1) {
        imageUrls.push(src);
      }
    });
  }

  var breadcrumbs = document.querySelectorAll('[class*="breadcrumb"] a, nav a');
  var categoryParts = [];
  breadcrumbs.forEach(function(a) {
    var text = (a.textContent || '').trim();
    if (text) categoryParts.push(text);
  });
  var category = categoryParts.join(' > ');

  return {
    title: title,
    url: window.location.href,
    price: price,
    currency: 'USD',
    category: category || undefined,
    imageUrls: imageUrls.slice(0, 10)
  };
}
