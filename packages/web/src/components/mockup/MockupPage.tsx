import { useState, useEffect, useCallback } from 'react';
import { Plus, Play } from 'lucide-react';
import { api } from '../../api/client';
import { WorkspacePage } from '../platform/WorkspacePage';
import { BatchActionBar } from '../platform/BatchActionBar';
import { useSelection } from '../platform/useSelection';
import { useWsEvent, type WsMessage } from '../platform/WebSocketBus';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Checkbox } from '../ui/Checkbox';
import { EmptyState } from '../ui/EmptyState';
import { toast } from '../ui/Toast';

interface MockupTemplate {
  id: string;
  name: string;
  smart_object_layer_name?: string;
  psd_path?: string;
}

interface ProductLite {
  id: string;
  title: string;
  thumbnail?: string | null;
}

export function MockupPage() {
  const [templates, setTemplates] = useState<MockupTemplate[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', psdPath: '', smartObjectLayerName: '' });

  const productSel = useSelection(products);
  const templateSel = useSelection(templates);

  const loadData = useCallback(async () => {
    const [templatesRes, productsRes]: any[] = await Promise.all([
      api.mockup.templates(),
      api.products.list(1, 100),
    ]);
    setTemplates(templatesRes.data?.templates || []);
    setProducts(productsRes.data?.products || []);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh on completion. Progress visualization handled by global TaskTray.
  useWsEvent(
    'mockup:progress',
    useCallback(
      (msg: WsMessage) => {
        const p = msg.payload || {};
        if (p.current >= p.total && p.status !== 'processing') {
          loadData();
        }
      },
      [loadData]
    )
  );

  async function addTemplate() {
    if (!newTemplate.name) {
      toast.error('请填写模板名称');
      return;
    }
    try {
      await api.mockup.addTemplate(newTemplate);
      toast.success('模板已添加');
      setNewTemplate({ name: '', psdPath: '', smartObjectLayerName: '' });
      setShowAddTemplate(false);
      loadData();
    } catch (e) {
      toast.error('添加失败：' + (e as Error).message);
    }
  }

  async function startBatch() {
    if (productSel.count === 0 || templateSel.count === 0) return;
    try {
      await api.mockup.startBatch({
        productIds: productSel.selectedIds,
        templateIds: templateSel.selectedIds,
        removeBackground: true,
        exportFormat: 'jpg',
        jpgQuality: 10,
      });
      toast.success(
        `已提交 ${productSel.count} 产品 × ${templateSel.count} 模板，进度见右下角任务盘`
      );
    } catch (e) {
      toast.error('开始失败：' + (e as Error).message);
    }
  }

  return (
    <WorkspacePage>
      <WorkspacePage.Header
        title="批量套图"
        subtitle={`${templates.length} templates · ${products.length} products · ${productSel.count} selected`}
        actions={
          <Button
            variant="primary"
            leftIcon={<Plus size={14} />}
            onClick={() => setShowAddTemplate(true)}
          >
            新建模板
          </Button>
        }
      />

      <WorkspacePage.Content>
        <div className="grid grid-cols-12 gap-6 h-full min-h-0">
          {/* Templates panel */}
          <Card className="col-span-12 lg:col-span-5 flex flex-col p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-edge-subtle">
              <h3 className="font-display text-base text-ink-primary">样机模板</h3>
              <div className="font-mono text-[10px] text-ink-muted mt-0.5 tabular">
                {templateSel.count} / {templates.length} selected
              </div>
            </div>
            {templates.length === 0 ? (
              <EmptyState title="暂无模板" description="点击右上角「新建模板」添加 PSD 样机" />
            ) : (
              <div className="flex-1 overflow-y-auto divide-y divide-edge-subtle">
                {templates.map((t) => {
                  const sel = templateSel.isSelected(t.id);
                  return (
                    <div
                      key={t.id}
                      onClick={() => templateSel.toggle(t.id)}
                      className={`flex items-start gap-3 p-3 cursor-pointer transition-colors ${
                        sel ? 'bg-gold-soft' : 'hover:bg-surface-hover'
                      }`}
                    >
                      <Checkbox checked={sel} readOnly className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-ink-primary truncate">{t.name}</div>
                        {t.smart_object_layer_name && (
                          <div className="text-[10px] font-mono text-ink-muted mt-0.5 truncate">
                            {t.smart_object_layer_name}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Products picker */}
          <Card className="col-span-12 lg:col-span-7 flex flex-col p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-edge-subtle">
              <h3 className="font-display text-base text-ink-primary">选择产品</h3>
              <div className="font-mono text-[10px] text-ink-muted mt-0.5 tabular">
                {productSel.count} / {products.length} selected
              </div>
            </div>
            {products.length === 0 ? (
              <EmptyState title="暂无产品" description="先在 Temu 商品页用插件采集" />
            ) : (
              <div className="flex-1 overflow-y-auto p-3 grid grid-cols-3 gap-2">
                {products.map((p) => {
                  const sel = productSel.isSelected(p.id);
                  return (
                    <div
                      key={p.id}
                      onClick={() => productSel.toggle(p.id)}
                      className={`relative rounded-md border cursor-pointer overflow-hidden transition-all ${
                        sel ? 'border-gold shadow-glow-gold' : 'border-edge hover:border-edge-strong'
                      }`}
                    >
                      <div className="aspect-square bg-surface-base">
                        {p.thumbnail ? (
                          <img
                            src={p.thumbnail}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                            alt=""
                            onError={(e) =>
                              ((e.currentTarget as HTMLImageElement).style.display = 'none')
                            }
                          />
                        ) : null}
                      </div>
                      <div className="p-2">
                        <div className="text-[11px] text-ink-primary line-clamp-2 leading-snug">
                          {p.title}
                        </div>
                      </div>
                      {sel && (
                        <div className="absolute top-1.5 right-1.5">
                          <Checkbox checked readOnly />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </WorkspacePage.Content>

      <WorkspacePage.Footer>
        <BatchActionBar
          count={productSel.count}
          label={`产品已选 · 模板 ${templateSel.count}`}
          actions={[
            {
              id: 'run',
              label: '开始套图',
              icon: <Play size={14} />,
              primary: true,
              disabled: productSel.count === 0 || templateSel.count === 0,
              onClick: startBatch,
            },
          ]}
          onClear={productSel.clear}
        />
      </WorkspacePage.Footer>

      <Modal
        open={showAddTemplate}
        onClose={() => setShowAddTemplate(false)}
        title="新建样机模板"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAddTemplate(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={addTemplate}>
              保存
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-mono text-ink-secondary mb-1.5 uppercase tracking-widest">
              模板名称
            </label>
            <Input
              value={newTemplate.name}
              onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
              placeholder="例如：白底书桌"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-ink-secondary mb-1.5 uppercase tracking-widest">
              PSD 文件路径
            </label>
            <Input
              value={newTemplate.psdPath}
              onChange={(e) => setNewTemplate({ ...newTemplate, psdPath: e.target.value })}
              placeholder="C:\templates\desk.psd"
              className="font-mono"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-ink-secondary mb-1.5 uppercase tracking-widest">
              智能对象图层名称
            </label>
            <Input
              value={newTemplate.smartObjectLayerName}
              onChange={(e) =>
                setNewTemplate({ ...newTemplate, smartObjectLayerName: e.target.value })
              }
              placeholder="ProductImage"
              className="font-mono"
            />
          </div>
        </div>
      </Modal>
    </WorkspacePage>
  );
}
