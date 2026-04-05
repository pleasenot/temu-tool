/**
 * Temu product page scraper
 * Extracts product data from the current page
 */

export interface ScrapedProduct {
  title: string;
  url: string;
  price?: number;
  currency?: string;
  category?: string;
  imageUrls: string[];
  specifications?: Record<string, string>;
  skuVariants?: Array<{ name: string; options: string[] }>;
}

export function scrapeProduct(): ScrapedProduct | null {
  // Strategy 1: Try to extract from __NEXT_DATA__ (SSR hydration data)
  const nextData = tryNextData();
  if (nextData) return nextData;

  // Strategy 2: Fall back to DOM scraping
  return scrapeDom();
}

function tryNextData(): ScrapedProduct | null {
  try {
    const scriptEl = document.querySelector('script#__NEXT_DATA__');
    if (!scriptEl) return null;

    const data = JSON.parse(scriptEl.textContent || '');
    const pageProps = data?.props?.pageProps;
    if (!pageProps) return null;

    // Try common Temu data structures
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

function extractImagesFromData(data: any): string[] {
  const images: string[] = [];

  // Try various image field names
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

function extractSpecsFromData(data: any): Record<string, string> {
  const specs: Record<string, string> = {};
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

function extractVariantsFromData(data: any): Array<{ name: string; options: string[] }> {
  const variants: Array<{ name: string; options: string[] }> = [];
  const variantFields = ['skuList', 'variants', 'options', 'saleProps'];

  for (const field of variantFields) {
    if (Array.isArray(data[field])) {
      for (const variant of data[field]) {
        if (variant.name && Array.isArray(variant.values || variant.options)) {
          variants.push({
            name: variant.name,
            options: (variant.values || variant.options).map((v: any) => typeof v === 'string' ? v : v.name || v.value),
          });
        }
      }
      if (variants.length > 0) return variants;
    }
  }

  return variants;
}

function scrapeDom(): ScrapedProduct | null {
  // Title
  const titleEl = document.querySelector('h1, [class*="ProductTitle"], [class*="goods-name"]');
  const title = titleEl?.textContent?.trim() || '';
  if (!title) return null;

  // Price
  const priceEl = document.querySelector('[class*="price"], [class*="Price"]');
  const priceText = priceEl?.textContent?.trim() || '';
  const priceMatch = priceText.match(/[\d.]+/);
  const price = priceMatch ? parseFloat(priceMatch[0]) : undefined;

  // Images - get from gallery/carousel
  const imageUrls: string[] = [];
  const imgEls = document.querySelectorAll(
    '[class*="gallery"] img, [class*="carousel"] img, [class*="slider"] img, [class*="thumb"] img'
  );
  imgEls.forEach((img) => {
    const src = (img as HTMLImageElement).src || img.getAttribute('data-src') || '';
    if (src && !imageUrls.includes(src)) {
      // Try to get high-res version
      const highRes = src.replace(/\/_\d+x\d+/, '').replace(/\/thumb\//, '/');
      imageUrls.push(highRes);
    }
  });

  // If no gallery images, try all product images
  if (imageUrls.length === 0) {
    document.querySelectorAll('img[src*="img.temu"]').forEach((img) => {
      const src = (img as HTMLImageElement).src;
      if (src && !imageUrls.includes(src)) {
        imageUrls.push(src);
      }
    });
  }

  // Category from breadcrumbs
  const breadcrumbs = document.querySelectorAll('[class*="breadcrumb"] a, nav a');
  const category = Array.from(breadcrumbs).map(a => a.textContent?.trim()).filter(Boolean).join(' > ');

  return {
    title,
    url: window.location.href,
    price,
    currency: 'USD',
    category: category || undefined,
    imageUrls: imageUrls.slice(0, 10), // Max 10 images
  };
}
