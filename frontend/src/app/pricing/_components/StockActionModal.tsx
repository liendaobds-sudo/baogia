"use client";
import React from 'react';

interface Material {
    id: number;
    name: string;
    stock_quantity?: number;
    stock?: number;
    unit?: string;
    // Field để quy đổi + preview client-side (backend vẫn tự tính lại để chốt).
    materialFormat?: string;
    material_format?: string;
    gsm?: number;
    width?: number;
    height?: number;
    rollWidth?: number;
    roll_width?: number;
    rollLength?: number;
    roll_length?: number;
    cost_price?: number;
    costPrice?: number;
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
    purchase_unit: string;
    purchase_qty: number;
    conversion_factor: number;
}

interface StockActionModalProps {
    action: StockAction | null;
    onClose: () => void;
    onSubmit: () => void;
    stockForm: StockForm;
    setStockForm: React.Dispatch<React.SetStateAction<StockForm>>;
}

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

// Đơn vị cơ sở theo dạng vật tư (khớp backend baseUnitOf).
function baseUnitOf(m: Material): 'tờ' | 'm²' {
    return (m.materialFormat || m.material_format) === 'roll' ? 'm²' : 'tờ';
}

// Đơn vị mua khả dụng theo dạng vật tư.
function purchaseUnitOptions(m: Material): { value: string; label: string }[] {
    const isRoll = (m.materialFormat || m.material_format) === 'roll';
    if (isRoll) {
        return [
            { value: 'sqm', label: 'm² (mua thẳng)' },
            { value: 'roll', label: 'Cuộn' },
            { value: 'met', label: 'Mét dài' },
            { value: 'kg', label: 'Kg' },
        ];
    }
    return [
        { value: 'sheet', label: 'Tờ (mua thẳng)' },
        { value: 'ram', label: 'Ram (500 tờ)' },
        { value: 'kg', label: 'Kg' },
    ];
}

// Tính hệ số quy đổi client-side để PREVIEW (khớp computeConversionFactor backend).
// Trả { factor, error } — factor = số ĐV cơ sở / 1 ĐV mua.
function computeFactor(m: Material, unit: string, override?: number): { factor: number; error?: string } {
    const u = (unit || '').toLowerCase();
    if (u === 'sheet' || u === 'sqm') return { factor: 1 };
    if (u === 'ram') return { factor: override && override > 0 ? override : 500 };
    if (u === 'kg') {
        const gsm = Number(m.gsm) || 0;
        const w = Number(m.width) || 0;
        const h = Number(m.height) || 0;
        if (gsm <= 0 || w <= 0 || h <= 0) return { factor: 0, error: 'Cần gsm + khổ tờ để quy đổi kg → tờ.' };
        const kgPerSheet = (gsm * (w / 1000) * (h / 1000)) / 1000;
        if (kgPerSheet <= 0) return { factor: 0, error: 'Khối lượng tờ tính ra 0.' };
        return { factor: 1 / kgPerSheet };
    }
    if (u === 'roll') {
        const w = Number(m.rollWidth || m.roll_width) || 0;
        const l = Number(m.rollLength || m.roll_length) || 0;
        if (w <= 0 || l <= 0) return { factor: 0, error: 'Cần khổ cuộn + chiều dài để quy đổi cuộn → m².' };
        return { factor: w * l };
    }
    if (u === 'met') {
        const w = Number(m.rollWidth || m.roll_width) || 0;
        if (w <= 0) return { factor: 0, error: 'Cần khổ cuộn để quy đổi mét → m².' };
        return { factor: w };
    }
    return { factor: 1 };
}

export default function StockActionModal({ action, onClose, onSubmit, stockForm, setStockForm }: StockActionModalProps) {
    if (!action) return null;

    const colorMap = {
        import: { bg: 'bg-gradient-to-r from-green-50 to-emerald-50', btn: 'bg-green-600 hover:bg-green-700', stock: 'bg-green-50 border-green-200' },
        export: { bg: 'bg-gradient-to-r from-amber-50 to-orange-50', btn: 'bg-amber-600 hover:bg-amber-700', stock: 'bg-amber-50 border-amber-200' },
        adjust: { bg: 'bg-gradient-to-r from-blue-50 to-indigo-50', btn: 'bg-blue-600 hover:bg-blue-700', stock: 'bg-blue-50 border-blue-200' },
    };
    const colors = colorMap[action.type];
    const labelMap = { import: '📥 Nhập kho', export: '📤 Xuất kho', adjust: '🔄 Điều chỉnh tồn kho' };

    const mat = action.material;
    const baseUnit = baseUnitOf(mat);
    const curStock = mat.stock ?? mat.stock_quantity ?? 0;

    // ── Preview nhập lô (chỉ khi import + đã chọn đơn vị mua) ──
    const purchaseUnit = stockForm.purchase_unit;
    const isBatchImport = action.type === 'import' && !!purchaseUnit;
    const conv = isBatchImport ? computeFactor(mat, purchaseUnit, stockForm.conversion_factor) : { factor: 1 };
    const purchaseQty = stockForm.purchase_qty || 0;
    const baseQty = conv.factor > 0 ? purchaseQty * conv.factor : 0;
    const pricePerPurchase = stockForm.cost_price || 0; // giá / 1 ĐV mua
    const unitCostBase = conv.factor > 0 ? pricePerPurchase / conv.factor : 0; // giá / ĐV cơ sở
    const oldCost = Number(mat.cost_price ?? mat.costPrice) || 0;
    const totalQty = curStock + baseQty;
    const newAvgCost = totalQty > 0 ? Math.round(((oldCost * curStock) + (unitCostBase * baseQty)) / totalQty * 100) / 100 : unitCostBase;

    const isRamlike = purchaseUnit === 'ram'; // chỉ ram cho sửa hệ số tay
    const canSubmitBatch = !isBatchImport || (conv.factor > 0 && purchaseQty > 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                <div className={`px-6 py-4 border-b ${colors.bg}`}>
                    <h3 className="text-lg font-bold text-slate-800">{labelMap[action.type]} — {mat.name}</h3>
                </div>
                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div className={`p-3 rounded-lg border ${colors.stock}`}>
                        <div className="flex justify-between">
                            <span className="text-slate-600">Tồn kho hiện tại:</span>
                            <span className="font-bold">{fmt(curStock)} {baseUnit}</span>
                        </div>
                        {action.type === 'import' && oldCost > 0 && (
                            <div className="flex justify-between mt-1 text-xs text-slate-500">
                                <span>Giá vốn hiện tại:</span>
                                <span>{fmt(oldCost)} đ/{baseUnit}</span>
                            </div>
                        )}
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

                    {/* ── NHẬP KHO: form theo lô ── */}
                    {action.type === 'import' ? (
                        <>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Đơn vị mua *</label>
                                <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" value={purchaseUnit} onChange={e => setStockForm(f => ({ ...f, purchase_unit: e.target.value, conversion_factor: 0 }))}>
                                    <option value="">-- Chọn đơn vị mua --</option>
                                    {purchaseUnitOptions(mat).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Số lượng mua *</label>
                                    <input type="number" className="w-full px-3 py-2.5 text-lg border border-slate-200 rounded-lg font-bold" min={0.01} step={0.01} value={stockForm.purchase_qty || ''} onChange={e => setStockForm(f => ({ ...f, purchase_qty: Number(e.target.value) }))} autoFocus />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Giá / {purchaseUnit ? purchaseUnitOptions(mat).find(o => o.value === purchaseUnit)?.label.split(' ')[0] || 'ĐV mua' : 'ĐV mua'} (đ)</label>
                                    <input type="number" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={stockForm.cost_price || ''} onChange={e => setStockForm(f => ({ ...f, cost_price: Number(e.target.value) }))} />
                                </div>
                            </div>

                            {isRamlike && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Số tờ / ram (hệ số quy đổi)</label>
                                    <input type="number" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" placeholder="Mặc định 500" value={stockForm.conversion_factor || ''} onChange={e => setStockForm(f => ({ ...f, conversion_factor: Number(e.target.value) }))} />
                                </div>
                            )}

                            {/* Preview quy đổi + giá vốn bình quân */}
                            {isBatchImport && (
                                conv.error ? (
                                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">{conv.error}</div>
                                ) : purchaseQty > 0 && (
                                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm space-y-1">
                                        <div className="flex justify-between"><span className="text-slate-500">Quy đổi:</span><span className="font-bold text-slate-700">{fmt(purchaseQty)} {purchaseUnitOptions(mat).find(o => o.value === purchaseUnit)?.label.split(' ')[0]} → {fmt(Math.round(baseQty))} {baseUnit}</span></div>
                                        {pricePerPurchase > 0 && <div className="flex justify-between"><span className="text-slate-500">Giá vốn lô:</span><span className="font-bold text-slate-700">{fmt(Math.round(unitCostBase))} đ/{baseUnit}</span></div>}
                                        {pricePerPurchase > 0 && <div className="flex justify-between border-t border-slate-200 pt-1 mt-1"><span className="text-slate-500">Giá vốn mới (bình quân):</span><span className="font-bold text-emerald-600">{fmt(Math.round(newAvgCost))} đ/{baseUnit}</span></div>}
                                        <div className="flex justify-between"><span className="text-slate-500">Tồn sau nhập:</span><span className="font-bold text-slate-700">{fmt(Math.round(totalQty))} {baseUnit}</span></div>
                                    </div>
                                )
                            )}
                        </>
                    ) : (
                        // XUẤT / ĐIỀU CHỈNH: số lượng theo đơn vị cơ sở
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Số lượng ({baseUnit}) *</label>
                            <input type="number" className="w-full px-3 py-2.5 text-lg border border-slate-200 rounded-lg font-bold" min={0.01} step={0.01} value={stockForm.quantity || ''} onChange={e => setStockForm(f => ({ ...f, quantity: Number(e.target.value) }))} autoFocus />
                            {action.type === 'export' && <p className="text-xs text-slate-400 mt-1">Tối đa: {fmt(curStock)}</p>}
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
                    <button onClick={onSubmit} disabled={!canSubmitBatch} className={`px-6 py-2 text-sm font-bold text-white rounded-lg ${colors.btn} disabled:opacity-50`}>
                        {labelMap[action.type]}
                    </button>
                </div>
            </div>
        </div>
    );
}
