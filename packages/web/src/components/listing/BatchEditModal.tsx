import { useState, useEffect } from 'react';
import { Pencil, Image as ImageIcon, Sparkles, Film } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Tabs } from '../ui/Tabs';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { toast } from '../ui/Toast';
import { api } from '../../api/client';

export type BatchTab = 'title' | 'image' | 'ai' | 'video';

export function BatchEditModal({
  open,
  onClose,
  selectedIds,
  initialTab,
  onCompleted,
}: {
  open: boolean;
  onClose: () => void;
  selectedIds: string[];
  initialTab: BatchTab;
  onCompleted: () => void;
}) {
  const [tab, setTab] = useState<BatchTab>(initialTab);
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoPrompt, setVideoPrompt] = useState('');
  const [busy, setBusy] = useState(false);

  // Sync tab whenever the modal is reopened with a fresh initial
  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setFind('');
      setReplace('');
      setImageFile(null);
      setVideoPrompt('');
    }
  }, [open, initialTab]);

  async function applyTitleReplace() {
    if (!find) {
      toast.error('请输入查找内容');
      return;
    }
    setBusy(true);
    try {
      const res: any = await api.products.bulkTitleReplace(selectedIds, find, replace);
      toast.success(`已更新 ${res.data?.updated ?? 0} 个产品标题`);
      onCompleted();
      onClose();
    } catch (err) {
      toast.error('替换失败：' + (err as Error).message);
    }
    setBusy(false);
  }

  async function applyAddImage() {
    if (!imageFile) {
      toast.error('请先选择图片');
      return;
    }
    setBusy(true);
    try {
      const res: any = await api.products.bulkAddImage(selectedIds, imageFile);
      toast.success(`已为 ${res.data?.inserted?.length ?? 0} 个产品追加图片`);
      onCompleted();
      onClose();
    } catch (err) {
      toast.error('上传失败：' + (err as Error).message);
    }
    setBusy(false);
  }

  async function applyTitleAi() {
    setBusy(true);
    try {
      await api.products.bulkTitleAi(selectedIds);
      toast.info(`已提交 ${selectedIds.length} 个 AI 标题任务，进度见右下角任务盘`);
      onClose();
    } catch (err) {
      toast.error('提交失败：' + (err as Error).message);
    }
    setBusy(false);
  }

  async function applyGenerateVideo() {
    setBusy(true);
    try {
      const res: any = await api.products.bulkGenerateVideo(selectedIds, videoPrompt || undefined);
      const queued = res.data?.queued ?? 0;
      const skipped = selectedIds.length - queued;
      toast.success(
        `已提交 ${queued} 个视频任务${skipped > 0 ? `（${skipped} 个跳过：无可用图片）` : ''}，进度见右下角任务盘`
      );
      onClose();
    } catch (err) {
      toast.error('提交失败：' + (err as Error).message);
    }
    setBusy(false);
  }

  return (
    <Modal open={open} onClose={onClose} size="md" title={`批量加工 (${selectedIds.length})`}>
      <Tabs
        items={[
          { id: 'title', label: '标题替换', icon: <Pencil size={14} /> },
          { id: 'image', label: '批量加图', icon: <ImageIcon size={14} /> },
          { id: 'ai', label: 'AI 优化标题', icon: <Sparkles size={14} /> },
          { id: 'video', label: '生成视频', icon: <Film size={14} /> },
        ]}
        value={tab}
        onChange={(id) => !busy && setTab(id as BatchTab)}
      />

      <div className="pt-5 min-h-[160px]">
        {tab === 'title' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-mono text-ink-secondary mb-1.5 uppercase tracking-widest">
                查找
              </label>
              <Input
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder="要替换的文本"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-ink-secondary mb-1.5 uppercase tracking-widest">
                替换为
              </label>
              <Input
                value={replace}
                onChange={(e) => setReplace(e.target.value)}
                placeholder="新文本（留空即删除）"
              />
            </div>
            <div className="pt-1 flex justify-end">
              <Button variant="primary" onClick={applyTitleReplace} loading={busy} disabled={!find}>
                应用替换
              </Button>
            </div>
          </div>
        )}

        {tab === 'image' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-mono text-ink-secondary mb-1.5 uppercase tracking-widest">
                选择要追加的图片
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-ink-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-surface-card file:text-ink-primary file:text-xs hover:file:bg-surface-hover"
              />
            </div>
            <p className="text-xs text-ink-muted leading-relaxed">
              图片将追加到每个选中产品图片列表的末尾（sort_order = MAX+1）
            </p>
            <div className="pt-1 flex justify-end">
              <Button variant="primary" onClick={applyAddImage} loading={busy} disabled={!imageFile}>
                追加到 {selectedIds.length} 个产品
              </Button>
            </div>
          </div>
        )}

        {tab === 'ai' && (
          <div className="space-y-3">
            <p className="text-sm text-ink-secondary leading-relaxed">
              将对 <span className="font-mono text-gold tabular">{selectedIds.length}</span> 个产品调用 MiniMax 重新生成标题。
              每条约 27 秒，提交后可立即关闭弹窗，进度在右下角任务盘。
            </p>
            <div className="pt-1 flex justify-end">
              <Button
                variant="primary"
                onClick={applyTitleAi}
                loading={busy}
                disabled={selectedIds.length === 0}
              >
                开始
              </Button>
            </div>
          </div>
        )}

        {tab === 'video' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-mono text-ink-secondary mb-1.5 uppercase tracking-widest">
                提示词（可选）
              </label>
              <Input
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                placeholder="[Static shot] product on white background, professional lighting"
              />
            </div>
            <p className="text-xs text-ink-muted leading-relaxed">
              将对 <span className="font-mono text-gold tabular">{selectedIds.length}</span> 个产品生成 768P / 6s 图生视频
              （MiniMax-Hailuo-2.3）。每个 ~1 分钟，提交后即可关闭。
            </p>
            <div className="pt-1 flex justify-end">
              <Button
                variant="primary"
                onClick={applyGenerateVideo}
                loading={busy}
                disabled={selectedIds.length === 0}
              >
                开始生成
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
