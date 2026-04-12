import { useState, useEffect, useRef } from 'react';
import { Plus, Upload, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { Modal } from '../ui/Modal';
import { Input, Textarea } from '../ui/Input';
import { Button } from '../ui/Button';
import { toast } from '../ui/Toast';
import { VideoGallerySection } from './VideoGallerySection';
import type { ProductVideo } from '@temu-lister/shared';

interface ProductImage {
  id: string;
  product_id: string;
  original_url: string;
  sort_order: number;
}

export function ProductEditModal({
  productId,
  onClose,
  onSaved,
}: {
  productId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState<string>('');
  const [category, setCategory] = useState('');
  const [images, setImages] = useState<ProductImage[]>([]);
  const [videos, setVideos] = useState<ProductVideo[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function load() {
    setLoading(true);
    try {
      const res: any = await api.products.get(productId);
      const p = res.data.product;
      setTitle(p.title || '');
      setPrice(p.price != null ? String(p.price) : '');
      setCategory(p.category || '');
      setImages(res.data.images || []);
      setVideos(res.data.videos || []);
    } catch (e) {
      console.error(e);
      toast.error('加载产品失败');
    }
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    try {
      await api.products.update(productId, {
        title,
        price: price ? parseFloat(price) : undefined,
        category: category || undefined,
      });
      toast.success('已保存');
      onSaved();
    } catch (e) {
      toast.error('保存失败：' + (e as Error).message);
    }
    setSaving(false);
  }

  async function addImage() {
    const url = newImageUrl.trim();
    if (!url) return;
    try {
      await api.products.addImage(productId, url);
      setNewImageUrl('');
      load();
    } catch (e) {
      toast.error('添加失败：' + (e as Error).message);
    }
  }

  async function removeImage(imageId: string) {
    if (!confirm('删除该图片？')) return;
    try {
      await api.products.deleteImage(productId, imageId);
      load();
    } catch (e) {
      toast.error('删除失败：' + (e as Error).message);
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || !files.length) return;
    try {
      for (let i = 0; i < files.length; i++) {
        await api.products.uploadImage(productId, files[i]);
      }
      load();
    } catch (e) {
      toast.error('上传失败：' + (e as Error).message);
    }
  }

  async function replaceImage(imageId: string, file: File) {
    try {
      await api.products.replaceImage(productId, imageId, file);
      load();
    } catch (e) {
      toast.error('替换失败：' + (e as Error).message);
    }
  }

  async function deleteVideo(videoId: string) {
    if (!confirm('删除该视频？')) return;
    try {
      await api.products.deleteVideo(productId, videoId);
      load();
      toast.success('视频已删除');
    } catch (e) {
      toast.error('删除失败：' + (e as Error).message);
    }
  }

  const posterUrl = images[0]?.original_url;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="编辑产品"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            保存
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="py-12 text-center text-ink-muted">加载中...</div>
      ) : (
        <div className="space-y-5">
          <div>
            <label className="block text-[10px] font-mono text-ink-secondary mb-1.5 uppercase tracking-widest">
              标题
            </label>
            <Textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={3}
              className="font-display text-base"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono text-ink-secondary mb-1.5 uppercase tracking-widest">
                价格
              </label>
              <Input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-ink-secondary mb-1.5 uppercase tracking-widest">
                类目
              </label>
              <Input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-mono text-ink-secondary uppercase tracking-widest">
                图片 ({images.length})
              </label>
            </div>
            {images.length === 0 ? (
              <div className="text-ink-muted text-sm py-6 text-center border border-dashed border-edge rounded-md">
                暂无图片
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {images.map((img) => (
                  <div key={img.id} className="relative group">
                    <img
                      src={img.original_url}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-full aspect-square object-cover rounded-md border border-edge bg-surface-card group-hover:border-gold transition-colors"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23555"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';
                      }}
                    />
                    <div className="absolute inset-x-0 bottom-0 flex gap-1 p-1 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition rounded-b-md">
                      <label className="flex-1 text-center text-gold text-[11px] font-mono font-semibold rounded py-1 cursor-pointer hover:text-ink-primary">
                        替换
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) replaceImage(img.id, f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                    <button
                      onClick={() => removeImage(img.id)}
                      className="absolute top-1 right-1 bg-status-danger/85 text-white rounded-full w-6 h-6 opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                      title="删除"
                      aria-label="删除"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex gap-2">
              <Input
                type="text"
                placeholder="粘贴图片 URL 后点击添加"
                value={newImageUrl}
                onChange={(e) => setNewImageUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addImage();
                }}
                className="flex-1"
              />
              <Button variant="secondary" onClick={addImage} leftIcon={<Plus size={14} />}>
                添加 URL
              </Button>
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                leftIcon={<Upload size={14} />}
              >
                上传本地
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  uploadFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          <VideoGallerySection
            videos={videos}
            productTitle={title}
            onDelete={deleteVideo}
            posterUrl={posterUrl}
          />
        </div>
      )}
    </Modal>
  );
}
