import { useState, useEffect } from 'react';
import { api } from '../../api/client';

interface ProductImage {
  id: string;
  product_id: string;
  original_url: string;
  sort_order: number;
}

export function ProductEditModal({ productId, onClose, onSaved }: {
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
  const [newImageUrl, setNewImageUrl] = useState('');

  useEffect(() => { load(); }, [productId]);

  async function load() {
    setLoading(true);
    try {
      const res: any = await api.products.get(productId);
      const p = res.data.product;
      setTitle(p.title || '');
      setPrice(p.price != null ? String(p.price) : '');
      setCategory(p.category || '');
      setImages(res.data.images || []);
    } catch (e) { console.error(e); }
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
      onSaved();
    } catch (e) {
      alert('保存失败：' + (e as Error).message);
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
    } catch (e) { alert('添加失败：' + (e as Error).message); }
  }

  async function removeImage(imageId: string) {
    if (!confirm('删除该图片？')) return;
    try {
      await api.products.deleteImage(productId, imageId);
      load();
    } catch (e) { alert('删除失败：' + (e as Error).message); }
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || !files.length) return;
    try {
      for (let i = 0; i < files.length; i++) {
        await api.products.uploadImage(productId, files[i]);
      }
      load();
    } catch (e) { alert('上传失败：' + (e as Error).message); }
  }

  async function replaceImage(imageId: string, file: File) {
    try {
      await api.products.replaceImage(productId, imageId, file);
      load();
    } catch (e) { alert('替换失败：' + (e as Error).message); }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-800">编辑产品</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500">加载中...</div>
        ) : (
          <div className="overflow-y-auto p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
              <textarea
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">价格</label>
                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">类目</label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                图片 ({images.length})
              </label>
              {images.length === 0 ? (
                <div className="text-gray-400 text-sm py-4 text-center border border-dashed border-gray-300 rounded">
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
                        className="w-full aspect-square object-cover rounded border border-gray-200 bg-gray-50"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ccc"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';
                        }}
                      />
                      <div className="absolute inset-x-0 bottom-0 flex gap-1 p-1 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition">
                        <label className="flex-1 text-center text-white text-[11px] bg-blue-600/90 hover:bg-blue-600 rounded py-1 cursor-pointer">
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
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 text-xs opacity-0 group-hover:opacity-100 transition"
                        title="删除"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  placeholder="粘贴图片 URL 后点击添加"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addImage(); }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={addImage}
                  className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                >
                  添加 URL
                </button>
                <label className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 cursor-pointer">
                  上传本地
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => { uploadFiles(e.target.files); e.target.value = ''; }}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
