import { useEffect, useState, useCallback } from 'react';
import { UserCircle, RefreshCw, LogIn, LogOut, AlertTriangle } from 'lucide-react';
import { api } from '../../api/client';
import { WorkspacePage } from '../platform/WorkspacePage';
import { useWsEvent, type WsMessage } from '../platform/WebSocketBus';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { toast } from '../ui/Toast';

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
  const [captchaMessage, setCaptchaMessage] = useState('');

  const refreshStatus = useCallback(async () => {
    try {
      const res: any = await api.listing.loginStatus();
      if (res.success && res.data) {
        setStatus(res.data);
        if (res.data.username) setUsername(res.data.username);
      }
    } catch (err) {
      toast.error('状态获取失败：' + String(err));
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useWsEvent(
    'listing:captcha',
    useCallback((msg: WsMessage) => {
      setCaptchaMessage(msg.payload?.message || '请在弹出的浏览器窗口中完成验证');
    }, [])
  );

  async function saveCredentials() {
    setSavingCreds(true);
    try {
      const res: any = await api.listing.saveCredentials(username, password);
      if (res.success) {
        toast.success('凭据已加密保存');
        setPassword('');
        await refreshStatus();
      } else {
        toast.error('保存失败：' + res.error);
      }
    } catch (err) {
      toast.error('保存失败：' + String(err));
    }
    setSavingCreds(false);
  }

  async function doLogin() {
    setLoggingIn(true);
    setCaptchaMessage('');
    try {
      const res: any = await api.listing.login();
      if (res.success) {
        toast.success('登录成功');
        await refreshStatus();
      } else {
        toast.error('登录失败：' + res.error);
      }
    } catch (err) {
      toast.error('登录失败：' + String(err));
    }
    setLoggingIn(false);
    setCaptchaMessage('');
  }

  async function doLogout() {
    if (!confirm('清除已保存的浏览器会话？下次登录将需要重新验证。')) return;
    try {
      const res: any = await api.listing.logout();
      if (res.success) {
        toast.success('已退出登录（浏览器配置已清除）');
        await refreshStatus();
      } else {
        toast.error('退出失败：' + res.error);
      }
    } catch (err) {
      toast.error('退出失败：' + String(err));
    }
  }

  return (
    <WorkspacePage>
      <WorkspacePage.Header
        title="账号管理"
        subtitle="Temu 卖家中心 SSO 登录态"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshStatus}
            leftIcon={<RefreshCw size={14} />}
          >
            刷新
          </Button>
        }
      />

      <WorkspacePage.Content>
        <div className="max-w-2xl mx-auto space-y-4">
          {captchaMessage && (
            <Card padded className="border-gold ring-1 ring-gold-ring">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-gold shrink-0 mt-0.5" />
                <div className="text-sm text-ink-primary leading-relaxed">{captchaMessage}</div>
              </div>
            </Card>
          )}

          {/* Status */}
          <Card padded>
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-full bg-surface-hover border border-edge flex items-center justify-center text-ink-muted shrink-0">
                <UserCircle size={32} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display text-lg text-ink-primary leading-tight truncate">
                  {status?.username || '未配置账号'}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge
                    variant="pip"
                    tone={status === null ? 'neutral' : status.loggedIn ? 'success' : 'danger'}
                  />
                  <span className="font-mono text-[10px] text-ink-secondary">
                    {status === null
                      ? '检查中...'
                      : status.loggedIn
                      ? '已登录'
                      : status.hasPassword
                      ? '凭据已配置 · 待登录'
                      : '未配置凭据'}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <Button
                  variant="primary"
                  leftIcon={<LogIn size={14} />}
                  onClick={doLogin}
                  loading={loggingIn}
                  disabled={!status?.username || !status?.hasPassword}
                >
                  登录 Temu
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<LogOut size={14} />}
                  onClick={doLogout}
                >
                  退出登录
                </Button>
              </div>
            </div>
            {(!status?.username || !status?.hasPassword) && (
              <p className="text-xs text-ink-muted mt-3">请先在下方填写并保存凭据</p>
            )}
          </Card>

          {/* Credentials */}
          <Card padded>
            <h3 className="font-display text-base text-ink-primary mb-1">账号凭据</h3>
            <p className="text-xs text-ink-muted mb-4 leading-relaxed">
              密码使用系统密钥环 (safeStorage) 加密存储，仅用于自动填充登录表单。
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-mono text-ink-secondary mb-1.5 uppercase tracking-widest">
                  手机号
                </label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Temu 卖家手机号"
                  className="font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-ink-secondary mb-1.5 uppercase tracking-widest">
                  密码
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={status?.hasPassword ? '已设置（留空保持不变）' : '输入密码'}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                variant="primary"
                onClick={saveCredentials}
                loading={savingCreds}
                disabled={!username}
              >
                保存凭据
              </Button>
            </div>
          </Card>
        </div>
      </WorkspacePage.Content>
    </WorkspacePage>
  );
}
