import { useState, useEffect } from 'react';
import { api } from '../../api/client';

const PRICING_FIELDS = [
  { key: 'size', label: '尺码', type: 'text', placeholder: 'S/M/L/XL' },
  { key: 'imageIndex', label: '图片序号', type: 'number', placeholder: '1' },
  { key: 'productCode', label: '货号', type: 'text', placeholder: '产品货号' },
  { key: 'packageLength', label: '包装体积长(cm)', type: 'number', placeholder: '0' },
  { key: 'packageWidth', label: '包装体积宽(cm)', type: 'number', placeholder: '0' },
  { key: 'packageHeight', label: '包装体积高(cm)', type: 'number', placeholder: '0' },
  { key: 'weight', label: '重量(g)', type: 'number', placeholder: '0' },
  { key: 'declaredPrice', label: '申报价(元)', type: 'number', placeholder: '0' },
  { key: 'suggestedRetailPrice', label: '建议零售价(元)', type: 'number', placeholder: '0' },
];

export function PricingPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [templateName, setTemplateName] = useState('');

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    const res: any = await api.pricing.templates();
    setTemplates(res.data.templates);
  }

  function startNew() {
    setEditing(null);
    setTemplateName('');
    setFormValues({});
  }

  function startEdit(template: any) {
    setEditing(template);
    setTemplateName(template.name);
    setFormValues(template.defaultValues || {});
  }

  async function save() {
    if (!templateName.trim()) return;

    if (editing) {
      await api.pricing.updateTemplate(editing.id, {
        name: templateName,
        defaultValues: formValues,
      });
    } else {
      await api.pricing.createTemplate({
        name: templateName,
        defaultValues: formValues,
      });
    }

    setEditing(null);
    setTemplateName('');
    setFormValues({});
    loadTemplates();
  }

  async function deleteTemplate(id: string) {
    await api.pricing.deleteTemplate(id);
    loadTemplates();
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">核价模板</h2>
        <button
          onClick={startNew}
          className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          新建模板
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Template list */}
        <div className="space-y-3">
          {templates.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
              暂无模板，点击"新建模板"创建
            </div>
          ) : (
            templates.map((t: any) => (
              <div key={t.id} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-gray-800">{t.name}</h4>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(t)}
                      className="text-xs text-blue-500 hover:text-blue-700"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => deleteTemplate(t.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      删除
                    </button>
                  </div>
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  {PRICING_FIELDS.map((f) => (
                    <div key={f.key}>
                      {f.label}: {t.defaultValues?.[f.key] ?? '-'}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Edit form */}
        {(editing !== undefined || templateName) && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-700 mb-4">
              {editing ? '编辑模板' : '新建模板'}
            </h3>
            <input
              placeholder="模板名称"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="w-full mb-4 px-3 py-2 border border-gray-300 rounded text-sm"
            />

            <div className="space-y-3">
              {PRICING_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm text-gray-600 mb-1">{field.label}</label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={formValues[field.key] ?? ''}
                    onChange={(e) =>
                      setFormValues({
                        ...formValues,
                        [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={save} className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">
                保存
              </button>
              <button
                onClick={() => { setEditing(null); setTemplateName(''); setFormValues({}); }}
                className="px-4 py-2 text-sm bg-gray-300 rounded hover:bg-gray-400"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
