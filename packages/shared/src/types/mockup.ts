export interface MockupTemplate {
  id: string;
  name: string;
  psdPath: string;
  smartObjectLayerName: string;
}

export interface MockupImage {
  id: string;
  productId: string;
  sourceImageId?: string;
  templatePath: string;
  outputPath: string;
  sortOrder: number;
  width?: number;
  height?: number;
  fileSize?: number;
  createdAt: string;
}

export interface MockupBatchConfig {
  productIds: string[];
  templateIds: string[];
  removeBackground: boolean;
  exportFormat: 'jpg' | 'png';
  jpgQuality: number;
}

export interface MockupProgress {
  current: number;
  total: number;
  productTitle: string;
  templateName: string;
  status: 'processing' | 'completed' | 'error';
  error?: string;
}
