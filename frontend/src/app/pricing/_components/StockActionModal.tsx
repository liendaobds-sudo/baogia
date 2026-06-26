"use client";
import React from 'react';

interface Material {
    id: number;
    name: string;
    stock_quantity?: number;
    unit?: string;
}

interface StockAction {
    type: 'import' | 'export' | 'adjust';
    material: Material;
}

interface StockForm {
    quantity: number;
    cost_price: number;
    reference: string;
    notes: string;
    reason: string;
    adjustment_type: string;
}

interface StockActionModalProps {
    action: StockAction | null;
    onClose: () => void;
    onSubmit: () => void;
    stockForm: StockForm;
    setStockForm: React.Dispatch<React.SetStateAction<StockForm>>;
}

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

export default function StockActionModal({ action, onClose, onSubmit, stockForm, setStockForm }: StockActionModalProps) {
    if (!action) return null;

    const colorMap = {
        import: { bg: 'bg-gradient-to-r from-green-50 to-emerald-50', btn: 'bg-green-600 hover:bg-green-700', stock: 'bg-green-50 border-green-200' },
        export: { bg: 'bg-gradient-to-r from-amber-50 to-orange-50', btn: 'bg-amber-600 hover:bg-amber-700', stock: 'bg-amber-50 border-amber-200' },
        adjust: { bg: 'bg-gradient-to-r from-blue-50 to-indigo-50', btn: 'bg-blue-600 hover:bg-blue-700', stock: 'bg-blue-50 border-blue-200' },
    };
    const colors = colorMap[action.type];
    const labelMap = { import: '📥 Nhập kho', export: '📤 Xuất kho', adjust: '🔄 Điều chỉnh tồn kho' };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                <div className={`px-6 py-4 border-b ${colors.bg}`}>
                    <h3 className="text-lg font-bold text-slate-800">{labelMap[action.type]} — {action.material.name}</h3>
                </div>
                <div className="p-6 space-y-4">
                    <div className={`p-3 rounded-lg border ${colors.stock}`}>
                        <div className="flex justify-between">
                            <span className="text-slate-600">Tồn kho hiện tại:</span>
                            <span className="font-bold">{fmt(action.material.stock_quantity || 0)} {action.material.unit || ''}</span>
                        </div>
                    </div>

                    {action.type === 'adjust' && (
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Loại điều chỉnh</label>
                            <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={stockForm.adjustment_type} onChange={e => setStockForm(f => ({ ...f, adjustment_type: e.target.value }))}>
                                <option value="set">Đặt lại số lượng</option>
                                <option value="add">Cộng thêm (+)</option>
                                <option value="subtract">Trừ đi (-)</option>
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">Số lượng *</label>
                        <input type="number" className="w-full px-3 py-2.5 text-lg border border-slate-200 rounded-lg font-bold" min={0.01} step={0.01} value={stockForm.quantity || ''} onChange={e => setStockForm(f => ({ ...f, quantity: Number(e.target.value) }))} autoFocus />
                        {action.type === 'export' && <p className="text-xs text-slate-400 mt-1">Tối đa: {fmt(action.material.stock_quantity || 0)}</p>}
                    </div>

                    {action.type === 'import' && (
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Giá nhập (đ/đơn vị)</label>
                            <input type="number" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={stockForm.cost_price || ''} onChange={e => setStockForm(f => ({ ...f, cost_price: Number(e.target.value) }))} />
                        </div>
                    )}

                    {action.type === 'export' && (
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Lý do xuất</label>
                            <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={stockForm.reason} onChange={e => setStockForm(f => ({ ...f, reason: e.target.value }))}>
                                <option value="production">Sản xuất</option>
                                <option value="order">Đơn hàng</option>
                                <option value="sample">Mẫu</option>
                                <option value="damaged">Hư hỏng</option>
                                <option value="other">Khác</option>
                            </select>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Mã phiếu</label>
                            <input className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={stockForm.reference} onChange={e => setStockForm(f => ({ ...f, reference: e.target.value }))} placeholder={action.type === 'import' ? 'PN-xxx' : 'PX-xxx'} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Ghi chú</label>
                            <input className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={stockForm.notes} onChange={e => setStockForm(f => ({ ...f, notes: e.target.value }))} />
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
                    <button onClick={onClose} className="px-5 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg">Hủy</button>
                    <button onClick={onSubmit} className={`px-6 py-2 text-sm font-bold text-white rounded-lg ${colors.btn}`}>
                        {labelMap[action.type]}
                    </button>
                </div>
            </div>
        </div>
    );
}
