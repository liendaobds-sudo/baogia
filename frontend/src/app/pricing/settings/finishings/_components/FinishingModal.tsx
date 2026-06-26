"use client";
import { useEffect, useState } from 'react';
import { api } from '../../../_components/apiClient';

export interface ProcessingOption {
    id: number; code: string; name: string; category?: string;
    price?: number; priceType?: string; is_active?: number;
    scope_offset?: boolean; billing_mode?: string; moq_param?: string; min_charge_param?: string;
}
export interface Tier {
    id?: number; processingOptionId?: number; pricingMethod?: string;
    quantityFrom: number | string; quantityTo: number | string; unitPrice: number | string; minCharge: number | string;
}

const CAT_OPTS = [
    { v: 'lamination', l: 'Cán màng' }, { v: 'cutting', l: 'Cấn bế' }, { v: 'foiling', l: 'Ép nhũ / Mạ vàng' },
    { v: 'binding', l: 'Đóng cuốn' }, { v: 'coating', l: 'Phủ UV / Sơn' }, { v: 'mounting', l: 'Bồi / dán' }, { v: 'other', l: 'Khác' },
];
const PRICETYPE_OPTS = [
    { v: 'per_item', l: 'Theo sản phẩm (cái)' }, { v: 'per_sheet', l: 'Theo tờ in' },
    { v: 'per_m2', l: 'Theo m²' }, { v: 'fixed', l: 'Cố định (mỗi đơn)' },
];
const BILLING_OPTS = [
    { v: 'perUnit', l: 'Theo số lượng (đơn giá × SL)' },
    { v: 'minCharge', l: 'Tối thiểu khi < MOQ, rồi theo SL' },
    { v: 'external', l: 'Ngoài bảng (vd ép kim)' },
];
const METHOD_OPTS = [
    { v: 'per_item', l: 'Theo cái' }, { v: 'per_sheet', l: 'Theo tờ' },
    { v: 'per_sqm', l: 'Theo m²' }, { v: 'per_meter', l: 'Theo mét' }, { v: 'fixed', l: 'Cố định' },
];

const inp = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white';
const lbl = 'block text-[13px] font-semibold text-slate-600 mb-1';
const sec = 'md:col-span-2 text-[11px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1 mt-1';

export function FinishingModal({ isOpen, onClose, onSaved, editItem, initialTiers }:
    { isOpen: boolean; onClose: () => void; onSaved: () => void; editItem: ProcessingOption | null; initialTiers: Tier[] }) {
    const [f, setF] = useState<ProcessingOption>({ id: 0, code: '', name: '', category: '', priceType: 'per_item', price: 0, is_active: 1, scope_offset: false, billing_mode: 'perUnit', moq_param: '', min_charge_param: '' });
    const [pricingMethod, setPricingMethod] = useState('per_item');
    const [tiers, setTiers] = useState<Tier[]>([]);
    const [deletedTierIds, setDeletedTierIds] = useState<number[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setError(''); setDeletedTierIds([]);
        if (editItem) {
            setF({ ...editItem, is_active: Number(editItem.is_active ?? 1), scope_offset: !!editItem.scope_offset, category: editItem.category || '', billing_mode: editItem.billing_mode || 'perUnit', priceType: editItem.priceType || 'per_item' });
            setPricingMethod(initialTiers[0]?.pricingMethod || 'per_item');
            setTiers(initialTiers.length ? initialTiers.map(t => ({ ...t })) : [{ quantityFrom: 1, quantityTo: 999999, unitPrice: 0, minCharge: 0 }]);
        } else {
            setF({ id: 0, code: '', name: '', category: '', priceType: 'per_item', price: 0, is_active: 1, scope_offset: false, billing_mode: 'perUnit', moq_param: 'MOQ_GiaCong', min_charge_param: '' });
            setPricingMethod('per_item');
            setTiers([{ quantityFrom: 1, quantityTo: 999999, unitPrice: 0, minCharge: 0 }]);
        }
    }, [isOpen, editItem, initialTiers]);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && isOpen) onClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const set = (k: keyof ProcessingOption, v: any) => setF(p => ({ ...p, [k]: v }));
    const setTier = (i: number, k: keyof Tier, v: any) => setTiers(ts => ts.map((t, j) => j === i ? { ...t, [k]: v } : t));
    const addTier = () => setTiers(ts => [...ts, { quantityFrom: (Number(ts.at(-1)?.quantityTo) || 0) + 1, quantityTo: 999999, unitPrice: 0, minCharge: 0 }]);
    const rmTier = (i: number) => {
        const t = tiers[i];
        if (t.id) setDeletedTierIds(d => [...d, t.id!]);
        setTiers(ts => ts.filter((_, j) => j !== i));
    };

    const save = async () => {
        if (!f.code || !f.name) { setError('Vui lòng nhập mã và tên gia công.'); return; }
        setSaving(true); setError('');
        try {
            const payload = {
                code: f.code, name: f.name, category: f.category || null,
                priceType: f.priceType, price: Number(f.price) || 0, is_active: Number(f.is_active ?? 1),
                scope_offset: !!f.scope_offset,
                billing_mode: f.scope_offset ? f.billing_mode : null,
                moq_param: f.scope_offset ? (f.moq_param || null) : null,
                min_charge_param: f.scope_offset ? (f.min_charge_param || null) : null,
            };
            let optId = editItem?.id;
            if (editItem) {
                const r = await api.put(`/erp/processing-options/${editItem.id}`, payload);
                if (!r.success) throw new Error(r.error || 'Lỗi cập nhật');
            } else {
                const r = await api.post<{ id: number }>('/erp/processing-options', payload);
                if (!r.success) throw new Error(r.error || 'Lỗi thêm mới');
                optId = r.data?.id;
            }
            // Bậc thang Offset: chỉ quản khi bật scope_offset.
            if (f.scope_offset && optId) {
                for (const id of deletedTierIds) await api.delete(`/erp/processing-pricing/${id}`).catch(() => {});
                for (const t of tiers) {
                    const tp = {
                        id: t.id, processingOptionId: optId, pricingMethod,
                        quantityFrom: t.quantityFrom === '' ? null : Number(t.quantityFrom),
                        quantityTo: t.quantityTo === '' ? null : Number(t.quantityTo),
                        unitPrice: Number(t.unitPrice) || 0, minCharge: Number(t.minCharge) || 0,
                    };
                    if (t.id) await api.put(`/erp/processing-pricing/${t.id}`, tp);
                    else await api.post('/erp/processing-pricing', tp);
                }
            }
            onSaved(); onClose();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Có lỗi xảy ra');
        }
        setSaving(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-slate-50">
                    <h3 className="text-lg font-bold text-slate-800">{editItem ? 'Chỉnh sửa' : 'Thêm'} gia công</h3>
                    <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-lg"><svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>

                <div className="p-6 max-h-[70vh] overflow-y-auto">
                    {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200 mb-4"><strong>Lỗi:</strong> {error}</div>}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className={sec}>Thông tin chung</div>
                        <div><label className={lbl}>Mã gia công *</label><input className={inp} value={f.code} onChange={e => set('code', e.target.value)} placeholder="VD: CAN_BONG" /></div>
                        <div><label className={lbl}>Tên gia công *</label><input className={inp} value={f.name} onChange={e => set('name', e.target.value)} placeholder="Cán bóng 1 mặt" /></div>
                        <div><label className={lbl}>Danh mục</label><select className={inp} value={f.category} onChange={e => set('category', e.target.value)}><option value="">— Chọn —</option>{CAT_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div>
                        <div><label className={lbl}>Trạng thái</label><select className={inp} value={String(f.is_active)} onChange={e => set('is_active', Number(e.target.value))}><option value="1">Hiện hành</option><option value="0">Ngừng sử dụng</option></select></div>

                        <div className={sec}>Giá In Nhanh (kỹ thuật số)</div>
                        <div><label className={lbl}>Cách tính giá</label><select className={inp} value={f.priceType} onChange={e => set('priceType', e.target.value)}>{PRICETYPE_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div>
                        <div><label className={lbl}>Đơn giá gốc (VND)</label><input type="number" className={inp} value={f.price ?? ''} onChange={e => set('price', Number(e.target.value))} /></div>

                        <div className={sec}>Cấu hình In Offset</div>
                        <label className="md:col-span-2 flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={!!f.scope_offset} onChange={e => set('scope_offset', e.target.checked)} className="w-4 h-4 text-indigo-600 rounded border-slate-300" />
                            <span className="text-sm font-semibold text-slate-700">Dùng cho báo giá In Offset</span>
                        </label>
                    </div>

                    {f.scope_offset && (
                        <div className="mt-4 bg-slate-50/70 border border-dashed border-slate-200 rounded-xl p-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                                <div><label className={lbl}>Cách tính tiền</label><select className={inp} value={f.billing_mode} onChange={e => set('billing_mode', e.target.value)}>{BILLING_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div>
                                <div><label className={lbl}>Tham số MOQ</label><input className={inp} value={f.moq_param || ''} onChange={e => set('moq_param', e.target.value)} placeholder="MOQ_GiaCong" /></div>
                                <div><label className={lbl}>Tham số giá sàn</label><input className={inp} value={f.min_charge_param || ''} onChange={e => set('min_charge_param', e.target.value)} placeholder="GiaMin_Be" /></div>
                            </div>
                            <div className="flex items-center justify-between mb-2">
                                <label className={lbl + ' !mb-0'}>Bảng giá bậc thang theo số lượng</label>
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-slate-400">Phương thức:</span>
                                    <select className="px-2 py-1 text-xs border border-slate-200 rounded bg-white" value={pricingMethod} onChange={e => setPricingMethod(e.target.value)}>{METHOD_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
                                </div>
                            </div>
                            <div className="grid grid-cols-12 gap-2 px-1 text-[11px] font-bold text-slate-500 uppercase mb-1">
                                <div className="col-span-3">Từ SL</div><div className="col-span-3">Đến SL</div><div className="col-span-3">Đơn giá</div><div className="col-span-2">Giá sàn</div><div className="col-span-1"></div>
                            </div>
                            <div className="space-y-1.5">
                                {tiers.map((t, i) => (
                                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                                        <input type="number" className="col-span-3 px-2 py-1.5 text-sm rounded border border-slate-200" value={t.quantityFrom ?? ''} onChange={e => setTier(i, 'quantityFrom', e.target.value === '' ? '' : Number(e.target.value))} />
                                        <input type="number" className="col-span-3 px-2 py-1.5 text-sm rounded border border-slate-200" value={t.quantityTo ?? ''} onChange={e => setTier(i, 'quantityTo', e.target.value === '' ? '' : Number(e.target.value))} />
                                        <input type="number" className="col-span-3 px-2 py-1.5 text-sm rounded border border-slate-200" value={t.unitPrice ?? ''} onChange={e => setTier(i, 'unitPrice', e.target.value === '' ? '' : Number(e.target.value))} />
                                        <input type="number" className="col-span-2 px-2 py-1.5 text-sm rounded border border-slate-200" value={t.minCharge ?? ''} onChange={e => setTier(i, 'minCharge', e.target.value === '' ? '' : Number(e.target.value))} />
                                        <div className="col-span-1 text-center">{tiers.length > 1 && <button onClick={() => rmTier(i)} className="text-red-400 hover:text-red-600"><svg className="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>}</div>
                                    </div>
                                ))}
                            </div>
                            <button onClick={addTier} className="mt-3 text-[13px] text-indigo-600 font-bold hover:text-indigo-700">+ Thêm mốc giá</button>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
                    <button onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">Hủy</button>
                    <button onClick={save} disabled={saving} className="px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Đang lưu...' : (editItem ? 'Cập nhật' : 'Thêm mới')}</button>
                </div>
            </div>
        </div>
    );
}
