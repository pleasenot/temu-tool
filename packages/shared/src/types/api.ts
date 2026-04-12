import type { Product, ProductImage } from './product';
import type { MockupTemplate, MockupBatchConfig, MockupImage } from './mockup';

// Generic API response
export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// Products API
export interface ProductListResponse {
  products: Product[];
  total: number;
}

export interface ProductVideo {
  id: string;
  file_path: string;
  status: 'processing' | 'success' | 'failed';
  duration: number | null;
  resolution: string | null;
  error_msg: string | null;
  created_at: string;
  file_size: number | null;
}

export interface ProductDetailResponse {
  product: Product;
  images: ProductImage[];
  mockups: MockupImage[];
  videos: ProductVideo[];
}

// Mockup API
export interface MockupTemplateListResponse {
  templates: MockupTemplate[];
}

export interface MockupBatchRequest {
  config: MockupBatchConfig;
}

// Listing API
export interface ListingStartRequest {
  productIds: string[];
  autoSubmit: boolean;
}

export interface ListingStatus {
  productId: string;
  status: 'pending' | 'filling' | 'waiting_confirm' | 'submitted' | 'error';
  error?: string;
}

// Settings API
export interface SettingsResponse {
  photoshop: {
    host: string;
    port: number;
    password: string;
  };
  temu: {
    username: string;
    hasPassword: boolean;
  };
  directories: {
    templates: string;
    input: string;
    output: string;
  };
}
