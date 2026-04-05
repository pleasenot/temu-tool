export interface PricingTemplate {
  id: string;
  name: string;
  defaultValues: PricingValues;
  createdAt: string;
  updatedAt: string;
}

export interface PricingValues {
  size: string;
  imageIndex: number;
  productCode: string;
  packageLength: number;
  packageWidth: number;
  packageHeight: number;
  weight: number;
  declaredPrice: number;
  suggestedRetailPrice: number;
}

export interface ProductPricingOverride {
  productId: string;
  templateId: string;
  overrides: Partial<PricingValues>;
}
