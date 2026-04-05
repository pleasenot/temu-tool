import { useState, useEffect } from 'react';
import { api, connectWebSocket } from '../../api/client';

export function ListingPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<any>(null);
  const [processing, setProcessing] = useState(false);
  const [captchaMsg, setCaptchaMsg] = useState('');
  const [listings, setListings] = useState<any[]>([]);

  useEffect(() => {
    loadData();

    const ws = connectWebSocket((msg) => {
      if (msg.type === 'listing:progress') {
        setProgress(msg.payload);
        if (msg.payload.current === msg.payload.total) {
          setProcessing(false);
          loadListings();
        }
      }
      if (msg.type === 'listing:captcha') {
        setCaptchaMsg(msg.payload.message);
      }
    });

    return () => ws.close();
  }, []);

  async function loadData() {
    const res: any = await api.products.list(1, 100);
    // Only show products that are priced or mockup_ready
    setProducts(res.data.products.filter((p: any) => ['priced', 'mockup_ready'].includes(p.status)));
    loadListings();
  }

  async function loadListings() {
    const res: any = await api.listing.status();
    setListings(res.data || []);
  }

  async function testLogin() {
    const res: any = await api.listing.login();
    if (res.success) {
      alert('Temu 登录成功！');
    } else {
      alert(`登录失败: ${res.error}`);
    }
  }

  async function startBatch() {
    if (selected.size === 0) return;
    setProcessing(true);
    setCaptchaMsg('');
    // autoSubmit = false, semi-automatic mode
    await api.listing.startBatch(Array.from(selected), false);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">自动上品</h2>
        <button
          onClick={testLogin}
          className="px-4 py-2 text-sm bg-green-500 text-white rounded hover:bg-green-600"
        >
          测试登录 Temu
        </button>
      </div>

      {captchaMsg && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-yellow-700 text-sm">{captchaMsg}</p>
        </div>
      )}

      {/* Product selection */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <h3 className="font-semibold text-gray-700 mb-3">选择待上品产品</h3>
        {products.length === 0 ? (
          <p className="text-sm text-gray-500">暂无可上品的产品（需要先完成套图和核价）</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-auto">
            {products.map((p: any) => (
              <label key={p.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => {
                    const next = new Set(selected);
                    next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                    setSelected(next);
                  }}
                />
                <span className="text-sm">{p.title}</span>
              </label>
            ))}
          </div>
        )}

        <button
          onClick={startBatch}
          disabled={processing || selected.size === 0}
          className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
        >
          {processing ? '上品中...' : `开始上品 (${selected.size} 个产品)`}
        </button>
        <p className="text-xs text-gray-400 mt-2">半自动模式：自动填充表单，不自动提交，你可以检查后手动提交</p>
      </div>

      {/* Progress */}
      {progress && (
        <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{progress.productTitle}</span>
            <span className="text-sm text-gray-500">{progress.current} / {progress.total}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-blue-500 transition-all"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Listing history */}
      {listings.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          <h3 className="font-semibold text-gray-700 p-4 border-b border-gray-200">上品记录</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b border-gray-100">
                <th className="p-3 text-left">产品</th>
                <th className="p-3 text-left">状态</th>
                <th className="p-3 text-left">时间</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l: any) => (
                <tr key={l.id} className="border-b border-gray-50">
                  <td className="p-3">{l.product_title}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs ${
                      l.status === 'submitted' ? 'bg-green-100 text-green-700' :
                      l.status === 'error' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {l.status}
                    </span>
                  </td>
                  <td className="p-3 text-gray-500">{l.submitted_at ? new Date(l.submitted_at).toLocaleString('zh-CN') : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
