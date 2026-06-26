"use client";
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../_components/apiClient';

/**
 * Định mức BÙ HAO THEO CÔNG ĐOẠN — In Offset.
 *
 * MỖI CÔNG ĐOẠN có bảng MỐC SỐ LƯỢNG RIÊNG: mỗi dòng = "từ số lượng ≥ X → % hao".
 * Bế có mốc riêng, dán có mốc riêng, in có mốc riêng... KHÔNG dùng chung một đường cong.
 * Một số công đoạn có thêm makeready (số canh máy/khuôn cố định).
 */
interface Tier { from: number; percent: number; }
interface StageUI {
    code: string;
    basis: 'sheet' | 'piece';
    label: string;
    hasMakeready: boolean;
    makereadyUnit: string;
    makeready: number;
    tiers: Tier[];
}

const ICONS: Record<string, string> = {
    IN: '🖨️', CAN: '🎞️', XLBM: '✨', BE: '✂️', DAN: '🧷', TP: '📐', CATXEN: '🔪', DONGGOI: '📦',
};

export default function WasteStagesPage() {
    const [stages, setStages] = useState<StageUI[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get<{ stages: StageUI[] }>('/pricing/offset/cfg/waste-stages');
            const list = res.success && res.data?.stages ? res.data.stages : [];
            setStages(list.map(s => ({ ...s, tiers: [...(s.tiers || [])].sort((a, b) => a.from - b.from) })));
        } catch {
            setStages([]);
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const showToast = (msg: string, type: 'success' | 'error') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const patch = (code: string, fn: (s: StageUI) => StageUI) =>
        setStages(prev => prev.map(s => (s.code === code ? fn(s) : s)));
    const setBasis = (code: string, basis: 'sheet' | 'piece') => patch(code, s => ({ ...s, basis }));
    const setMakeready = (code: string, v: number) => patch(code, s => ({ ...s, makeready: v }));
    const addTier = (code: string) => patch(code, s => ({ ...s, tiers: [...s.tiers, { from: (s.tiers.at(-1)?.from ?? 0) + 1000, percent: 0 }] }));
    const removeTier = (code: string, i: number) => patch(code, s => ({ ...s, tiers: s.tiers.filter((_, idx) => idx !== i) }));
    const updateTier = (code: string, i: number, field: keyof Tier, v: number) =>
        patch(code, s => ({ ...s, tiers: s.tiers.map((t, idx) => (idx === i ? { ...t, [field]: v } : t)) }));

    const handleSave = async () => {
        setSaving(true);
        try {
            const body = {
                stages: stages.map(s => ({
                    code: s.code,
                    basis: s.basis,
                    makeready: Math.round(s.makeready || 0),
                    tiers: [...s.tiers].sort((a, b) => a.from - b.from),
                })),
            };
            const res = await api.post('/pricing/offset/cfg/waste-stages', body);
            if (res.success) showToast('Đã lưu định mức bù hao theo công đoạn', 'success');
            else throw new Error(res.error);
        } catch (e: unknown) {
            showToast('Lỗi: ' + (e instanceof Error ? e.message : 'Unknown'), 'error');
        }
        setSaving(false);
    };

    if (loading) return <div className="flex items-center justify-center h-full"><svg className="animate-spin h-8 w-8 text-indigo-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>;

    const StageCard = (s: StageUI) => (
        <div key={s.code} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">{ICONS[s.code] || '⚙️'}</span>
                    <div>
                        <span className="font-bold text-slate-800 text-sm">{s.label}</span>
                        <div className="mt-1 inline-flex rounded-md overflow-hidden border border-slate-200 align-middle">
                            <button onClick={() => setBasis(s.code, 'sheet')}
                                className={`px-2 py-0.5 text-[10px] font-bold uppercase transition-colors ${s.basis === 'sheet' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                                Theo tờ
                            </button>
                            <button onClick={() => setBasis(s.code, 'piece')}
                                className={`px-2 py-0.5 text-[10px] font-bold uppercase transition-colors border-l border-slate-200 ${s.basis === 'piece' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                                Theo con
                            </button>
                        </div>
                    </div>
                </div>
                {s.hasMakeready && (
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500 font-semibold">Canh máy</span>
                        <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 px-2">
                            <input type="number" min={0} step={10} value={s.makeready}
                                onChange={e => setMakeready(s.code, parseInt(e.target.value) || 0)}
                                className="w-16 text-center text-sm font-bold py-1 bg-transparent focus:outline-none" />
                            <span className="text-[11px] text-slate-500 pr-1">{s.makereadyUnit}</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="border border-slate-100 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 bg-slate-50">
                            <th className="py-1.5 px-3 font-bold">Từ số lượng (≥)</th>
                            <th className="py-1.5 px-3 font-bold">% hao</th>
                            <th className="py-1.5 w-8"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {s.tiers.length === 0 && (
                            <tr><td colSpan={3} className="py-3 px-3 text-center text-slate-400 text-[12px]">Chưa có mốc → công đoạn này không bù hao. Bấm “+ mốc”.</td></tr>
                        )}
                        {s.tiers.map((t, i) => (
                            <tr key={i} className="border-t border-slate-50">
                                <td className="py-1 px-3">
                                    <div className="flex items-center bg-slate-50 rounded border border-slate-200 px-1.5 w-fit">
                                        <input type="number" min={1} step={100} value={t.from}
                                            onChange={e => updateTier(s.code, i, 'from', parseInt(e.target.value) || 0)}
                                            className="w-24 text-right text-sm font-bold py-1 bg-transparent focus:outline-none" />
                                        <span className="text-[10px] text-slate-400 pl-1">sp</span>
                                    </div>
                                </td>
                                <td className="py-1 px-3">
                                    <div className="flex items-center bg-slate-50 rounded border border-slate-200 px-1.5 w-fit">
                                        <input type="number" min={0} step={0.5} value={t.percent}
                                            onChange={e => updateTier(s.code, i, 'percent', parseFloat(e.target.value) || 0)}
                                            className="w-16 text-center text-sm font-bold py-1 bg-transparent focus:outline-none" />
                                        <span className="text-[11px] text-slate-500 font-bold pr-1">%</span>
                                    </div>
                                </td>
                                <td className="py-1 pr-2 text-right">
                                    <button onClick={() => removeTier(s.code, i)} aria-label="Xóa mốc" title="Xóa mốc"
                                        className="text-slate-300 hover:text-red-500 transition-colors leading-none">✕</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <button onClick={() => addTier(s.code)} className="mt-2 text-indigo-600 hover:text-indigo-800 text-[12px] font-bold">+ mốc</button>
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6">
            {toast && <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>{toast.msg}</div>}

            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Định Mức Bù Hao Theo Công Đoạn</h1>
                    <p className="text-slate-500 text-sm mt-1">In Offset. Mỗi công đoạn có <b>bảng mốc số lượng riêng</b>.{' '}
                        <Link href="/pricing/settings/offset-fees" className="text-indigo-600 underline">Phí cố định & chiết khấu</Link></p>
                </div>
                <button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-5 rounded-lg shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50">
                    {saving ? 'Đang lưu...' : '💾 Lưu tất cả'}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="max-w-5xl mx-auto space-y-6">
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-[13px] text-blue-800">
                        ℹ️ Mỗi công đoạn tự có bảng mốc riêng và tự chọn <b>tính theo tờ</b> hay <b>theo con</b> (2 nút trên mỗi thẻ).
                        Khi báo giá: với số lượng đơn, hệ thống tra <b>mốc lớn nhất ≤ số lượng</b> của từng công đoạn để lấy % hao,
                        rồi bù hao vào số <b>tờ in</b> (nếu chọn theo tờ) hoặc số <b>thành phẩm</b> (nếu theo con).
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{stages.map(StageCard)}</div>

                    <p className="text-[12px] text-slate-400">
                        Đường cong hao chung (digital/offset) ở <Link href="/pricing/settings/waste-config" className="underline">Cấu Hình Bù Hao</Link> chỉ áp cho In Nhanh & là mặc định cho công đoạn IN khi IN chưa có bảng riêng.
                    </p>
                </div>
            </div>
        </div>
    );
}
