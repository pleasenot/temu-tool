import { useState, useEffect, useRef } from 'react';
import { api, connectWebSocket } from '../../api/client';

interface Product {
  id: string;
  title: string;
  price?: number;
  currency: string;
  status: string;
  scraped_at: string;
  original_url?: string;
  thumbnail?: string | null;
  image_count?: number;
  category?: string;
}

interface ProductImage {
  id: string;
  product_id: string;
  original_url: string;
  sort_order: number;
}

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    loadProducts();
    const ws = connectWebSocket((msg) => {
      if (msg.type === 'product:new') {
        showToast(`已采集：${msg.payload?.title || '新商品'}`);
        loadProducts();
      }
    });
    return () => { try { ws.close(); } catch {} };
  }, []);

  function showToast(text: string) {
    setToast(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  }

  async function loadProducts() {
    setLoading(true);
    try {
      const res: any = await api.products.list();
      setProducts(res.data.products);
      setTotal(res.data.total);
    } catch (err) {
      console.error('Failed to load products:', err);
    }
    setLoading(false);
  }

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function selectAll() {
    if (selected.size === products.length) setSelected(new Set());
    else setSelected(new Set(products.map(p => p.id)));
  }

  async function deleteSelected() {
    if (!confirm(`确定删除选中的 ${selected.size} 个产品吗？`)) return;
    for (const id of selected) await api.products.delete(id);
    setSelected(new Set());
    loadProducts();
  }

  const statusLabel: Record<string, string> = {
    collected: '已采集', processing: '处理中', mockup_ready: '已套图',
    priced: '已核价', listing: '上品中', listed: '已上品', error: '错误',
  };
  const statusColor: Record<string, string> = {
    collected: 'bg-gray-100 text-gray-600',
    processing: 'bg-yellow-100 text-yellow-700',
    mockup_ready: 'bg-blue-100 text-blue-700',
    priced: 'bg-purple-100 text-purple-700',
    listed: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
  };

  return (
    <div className="p-6">
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg text-sm animate-fade-in">
          ✓ {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">产品管理</h2>
          <p className="text-sm text-gray-500 mt-1">共 {total} 个产品</p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <button
              onClick={deleteSelected}
              className="px-4 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600"
            >
              删除选中 ({selected.size})
            </button>
          )}
          <button
            onClick={loadProducts}
            className="px-4 py-2 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            刷新
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : products.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500 text-lg">暂无产品</p>
          <p className="text-gray-400 text-sm mt-2">使用 Chrome 插件在 Temu 上采集产品</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-sm text-gray-500">
                <th className="p-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === products.length}
                    onChange={selectAll}
                  />
                </th>
                <th className="p-3 text-left w-20">图片</th>
                <th className="p-3 text-left">标题</th>
                <th className="p-3 text-left w-24">价格</th>
                <th className="p-3 text-left w-24">状态</th>
                <th className="p-3 text-left w-40">采集时间</th>
                <th className="p-3 text-left w-20">操作</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-gray-100 hover:bg-gray-50 text-sm"
                >
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selected.has(product.id)}
                      onChange={() => toggleSelect(product.id)}
                    />
                  </td>
                  <td className="p-3">
                    {product.thumbnail ? (
                      <div className="relative">
                        <img
                          src={product.thumbnail}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-14 h-14 object-cover rounded border border-gray-200 bg-gray-50"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                        {(product.image_count || 0) > 1 && (
                          <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] rounded-full px-1.5 py-0.5">
                            {product.image_count}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded border border-dashed border-gray-300 flex items-center justify-center text-gray-300 text-xs">
                        无图
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="font-medium text-gray-800 line-clamp-2">{product.title}</div>
                    {product.original_url && (
                      <a
                        href={product.original_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-500 hover:underline"
                      >
                        原链接
                      </a>
                    )}
                  </td>
                  <td className="p-3 text-gray-600">
                    {product.price ? `${product.currency} ${product.price}` : '-'}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs ${statusColor[product.status] || ''}`}>
                      {statusLabel[product.status] || product.status}
                    </span>
                  </td>
                  <td className="p-3 text-gray-500 text-xs">
                    {new Date(product.scraped_at).toLocaleString('zh-CN')}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => setEditingId(product.id)}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      编辑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingId && (
        <ProductEditModal
          productId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); loadProducts(); }}
        />
      )}
    </div>
  );
}

function ProductEditModal({ productId, onClose, onSaved }: {
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
                  添加图片
                </button>
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
