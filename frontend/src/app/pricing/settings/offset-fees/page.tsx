"use client";
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../_components/apiClient';

/**
 * Phí cố định & Chiết khấu — In Offset. Tất cả CẤU HÌNH ĐƯỢC, không gán cứng.
 *  - Phí khuôn bế (SP thường / hộp), phí thiết kế mặc định → setup_fees (category offset).
 *  - Chiết khấu mặc định + trần (%) → pricing_config (offset.TyLe_ChietKhau / _Max).
 * Engine offset dùng các giá trị này khi báo giá (form không bắt nhập tay nữa).
 */
interface Fee { code: string; ten: string; giaTri: number; }
interface FeesData { fees: Fee[]; chietKhauDefault: number; chietKhauMax: number; mocSoLuong?: number[]; epKimMoc?: { m1: number; m2: number; m3: number }; }

const FEE_LABELS: Record<string, { label: string; icon: string; hint: string }> = {
    Gia_Khuon: { label: 'Phí khuôn bế (SP thường)', icon: '🧩', hint: 'Áp khi bật "Khuôn bế" ở tờ rơi / bì thư / sản phẩm khác.' },
    Gia_Khuon_Hop: { label: 'Phí khuôn bế (Hộp giấy)', icon: '📦', hint: 'Khuôn bế cho hộp giấy.' },
    Gia_ThietKe: { label: 'Phí thiết kế mặc định', icon: '🎨', hint: 'Mặc định điền sẵn ô "Thiết kế" trên form (sửa được mỗi đơn).' },
};

export default function OffsetFeesPage() {
    const [data, setData] = useState<FeesData>({ fees: [], chietKhauDefault: 0, chietKhauMax: 0 });
    const [mocText, setMocText] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get<FeesData>('/pricing/offset/cfg/fees');
            if (res.success && res.data) {
                setData(res.data);
                setMocText((res.data.mocSoLuong ?? []).join(', '));
            }
        } catch { /* keep defaults */ }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const showToast = (msg: string, type: 'success' | 'error') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const setFee = (code: string, giaTri: number) =>
        setData(d => ({ ...d, fees: d.fees.map(f => (f.code === code ? { ...f, giaTri } : f)) }));

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await api.post('/pricing/offset/cfg/fees', {
                fees: data.fees.map(f => ({ code: f.code, ten: f.ten, giaTri: Math.round(f.giaTri || 0) })),
                chietKhauDefault: data.chietKhauDefault || 0,
                chietKhauMax: data.chietKhauMax || 0,
                mocSoLuong: mocText.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0),
                epKimMoc: data.epKimMoc,
            });
            if (res.success) showToast('Đã lưu phí & chiết khấu', 'success');
            else throw new Error(res.error);
        } catch (e: unknown) {
            showToast('Lỗi: ' + (e instanceof Error ? e.message : 'Unknown'), 'error');
        }
        setSaving(false);
    };

    if (loading) return <div className="flex items-center justify-center h-full"><svg className="animate-spin h-8 w-8 text-indigo-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>;

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6">
            {toast && <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>{toast.msg}</div>}

            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Phí cố định & chiết khấu — offset</h1>
                    <p className="text-slate-500 text-sm mt-1">Cấu hình tập trung; form báo giá tự dùng, không nhập tay.{' '}
                        <Link href="/pricing/settings/waste-stages" className="text-indigo-600 underline">Định mức bù hao</Link>{' · '}
                        <Link href="/pricing/settings/offset-products" className="text-indigo-600 underline">Cấu hình sản phẩm</Link></p>
                </div>
                <button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50">
                    {saving ? 'Đang lưu...' : '💾 Lưu'}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto space-y-6">
                    <div>
                        <h2 className="text-[12px] font-black uppercase tracking-wider text-slate-500 mb-2">Phí cố định (VND/đơn)</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {data.fees.map(f => {
                                const meta = FEE_LABELS[f.code] || { label: f.ten, icon: '⚙️', hint: '' };
                                return (
                                    <div key={f.code} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                                        <div className="flex items-center gap-2 mb-1"><span className="text-2xl">{meta.icon}</span><span className="font-bold text-slate-800 text-sm">{meta.label}</span></div>
                                        <p className="text-[11px] text-slate-400 mb-3 min-h-[32px]">{meta.hint}</p>
                                        <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 px-2 w-fit">
                                            <input type="number" min={0} step={1000} value={f.giaTri}
                                                onChange={e => setFee(f.code, parseFloat(e.target.value) || 0)}
                                                className="w-28 text-right text-sm font-bold py-1.5 bg-transparent focus:outline-none" />
                                            <span className="text-xs text-slate-500 font-bold pr-1">đ</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <h2 className="text-[12px] font-black uppercase tracking-wider text-slate-500 mb-2">Chiết khấu</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                                <div className="font-bold text-slate-800 text-sm mb-1">Chiết khấu mặc định</div>
                                <p className="text-[11px] text-slate-400 mb-3">Áp tự động cho mỗi báo giá offset (trên chi phí SX + thiết kế).</p>
                                <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 px-2 w-fit">
                                    <input type="number" min={0} max={100} step={0.5} value={data.chietKhauDefault}
                                        onChange={e => setData(d => ({ ...d, chietKhauDefault: parseFloat(e.target.value) || 0 }))}
                                        className="w-20 text-center text-sm font-bold py-1.5 bg-transparent focus:outline-none" />
                                    <span className="text-xs text-slate-500 font-bold pr-1">%</span>
                                </div>
                            </div>
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                                <div className="font-bold text-slate-800 text-sm mb-1">Chiết khấu tối đa (trần)</div>
                                <p className="text-[11px] text-slate-400 mb-3">Giới hạn trên — báo giá không vượt mức này.</p>
                                <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 px-2 w-fit">
                                    <input type="number" min={0} max={100} step={0.5} value={data.chietKhauMax}
                                        onChange={e => setData(d => ({ ...d, chietKhauMax: parseFloat(e.target.value) || 0 }))}
                                        className="w-20 text-center text-sm font-bold py-1.5 bg-transparent focus:outline-none" />
                                    <span className="text-xs text-slate-500 font-bold pr-1">%</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h2 className="text-[12px] font-black uppercase tracking-wider text-slate-500 mb-2">Nâng cao</h2>
                        <div className="grid grid-cols-1 gap-4">
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                                <div className="font-bold text-slate-800 text-sm mb-1">Mốc số lượng bậc giá</div>
                                <p className="text-[11px] text-slate-400 mb-3">Các ngưỡng số lượng để chọn bậc đơn giá (giấy/gia công). Nhập danh sách số, cách nhau dấu phẩy.</p>
                                <textarea value={mocText} onChange={e => setMocText(e.target.value)} rows={2}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono"
                                    placeholder="1, 299, 499, 699, 999, 1999, ..." />
                            </div>
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                                <div className="font-bold text-slate-800 text-sm mb-1">Ngưỡng số lượng ép kim</div>
                                <p className="text-[11px] text-slate-400 mb-3">Dưới mốc 1: tính trọn gói. Các mốc xác định khoảng đơn giá ép kim theo số lượng.</p>
                                <div className="flex flex-wrap gap-3">
                                    {([['m1', 'Mốc 1'], ['m2', 'Mốc 2'], ['m3', 'Mốc 3']] as const).map(([k, label]) => (
                                        <div key={k}>
                                            <div className="text-[11px] text-slate-500 font-semibold mb-1">{label}</div>
                                            <input type="number" min={1}
                                                value={data.epKimMoc?.[k] ?? (k === 'm1' ? 100 : k === 'm2' ? 500 : 1000)}
                                                onChange={e => setData(d => ({ ...d, epKimMoc: { m1: d.epKimMoc?.m1 ?? 100, m2: d.epKimMoc?.m2 ?? 500, m3: d.epKimMoc?.m3 ?? 1000, [k]: parseInt(e.target.value, 10) || 0 } }))}
                                                className="w-24 text-center text-sm font-bold py-1.5 bg-slate-50 rounded-lg border border-slate-200 focus:outline-none" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
