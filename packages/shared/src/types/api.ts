import type { Product, ProductImage } from './product';
import type { PricingTemplate, ProductPricingOverride } from './pricing';
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

export interface ProductDetailResponse {
  product: Product;
  images: ProductImage[];
  mockups: MockupImage[];
}

// Mockup API
export interface MockupTemplateListResponse {
  templates: MockupTemplate[];
}

export interface MockupBatchRequest {
  config: MockupBatchConfig;
}

// Pricing API
export interface PricingTemplateListResponse {
  templates: PricingTemplate[];
}

export interface ApplyPricingRequest {
  templateId: string;
  productIds: string[];
  overrides?: Record<string, Partial<ProductPricingOverride>>;
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
  minimax: {
    apiKey: string;
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
