import { useState, useEffect } from 'react';
import { api, connectWebSocket } from '../../api/client';

export function MockupPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<any>(null);
  const [processing, setProcessing] = useState(false);

  // New template form
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', psdPath: '', smartObjectLayerName: '' });

  useEffect(() => {
    loadData();

    const ws = connectWebSocket((msg) => {
      if (msg.type === 'mockup:progress') {
        setProgress(msg.payload);
        if (msg.payload.current === msg.payload.total && msg.payload.status !== 'processing') {
          setProcessing(false);
        }
      }
    });

    return () => ws.close();
  }, []);

  async function loadData() {
    const [templatesRes, productsRes]: any[] = await Promise.all([
      api.mockup.templates(),
      api.products.list(1, 100),
    ]);
    setTemplates(templatesRes.data.templates);
    setProducts(productsRes.data.products);
  }

  async function addTemplate() {
    await api.mockup.addTemplate(newTemplate);
    setNewTemplate({ name: '', psdPath: '', smartObjectLayerName: '' });
    setShowAddTemplate(false);
    loadData();
  }

  async function startBatch() {
    if (selectedProducts.size === 0 || selectedTemplates.size === 0) return;

    setProcessing(true);
    await api.mockup.startBatch({
      productIds: Array.from(selectedProducts),
      templateIds: Array.from(selectedTemplates),
      removeBackground: true,
      exportFormat: 'jpg',
      jpgQuality: 10,
    });
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-6">批量套图</h2>

      <div className="grid grid-cols-2 gap-6">
        {/* Templates section */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-700">样机模板</h3>
            <button
              onClick={() => setShowAddTemplate(true)}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              添加模板
            </button>
          </div>

          {showAddTemplate && (
            <div className="mb-4 p-3 bg-gray-50 rounded border border-gray-200">
              <input
                placeholder="模板名称"
                value={newTemplate.name}
                onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                className="w-full mb-2 px-3 py-2 border border-gray-300 rounded text-sm"
              />
              <input
                placeholder="PSD 文件路径"
                value={newTemplate.psdPath}
                onChange={(e) => setNewTemplate({ ...newTemplate, psdPath: e.target.value })}
                className="w-full mb-2 px-3 py-2 border border-gray-300 rounded text-sm"
              />
              <input
                placeholder="智能对象图层名称"
                value={newTemplate.smartObjectLayerName}
                onChange={(e) => setNewTemplate({ ...newTemplate, smartObjectLayerName: e.target.value })}
                className="w-full mb-2 px-3 py-2 border border-gray-300 rounded text-sm"
              />
              <div className="flex gap-2">
                <button onClick={addTemplate} className="px-3 py-1 text-sm bg-blue-500 text-white rounded">保存</button>
                <button onClick={() => setShowAddTemplate(false)} className="px-3 py-1 text-sm bg-gray-300 rounded">取消</button>
              </div>
            </div>
          )}

          {templates.length === 0 ? (
            <p className="text-sm text-gray-500">暂无模板，请添加 PSD 样机模板</p>
          ) : (
            <div className="space-y-2">
              {templates.map((t: any) => (
                <label key={t.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedTemplates.has(t.id)}
                    onChange={() => {
                      const next = new Set(selectedTemplates);
                      next.has(t.id) ? next.delete(t.id) : next.add(t.id);
                      setSelectedTemplates(next);
                    }}
                  />
                  <div>
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-xs text-gray-400">{t.smart_object_layer_name}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Products selection */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-700 mb-4">选择产品</h3>
          {products.length === 0 ? (
            <p className="text-sm text-gray-500">暂无产品，请先采集</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-auto">
              {products.map((p: any) => (
                <label key={p.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedProducts.has(p.id)}
                    onChange={() => {
                      const next = new Set(selectedProducts);
                      next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                      setSelectedProducts(next);
                    }}
                  />
                  <span className="text-sm line-clamp-1">{p.title}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={startBatch}
          disabled={processing || selectedProducts.size === 0 || selectedTemplates.size === 0}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {processing ? '处理中...' : `开始套图 (${selectedProducts.size} 产品 x ${selectedTemplates.size} 模板)`}
        </button>
      </div>

      {/* Progress */}
      {progress && (
        <div className="mt-4 bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              {progress.productTitle} - {progress.templateName}
            </span>
            <span className="text-sm text-gray-500">
              {progress.current} / {progress.total}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                progress.status === 'error' ? 'bg-red-500' : 'bg-blue-500'
              }`}
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
          {progress.error && (
            <p className="text-sm text-red-500 mt-2">{progress.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
