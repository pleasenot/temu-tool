import { useState, useEffect, useCallback } from 'react';
import { api, connectWebSocket } from '../../api/client';
import { ProductEditModal } from '../products/ProductEditModal';

interface Template {
  id: string;
  name: string;
  ref_product_id?: string;
  cat_name?: string;
  size_info?: string;
  image_index?: number;
  product_code?: string;
  volume_len_cm?: number;
  volume_width_cm?: number;
  volume_height_cm?: number;
  weight_g?: number;
  declared_price?: number;
  retail_price?: number;
  created_at?: string;
}

interface Product {
  id: string;
  title: string;
  price?: number;
  currency?: string;
  status: string;
  thumbnail?: string | null;
  image_count?: number;
}

interface ShopProduct {
  productId: number;
  productName: string;
  thumbUrl: string;
  catName?: string;
}

const SHOP_PAGE_SIZE = 20;

const EMPTY_FORM: Omit<Template, 'id' | 'created_at'> = {
  name: '', ref_product_id: '', size_info: '', product_code: '',
  volume_len_cm: undefined, volume_width_cm: undefined, volume_height_cm: undefined,
  weight_g: undefined, declared_price: undefined, retail_price: undefined, image_index: undefined,
};

export function ListingPage() {
  // Login state
  const [loginStatus, setLoginStatus] = useState<{ loggedIn: boolean | null; username?: string; hasPassword?: boolean } | null>(null);

  // Templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [templateForm, setTemplateForm] = useState(EMPTY_FORM);
  const [isNewTemplate, setIsNewTemplate] = useState(false);

  // Products
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeTemplateId, setActiveTemplateId] = useState('');

  // Publishing
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState<any>(null);
  const [listings, setListings] = useState<any[]>([]);

  // Shop products modal (with pagination)
  const [showShopModal, setShowShopModal] = useState(false);
  const [shopProducts, setShopProducts] = useState<ShopProduct[]>([]);
  const [shopLoading, setShopLoading] = useState(false);
  const [shopPage, setShopPage] = useState(1);
  const [shopTotal, setShopTotal] = useState(0);
  const [shopJumpInput, setShopJumpInput] = useState('');

  // Batch edit modal
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [batchTitle, setBatchTitle] = useState('');

  // Product edit modal
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [tplRes, prodRes, listRes]: any[] = await Promise.all([
      api.templates.list(),
      api.products.list(1, 200),
      api.listing.status(),
    ]);
    setTemplates(tplRes.data || []);
    setProducts(prodRes.data?.products || []);
    setListings(listRes.data || []);
  }, []);

  useEffect(() => {
    loadData();
    checkLogin();
    const ws = connectWebSocket((msg) => {
      if (msg.type === 'listing:progress') {
        setProgress(msg.payload);
        if (msg.payload.current === msg.payload.total) {
          setPublishing(false);
          loadData();
        }
      }
    });
    return () => ws.close();
  }, [loadData]);

  async function checkLogin() {
    try {
      const res: any = await api.listing.loginStatus();
      if (res.success) setLoginStatus(res.data);
    } catch {}
  }

  // ---- Template CRUD ----
  function startNewTemplate() {
    setEditingTemplate(null);
    setTemplateForm({ ...EMPTY_FORM });
    setIsNewTemplate(true);
  }

  function startEditTemplate(t: Template) {
    setEditingTemplate(t);
    setTemplateForm({
      name: t.name, ref_product_id: t.ref_product_id || '',
      size_info: t.size_info || '', product_code: t.product_code || '',
      image_index: t.image_index, volume_len_cm: t.volume_len_cm,
      volume_width_cm: t.volume_width_cm, volume_height_cm: t.volume_height_cm,
      weight_g: t.weight_g, declared_price: t.declared_price, retail_price: t.retail_price,
    });
    setIsNewTemplate(false);
  }

  async function saveTemplate() {
    if (!templateForm.name) return;
    const data = {
      name: templateForm.name,
      refProductId: templateForm.ref_product_id || undefined,
      sizeInfo: templateForm.size_info || undefined,
      productCode: templateForm.product_code || undefined,
      imageIndex: templateForm.image_index ?? undefined,
      volumeLenCm: templateForm.volume_len_cm ?? undefined,
      volumeWidthCm: templateForm.volume_width_cm ?? undefined,
      volumeHeightCm: templateForm.volume_height_cm ?? undefined,
      weightG: templateForm.weight_g ?? undefined,
      declaredPrice: templateForm.declared_price ?? undefined,
      retailPrice: templateForm.retail_price ?? undefined,
    };

    if (isNewTemplate) {
      await api.templates.create(data as any);
    } else if (editingTemplate) {
      await api.templates.update(editingTemplate.id, data);
    }
    setEditingTemplate(null);
    setIsNewTemplate(false);
    loadData();
  }

  async function deleteTemplate(id: string) {
    if (!confirm('确定删除此模板？')) return;
    await api.templates.delete(id);
    if (activeTemplateId === id) setActiveTemplateId('');
    loadData();
  }

  // ---- Shop products modal ----
  async function loadShopPage(page: number) {
    setShopLoading(true);
    try {
      const res: any = await api.listing.shopProducts({ page, pageSize: SHOP_PAGE_SIZE });
      if (res.data?.loggedIn === false) {
        alert('Temu 卖家中心未登录，请先在"账号管理"页面登录后再获取店铺商品。');
        setShopProducts([]);
        setShopTotal(0);
        setShowShopModal(false);
      } else {
        setShopProducts(res.data?.list || []);
        setShopTotal(res.data?.total || 0);
        setShopPage(page);
      }
    } catch {
      setShopProducts([]);
      setShopTotal(0);
    }
    setShopLoading(false);
  }

  async function openShopModal() {
    setShowShopModal(true);
    setShopJumpInput('');
    await loadShopPage(1);
  }

  function selectShopProduct(p: ShopProduct) {
    setTemplateForm({ ...templateForm, ref_product_id: String(p.productId) });
    setShowShopModal(false);
  }

  function handleShopJump() {
    const total = Math.max(1, Math.ceil(shopTotal / SHOP_PAGE_SIZE));
    const n = parseInt(shopJumpInput, 10);
    if (!Number.isFinite(n) || n < 1 || n > total) return;
    loadShopPage(n);
  }

  // ---- Batch delete ----
  async function batchDelete() {
    if (selected.size === 0) return;
    if (!confirm(`确定删除选中的 ${selected.size} 个产品吗？此操作不可撤销。`)) return;
    for (const id of selected) {
      try { await api.products.delete(id); } catch (e) { console.error('delete failed', id, e); }
    }
    setSelected(new Set());
    loadData();
  }

  // ---- Product selection ----
  function toggleSelect(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  function toggleSelectAll() {
    if (selected.size === products.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map(p => p.id)));
    }
  }

  // ---- Batch publish ----
  async function batchPublish() {
    if (selected.size === 0 || !activeTemplateId) return;
    setPublishing(true);
    setProgress(null);
    await api.listing.batchPublish(Array.from(selected), activeTemplateId);
  }

  // ---- Batch edit ----
  async function applyBatchEdit() {
    for (const pid of selected) {
      if (batchTitle.trim()) {
        await api.products.update(pid, { title: batchTitle });
      }
    }
    setShowBatchEdit(false);
    setBatchTitle('');
    loadData();
  }

  const statusColors: Record<string, string> = {
    collected: 'bg-gray-100 text-gray-600',
    processing: 'bg-yellow-100 text-yellow-700',
    mockup_ready: 'bg-blue-100 text-blue-700',
    priced: 'bg-purple-100 text-purple-700',
    listed: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
  };

  const isEditing = isNewTemplate || editingTemplate !== null;

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">自动上品</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${loginStatus?.loggedIn === true ? 'bg-green-500' : loginStatus?.loggedIn === false ? 'bg-red-400' : 'bg-yellow-400'}`} />
            <span className="text-sm text-gray-600">
              {loginStatus === null ? '检查中...'
                : loginStatus.loggedIn === true ? `已登录 ${loginStatus.username || ''}`
                : loginStatus.loggedIn === false ? '未登录'
                : loginStatus.hasPassword ? `${loginStatus.username || ''} (待连接)` : '未配置账号'}
            </span>
          </div>
          <button onClick={checkLogin} className="px-2 py-1 text-xs bg-gray-100 border border-gray-300 rounded hover:bg-gray-200">
            刷新
          </button>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Left: Template Management */}
        <div className="w-80 flex-shrink-0 flex flex-col">
          <div className="bg-white rounded-lg border border-gray-200 flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-700 text-sm">上品模板</h3>
              <button onClick={startNewTemplate} className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600">
                + 新建
              </button>
            </div>

            {/* Template list */}
            <div className="flex-1 overflow-auto">
              {templates.length === 0 && !isEditing && (
                <p className="p-4 text-sm text-gray-400 text-center">暂无模板</p>
              )}
              {templates.map(t => (
                <div
                  key={t.id}
                  className={`p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${activeTemplateId === t.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
                  onClick={() => setActiveTemplateId(t.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{t.name}</span>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); startEditTemplate(t); }} className="text-xs text-blue-500 hover:text-blue-700">编辑</button>
                      <button onClick={(e) => { e.stopPropagation(); deleteTemplate(t.id); }} className="text-xs text-red-500 hover:text-red-700">删除</button>
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 mt-1 space-x-2">
                    {t.ref_product_id && <span>参考:{t.ref_product_id}</span>}
                    {t.declared_price && <span>{t.declared_price}元</span>}
                    {t.weight_g && <span>{t.weight_g}g</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Template form */}
            {isEditing && (
              <div className="border-t border-gray-200 p-3 bg-gray-50 overflow-auto max-h-96">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">{isNewTemplate ? '新建模板' : '编辑模板'}</h4>
                <div className="space-y-2">
                  <input placeholder="模板名称 *" value={templateForm.name}
                    onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />

                  <div className="flex gap-1">
                    <input placeholder="参考商品 ID" value={templateForm.ref_product_id || ''}
                      onChange={e => setTemplateForm({ ...templateForm, ref_product_id: e.target.value })}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    <button onClick={openShopModal} className="px-2 py-1.5 text-xs bg-gray-200 rounded hover:bg-gray-300 whitespace-nowrap">
                      从店铺选
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">尺码</label>
                      <input placeholder="S/M/L/XL" value={templateForm.size_info || ''}
                        onChange={e => setTemplateForm({ ...templateForm, size_info: e.target.value })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">货号</label>
                      <input placeholder="产品货号" value={templateForm.product_code || ''}
                        onChange={e => setTemplateForm({ ...templateForm, product_code: e.target.value })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">图片序号</label>
                      <input type="number" placeholder="1" value={templateForm.image_index ?? ''}
                        onChange={e => setTemplateForm({ ...templateForm, image_index: e.target.value ? Number(e.target.value) : undefined })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">重量(g)</label>
                      <input type="number" placeholder="100" value={templateForm.weight_g ?? ''}
                        onChange={e => setTemplateForm({ ...templateForm, weight_g: e.target.value ? Number(e.target.value) : undefined })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">包装体积 (cm)</label>
                    <div className="flex gap-1">
                      <input type="number" placeholder="长" value={templateForm.volume_len_cm ?? ''}
                        onChange={e => setTemplateForm({ ...templateForm, volume_len_cm: e.target.value ? Number(e.target.value) : undefined })}
                        className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" />
                      <input type="number" placeholder="宽" value={templateForm.volume_width_cm ?? ''}
                        onChange={e => setTemplateForm({ ...templateForm, volume_width_cm: e.target.value ? Number(e.target.value) : undefined })}
                        className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" />
                      <input type="number" placeholder="高" value={templateForm.volume_height_cm ?? ''}
                        onChange={e => setTemplateForm({ ...templateForm, volume_height_cm: e.target.value ? Number(e.target.value) : undefined })}
                        className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">申报价(元)</label>
                      <input type="number" step="0.01" placeholder="25.00" value={templateForm.declared_price ?? ''}
                        onChange={e => setTemplateForm({ ...templateForm, declared_price: e.target.value ? Number(e.target.value) : undefined })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">建议零售价(元)</label>
                      <input type="number" step="0.01" placeholder="39.90" value={templateForm.retail_price ?? ''}
                        onChange={e => setTemplateForm({ ...templateForm, retail_price: e.target.value ? Number(e.target.value) : undefined })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button onClick={saveTemplate} className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">保存</button>
                    <button onClick={() => { setEditingTemplate(null); setIsNewTemplate(false); }}
                      className="px-3 py-1.5 text-sm bg-gray-300 rounded hover:bg-gray-400">取消</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Products + Actions */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Action bar */}
          <div className="flex items-center gap-3 mb-3">
            <select value={activeTemplateId} onChange={e => setActiveTemplateId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded text-sm bg-white">
              <option value="">-- 选择模板 --</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>

            <button onClick={() => { if (selected.size > 0) setShowBatchEdit(true); }}
              disabled={selected.size === 0}
              className="px-3 py-2 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">
              批量编辑 ({selected.size})
            </button>

            <button onClick={batchDelete}
              disabled={selected.size === 0}
              className="px-3 py-2 text-sm bg-white border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-50">
              批量删除 ({selected.size})
            </button>

            <button onClick={batchPublish}
              disabled={publishing || selected.size === 0 || !activeTemplateId}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50">
              {publishing ? '发布中...' : `批量发布 (${selected.size})`}
            </button>

            {!activeTemplateId && selected.size > 0 && (
              <span className="text-xs text-orange-500">请先选择模板</span>
            )}
          </div>

          {/* Progress */}
          {progress && (
            <div className="mb-3 bg-white rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium truncate">{progress.productTitle}</span>
                <span className="text-xs text-gray-500">{progress.current}/{progress.total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full transition-all ${progress.status === 'error' ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${(progress.current / progress.total) * 100}%` }} />
              </div>
              {progress.error && <p className="text-xs text-red-500 mt-1">{progress.error}</p>}
            </div>
          )}

          {/* Product table */}
          <div className="bg-white rounded-lg border border-gray-200 flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="text-gray-500 border-b border-gray-200">
                  <th className="p-2 text-left w-8">
                    <input type="checkbox" checked={selected.size === products.length && products.length > 0}
                      onChange={toggleSelectAll} />
                  </th>
                  <th className="p-2 text-left w-14">图片</th>
                  <th className="p-2 text-left">标题</th>
                  <th className="p-2 text-left w-20">价格</th>
                  <th className="p-2 text-left w-20">状态</th>
                  <th className="p-2 text-left w-14">操作</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">暂无产品，请先通过插件采集</td></tr>
                ) : products.map(p => (
                  <tr key={p.id} className={`border-b border-gray-50 hover:bg-gray-50 ${selected.has(p.id) ? 'bg-blue-50' : ''}`}>
                    <td className="p-2">
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
                    </td>
                    <td className="p-2">
                      {p.thumbnail ? (
                        <div className="relative inline-block">
                          <img
                            src={p.thumbnail}
                            referrerPolicy="no-referrer"
                            className="w-11 h-11 object-cover rounded border border-gray-200 bg-gray-50"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                          {(p.image_count || 0) > 1 && (
                            <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] leading-none rounded-full px-1.5 py-0.5">
                              {p.image_count}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="w-11 h-11 bg-gray-100 rounded" />
                      )}
                    </td>
                    <td className="p-2">
                      <span className="line-clamp-2 text-gray-800">{p.title}</span>
                    </td>
                    <td className="p-2 text-gray-600">{p.price ? `${p.currency || '$'}${p.price}` : '-'}</td>
                    <td className="p-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${statusColors[p.status] || 'bg-gray-100 text-gray-600'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="p-2">
                      <button
                        onClick={() => setEditingProductId(p.id)}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        编辑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Listing history */}
          {listings.length > 0 && (
            <div className="mt-3 bg-white rounded-lg border border-gray-200 max-h-40 overflow-auto">
              <h4 className="text-xs font-semibold text-gray-500 p-2 border-b border-gray-100">上品记录</h4>
              <table className="w-full text-xs">
                <tbody>
                  {listings.slice(0, 10).map((l: any) => (
                    <tr key={l.id} className="border-b border-gray-50">
                      <td className="p-2 truncate max-w-xs">{l.product_title || l.product_id}</td>
                      <td className="p-2">
                        <span className={`px-1.5 py-0.5 rounded ${
                          l.status === 'draft_saved' ? 'bg-green-100 text-green-700' :
                          l.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                        }`}>{l.status}</span>
                      </td>
                      <td className="p-2 text-gray-400">{l.submitted_at ? new Date(l.submitted_at).toLocaleString('zh-CN') : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Shop Products Modal */}
      {showShopModal && (() => {
        const totalPages = Math.max(1, Math.ceil(shopTotal / SHOP_PAGE_SIZE));
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowShopModal(false)}>
            <div className="bg-white rounded-lg w-[560px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <div>
                  <h3 className="font-semibold text-gray-800">从店铺选择参考商品</h3>
                  {shopTotal > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      共 {shopTotal} 条 · 第 {shopPage}/{totalPages} 页
                    </p>
                  )}
                </div>
                <button onClick={() => setShowShopModal(false)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {shopLoading ? (
                  <p className="text-center text-gray-400 py-8">加载中...</p>
                ) : shopProducts.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">暂无数据</p>
                ) : shopProducts.map(p => (
                  <div key={p.productId} onClick={() => selectShopProduct(p)}
                    className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded cursor-pointer border-b border-gray-100">
                    {p.thumbUrl && <img src={p.thumbUrl} className="w-12 h-12 object-cover rounded" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{p.productName}</div>
                      <div className="text-xs text-gray-400">
                        {p.catName ? `${p.catName} · ` : ''}ID: {p.productId}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Pagination footer */}
              {shopTotal > 0 && (
                <div className="flex items-center gap-2 p-3 border-t border-gray-200 text-sm">
                  <button
                    onClick={() => loadShopPage(shopPage - 1)}
                    disabled={shopLoading || shopPage <= 1}
                    className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ← 上一页
                  </button>
                  <button
                    onClick={() => loadShopPage(shopPage + 1)}
                    disabled={shopLoading || shopPage >= totalPages}
                    className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    下一页 →
                  </button>
                  <span className="ml-auto text-xs text-gray-500">跳到</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={shopJumpInput}
                    onChange={e => setShopJumpInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleShopJump(); }}
                    placeholder={String(shopPage)}
                    className="w-16 px-2 py-1.5 border border-gray-300 rounded text-center"
                  />
                  <button
                    onClick={handleShopJump}
                    disabled={shopLoading}
                    className="px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-40"
                  >
                    跳转
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Batch Edit Modal */}
      {showBatchEdit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowBatchEdit(false)}>
          <div className="bg-white rounded-lg w-96 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-800 mb-4">批量编辑 ({selected.size} 个产品)</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">统一标题（留空不改）</label>
                <input value={batchTitle} onChange={e => setBatchTitle(e.target.value)}
                  placeholder="输入新标题" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={applyBatchEdit} className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">应用</button>
              <button onClick={() => setShowBatchEdit(false)} className="px-4 py-2 text-sm bg-gray-300 rounded hover:bg-gray-400">取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Product Edit Modal */}
      {editingProductId && (
        <ProductEditModal
          productId={editingProductId}
          onClose={() => setEditingProductId(null)}
          onSaved={() => { setEditingProductId(null); loadData(); }}
        />
      )}
    </div>
  );
}
