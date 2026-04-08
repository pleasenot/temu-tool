import { useEffect, useState } from 'react';
import { api, connectWebSocket } from '../../api/client';

interface LoginStatus {
  loggedIn: boolean;
  username: string;
  hasPassword: boolean;
}

export function AccountPage() {
  const [status, setStatus] = useState<LoginStatus | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [savingCreds, setSavingCreds] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [message, setMessage] = useState('');
  const [captchaMessage, setCaptchaMessage] = useState('');

  useEffect(() => {
    refreshStatus();
    // Listen for captcha hints from backend during login.
    const ws = connectWebSocket((msg) => {
      if (msg?.type === 'listing:captcha') {
        setCaptchaMessage(msg.payload?.message || '请在弹出的浏览器窗口中完成验证');
      }
    });
    return () => ws.close();
  }, []);

  async function refreshStatus() {
    try {
      const res: any = await api.listing.loginStatus();
      if (res.success && res.data) {
        setStatus(res.data);
        if (res.data.username) setUsername(res.data.username);
      }
    } catch (err) {
      setMessage(`状态获取失败: ${err}`);
    }
  }

  async function saveCredentials() {
    setSavingCreds(true);
    setMessage('');
    try {
      const res: any = await api.listing.saveCredentials(username, password);
      if (res.success) {
        setMessage('凭据已加密保存');
        setPassword('');
        await refreshStatus();
      } else {
        setMessage(`保存失败: ${res.error}`);
      }
    } catch (err) {
      setMessage(`保存失败: ${err}`);
    }
    setSavingCreds(false);
  }

  async function doLogin() {
    setLoggingIn(true);
    setMessage('');
    setCaptchaMessage('');
    try {
      const res: any = await api.listing.login();
      if (res.success) {
        setMessage('登录成功');
        await refreshStatus();
      } else {
        setMessage(`登录失败: ${res.error}`);
      }
    } catch (err) {
      setMessage(`登录失败: ${err}`);
    }
    setLoggingIn(false);
    setCaptchaMessage('');
  }

  async function doLogout() {
    if (!confirm('清除已保存的浏览器会话？下次登录将需要重新验证。')) return;
    setMessage('');
    try {
      const res: any = await api.listing.logout();
      if (res.success) {
        setMessage('已退出登录（浏览器配置已清除）');
        await refreshStatus();
      } else {
        setMessage(`退出失败: ${res.error}`);
      }
    } catch (err) {
      setMessage(`退出失败: ${err}`);
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-xl font-bold text-gray-800 mb-6">账号管理</h2>

      {message && (
        <div
          className={`mb-4 p-3 rounded text-sm ${
            message.includes('失败') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
          }`}
        >
          {message}
        </div>
      )}

      {captchaMessage && (
        <div className="mb-4 p-3 rounded text-sm bg-yellow-50 text-yellow-800 border border-yellow-200">
          ⚠️ {captchaMessage}
        </div>
      )}

      {/* 登录状态 */}
      <section className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <h3 className="font-semibold text-gray-700 mb-3">Temu 卖家中心登录状态</h3>
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`w-2 h-2 rounded-full ${
              status?.loggedIn ? 'bg-green-500' : 'bg-gray-300'
            }`}
          />
          <span className="text-sm">
            {status === null
              ? '检查中...'
              : status.loggedIn
              ? `已登录${status.username ? ` (${status.username})` : ''}`
              : '未登录'}
          </span>
          <button
            onClick={refreshStatus}
            className="ml-auto px-2 py-1 text-xs bg-gray-100 border border-gray-300 rounded hover:bg-gray-200"
          >
            刷新
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={doLogin}
            disabled={loggingIn || !status?.username || !status?.hasPassword}
            className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {loggingIn ? '登录中（请查看弹出的浏览器）...' : '登录'}
          </button>
          <button
            onClick={doLogout}
            className="px-4 py-2 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            退出登录
          </button>
        </div>
        {(!status?.username || !status?.hasPassword) && (
          <p className="text-xs text-gray-500 mt-2">请先在下方填写并保存凭据</p>
        )}
      </section>

      {/* 凭据 */}
      <section className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <h3 className="font-semibold text-gray-700 mb-3">账号凭据</h3>
        <p className="text-xs text-gray-500 mb-3">
          密码使用系统密钥环（safeStorage）加密存储，仅用于自动填充登录表单。
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">手机号</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Temu 卖家手机号"
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={status?.hasPassword ? '已设置（留空则保持不变）' : '输入密码'}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </div>
        </div>
        <button
          onClick={saveCredentials}
          disabled={savingCreds || !username}
          className="mt-3 px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {savingCreds ? '保存中...' : '保存凭据'}
        </button>
      </section>
    </div>
  );
}
