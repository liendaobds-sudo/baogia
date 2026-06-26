"use client";
import { useState, useEffect } from 'react';
import { api } from '../_components/apiClient';

interface MiniField {
    code: string; name: string; type: string; group: string;
    defaultOn: boolean; description?: string; enabled: boolean;
}

interface Product { id: number; code: string; name_vi: string; quote_type: string; }

interface Props {
    isOpen: boolean;
    onClose: () => void;
    selectedProducts: Product[];
    onSaved: () => void;
}

export default function BatchMiniQuoteModal({ isOpen, onClose, selectedProducts, onSaved }: Props) {
    const [fields, setFields] = useState<MiniField[]>([]);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    // Check if all selected products share the same quote_type
    const quoteTypes = [...new Set(selectedProducts.map(p => p.quote_type))];
    const isMixed = quoteTypes.length > 1;
    const commonType = quoteTypes[0] || 'loose';

    useEffect(() => {
        if (!isOpen || isMixed) return;
        // Load master fields for the common type
        api.get<any>(`/erp/products/mini-quote-fields/master-registry?quote_type=${commonType}`)
            .then(res => {
                if (res.success && res.data?.fields) {
                    const defaults = res.data.defaults || [];
                    setFields(res.data.fields.map((f: any) => ({
                        ...f,
                        enabled: defaults.includes(f.code),
                    })));
                }
            })
            .catch(() => {});
    }, [isOpen, commonType, isMixed]);

    const handleSave = async () => {
        setSaving(true);
        const enabledCodes = fields.filter(f => f.enabled).map(f => f.code);
        try {
            const res = await api.put<any>('/erp/products/batch-mini-quote-fields', {
                product_ids: selectedProducts.map(p => p.id),
                fields: enabledCodes,
            });
            if (res.success) {
                setToast(`Đã cập nhật ${selectedProducts.length} sản phẩm!`);
                setTimeout(() => { setToast(null); onSaved(); onClose(); }, 1200);
            } else {
                setToast('Lỗi: ' + (res.error || 'Unknown'));
                setTimeout(() => setToast(null), 3000);
            }
        } catch (e: any) {
            setToast('Lỗi: ' + e.message);
            setTimeout(() => setToast(null), 3000);
        }
        setSaving(false);
    };

    if (!isOpen) return null;

    const typeLabels: Record<string, string> = { loose: 'Tờ rời', bound: 'Sách/Cuốn', large_format: 'Khổ lớn' };
    const groupMeta: Record<string, { icon: string; label: string }> = {
        info: { icon: '📝', label: 'Thông tin' },
        basic: { icon: '📦', label: 'Thông số SP' },
        material: { icon: '📄', label: 'Vật tư' },
        print: { icon: '🖨️', label: 'In ấn' },
        binding: { icon: '📕', label: 'Đóng cuốn' },
        cover: { icon: '🔵', label: 'Bìa ngoài' },
        inner: { icon: '⚪', label: 'Ruột bên trong' },
        processing: { icon: '✂️', label: 'Gia công' },
        accessory: { icon: '🧩', label: 'Phụ kiện' },
    };
    const GROUP_ORDER = ['info', 'basic', 'material', 'print', 'binding', 'cover', 'inner', 'processing', 'accessory'] as const;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col overflow-hidden">
                {toast && <div className="absolute top-4 right-4 z-50 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold shadow-lg">{toast}</div>}

                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-orange-50 to-amber-50 shrink-0">
                    <h2 className="text-lg font-bold text-slate-800">📱 Cấu hình Mini Quote hàng loạt</h2>
                    <p className="text-xs text-slate-500 mt-1">Áp dụng cấu hình trường cho {selectedProducts.length} sản phẩm đã chọn</p>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {/* Selected products list */}
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Sản phẩm đã chọn ({selectedProducts.length})</h4>
                        <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                            {selectedProducts.map(p => (
                                <span key={p.id} className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                                    p.quote_type === 'bound' ? 'bg-purple-100 text-purple-700' :
                                    p.quote_type === 'large_format' ? 'bg-green-100 text-green-700' :
                                    'bg-blue-100 text-blue-700'
                                }`}>
                                    {p.name_vi}
                                </span>
                            ))}
                        </div>
                    </div>

                    {isMixed ? (
                        <div className="text-center py-8">
                            <p className="text-3xl mb-3">⚠️</p>
                            <p className="font-bold text-slate-700">Không thể batch config cho sản phẩm khác loại</p>
                            <p className="text-sm text-slate-500 mt-2">
                                Bạn đã chọn sản phẩm thuộc: {quoteTypes.map(t => typeLabels[t] || t).join(', ')}.<br />
                                Vui lòng chỉ chọn sản phẩm <strong>cùng loại</strong> (tờ rời, sách/cuốn, hoặc khổ lớn).
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="bg-orange-50/80 rounded-lg p-3 border border-orange-200">
                                <p className="text-xs text-orange-700">
                                    <strong>Loại sản phẩm:</strong> {typeLabels[commonType]} — Cấu hình sẽ ghi đè toàn bộ cài đặt Mini Quote hiện tại của các SP đã chọn.
                                </p>
                            </div>

                            {GROUP_ORDER.map(group => {
                                const groupFields = fields.filter(f => f.group === group);
                                if (groupFields.length === 0) return null;
                                const g = groupMeta[group];
                                return (
                                    <div key={group} className="bg-white rounded-xl p-4 border border-slate-200">
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="font-bold text-slate-700 text-sm flex items-center gap-1.5">{g.icon} {g.label}</h4>
                                            <button 
                                                onClick={() => {
                                                    const allOn = groupFields.every(f => f.enabled);
                                                    setFields(prev => prev.map(f => f.group === group ? { ...f, enabled: !allOn } : f));
                                                }}
                                                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                                            >
                                                {groupFields.every(f => f.enabled) ? 'Bỏ tất cả' : 'Chọn tất cả'}
                                            </button>
                                        </div>
                                        <div className="space-y-1">
                                            {groupFields.map(field => (
                                                <label key={field.code} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${field.enabled ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}`}>
                                                    <input 
                                                        type="checkbox" className="w-4 h-4 text-indigo-600 rounded"
                                                        checked={field.enabled}
                                                        onChange={() => setFields(prev => prev.map(f => f.code === field.code ? { ...f, enabled: !f.enabled } : f))}
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <span className={`text-sm font-semibold ${field.enabled ? 'text-slate-800' : 'text-slate-400'}`}>{field.name}</span>
                                                        {field.description && <p className="text-xs text-slate-400 mt-0.5">{field.description}</p>}
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
                    <span className="text-xs text-slate-500">{fields.filter(f => f.enabled).length}/{fields.length} trường bật</span>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">Hủy</button>
                        <button onClick={handleSave} disabled={saving || isMixed} className="px-6 py-2.5 text-sm font-bold text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2">
                            {saving ? 'Đang lưu...' : `Áp dụng cho ${selectedProducts.length} SP`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
