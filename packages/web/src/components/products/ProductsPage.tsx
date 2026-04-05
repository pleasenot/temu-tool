import { useState, useEffect } from 'react';
import { api } from '../../api/client';

interface Product {
  id: string;
  title: string;
  price?: number;
  currency: string;
  status: string;
  scraped_at: string;
  original_url?: string;
}

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadProducts();
  }, []);

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
    if (selected.size === products.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map(p => p.id)));
    }
  }

  async function deleteSelected() {
    for (const id of selected) {
      await api.products.delete(id);
    }
    setSelected(new Set());
    loadProducts();
  }

  const statusLabel: Record<string, string> = {
    collected: '已采集',
    processing: '处理中',
    mockup_ready: '已套图',
    priced: '已核价',
    listing: '上品中',
    listed: '已上品',
    error: '错误',
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">产品管理</h2>
          <p className="text-sm text-gray-500 mt-1">共 {total} 个产品</p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <>
              <button
                onClick={deleteSelected}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600"
              >
                删除选中 ({selected.size})
              </button>
            </>
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
        <div className="bg-white rounded-lg border border-gray-200">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-sm text-gray-500">
                <th className="p-3 text-left">
                  <input
                    type="checkbox"
                    checked={selected.size === products.length}
                    onChange={selectAll}
                  />
                </th>
                <th className="p-3 text-left">标题</th>
                <th className="p-3 text-left">价格</th>
                <th className="p-3 text-left">状态</th>
                <th className="p-3 text-left">采集时间</th>
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
                    <div className="font-medium text-gray-800 line-clamp-2">
                      {product.title}
                    </div>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
