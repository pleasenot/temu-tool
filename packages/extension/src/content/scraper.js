/**
 * Temu product page scraper
 */

function scrapeProduct() {
  const nextData = tryNextData();
  if (nextData) return nextData;
  return scrapeDom();
}

function tryNextData() {
  try {
    const scriptEl = document.querySelector('script#__NEXT_DATA__');
    if (!scriptEl) return null;

    const data = JSON.parse(scriptEl.textContent || '');
    const pageProps = data?.props?.pageProps;
    if (!pageProps) return null;

    const goodsInfo = pageProps.goodsInfo || pageProps.goods || pageProps.productInfo;
    if (!goodsInfo) return null;

    return {
      title: goodsInfo.goodsName || goodsInfo.title || goodsInfo.name || '',
      url: window.location.href,
      price: goodsInfo.minPrice || goodsInfo.price,
      currency: goodsInfo.currency || 'USD',
      category: goodsInfo.categoryName || goodsInfo.category,
      imageUrls: extractImagesFromData(goodsInfo),
      specifications: extractSpecsFromData(goodsInfo),
      skuVariants: extractVariantsFromData(goodsInfo),
    };
  } catch {
    return null;
  }
}

function extractImagesFromData(data) {
  const images = [];
  const imgFields = ['images', 'imageList', 'gallery', 'thumbList', 'imgList'];
  for (const field of imgFields) {
    if (Array.isArray(data[field])) {
      for (const img of data[field]) {
        const url = typeof img === 'string' ? img : img.url || img.src || img.imgUrl;
        if (url) images.push(url.startsWith('//') ? `https:${url}` : url);
      }
      if (images.length > 0) return images;
    }
  }
  return images;
}

function extractSpecsFromData(data) {
  const specs = {};
  const specFields = ['specifications', 'specs', 'attributes', 'properties'];
  for (const field of specFields) {
    if (Array.isArray(data[field])) {
      for (const spec of data[field]) {
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
  const variants = [];
  const variantFields = ['skuList', 'variants', 'options', 'saleProps'];
  for (const field of variantFields) {
    if (Array.isArray(data[field])) {
      for (const variant of data[field]) {
        if (variant.name && Array.isArray(variant.values || variant.options)) {
          variants.push({
            name: variant.name,
            options: (variant.values || variant.options).map(v => typeof v === 'string' ? v : v.name || v.value),
          });
        }
      }
      if (variants.length > 0) return variants;
    }
  }
  return variants;
}

function scrapeDom() {
  const titleEl = document.querySelector('h1, [class*="ProductTitle"], [class*="goods-name"]');
  const title = titleEl?.textContent?.trim() || '';
  if (!title) return null;

  const priceEl = document.querySelector('[class*="price"], [class*="Price"]');
  const priceText = priceEl?.textContent?.trim() || '';
  const priceMatch = priceText.match(/[\d.]+/);
  const price = priceMatch ? parseFloat(priceMatch[0]) : undefined;

  const imageUrls = [];
  const imgEls = document.querySelectorAll(
    '[class*="gallery"] img, [class*="carousel"] img, [class*="slider"] img, [class*="thumb"] img'
  );
  imgEls.forEach((img) => {
    const src = img.src || img.getAttribute('data-src') || '';
    if (src && !imageUrls.includes(src)) {
      const highRes = src.replace(/\/_\d+x\d+/, '').replace(/\/thumb\//, '/');
      imageUrls.push(highRes);
    }
  });

  if (imageUrls.length === 0) {
    document.querySelectorAll('img[src*="img.temu"]').forEach((img) => {
      const src = img.src;
      if (src && !imageUrls.includes(src)) {
        imageUrls.push(src);
      }
    });
  }

  const breadcrumbs = document.querySelectorAll('[class*="breadcrumb"] a, nav a');
  const category = Array.from(breadcrumbs).map(a => a.textContent?.trim()).filter(Boolean).join(' > ');

  return {
    title,
    url: window.location.href,
    price,
    currency: 'USD',
    category: category || undefined,
    imageUrls: imageUrls.slice(0, 10),
  };
}
