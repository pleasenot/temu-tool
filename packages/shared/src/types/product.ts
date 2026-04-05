export interface Product {
  id: string;
  title: string;
  originalUrl?: string;
  price?: number;
  currency: string;
  category?: string;
  specifications?: Record<string, string>;
  skuVariants?: SkuVariant[];
  scrapedAt: string;
  status: ProductStatus;
}

export type ProductStatus =
  | 'collected'
  | 'processing'
  | 'mockup_ready'
  | 'priced'
  | 'listing'
  | 'listed'
  | 'error';

export interface SkuVariant {
  name: string;
  options: string[];
}

export interface ProductImage {
  id: string;
  productId: string;
  originalUrl?: string;
  localPath?: string;
  sortOrder: number;
  width?: number;
  height?: number;
  fileSize?: number;
}
