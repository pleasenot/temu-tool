import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { WorkspacePage } from '../platform/WorkspacePage';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { toast } from '../ui/Toast';

export function SettingsPage() {
  const [settings, setSettings] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const [psHost, setPsHost] = useState('127.0.0.1');
  const [psPort, setPsPort] = useState('49494');
  const [psPassword, setPsPassword] = useState('');
  const [templatesDir, setTemplatesDir] = useState('');
  const [inputDir, setInputDir] = useState('');
  const [outputDir, setOutputDir] = useState('');

  const loadSettings = useCallback(async () => {
    const res: any = await api.settings.get();
    if (res.data) {
      const s = res.data;
      setPsHost(s.photoshop.host);
      setPsPort(String(s.photoshop.port));
      setTemplatesDir(s.directories.templates);
      setInputDir(s.directories.input);
      setOutputDir(s.directories.output);
      setSettings(s);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  async function save() {
    setSaving(true);
    try {
      const updates: Record<string, string> = {
        ps_host: psHost,
        ps_port: psPort,
        templates_dir: templatesDir,
        input_dir: inputDir,
        output_dir: outputDir,
      };
      if (psPassword) updates.ps_password = psPassword;
      await api.settings.update(updates);
      toast.success('设置已保存');
    } catch (err) {
      toast.error('保存失败：' + String(err));
    }
    setSaving(false);
  }

  async function testPsConnection() {
    try {
      const res: any = await api.mockup.testConnection(psHost, parseInt(psPort), psPassword);
      if (res.success) {
        toast.success('Photoshop 连接成功');
      } else {
        toast.error('连接失败：' + res.error);
      }
    } catch (err) {
      toast.error('连接失败：' + String(err));
    }
  }

  return (
    <WorkspacePage>
      <WorkspacePage.Header
        title="设置"
        subtitle="Photoshop 远程连接 · 文件路径"
        actions={
          <Button variant="primary" onClick={save} loading={saving}>
            保存设置
          </Button>
        }
      />

      <WorkspacePage.Content>
        <div className="max-w-2xl mx-auto space-y-4">
          {/* Photoshop */}
          <Card padded>
            <h3 className="font-display text-base text-ink-primary mb-1">Photoshop 远程连接</h3>
            <p className="text-xs text-ink-muted mb-4">通过 PS 远程连接协议访问本地 Photoshop。</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-mono text-ink-secondary mb-1.5 uppercase tracking-widest">
                  主机
                </label>
                <Input
                  value={psHost}
                  onChange={(e) => setPsHost(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-ink-secondary mb-1.5 uppercase tracking-widest">
                  端口
                </label>
                <Input
                  value={psPort}
                  onChange={(e) => setPsPort(e.target.value)}
                  className="font-mono tabular"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-[10px] font-mono text-ink-secondary mb-1.5 uppercase tracking-widest">
                密码
              </label>
              <Input
                type="password"
                value={psPassword}
                onChange={(e) => setPsPassword(e.target.value)}
                placeholder={settings.photoshop?.password ? '已设置' : '输入 PS 远程连接密码'}
              />
            </div>
            <div className="mt-3">
              <Button size="sm" variant="secondary" onClick={testPsConnection}>
                测试连接
              </Button>
            </div>
          </Card>

          {/* Directories */}
          <Card padded>
            <h3 className="font-display text-base text-ink-primary mb-1">目录设置</h3>
            <p className="text-xs text-ink-muted mb-4">PSD 模板和图片输入/输出位置。</p>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-mono text-ink-secondary mb-1.5 uppercase tracking-widest">
                  PSD 模板目录
                </label>
                <Input
                  value={templatesDir}
                  onChange={(e) => setTemplatesDir(e.target.value)}
                  placeholder="C:\templates"
                  className="font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-ink-secondary mb-1.5 uppercase tracking-widest">
                  产品图片输入目录
                </label>
                <Input
                  value={inputDir}
                  onChange={(e) => setInputDir(e.target.value)}
                  placeholder="C:\input"
                  className="font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-ink-secondary mb-1.5 uppercase tracking-widest">
                  输出目录
                </label>
                <Input
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  placeholder="C:\output"
                  className="font-mono"
                />
              </div>
            </div>
          </Card>
        </div>
      </WorkspacePage.Content>
    </WorkspacePage>
  );
}
