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

interface Template {
  id: string;
  name: string;
  ref_product_id?: string;
  cat_name?: string;
  created_at?: string;
}

interface ShopProduct {
  productId: number;
  productName: string;
  thumbUrl: string;
  catName: string;
}

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  // Template & publish state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState<any>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [shopProducts, setShopProducts] = useState<ShopProduct[]>([]);
  const [loadingShop, setLoadingShop] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [selectedRefProduct, setSelectedRefProduct] = useState<number | null>(null);

  useEffect(() => {
    loadProducts();
    loadTemplates();
    const ws = connectWebSocket((msg) => {
      if (msg.type === 'product:new') {
        showToast(`已采集：${msg.payload?.title || '新商品'}`);
        loadProducts();
      }
      if (msg.type === 'listing:progress') {
        setProgress(msg.payload);
        if (msg.payload.current === msg.payload.total &&
            (msg.payload.status === 'draft_saved' || msg.payload.status === 'error')) {
          setPublishing(false);
          loadProducts();
        }
      }
    });
    return () => { try { ws.close(); } catch {} };
  }, []);

  async function loadTemplates() {
    try {
      const res: any = await api.templates.list();
      setTemplates(res.data || []);
    } catch {}
  }

  async function loadShopProducts() {
    setLoadingShop(true);
    try {
      const res: any = await api.listing.shopProducts();
      setShopProducts(res.data?.list || []);
    } catch (e) {
      showToast('获取店铺商品失败，请先登录');
    }
    setLoadingShop(false);
  }

  async function handleBatchPublish() {
    if (selected.size === 0) { showToast('请先选择商品'); return; }
    if (!selectedTemplate) { showToast('请先选择模板'); return; }
    setPublishing(true);
    setProgress(null);
    try {
      await api.listing.batchPublish(Array.from(selected), selectedTemplate);
    } catch (err) {
      showToast('发布失败: ' + String(err));
      setPublishing(false);
    }
  }

  async function handleCreateTemplate() {
    if (!newTemplateName.trim()) { showToast('请输入模板名称'); return; }
    if (!selectedRefProduct) { showToast('请选择引用商品'); return; }
    try {
      await api.templates.createFromProduct(newTemplateName.trim(), String(selectedRefProduct));
      setShowCreateTemplate(false);
      setNewTemplateName('');
      setSelectedRefProduct(null);
      loadTemplates();
      showToast('模板创建成功');
    } catch (err) {
      showToast('创建失败: ' + String(err));
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm('确定删除此模板？')) return;
    await api.templates.delete(id);
    loadTemplates();
    if (selectedTemplate === id) setSelectedTemplate('');
  }

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

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">产品管理</h2>
          <p className="text-sm text-gray-500 mt-1">共 {total} 个产品</p>
        </div>
        <button onClick={loadProducts} className="px-4 py-2 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50">
          刷新
        </button>
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap bg-white p-3 rounded-lg border border-gray-200">
        <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white min-w-[160px]">
          <option value="">-- 引用模板 --</option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <button onClick={handleBatchPublish}
          disabled={publishing || selected.size === 0 || !selectedTemplate}
          className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
          {publishing ? '发布中...' : `批量发布 (${selected.size})`}
        </button>

        <button onClick={() => setShowTemplateModal(true)}
          className="px-4 py-1.5 border border-blue-500 text-blue-600 rounded text-sm hover:bg-blue-50">
          商品模板管理
        </button>

        {selected.size > 0 && (
          <button onClick={deleteSelected}
            className="px-4 py-1.5 bg-red-500 text-white rounded text-sm hover:bg-red-600 ml-auto">
            批量删除 ({selected.size})
          </button>
        )}
      </div>

      {/* Progress Bar */}
      {publishing && progress && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded p-3">
          <div className="flex justify-between text-sm mb-1">
            <span className="truncate max-w-md">{progress.productTitle}</span>
            <span className="flex-shrink-0">{progress.current}/{progress.total}</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${(progress.current / progress.total) * 100}%` }} />
          </div>
          <div className="text-xs mt-1 text-gray-500">
            {progress.status === 'error' ? `错误: ${progress.error}` : progress.status === 'draft_saved' ? '草稿已保存' : progress.status}
          </div>
        </div>
      )}

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

      {/* Template Manager Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowTemplateModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-[750px] max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-bold">商品模板管理</h3>
              <button onClick={() => setShowTemplateModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-4">
              <div className="flex gap-2 mb-4">
                <button onClick={() => { setShowCreateTemplate(true); loadShopProducts(); }}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                  + 新增模板
                </button>
              </div>

              {showCreateTemplate && (
                <div className="mb-4 p-4 border border-blue-200 rounded bg-blue-50">
                  <div className="mb-3">
                    <label className="text-xs text-gray-600 block mb-1">模板名称</label>
                    <input value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)}
                      placeholder="如：方巾、化妆包" className="border rounded px-3 py-1.5 text-sm w-full" />
                  </div>
                  <div className="mb-3">
                    <label className="text-xs text-gray-600 block mb-1">选择引用商品（从店铺已有商品中选择）</label>
                    {loadingShop ? (
                      <div className="text-sm text-gray-400 py-2">加载店铺商品中...</div>
                    ) : shopProducts.length === 0 ? (
                      <div className="text-sm text-gray-400 py-2">
                        未获取到店铺商品。
                        <button onClick={loadShopProducts} className="text-blue-600 hover:underline ml-1">重试</button>
                        <span className="block text-xs mt-1">或手动输入商品 ID：</span>
                        <input type="text" placeholder="如 6791275947"
                          onChange={e => setSelectedRefProduct(Number(e.target.value) || null)}
                          className="border rounded px-3 py-1.5 text-sm w-48 mt-1" />
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto border rounded bg-white">
                        {shopProducts.map(sp => (
                          <label key={sp.productId}
                            className={`flex items-center gap-3 px-3 py-2 hover:bg-blue-50 cursor-pointer border-b last:border-b-0 ${
                              selectedRefProduct === sp.productId ? 'bg-blue-50' : ''
                            }`}>
                            <input type="radio" name="refProduct" checked={selectedRefProduct === sp.productId}
                              onChange={() => setSelectedRefProduct(sp.productId)} />
                            {sp.thumbUrl && <img src={sp.thumbUrl} className="w-10 h-10 object-cover rounded border" />}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm truncate">{sp.productName}</div>
                              <div className="text-xs text-gray-400">{sp.catName} - ID: {sp.productId}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleCreateTemplate}
                      className="px-4 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700">
                      创建
                    </button>
                    <button onClick={() => setShowCreateTemplate(false)}
                      className="px-4 py-1.5 border rounded text-sm hover:bg-gray-50">
                      取消
                    </button>
                  </div>
                </div>
              )}

              <table className="w-full text-sm border">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">模板名称</th>
                    <th className="px-3 py-2 text-left">引用商品 ID</th>
                    <th className="px-3 py-2 text-left">类目</th>
                    <th className="px-3 py-2 text-left">创建时间</th>
                    <th className="px-3 py-2 text-left">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-6 text-gray-400">暂无模板，请点击"新增模板"创建</td></tr>
                  ) : templates.map(t => (
                    <tr key={t.id} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{t.name}</td>
                      <td className="px-3 py-2 text-gray-600">{t.ref_product_id || '-'}</td>
                      <td className="px-3 py-2 text-gray-600">{t.cat_name || '-'}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{t.created_at ? new Date(t.created_at).toLocaleDateString('zh-CN') : '-'}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => handleDeleteTemplate(t.id)} className="text-red-500 hover:underline text-xs">删除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
