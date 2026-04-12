import { Card } from '../ui/Card';
import { Checkbox } from '../ui/Checkbox';
import { Badge } from '../ui/Badge';
import { ProductStatusPip } from '../platform/ProductStatusPip';

export interface ProductCardProduct {
  id: string;
  title: string;
  price?: number;
  currency?: string;
  status?: string;
  thumbnail?: string | null;
  image_count?: number;
  video_count?: number;
}

export function ProductCard({
  product,
  selected,
  onToggle,
  onEdit,
  index,
}: {
  product: ProductCardProduct;
  selected: boolean;
  onToggle: () => void;
  onEdit: () => void;
  index?: number;
}) {
  const stagger =
    index !== undefined ? { animationDelay: `${Math.min(index, 30) * 50}ms` } : undefined;

  return (
    <div className="enter-stagger" style={stagger}>
      <Card
        selected={selected}
        hoverable
        className="overflow-hidden p-0 relative group"
        onClick={onToggle}
      >
        {/* Cover */}
        <div className="relative aspect-square bg-surface-base overflow-hidden rounded-t-xl">
          {product.thumbnail ? (
            <img
              src={product.thumbnail}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-full h-full bg-surface-card flex items-center justify-center text-ink-muted text-xs">
              无图
            </div>
          )}

          {/* Gradient overlay on hover */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          {/* Top-left status pip */}
          <div className="absolute top-2.5 left-2.5">
            <ProductStatusPip product={product} />
          </div>

          {/* Top-right image count badge */}
          {(product.image_count ?? 0) > 0 && (
            <Badge tone="gold" className="absolute top-2 right-2">
              {product.image_count}
            </Badge>
          )}

          {/* Bottom-right video badge */}
          {(product.video_count ?? 0) > 0 && (
            <span
              className="absolute bottom-2 right-2 bg-violet-accent/90 text-white rounded-md px-2 py-0.5 text-[10px] font-mono leading-none flex items-center gap-1 backdrop-blur-sm"
              title="已生成视频"
            >
              <span aria-hidden>🎬</span>
              {(product.video_count ?? 0) > 1 && <span className="tabular">{product.video_count}</span>}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="p-3.5 flex flex-col gap-2">
          <div className="flex items-start gap-2.5">
            <span
              className="mt-0.5 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
            >
              <Checkbox checked={selected} readOnly />
            </span>
            <span className="text-[13px] text-ink-primary line-clamp-2 leading-snug flex-1">
              {product.title || '—'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] mt-0.5">
            <span className="font-mono text-gold tabular font-medium">
              {product.price ? `${product.currency || '$'}${product.price}` : '—'}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="font-mono text-ink-muted hover:text-gold transition-colors duration-200 hover:underline underline-offset-2"
            >
              编辑
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
