import { useState, useEffect, useCallback } from 'react';
import {
  Play, FolderOpen, Search, Image, Layers, Settings2,
  FileText, Monitor,
} from 'lucide-react';
import { api } from '../../api/client';
import { WorkspacePage } from '../platform/WorkspacePage';
import { useWsEvent, type WsMessage } from '../platform/WebSocketBus';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { toast } from '../ui/Toast';
import { Tabs } from '../ui/Tabs';

interface ScannedFile {
  path: string;
  name: string;
  size: number;
}

type ExportFormat = 'jpg' | 'png';
type ResizeMode = 'fit' | 'fill' | 'stretch' | 'none';

const NAMING_TOKENS = [
  { token: '{image}', label: '图片名' },
  { token: '{template}', label: '模板名' },
  { token: '{index}', label: '序号' },
];

function SectionHeader({ icon: Icon, title, badge }: { icon: any; title: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div className="w-7 h-7 rounded-md bg-gold-soft flex items-center justify-center">
        <Icon size={14} className="text-gold" />
      </div>
      <h3 className="font-display text-base text-ink-primary">{title}</h3>
      {badge}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-mono text-ink-secondary mb-1.5 uppercase tracking-widest">
      {children}
    </label>
  );
}

export function MockupPage() {
  // Source images
  const [imageDir, setImageDir] = useState('');
  const [scannedImages, setScannedImages] = useState<ScannedFile[]>([]);
  const [scanningImages, setScanningImages] = useState(false);

  // Templates
  const [templateDir, setTemplateDir] = useState('');
  const [scannedTemplates, setScannedTemplates] = useState<ScannedFile[]>([]);
  const [scanningTemplates, setScanningTemplates] = useState(false);

  // Output config
  const [outputDir, setOutputDir] = useState('');
  const [namingPattern, setNamingPattern] = useState('{template}_{image}');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('jpg');
  const [jpgQuality, setJpgQuality] = useState(10);
  const [resizeMode, setResizeMode] = useState<ResizeMode>('fill');

  // PS connection
  const [psConnected, setPsConnected] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);

  // Load defaults from settings
  useEffect(() => {
    (async () => {
      try {
        const res: any = await api.settings.get();
        const s = res.data || {};
        if (s.input_dir) setImageDir(s.input_dir);
        if (s.templates_dir) setTemplateDir(s.templates_dir);
        if (s.output_dir) setOutputDir(s.output_dir);
      } catch {}
    })();
  }, []);

  // Test PS connection on mount (uses stored settings on backend)
  useEffect(() => {
    (async () => {
      try {
        const connRes: any = await api.mockup.testConnectionStored();
        setPsConnected(connRes.success);
      } catch {
        setPsConnected(false);
      }
    })();
  }, []);

  // Listen for batch completion
  useWsEvent(
    'mockup:progress',
    useCallback((msg: WsMessage) => {
      const p = msg.payload || {};
      if (p.current >= p.total && p.status !== 'processing') {
        setRunning(false);
        toast.success(`套图完成：${p.current} 个任务`);
      }
    }, [])
  );

  // === Actions ===

  async function scanImages() {
    if (!imageDir.trim()) { toast.error('请填写图片目录路径'); return; }
    setScanningImages(true);
    try {
      const res: any = await api.mockup.scanDir(imageDir.trim());
      if (!res.success) { toast.error(res.error || '扫描失败'); setScannedImages([]); return; }
      setScannedImages(res.data.files);
      if (res.data.count === 0) toast.info('目录中没有找到图片文件');
    } catch (e) {
      toast.error('扫描失败：' + (e as Error).message);
    } finally { setScanningImages(false); }
  }

  async function scanTemplates() {
    if (!templateDir.trim()) { toast.error('请填写模板目录路径'); return; }
    setScanningTemplates(true);
    try {
      const res: any = await api.mockup.scanTemplates(templateDir.trim());
      if (!res.success) { toast.error(res.error || '扫描失败'); setScannedTemplates([]); return; }
      setScannedTemplates(res.data.templates);
      if (res.data.count === 0) toast.info('目录中没有找到 PSD 文件');
    } catch (e) {
      toast.error('扫描失败：' + (e as Error).message);
    } finally { setScanningTemplates(false); }
  }

  async function startBatch() {
    if (scannedImages.length === 0) { toast.error('请先扫描图片目录'); return; }
    if (scannedTemplates.length === 0) { toast.error('请先扫描模板目录'); return; }
    if (!outputDir.trim()) { toast.error('请填写输出目录'); return; }
    if (psConnected !== true) { toast.error('Photoshop 未连接，请在设置页配置'); return; }

    setRunning(true);
    try {
      const res: any = await api.mockup.startBatchDir({
        imageDir: imageDir.trim(),
        templateDir: templateDir.trim(),
        outputDir: outputDir.trim(),
        namingPattern,
        exportFormat,
        jpgQuality,
        resizeMode,
      });
      if (!res.success) {
        toast.error(res.error || '启动失败');
        setRunning(false);
        return;
      }
      toast.success(
        `已提交 ${scannedImages.length} 张图 × ${scannedTemplates.length} 个模板，进度见右下角任务盘`
      );
    } catch (e) {
      toast.error('启动失败：' + (e as Error).message);
      setRunning(false);
    }
  }

  const totalJobs = scannedImages.length * scannedTemplates.length;

  // Preview naming
  const previewName = namingPattern
    .replace(/\{image\}/g, 'photo_01')
    .replace(/\{template\}/g, 'mockup_desk')
    .replace(/\{index\}/g, '001');

  const canStart = scannedImages.length > 0 && scannedTemplates.length > 0 && outputDir.trim() && psConnected === true && !running;

  return (
    <WorkspacePage>
      <WorkspacePage.Header
        title="批量套图"
        subtitle={
          totalJobs > 0
            ? `${scannedImages.length} 张图 × ${scannedTemplates.length} 模板 = ${totalJobs} 个任务`
            : '选择图片目录和模板目录，一键套图'
        }
        actions={
          <div className="flex items-center gap-1.5">
            <Monitor size={14} className="text-ink-muted" />
            <span className="text-[10px] font-mono text-ink-muted">PS</span>
            <div
              className={`w-2 h-2 rounded-full ${
                psConnected === true
                  ? 'bg-status-success'
                  : psConnected === false
                  ? 'bg-status-danger'
                  : 'bg-ink-muted animate-pulse'
              }`}
            />
          </div>
        }
      />

      <WorkspacePage.Content>
        <div className="max-w-4xl mx-auto space-y-5">
          {/* Section 1: Source Images */}
          <Card padded>
            <SectionHeader
              icon={Image}
              title="图片来源"
              badge={
                scannedImages.length > 0
                  ? <Badge variant="count" tone="gold">{scannedImages.length} 张图片</Badge>
                  : undefined
              }
            />
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  value={imageDir}
                  onChange={(e) => setImageDir(e.target.value)}
                  placeholder="图片所在目录路径，如 E:\素材\产品图"
                  className="font-mono text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && scanImages()}
                />
              </div>
              <Button
                variant="secondary"
                leftIcon={scanningImages ? <Spinner size={14} /> : <Search size={14} />}
                onClick={scanImages}
                disabled={scanningImages}
              >
                扫描
              </Button>
            </div>

            {scannedImages.length > 0 && (
              <div className="mt-3 text-xs text-ink-secondary">
                找到 {scannedImages.length} 张图片（
                {(scannedImages.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB）
              </div>
            )}
          </Card>

          {/* Section 2: PSD Templates */}
          <Card padded>
            <SectionHeader
              icon={Layers}
              title="PSD 样机模板"
              badge={
                scannedTemplates.length > 0
                  ? <Badge variant="count" tone="violet">{scannedTemplates.length} 个模板</Badge>
                  : undefined
              }
            />
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  value={templateDir}
                  onChange={(e) => setTemplateDir(e.target.value)}
                  placeholder="PSD 模板所在目录路径，如 E:\模板\样机"
                  className="font-mono text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && scanTemplates()}
                />
              </div>
              <Button
                variant="secondary"
                leftIcon={scanningTemplates ? <Spinner size={14} /> : <FolderOpen size={14} />}
                onClick={scanTemplates}
                disabled={scanningTemplates}
              >
                扫描模板
              </Button>
            </div>

            {scannedTemplates.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {scannedTemplates.map((tpl) => (
                  <div
                    key={tpl.path}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-base/60 border border-edge-subtle"
                  >
                    <FileText size={16} className="text-ink-muted shrink-0" />
                    <span className="text-sm text-ink-primary truncate">{tpl.name}</span>
                    <span className="text-[10px] font-mono text-ink-muted ml-auto shrink-0">
                      {(tpl.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Section 3: Output Config */}
          <Card padded>
            <SectionHeader icon={Settings2} title="输出配置" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {/* Left column */}
              <div className="space-y-4">
                <div>
                  <FieldLabel>输出目录</FieldLabel>
                  <Input
                    value={outputDir}
                    onChange={(e) => setOutputDir(e.target.value)}
                    placeholder="套图输出保存目录"
                    className="font-mono text-sm"
                  />
                </div>
                <div>
                  <FieldLabel>命名规则</FieldLabel>
                  <Input
                    value={namingPattern}
                    onChange={(e) => setNamingPattern(e.target.value)}
                    placeholder="{template}_{image}"
                    className="font-mono text-sm"
                  />
                  <div className="flex gap-1.5 mt-1.5">
                    {NAMING_TOKENS.map((t) => (
                      <button
                        key={t.token}
                        onClick={() => setNamingPattern((prev) => prev + t.token)}
                        className="px-2 py-0.5 rounded text-[10px] font-mono bg-gold-soft text-gold border border-gold/20 hover:bg-gold/20 transition-colors"
                      >
                        {t.token}
                      </button>
                    ))}
                  </div>
                  <div className="text-[10px] font-mono text-ink-muted mt-1">
                    预览: <span className="text-ink-secondary">{previewName}.{exportFormat}</span>
                  </div>
                </div>
              </div>

              {/* Right column */}
              <div className="space-y-4">
                <div>
                  <FieldLabel>输出格式</FieldLabel>
                  <Tabs
                    items={[
                      { id: 'jpg', label: 'JPG' },
                      { id: 'png', label: 'PNG' },
                    ]}
                    value={exportFormat}
                    onChange={(v) => setExportFormat(v as ExportFormat)}
                  />
                </div>

                <div>
                  <FieldLabel>Resize Mode</FieldLabel>
                  <Tabs
                    items={[
                      { id: 'fit', label: 'Fit' },
                      { id: 'fill', label: 'Fill' },
                      { id: 'stretch', label: 'Stretch' },
                      { id: 'none', label: 'None' },
                    ]}
                    value={resizeMode}
                    onChange={(v) => setResizeMode(v as ResizeMode)}
                  />
                </div>

                {exportFormat === 'jpg' && (
                  <div>
                    <FieldLabel>JPG 质量 ({jpgQuality}/12)</FieldLabel>
                    <input
                      type="range"
                      min={1}
                      max={12}
                      value={jpgQuality}
                      onChange={(e) => setJpgQuality(Number(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none bg-surface-base accent-gold cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] font-mono text-ink-muted mt-0.5">
                      <span>低质量</span>
                      <span>高质量</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Start Button */}
          <div className="flex items-center justify-between pt-2 pb-4">
            <div className="text-sm text-ink-secondary">
              {totalJobs > 0
                ? `${scannedImages.length} 张图 × ${scannedTemplates.length} 模板 = ${totalJobs} 个任务`
                : '扫描图片和模板目录后开始'}
            </div>
            <Button
              variant="primary"
              size="lg"
              leftIcon={running ? <Spinner size={16} /> : <Play size={16} />}
              onClick={startBatch}
              disabled={!canStart}
            >
              {running ? '套图中…' : '开始套图'}
            </Button>
          </div>
        </div>
      </WorkspacePage.Content>
    </WorkspacePage>
  );
}
