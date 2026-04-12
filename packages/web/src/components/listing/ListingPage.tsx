import { useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  Plus,
  RefreshCw,
  Trash2,
  Pencil,
  Image as ImageIcon,
  Sparkles,
  Film,
  Search,
  Send,
} from 'lucide-react';
import { api } from '../../api/client';
import { ProductEditModal } from '../products/ProductEditModal';
import { ProductCard, type ProductCardProduct } from './ProductCard';
import { BatchEditModal, type BatchTab } from './BatchEditModal';
import { WorkspacePage } from '../platform/WorkspacePage';
import { BatchActionBar } from '../platform/BatchActionBar';
import { useSelection } from '../platform/useSelection';
import { useWsEvent, type WsMessage } from '../platform/WebSocketBus';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Card } from '../ui/Card';
import { ProgressBar } from '../ui/ProgressBar';
import { toast } from '../ui/Toast';
import { EmptyState } from '../ui/EmptyState';

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

type Product = ProductCardProduct & { status: string };

interface ShopProduct {
  productId: number;
  productName: string;
  thumbUrl: string;
  catName?: string;
}

const SHOP_PAGE_SIZE = 20;

const EMPTY_FORM: Omit<Template, 'id' | 'created_at'> = {
  name: '',
  ref_product_id: '',
  size_info: '',
  product_code: '',
  volume_len_cm: undefined,
  volume_width_cm: undefined,
  volume_height_cm: undefined,
  weight_g: undefined,
  declared_price: undefined,
  retail_price: undefined,
  image_index: undefined,
};

export function ListingPage() {
  // Login
  const [loginStatus, setLoginStatus] = useState<{
    loggedIn: boolean | null;
    username?: string;
    hasPassword?: boolean;
  } | null>(null);

  // Templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [templateForm, setTemplateForm] = useState(EMPTY_FORM);
  const [isNewTemplate, setIsNewTemplate] = useState(false);
  const [activeTemplateId, setActiveTemplateId] = useState('');

  // Products + search
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');

  // Publishing
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState<any>(null);
  const [listings, setListings] = useState<any[]>([]);

  // Shop products modal
  const [showShopModal, setShowShopModal] = useState(false);
  const [shopProducts, setShopProducts] = useState<ShopProduct[]>([]);
  const [shopLoading, setShopLoading] = useState(false);
  const [shopPage, setShopPage] = useState(1);
  const [shopTotal, setShopTotal] = useState(0);
  const [shopJumpInput, setShopJumpInput] = useState('');

  // Batch edit modal
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [batchInitialTab, setBatchInitialTab] = useState<BatchTab>('title');

  // Per-product edit modal
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  // Filtered + selection
  const filteredProducts = products.filter((p) =>
    search ? (p.title || '').toLowerCase().includes(search.toLowerCase()) : true
  );
  const selection = useSelection(filteredProducts);

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

  const checkLogin = useCallback(async () => {
    try {
      const res: any = await api.listing.loginStatus();
      if (res.success) setLoginStatus(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    loadData();
    checkLogin();
  }, [loadData, checkLogin]);

  // ── WebSocket: refresh data on completion. Progress visualization is in TaskTray.
  useWsEvent(
    'product:new',
    useCallback(() => loadData(), [loadData])
  );
  useWsEvent(
    'listing:progress',
    useCallback(
      (msg: WsMessage) => {
        const p = msg.payload || {};
        setProgress(p);
        if (p.current === p.total) {
          setPublishing(false);
          loadData();
        }
      },
      [loadData]
    )
  );
  useWsEvent(
    'title-ai:progress',
    useCallback(
      (msg: WsMessage) => {
        const p = msg.payload || {};
        if (p.current >= p.total) loadData();
      },
      [loadData]
    )
  );
  useWsEvent(
    'video-gen:progress',
    useCallback(
      (msg: WsMessage) => {
        const p = msg.payload || {};
        if (p.status === 'success' || p.status === 'failed') loadData();
      },
      [loadData]
    )
  );

  // ── Template CRUD
  function startNewTemplate() {
    setEditingTemplate(null);
    setTemplateForm({ ...EMPTY_FORM });
    setIsNewTemplate(true);
  }

  function startEditTemplate(t: Template) {
    setEditingTemplate(t);
    setTemplateForm({
      name: t.name,
      ref_product_id: t.ref_product_id || '',
      size_info: t.size_info || '',
      product_code: t.product_code || '',
      image_index: t.image_index,
      volume_len_cm: t.volume_len_cm,
      volume_width_cm: t.volume_width_cm,
      volume_height_cm: t.volume_height_cm,
      weight_g: t.weight_g,
      declared_price: t.declared_price,
      retail_price: t.retail_price,
    });
    setIsNewTemplate(false);
  }

  async function saveTemplate() {
    if (!templateForm.name) {
      toast.error('请填写模板名称');
      return;
    }
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
    try {
      if (isNewTemplate) {
        await api.templates.create(data as any);
      } else if (editingTemplate) {
        await api.templates.update(editingTemplate.id, data);
      }
      setEditingTemplate(null);
      setIsNewTemplate(false);
      toast.success('模板已保存');
      loadData();
    } catch (e) {
      toast.error('保存失败：' + (e as Error).message);
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm('确定删除此模板？')) return;
    try {
      await api.templates.delete(id);
      if (activeTemplateId === id) setActiveTemplateId('');
      loadData();
    } catch (e) {
      toast.error('删除失败：' + (e as Error).message);
    }
  }

  // ── Shop products (template ref selector)
  async function loadShopPage(page: number) {
    setShopLoading(true);
    try {
      const res: any = await api.listing.shopProducts({ page, pageSize: SHOP_PAGE_SIZE });
      if (res.data?.loggedIn === false) {
        toast.error('Temu 卖家中心未登录，请先在「账号管理」页面登录');
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

  // ── Batch actions
  async function batchDelete() {
    const ids = selection.selectedIds;
    if (ids.length === 0) return;
    if (!confirm(`确定删除选中的 ${ids.length} 个产品吗？此操作不可撤销。`)) return;
    for (const id of ids) {
      try {
        await api.products.delete(id);
      } catch (e) {
        console.error('delete failed', id, e);
      }
    }
    selection.clear();
    toast.success(`已删除 ${ids.length} 个产品`);
    loadData();
  }

  async function batchPublish() {
    const ids = selection.selectedIds;
    if (ids.length === 0 || !activeTemplateId) return;
    setPublishing(true);
    setProgress(null);
    try {
      await api.listing.batchPublish(ids, activeTemplateId);
    } catch (e) {
      toast.error('发布失败：' + (e as Error).message);
      setPublishing(false);
    }
  }

  function openBatchEdit(tab: BatchTab) {
    if (selection.count === 0) return;
    setBatchInitialTab(tab);
    setShowBatchEdit(true);
  }

  const isEditingTemplate = isNewTemplate || editingTemplate !== null;
  const totalShopPages = Math.max(1, Math.ceil(shopTotal / SHOP_PAGE_SIZE));

  const batchActions = [
    { id: 'title', label: '标题替换', icon: <Pencil size={14} />, onClick: () => openBatchEdit('title') },
    { id: 'image', label: '批量加图', icon: <ImageIcon size={14} />, onClick: () => openBatchEdit('image') },
    { id: 'ai', label: 'AI 标题', icon: <Sparkles size={14} />, onClick: () => openBatchEdit('ai') },
    { id: 'video', label: '生成视频', icon: <Film size={14} />, onClick: () => openBatchEdit('video') },
    { id: 'delete', label: '删除', icon: <Trash2 size={14} />, onClick: batchDelete },
    {
      id: 'publish',
      label: publishing ? '发布中...' : '发布',
      icon: <Send size={14} />,
      primary: true,
      disabled: publishing || !activeTemplateId,
      onClick: batchPublish,
    },
  ];

  const loginText =
    loginStatus === null
      ? '检查中...'
      : loginStatus.loggedIn === true
      ? `已登录 ${loginStatus.username || ''}`
      : loginStatus.loggedIn === false
      ? '未登录'
      : loginStatus.hasPassword
      ? `${loginStatus.username || ''} (待连接)`
      : '未配置账号';

  return (
    <WorkspacePage>
      <WorkspacePage.Header
        title="自动上品"
        subtitle={`${products.length} products · ${selection.count} selected`}
        actions={
          <>
            <div className="flex items-center gap-2 mr-2">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  loginStatus?.loggedIn === true
                    ? 'bg-status-success animate-pulse'
                    : loginStatus?.loggedIn === false
                    ? 'bg-status-danger'
                    : 'bg-status-warn'
                }`}
              />
              <span className="font-mono text-[10px] text-ink-secondary">{loginText}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                checkLogin();
                loadData();
              }}
              leftIcon={<RefreshCw size={14} />}
            >
              刷新
            </Button>
          </>
        }
      />

      <WorkspacePage.Toolbar>
        <div className="relative flex-1 max-w-sm">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索产品标题..."
            className="pl-8"
          />
        </div>
        <select
          value={activeTemplateId}
          onChange={(e) => setActiveTemplateId(e.target.value)}
          className="h-9 px-3 bg-surface-card border border-edge rounded-md text-sm text-ink-primary focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold-ring"
        >
          <option value="">— 选择上品模板 —</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {!activeTemplateId && selection.count > 0 && (
          <span className="text-xs font-mono text-status-warn">请先选择模板</span>
        )}
      </WorkspacePage.Toolbar>

      <WorkspacePage.Content>
        <div className="flex gap-6 h-full min-h-0">
          {/* Templates panel — left */}
          <Card className="w-72 shrink-0 flex flex-col overflow-hidden p-0">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-edge-subtle">
              <h3 className="font-display text-sm text-ink-primary">上品模板</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={startNewTemplate}
                leftIcon={<Plus size={12} />}
              >
                新建
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {templates.length === 0 && !isEditingTemplate && (
                <p className="p-4 text-xs text-ink-muted text-center">暂无模板</p>
              )}
              {templates.map((t) => (
                <div
                  key={t.id}
                  className={`p-3 border-b border-edge-subtle cursor-pointer transition-colors ${
                    activeTemplateId === t.id
                      ? 'bg-gold-soft border-l-2 border-l-gold'
                      : 'hover:bg-surface-hover'
                  }`}
                  onClick={() => setActiveTemplateId(t.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-ink-primary truncate">{t.name}</span>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditTemplate(t);
                        }}
                        className="text-[11px] font-mono text-ink-secondary hover:text-gold"
                      >
                        编辑
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTemplate(t.id);
                        }}
                        className="text-[11px] font-mono text-ink-secondary hover:text-status-danger"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  <div className="text-[10px] font-mono text-ink-muted mt-1 space-x-2 tabular">
                    {t.ref_product_id && <span>参考:{t.ref_product_id}</span>}
                    {t.declared_price && <span>{t.declared_price}元</span>}
                    {t.weight_g && <span>{t.weight_g}g</span>}
                  </div>
                </div>
              ))}
            </div>

            {isEditingTemplate && (
              <div className="border-t border-edge-subtle p-3 bg-surface-base/40 overflow-y-auto max-h-[60vh]">
                <h4 className="text-[10px] font-mono text-ink-secondary mb-2 uppercase tracking-widest">
                  {isNewTemplate ? '新建模板' : '编辑模板'}
                </h4>
                <div className="space-y-2">
                  <Input
                    placeholder="模板名称 *"
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  />
                  <div className="flex gap-1.5">
                    <Input
                      placeholder="参考商品 ID"
                      value={templateForm.ref_product_id || ''}
                      onChange={(e) =>
                        setTemplateForm({ ...templateForm, ref_product_id: e.target.value })
                      }
                      className="flex-1"
                    />
                    <Button size="sm" variant="secondary" onClick={openShopModal}>
                      从店铺选
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <FormField label="尺码">
                      <Input
                        placeholder="S/M/L/XL"
                        value={templateForm.size_info || ''}
                        onChange={(e) =>
                          setTemplateForm({ ...templateForm, size_info: e.target.value })
                        }
                      />
                    </FormField>
                    <FormField label="货号">
                      <Input
                        placeholder="产品货号"
                        value={templateForm.product_code || ''}
                        onChange={(e) =>
                          setTemplateForm({ ...templateForm, product_code: e.target.value })
                        }
                      />
                    </FormField>
                    <FormField label="图片序号">
                      <Input
                        type="number"
                        placeholder="1"
                        value={templateForm.image_index ?? ''}
                        onChange={(e) =>
                          setTemplateForm({
                            ...templateForm,
                            image_index: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                      />
                    </FormField>
                    <FormField label="重量(g)">
                      <Input
                        type="number"
                        placeholder="100"
                        value={templateForm.weight_g ?? ''}
                        onChange={(e) =>
                          setTemplateForm({
                            ...templateForm,
                            weight_g: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                      />
                    </FormField>
                  </div>

                  <FormField label="包装体积 (cm)">
                    <div className="flex gap-1.5">
                      <Input
                        type="number"
                        placeholder="长"
                        value={templateForm.volume_len_cm ?? ''}
                        onChange={(e) =>
                          setTemplateForm({
                            ...templateForm,
                            volume_len_cm: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                      />
                      <Input
                        type="number"
                        placeholder="宽"
                        value={templateForm.volume_width_cm ?? ''}
                        onChange={(e) =>
                          setTemplateForm({
                            ...templateForm,
                            volume_width_cm: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                      />
                      <Input
                        type="number"
                        placeholder="高"
                        value={templateForm.volume_height_cm ?? ''}
                        onChange={(e) =>
                          setTemplateForm({
                            ...templateForm,
                            volume_height_cm: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                      />
                    </div>
                  </FormField>

                  <div className="grid grid-cols-2 gap-2">
                    <FormField label="申报价(元)">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="25.00"
                        value={templateForm.declared_price ?? ''}
                        onChange={(e) =>
                          setTemplateForm({
                            ...templateForm,
                            declared_price: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                      />
                    </FormField>
                    <FormField label="建议零售价(元)">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="39.90"
                        value={templateForm.retail_price ?? ''}
                        onChange={(e) =>
                          setTemplateForm({
                            ...templateForm,
                            retail_price: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                      />
                    </FormField>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="primary" onClick={saveTemplate}>
                      保存
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingTemplate(null);
                        setIsNewTemplate(false);
                      }}
                    >
                      取消
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Right: products + listings */}
          <div className="flex-1 min-w-0 flex flex-col">
            {progress && (
              <Card padded className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-ink-primary truncate">{progress.productTitle}</span>
                  <span className="font-mono text-[11px] text-ink-secondary tabular">
                    {progress.current}/{progress.total}
                  </span>
                </div>
                <ProgressBar
                  value={progress.total ? (progress.current / progress.total) * 100 : 0}
                />
                {progress.error && (
                  <p className="text-xs text-status-danger mt-1.5">{progress.error}</p>
                )}
              </Card>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
              {filteredProducts.length === 0 ? (
                <EmptyState
                  title="暂无产品"
                  description="先在 Temu 商品页用插件采集，新商品会自动出现在这里"
                />
              ) : (
                <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 pb-2">
                  {filteredProducts.map((p, i) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      selected={selection.isSelected(p.id)}
                      onToggle={() => selection.toggle(p.id)}
                      onEdit={() => setEditingProductId(p.id)}
                      index={i}
                    />
                  ))}
                </div>
              )}
            </div>

            {listings.length > 0 && (
              <Card className="mt-3 max-h-40 overflow-auto p-0">
                <div className="text-[10px] font-mono text-ink-secondary p-2 border-b border-edge-subtle uppercase tracking-widest">
                  上品记录
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {listings.slice(0, 10).map((l: any) => (
                      <tr key={l.id} className="border-b border-edge-subtle">
                        <td className="p-2 truncate max-w-xs text-ink-primary">
                          {l.product_title || l.product_id}
                        </td>
                        <td className="p-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                              l.status === 'draft_saved'
                                ? 'bg-status-success/15 text-status-success'
                                : l.status === 'error'
                                ? 'bg-status-danger/15 text-status-danger'
                                : 'bg-surface-hover text-ink-secondary'
                            }`}
                          >
                            {l.status}
                          </span>
                        </td>
                        <td className="p-2 text-ink-muted font-mono text-[10px] tabular">
                          {l.submitted_at ? new Date(l.submitted_at).toLocaleString('zh-CN') : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        </div>
      </WorkspacePage.Content>

      <WorkspacePage.Footer>
        <BatchActionBar count={selection.count} actions={batchActions} onClear={selection.clear} />
      </WorkspacePage.Footer>

      {/* Shop Products Modal */}
      <Modal
        open={showShopModal}
        onClose={() => setShowShopModal(false)}
        size="md"
        title={
          <span>
            从店铺选择参考商品
            {shopTotal > 0 && (
              <span className="ml-3 font-mono text-xs text-ink-secondary tabular">
                共 {shopTotal} · 第 {shopPage}/{totalShopPages} 页
              </span>
            )}
          </span>
        }
        footer={
          shopTotal > 0 ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => loadShopPage(shopPage - 1)}
                disabled={shopLoading || shopPage <= 1}
              >
                ← 上一页
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => loadShopPage(shopPage + 1)}
                disabled={shopLoading || shopPage >= totalShopPages}
              >
                下一页 →
              </Button>
              <span className="ml-auto text-[10px] font-mono text-ink-muted">跳转</span>
              <Input
                type="number"
                min={1}
                max={totalShopPages}
                value={shopJumpInput}
                onChange={(e) => setShopJumpInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleShopJump();
                }}
                placeholder={String(shopPage)}
                className="w-16 text-center font-mono"
              />
              <Button size="sm" variant="primary" onClick={handleShopJump} disabled={shopLoading}>
                Go
              </Button>
            </div>
          ) : null
        }
      >
        {shopLoading ? (
          <p className="text-center text-ink-muted py-8">加载中...</p>
        ) : shopProducts.length === 0 ? (
          <p className="text-center text-ink-muted py-8">暂无数据</p>
        ) : (
          shopProducts.map((p) => (
            <div
              key={p.productId}
              onClick={() => selectShopProduct(p)}
              className="flex items-center gap-3 p-3 hover:bg-surface-hover rounded-md cursor-pointer border-b border-edge-subtle"
            >
              {p.thumbUrl && (
                <img
                  src={p.thumbUrl}
                  alt=""
                  className="w-12 h-12 object-cover rounded-md border border-edge"
                  referrerPolicy="no-referrer"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink-primary truncate">{p.productName}</div>
                <div className="text-[10px] font-mono text-ink-muted tabular">
                  {p.catName ? `${p.catName} · ` : ''}ID: {p.productId}
                </div>
              </div>
            </div>
          ))
        )}
      </Modal>

      {/* Batch Edit Modal */}
      <BatchEditModal
        open={showBatchEdit}
        onClose={() => setShowBatchEdit(false)}
        selectedIds={selection.selectedIds}
        initialTab={batchInitialTab}
        onCompleted={loadData}
      />

      {/* Per-product edit modal */}
      {editingProductId && (
        <ProductEditModal
          productId={editingProductId}
          onClose={() => setEditingProductId(null)}
          onSaved={() => {
            setEditingProductId(null);
            loadData();
          }}
        />
      )}
    </WorkspacePage>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-mono text-ink-secondary mb-1 uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}
