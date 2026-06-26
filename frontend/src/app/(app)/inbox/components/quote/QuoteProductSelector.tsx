import { ProductTemplate } from './types';

interface QuoteProductSelectorProps {
    templates: ProductTemplate[];
    selectedTemplateCode?: string;
    onTemplateChange: (code: string) => void;
    autoDetected: boolean;
}

export function QuoteProductSelector({
    templates,
    selectedTemplateCode,
    onTemplateChange,
    autoDetected
}: QuoteProductSelectorProps) {
    return (
        <div className="px-4 py-3 border-b border-slate-200 shrink-0 bg-white shadow-sm z-10">
            <div className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1.5">
                <span className="text-[13px]">📦</span> <span className="uppercase tracking-wider">Sản phẩm</span>
            </div>
            <select
                value={selectedTemplateCode || ''}
                onChange={e => onTemplateChange(e.target.value)}
                className={`w-full px-3 py-2.5 text-sm border rounded-md outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 transition-all shadow-sm cursor-pointer ${
                    selectedTemplateCode
                        ? 'bg-indigo-50/40 border-indigo-200 text-indigo-900 font-medium'
                        : 'bg-white border-slate-200 text-slate-700'
                }`}
            >
                <option value="">— Chọn sản phẩm —</option>
                {templates.map(t => (
                    <option key={t.code} value={t.code}>{t.name}</option>
                ))}
            </select>
            {autoDetected && selectedTemplateCode && (
                <div className="text-[11px] text-emerald-600 font-medium mt-1.5 flex items-center gap-1">
                    <span className="text-[10px]">✨</span> Tự động nhận diện từ tin nhắn
                </div>
            )}
        </div>
    );
}
