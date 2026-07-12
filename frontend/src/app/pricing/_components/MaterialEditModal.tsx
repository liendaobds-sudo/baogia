"use client";
import React, { useEffect } from 'react';

interface PaperSize { id: number; name: string; width: number; height: number; }
interface UnitOpt { id: number; symbol: string; name: string; }
interface ChildSheet { width: number; height: number; name?: string; }

interface MaterialEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    form: Record<string, unknown>;
    setForm: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
    editItem: { id: number } | null;
    paperSizes: PaperSize[];
    units: UnitOpt[];
}

export default function MaterialEditModal({ isOpen, onClose, onSave, form, setForm, editItem, paperSizes, units }: MaterialEditModalProps) {
    // Close on Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50 shrink-0">
                    <h3 className="text-lg font-bold text-slate-800">{editItem ? 'Sửa vật tư' : 'Thêm vật tư mới'}</h3>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
                    <div className="grid grid-cols-3 gap-3">
                        <div><label className="block text-xs font-bold text-slate-600 mb-1">Mã vật tư *</label><input className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={String(form.code || '')} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} /></div>
                        <div className="col-span-2"><label className="block text-xs font-bold text-slate-600 mb-1">Tên vật tư *</label><input className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={String(form.name || '')} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Phân loại (Type)</label>
                            <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" value={String(form.type || 'paper')} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                                <option value="paper">Giấy in (Paper)</option>
                                <option value="decal">Decal / Tem nhãn</option>
                                <option value="lamination">Màng (Lamination)</option>
                                <option value="film">Film / Kẽm</option>
                                <option value="ink">Mực in (Ink)</option>
                                <option value="accessory">Phụ kiện (Accessory)</option>
                                <option value="finishing">Gia công (Finishing)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Đơn vị chuẩn *</label>
                            <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" value={String(form.unit || '')}
                                onChange={e => { const sym = e.target.value; const u = units.find(x => x.symbol === sym); setForm(f => ({ ...f, unit: sym, unitId: u?.id, unit_id: u?.id })); }}>
                                <option value="">-- Chọn đơn vị --</option>
                                {units.map(u => <option key={u.id} value={u.symbol}>{u.name} ({u.symbol})</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Quy cách định dạng</label>
                            <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" value={String(form.materialFormat || 'sheet')} onChange={e => setForm(f => ({ ...f, materialFormat: e.target.value }))}>
                                <option value="sheet">Dạng Tờ rời (Sheets)</option>
                                <option value="roll">Dạng Cuộn (Rolls)</option>
                            </select>
                        </div>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <h4 className="text-sm font-bold text-slate-800 mb-3 border-b border-slate-200 pb-2">
                            {form.materialFormat === 'roll' ? 'Quy cách Thông số Cuộn' : 'Quy cách Kích thước Tờ & Lên khuôn'}
                        </h4>
                        {form.materialFormat === 'roll' ? (
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-xs font-bold text-slate-600 mb-1">Khổ cuộn (m)</label><input type="number" step="0.01" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={String(form.rollWidth || '')} onChange={e => setForm(f => ({ ...f, rollWidth: Number(e.target.value) }))} placeholder="VD: 0.914" /></div>
                                <div><label className="block text-xs font-bold text-slate-600 mb-1">Chiều dài cuộn (m)</label><input type="number" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={String(form.rollLength || '')} onChange={e => setForm(f => ({ ...f, rollLength: Number(e.target.value) }))} placeholder="Tùy chọn" /></div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Tính tiền nguyên khổ cuộn</label>
                                    <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={form.chargeFullWidth ? 'true' : 'false'} onChange={e => setForm(f => ({ ...f, chargeFullWidth: e.target.value === 'true' }))}>
                                        <option value="false">Không (Tính theo diện tích con)</option>
                                        <option value="true">Có (Khách chịu xả bỏ)</option>
                                    </select>
                                </div>
                                <div><label className="block text-xs font-bold text-slate-600 mb-1">M² tính phí tối thiểu</label><input type="number" step="0.1" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={String(form.minChargeArea || '')} onChange={e => setForm(f => ({ ...f, minChargeArea: Number(e.target.value) }))} placeholder="Mặc định: 1m²" /></div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2 md:col-span-1">
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Móc Khổ Giấy Chuẩn (Tự động layout)</label>
                                    <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white font-mono text-indigo-700" value={String(form.paperSizeId || '')} onChange={e => setForm(f => ({ ...f, paperSizeId: e.target.value ? Number(e.target.value) : null }))}>
                                        <option value="">-- Không gán Khổ Chuẩn --</option>
                                        {paperSizes.map(ps => (
                                            <option key={ps.id} value={ps.id}>{ps.name} ({ps.width}x{ps.height})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex gap-2">
                                    <div className="flex-1"><label className="block text-xs font-bold text-slate-600 mb-1">Rộng (mm)</label><input type="number" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={String(form.width || '')} onChange={e => setForm(f => ({ ...f, width: Number(e.target.value) }))} /></div>
                                    <div className="flex-1"><label className="block text-xs font-bold text-slate-600 mb-1">Cao (mm)</label><input type="number" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={String(form.height || '')} onChange={e => setForm(f => ({ ...f, height: Number(e.target.value) }))} /></div>
                                </div>
                                <div><label className="block text-xs font-bold text-slate-600 mb-1">Định lượng (GSM)</label><input type="number" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={String(form.gsm || '')} onChange={e => setForm(f => ({ ...f, gsm: Number(e.target.value) }))} /></div>
                            </div>
                        )}
                    </div>

                    {/* Khổ xả (bài in) — chỉ vật tư tờ + bật In Offset. Tick khổ con cắt từ tờ nhập này;
                        mỗi khổ → 1 vật tư con thật (self-FK về cha), giá dẫn xuất từ giá tờ nhập (không nhập tay). */}
                    {form.materialFormat !== 'roll' && (!!form.scopeOffset || !!form.scope_offset) && (
                        <div className="bg-purple-50/50 p-4 rounded-lg border border-purple-200">
                            <div className="flex items-center justify-between mb-3 border-b border-purple-200 pb-2">
                                <h4 className="text-sm font-bold text-slate-800">Khổ xả / bài in (cắt từ tờ nhập này)</h4>
                                <button
                                    type="button"
                                    onClick={() => setForm(f => ({ ...f, child_sheets: [...(Array.isArray(f.child_sheets) ? f.child_sheets as ChildSheet[] : []), { width: 0, height: 0 }] }))}
                                    className="text-xs font-semibold text-purple-700 bg-white border border-purple-300 rounded-lg px-3 py-1.5 hover:bg-purple-100"
                                >+ Thêm khổ xả</button>
                            </div>
                            <p className="text-xs text-slate-500 mb-3">Mỗi khổ xả thành một vật tư con; giá tự chia từ giá tờ nhập theo số bài in cắt được. Mã tự sinh từ mã cha + kích thước.</p>
                            {(Array.isArray(form.child_sheets) ? form.child_sheets as ChildSheet[] : []).length === 0 ? (
                                <div className="text-xs text-slate-400 italic">Chưa có khổ xả. Bấm "+ Thêm khổ xả" nếu tờ nhập này được cắt thành bài in nhỏ hơn.</div>
                            ) : (
                                <div className="space-y-2">
                                    {(form.child_sheets as ChildSheet[]).map((cs, i) => (
                                        <div key={i} className="flex gap-2 items-center">
                                            <input type="number" placeholder="Rộng (mm)" className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg" value={String(cs.width || '')}
                                                onChange={e => setForm(f => { const arr = [...(f.child_sheets as ChildSheet[])]; arr[i] = { ...arr[i], width: Number(e.target.value) }; return { ...f, child_sheets: arr }; })} />
                                            <span className="text-slate-400">×</span>
                                            <input type="number" placeholder="Cao (mm)" className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg" value={String(cs.height || '')}
                                                onChange={e => setForm(f => { const arr = [...(f.child_sheets as ChildSheet[])]; arr[i] = { ...arr[i], height: Number(e.target.value) }; return { ...f, child_sheets: arr }; })} />
                                            <input type="text" placeholder="Tên (tùy chọn)" className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg" value={String(cs.name || '')}
                                                onChange={e => setForm(f => { const arr = [...(f.child_sheets as ChildSheet[])]; arr[i] = { ...arr[i], name: e.target.value }; return { ...f, child_sheets: arr }; })} />
                                            <button type="button" onClick={() => setForm(f => ({ ...f, child_sheets: (f.child_sheets as ChildSheet[]).filter((_, j) => j !== i) }))}
                                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="Xóa khổ xả">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div><label className="block text-xs font-bold text-slate-600 mb-1">Giá vốn (VND)</label><input type="number" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={String(form.costPrice || form.cost_price || form.unitPrice || form.unit_price || 0)} onChange={e => setForm(f => ({ ...f, costPrice: Number(e.target.value), cost_price: Number(e.target.value), unitPrice: Number(e.target.value), unit_price: Number(e.target.value) }))} /></div>
                        <div><label className="block text-xs font-bold text-slate-600 mb-1">Phí lên máy (Setup Fee)</label><input type="number" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={String(form.setupFee || 0)} onChange={e => setForm(f => ({ ...f, setupFee: Number(e.target.value) }))} /></div>
                        <div><label className="block text-xs font-bold text-slate-600 mb-1">% Hao hụt vật tư</label><input type="number" step="0.5" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-amber-700" value={String(form.wastePercent || '')} onChange={e => setForm(f => ({ ...f, wastePercent: Number(e.target.value) }))} placeholder="Ví dụ: 3.5%" /></div>
                        <div><label className="block text-xs font-bold text-slate-600 mb-1">Tồn kho tối thiểu</label><input type="number" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={String(form.min_stock || form.minStock || 0)} onChange={e => setForm(f => ({ ...f, minStock: Number(e.target.value), min_stock: Number(e.target.value) }))} /></div>
                    </div>

                    <div className="flex gap-6 mt-4 pt-3 border-t border-slate-100 justify-center">
                        <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="w-4 h-4 rounded text-indigo-600" checked={!!form.scopeLoose || !!form.scope_loose} onChange={e => setForm(f => ({ ...f, scopeLoose: e.target.checked ? 1 : 0, scope_loose: e.target.checked ? 1 : 0 }))} /><span className="text-slate-700 font-semibold">Tự dùng SP Rời</span></label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="w-4 h-4 rounded text-indigo-600" checked={!!form.scopeBound || !!form.scope_bound} onChange={e => setForm(f => ({ ...f, scopeBound: e.target.checked ? 1 : 0, scope_bound: e.target.checked ? 1 : 0 }))} /><span className="text-slate-700 font-semibold">Dùng in SP Cuốn</span></label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="w-4 h-4 rounded text-indigo-600" checked={!!form.scopeLargeFormat || !!form.scope_large_format} onChange={e => setForm(f => ({ ...f, scopeLargeFormat: e.target.checked ? 1 : 0, scope_large_format: e.target.checked ? 1 : 0 }))} /><span className="text-slate-700 font-semibold">Dùng In Khổ Lớn</span></label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="w-4 h-4 rounded text-purple-600" checked={!!form.scopeOffset || !!form.scope_offset} onChange={e => setForm(f => ({ ...f, scopeOffset: e.target.checked ? 1 : 0, scope_offset: e.target.checked ? 1 : 0 }))} /><span className="text-slate-700 font-semibold">Dùng In Offset</span></label>
                    </div>
                </div>
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
                    <button onClick={onClose} className="px-5 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg">Hủy</button>
                    <button onClick={onSave} className="px-6 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">💾 Lưu cấu hình</button>
                </div>
            </div>
        </div>
    );
}
