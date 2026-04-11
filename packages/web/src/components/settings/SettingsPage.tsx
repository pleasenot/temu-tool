import { useState, useEffect } from 'react';
import { api } from '../../api/client';

export function SettingsPage() {
  const [settings, setSettings] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Form state
  const [psHost, setPsHost] = useState('127.0.0.1');
  const [psPort, setPsPort] = useState('49494');
  const [psPassword, setPsPassword] = useState('');
  const [templatesDir, setTemplatesDir] = useState('');
  const [inputDir, setInputDir] = useState('');
  const [outputDir, setOutputDir] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
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
  }

  async function save() {
    setSaving(true);
    setMessage('');
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
      setMessage('设置已保存');
    } catch (err) {
      setMessage(`保存失败: ${err}`);
    }
    setSaving(false);
  }

  async function testPsConnection() {
    const res: any = await api.mockup.testConnection(psHost, parseInt(psPort), psPassword);
    if (res.success) {
      setMessage('Photoshop 连接成功！');
    } else {
      setMessage(`连接失败: ${res.error}`);
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-xl font-bold text-gray-800 mb-6">设置</h2>

      {message && (
        <div className={`mb-4 p-3 rounded text-sm ${
          message.includes('失败') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
        }`}>
          {message}
        </div>
      )}

      {/* Photoshop */}
      <section className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <h3 className="font-semibold text-gray-700 mb-3">Photoshop 远程连接</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">主机</label>
            <input value={psHost} onChange={(e) => setPsHost(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">端口</label>
            <input value={psPort} onChange={(e) => setPsPort(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-sm text-gray-600 mb-1">密码</label>
          <input type="password" value={psPassword} onChange={(e) => setPsPassword(e.target.value)}
            placeholder={settings.photoshop?.password ? '已设置' : '输入 PS 远程连接密码'}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
        </div>
        <button onClick={testPsConnection}
          className="mt-3 px-3 py-1 text-sm bg-gray-100 border border-gray-300 rounded hover:bg-gray-200">
          测试连接
        </button>
      </section>

      {/* MiniMax key now lives in packages/electron/.env (not managed via UI). */}

      {/* Directories */}
      <section className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <h3 className="font-semibold text-gray-700 mb-3">目录设置</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">PSD 模板目录</label>
            <input value={templatesDir} onChange={(e) => setTemplatesDir(e.target.value)}
              placeholder="C:\templates"
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">产品图片输入目录</label>
            <input value={inputDir} onChange={(e) => setInputDir(e.target.value)}
              placeholder="C:\input"
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">输出目录</label>
            <input value={outputDir} onChange={(e) => setOutputDir(e.target.value)}
              placeholder="C:\output"
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </div>
        </div>
      </section>

      <button onClick={save} disabled={saving}
        className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">
        {saving ? '保存中...' : '保存设置'}
      </button>
    </div>
  );
}
