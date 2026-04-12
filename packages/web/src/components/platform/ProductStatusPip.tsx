import { Badge, BadgeTone } from '../ui/Badge';

export interface ProductLike {
  image_count?: number;
  video_count?: number;
  // Future: status, listed_at, etc.
}

export type ProductStage = 'collected' | 'processing' | 'video' | 'published';

export function deriveStage(p: ProductLike): ProductStage {
  if ((p.video_count ?? 0) > 0) return 'video';
  return 'collected';
}

const STAGE_TONE: Record<ProductStage, BadgeTone> = {
  collected: 'neutral',
  processing: 'gold',
  video: 'violet',
  published: 'success',
};

export function ProductStatusPip({ product, className = '' }: { product: ProductLike; className?: string }) {
  const stage = deriveStage(product);
  return <Badge variant="pip" tone={STAGE_TONE[stage]} className={className} />;
}
