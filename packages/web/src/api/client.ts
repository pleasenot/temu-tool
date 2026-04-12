const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

// Products
export const api = {
  products: {
    list: (page = 1, limit = 20) =>
      request(`/products?page=${page}&limit=${limit}`),
    get: (id: string) =>
      request(`/products/${id}`),
    delete: (id: string) =>
      request(`/products/${id}`, { method: 'DELETE' }),
    update: (id: string, data: { title?: string; price?: number; category?: string }) =>
      request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    addImage: (id: string, url: string) =>
      request(`/products/${id}/images`, { method: 'POST', body: JSON.stringify({ url }) }),
    deleteImage: (id: string, imageId: string) =>
      request(`/products/${id}/images/${imageId}`, { method: 'DELETE' }),
    uploadImage: async (id: string, file: File) => {
      const res = await fetch(`/api/products/${id}/images/upload`, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
        body: file,
      });
      if (!res.ok) throw new Error('upload failed: ' + res.status);
      return res.json();
    },
    replaceImage: async (id: string, imageId: string, file: File) => {
      const res = await fetch(`/api/products/${id}/images/${imageId}/upload`, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
        body: file,
      });
      if (!res.ok) throw new Error('replace failed: ' + res.status);
      return res.json();
    },
    bulkAddImage: async (productIds: string[], file: File) => {
      const qs = new URLSearchParams({ productIds: productIds.join(',') });
      const res = await fetch(`/api/products/bulk-add-image?${qs}`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-Filename': encodeURIComponent(file.name),
        },
        body: file,
      });
      if (!res.ok) throw new Error('bulk-add-image failed: ' + res.status);
      return res.json();
    },
    bulkTitleReplace: (productIds: string[], find: string, replace: string) =>
      request<any>('/products/bulk-title-replace', {
        method: 'POST',
        body: JSON.stringify({ productIds, find, replace }),
      }),
    bulkTitleAi: (productIds: string[]) =>
      request<any>('/products/bulk-title-ai', {
        method: 'POST',
        body: JSON.stringify({ productIds }),
      }),
    bulkGenerateVideo: (productIds: string[], promptTemplate?: string) =>
      request<any>('/products/bulk-generate-video', {
        method: 'POST',
        body: JSON.stringify({ productIds, promptTemplate }),
      }),
    deleteVideo: (productId: string, videoId: string) =>
      request(`/products/${productId}/videos/${videoId}`, { method: 'DELETE' }),
  },

  mockup: {
    templates: () => request('/mockup/templates'),
    addTemplate: (data: { name: string; psdPath: string; smartObjectLayerName: string }) =>
      request('/mockup/templates', { method: 'POST', body: JSON.stringify(data) }),
    deleteTemplate: (id: string) =>
      request(`/mockup/templates/${id}`, { method: 'DELETE' }),
    startBatch: (config: any) =>
      request('/mockup/batch', { method: 'POST', body: JSON.stringify({ config }) }),
    testConnection: (host: string, port: number, password: string) =>
      request('/mockup/test-connection', { method: 'POST', body: JSON.stringify({ host, port, password }) }),
  },

  listing: {
    login: () => request('/listing/login', { method: 'POST' }),
    logout: () => request('/listing/logout', { method: 'POST' }),
    loginStatus: () => request('/listing/login-status'),
    saveCredentials: (username: string, password: string) =>
      request('/listing/credentials', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    startBatch: (productIds: string[], autoSubmit = false) =>
      request('/listing/batch', { method: 'POST', body: JSON.stringify({ productIds, autoSubmit }) }),
    batchPublish: (productIds: string[], templateId: string) =>
      request('/listing/batch-publish', { method: 'POST', body: JSON.stringify({ productIds, templateId }) }),
    shopProducts: (params?: { page?: number; pageSize?: number }) => {
      const qs = new URLSearchParams();
      if (params?.page) qs.set('page', String(params.page));
      if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
      const suffix = qs.toString() ? `?${qs}` : '';
      return request<any>(`/listing/shop-products${suffix}`);
    },
    status: () => request('/listing/status'),
  },

  templates: {
    list: () => request<any>('/templates'),
    get: (id: string) => request<any>(`/templates/${id}`),
    create: (data: { name: string; refProductId?: string }) =>
      request('/templates', { method: 'POST', body: JSON.stringify(data) }),
    createFromProduct: (name: string, refProductId: string) =>
      request('/templates/create-from-product', { method: 'POST', body: JSON.stringify({ name, refProductId }) }),
    update: (id: string, data: any) =>
      request(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request(`/templates/${id}`, { method: 'DELETE' }),
  },

  settings: {
    get: () => request('/settings'),
    update: (data: Record<string, string>) =>
      request('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  },
};

// WebSocket connection for real-time updates
export function connectWebSocket(onMessage: (msg: any) => void): WebSocket {
  const ws = new WebSocket(`ws://localhost:23789`);

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'auth',
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      payload: { source: 'web' },
    }));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      onMessage(msg);
    } catch {}
  };

  ws.onclose = () => {
    // Reconnect after 3 seconds
    setTimeout(() => connectWebSocket(onMessage), 3000);
  };

  return ws;
}
