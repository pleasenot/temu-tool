import { useState, useEffect } from 'react';
import { FileText, AlertCircle, ChevronDown } from 'lucide-react';
import { api } from '../../api/client';
import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';

interface DetectedTemplate {
  path: string;
  name: string;
  size: number;
  smartObjectLayers: string[];
  selectedLayer: string;
  detecting: boolean;
  error?: string;
}

interface TemplateDetectorProps {
  template: DetectedTemplate;
  onLayerSelect: (psdPath: string, layerName: string) => void;
}

export type { DetectedTemplate };

export function TemplateDetector({ template, onLayerSelect }: TemplateDetectorProps) {
  const { name, size, smartObjectLayers, selectedLayer, detecting, error } = template;
  const sizeMB = (size / 1024 / 1024).toFixed(1);

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface-base/60 border border-edge-subtle">
      <FileText size={16} className="text-ink-muted shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink-primary truncate">{name}</div>
        <div className="text-[10px] font-mono text-ink-muted mt-0.5">{sizeMB} MB</div>
      </div>

      <div className="shrink-0">
        {detecting ? (
          <div className="flex items-center gap-1.5 text-ink-muted">
            <Spinner size={14} />
            <span className="text-[10px] font-mono">检测中…</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-1.5 text-status-danger">
            <AlertCircle size={14} />
            <span className="text-[10px] font-mono truncate max-w-[160px]">{error}</span>
          </div>
        ) : smartObjectLayers.length === 0 ? (
          <Badge variant="status" tone="warn">无智能图层</Badge>
        ) : smartObjectLayers.length === 1 ? (
          <Badge variant="status" tone="success">{selectedLayer}</Badge>
        ) : (
          <div className="relative">
            <select
              value={selectedLayer}
              onChange={(e) => onLayerSelect(template.path, e.target.value)}
              className="appearance-none bg-surface-card border border-edge rounded-md text-xs text-ink-primary pl-2 pr-6 py-1 focus:outline-none focus:border-gold cursor-pointer"
            >
              {smartObjectLayers.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Detect smart object layers for a single template */
export async function detectTemplateLayer(
  tpl: { path: string; name: string; size: number }
): Promise<DetectedTemplate> {
  try {
    const res: any = await api.mockup.detectLayers(tpl.path);
    if (!res.success) {
      return { ...tpl, smartObjectLayers: [], selectedLayer: '', detecting: false, error: res.error };
    }
    const layers: string[] = res.data?.smartObjectLayers || [];
    return {
      ...tpl,
      smartObjectLayers: layers,
      selectedLayer: layers[0] || '',
      detecting: false,
    };
  } catch (err) {
    return { ...tpl, smartObjectLayers: [], selectedLayer: '', detecting: false, error: String(err) };
  }
}
