import { Film, Loader2, AlertTriangle, Download, Trash2 } from 'lucide-react';
import type { ProductVideo } from '@temu-lister/shared';
import { Tooltip } from '../ui/Tooltip';

export interface VideoGallerySectionProps {
  videos: ProductVideo[];
  productTitle: string;
  onDelete: (videoId: string) => void;
  posterUrl?: string;
}

/**
 * Empty when videos.length === 0 — entire section unrenders.
 * Container is the spec'd dark-violet box; cards have 4 states:
 * processing (spinner), failed (warning), success (video element).
 */
export function VideoGallerySection({
  videos,
  productTitle,
  onDelete,
  posterUrl,
}: VideoGallerySectionProps) {
  if (videos.length === 0) return null;

  const total = videos.length;
  const processing = videos.filter((v) => v.status === 'processing').length;
  const failed = videos.filter((v) => v.status === 'failed').length;

  const slug =
    productTitle
      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'video';

  return (
    <div className="mt-6 rounded-xl p-4 bg-surface-base ring-1 ring-violet-accent/15">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 font-display text-lg text-ink-primary">
          <Film size={18} className="text-violet-accent" />
          视频
        </div>
        <div className="font-mono text-[10px] text-ink-muted tabular flex items-center gap-2">
          <span>{total} 个</span>
          {processing > 0 && <span className="text-gold">· {processing} 处理中</span>}
          {failed > 0 && <span className="text-status-danger">· {failed} 失败</span>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {videos.map((v, i) => (
          <VideoCard
            key={v.id}
            video={v}
            posterUrl={posterUrl}
            downloadName={`${slug}-${i + 1}.mp4`}
            onDelete={() => onDelete(v.id)}
          />
        ))}
      </div>
    </div>
  );
}

function VideoCard({
  video,
  posterUrl,
  downloadName,
  onDelete,
}: {
  video: ProductVideo;
  posterUrl?: string;
  downloadName: string;
  onDelete: () => void;
}) {
  const sizeLabel = video.file_size != null ? formatBytes(video.file_size) : null;
  const meta = [video.resolution, video.duration ? `${video.duration}s` : null, sizeLabel]
    .filter(Boolean)
    .join(' · ');

  if (video.status === 'processing') {
    return (
      <div className="group">
        <div className="aspect-video rounded-lg bg-surface-card ring-1 ring-white/5 flex flex-col items-center justify-center">
          <Loader2 size={28} className="text-gold animate-spin" />
          <div className="font-mono text-[10px] text-ink-muted mt-2">生成中...</div>
        </div>
        <div className="mt-1.5 font-mono text-[10px] text-ink-muted tabular truncate">— · — · —</div>
      </div>
    );
  }

  if (video.status === 'failed') {
    return (
      <div className="group">
        <div className="aspect-video rounded-lg bg-surface-card ring-1 ring-status-danger/30 flex flex-col items-center justify-center text-status-danger">
          <Tooltip content={video.error_msg || '生成失败'}>
            <span className="flex flex-col items-center">
              <AlertTriangle size={24} />
              <span className="font-mono text-[10px] mt-2">失败</span>
            </span>
          </Tooltip>
        </div>
        <div className="mt-1.5 font-mono text-[10px] text-ink-muted tabular flex justify-between gap-2">
          <span className="truncate">{meta || '—'}</span>
          <button
            onClick={onDelete}
            className="text-ink-muted hover:text-status-danger shrink-0"
            aria-label="删除"
            title="删除"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    );
  }

  // success
  return (
    <div className="group">
      <div className="aspect-video rounded-md bg-black ring-1 ring-white/5 overflow-hidden relative">
        <video
          src={video.file_path}
          poster={posterUrl}
          controls
          preload="metadata"
          className="w-full h-full object-contain"
        />
        <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <a
            href={video.file_path}
            download={downloadName}
            className="bg-black/70 backdrop-blur text-ink-primary p-1.5 rounded-md hover:bg-black/90"
            title="下载"
          >
            <Download size={12} />
          </a>
          <button
            onClick={onDelete}
            className="bg-black/70 backdrop-blur text-status-danger p-1.5 rounded-md hover:bg-black/90"
            title="删除"
            aria-label="删除"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      <div className="mt-1.5 font-mono text-[10px] text-ink-muted tabular truncate">
        {meta || '—'}
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}K`;
  return `${(n / 1024 / 1024).toFixed(1)}M`;
}
