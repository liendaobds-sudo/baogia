"use client";
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../_components/apiClient';

interface WasteConfig {
    digital_waste_pct: number;
    offset_waste_pct: number;
    lamination_waste_pct: number;
    die_cut_waste_pct: number;
    binding_waste_pct: number;
    foiling_waste_pct: number;
    enabled: boolean;
    waste_category_map?: Record<string, string>;
}

interface ProcOption { id: number; code: string; name: string; }

const WASTE_CATEGORIES = [
    { value: '', label: '— Không cộng bù hao —' },
    { value: 'lamination', label: 'Cán màng' },
    { value: 'die_cut', label: 'Cấn bế' },
    { value: 'binding', label: 'Đóng cuốn' },
];

const DEFAULTS: WasteConfig = {
    digital_waste_pct: 3, offset_waste_pct: 5,
    lamination_waste_pct: 2, die_cut_waste_pct: 1,
    binding_waste_pct: 3, foiling_waste_pct: 2, enabled: true,
};

const PRINT_FIELDS = [
    { key: 'digital_waste_pct', label: 'In kỹ thuật số (Digital)', icon: '🖨️', color: 'blue' },
    { key: 'offset_waste_pct', label: 'In Offset (chỉ In Nhanh)', icon: '🏭', color: 'purple' },
] as const;
const FINISH_FIELDS = [
    { key: 'lamination_waste_pct', label: 'Cán màng (Lamination)', icon: '🎞️', color: 'cyan' },
    { key: 'die_cut_waste_pct', label: 'Cấn bế (Die-cut)', icon: '✂️', color: 'amber' },
    { key: 'binding_waste_pct', label: 'Đóng cuốn (Binding)', icon: '📚', color: 'green' },
    { key: 'foiling_waste_pct', label: 'Ép nhũ (Foiling)', icon: '✨', color: 'rose' },
] as const;
const FIELDS = [...PRINT_FIELDS, ...FINISH_FIELDS] as const;

export default function WasteConfigPage() {
    const [config, setConfig] = useState<WasteConfig>(DEFAULTS);
    const [procs, setProcs] = useState<ProcOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [cfgRes, procRes] = await Promise.all([
                api.get<WasteConfig>('/erp/waste-config'),
                api.get<ProcOption[]>('/erp/processing-options'),
            ]);
            if (cfgRes.success && cfgRes.data) setConfig({ ...DEFAULTS, waste_category_map: {}, ...cfgRes.data });
            if (procRes.success && procRes.data) setProcs(procRes.data);
        } catch { /* use defaults */ }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const showToast = (msg: string, type: 'success' | 'error') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await api.post('/erp/waste-config', config);
            if (res.success) showToast('Đã lưu cấu hình bù hao', 'success');
            else throw new Error(res.error);
        } catch (e: unknown) {
            showToast('Lỗi: ' + (e instanceof Error ? e.message : 'Unknown'), 'error');
        }
        setSaving(false);
    };

    // Preview calculation: 1000 sheets with these waste rates
    const previewSheets = 1000;
    const totalWaste = FIELDS.reduce((sum, f) => sum + (config[f.key] || 0), 0);

    if (loading) return <div className="flex items-center justify-center h-full"><svg className="animate-spin h-8 w-8 text-indigo-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>;

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6">
            {toast && <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>{toast.msg}</div>}
            
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Cấu hình bù hao — in nhanh</h1>
                    <p className="text-slate-500 text-sm mt-1">Tỷ lệ % in dư bù hỏng cho báo giá <b>In Nhanh</b>. Engine cộng % này vào số lượng in thực tế (giá vốn). Tổng % = hao theo phương pháp in + hao các công đoạn gia công sản phẩm đi qua.</p>
                    <a href="/pricing/settings/waste-stages" className="text-indigo-600 text-xs font-semibold underline mt-1 inline-block">→ Định mức bù hao theo công đoạn (In Offset)</a>
                </div>
                <button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-5 rounded-lg shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50">
                    {saving ? 'Đang lưu...' : '💾 Lưu cấu hình'}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="max-w-4xl mx-auto space-y-6">
                    {/* Toggle */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={config.enabled} onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))} className="w-5 h-5 text-indigo-600 rounded" />
                            <div>
                                <span className="font-bold text-slate-800">Bật tính năng bù hao</span>
                                <p className="text-xs text-slate-500">Khi bật, hệ thống tự động cộng thêm % bù hao vào số lượng in thực tế.</p>
                            </div>
                        </label>
                    </div>

                    {/* Bù hao theo PHƯƠNG PHÁP IN */}
                    <div>
                        <h3 className="text-[12px] font-black uppercase tracking-wider text-slate-500 mb-1">Bù hao theo phương pháp in</h3>
                        <p className="text-[11px] text-slate-400 mb-2">% hao cơ bản theo cách in. <b>In Offset</b> ở đây chỉ áp cho luồng In Nhanh chọn offset — báo giá In Offset mới dùng bảng riêng{' '}
                            <a href="/pricing/settings/waste-stages" className="text-indigo-600 underline">Bù Hao Theo Công Đoạn</a>.</p>
                        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${!config.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                            {PRINT_FIELDS.map(f => (
                                <div key={f.key} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-2xl">{f.icon}</span>
                                        <span className="font-bold text-slate-800 text-sm">{f.label}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <input type="range" min="0" max="20" step="0.5" value={config[f.key]} onChange={e => setConfig(c => ({ ...c, [f.key]: parseFloat(e.target.value) }))} className="flex-1 accent-indigo-600" />
                                        <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 px-2">
                                            <input type="number" min="0" max="50" step="0.5" value={config[f.key]} onChange={e => setConfig(c => ({ ...c, [f.key]: parseFloat(e.target.value) || 0 }))} className="w-14 text-center text-sm font-bold py-1.5 bg-transparent focus:outline-none" />
                                            <span className="text-xs text-slate-500 font-bold">%</span>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-2">+{Math.ceil(previewSheets * (config[f.key] / 100))} tờ / {previewSheets} tờ</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Bù hao theo CÔNG ĐOẠN GIA CÔNG */}
                    <div>
                        <h3 className="text-[12px] font-black uppercase tracking-wider text-slate-500 mb-1">Bù hao theo công đoạn gia công</h3>
                        <p className="text-[11px] text-slate-400 mb-2">% hao cộng thêm cho từng công đoạn sau in (mỗi công đoạn sản phẩm đi qua sẽ cộng dồn % tương ứng).</p>
                        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ${!config.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                            {FINISH_FIELDS.map(f => (
                                <div key={f.key} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-2xl">{f.icon}</span>
                                        <span className="font-bold text-slate-800 text-sm">{f.label}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <input type="range" min="0" max="20" step="0.5" value={config[f.key]} onChange={e => setConfig(c => ({ ...c, [f.key]: parseFloat(e.target.value) }))} className="flex-1 accent-indigo-600" />
                                        <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 px-2">
                                            <input type="number" min="0" max="50" step="0.5" value={config[f.key]} onChange={e => setConfig(c => ({ ...c, [f.key]: parseFloat(e.target.value) || 0 }))} className="w-14 text-center text-sm font-bold py-1.5 bg-transparent focus:outline-none" />
                                            <span className="text-xs text-slate-500 font-bold">%</span>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-2">+{Math.ceil(previewSheets * (config[f.key] / 100))} tờ / {previewSheets} tờ</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Preview Card */}
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-6">
                        <h3 className="font-bold text-indigo-800 mb-3">📊 Xem trước (với {previewSheets.toLocaleString()} tờ)</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                            <div>
                                <p className="text-xs text-indigo-500 font-semibold">Tổng bù hao</p>
                                <p className="text-2xl font-black text-indigo-700">{totalWaste.toFixed(1)}%</p>
                            </div>
                            <div>
                                <p className="text-xs text-indigo-500 font-semibold">Tờ bù hao</p>
                                <p className="text-2xl font-black text-indigo-700">{Math.ceil(previewSheets * (totalWaste / 100))}</p>
                            </div>
                            <div>
                                <p className="text-xs text-indigo-500 font-semibold">Tổng in thực tế</p>
                                <p className="text-2xl font-black text-emerald-600">{(previewSheets + Math.ceil(previewSheets * (totalWaste / 100))).toLocaleString()}</p>
                            </div>
                            <div>
                                <p className="text-xs text-indigo-500 font-semibold">Trạng thái</p>
                                <p className={`text-lg font-black ${config.enabled ? 'text-emerald-600' : 'text-slate-400'}`}>{config.enabled ? '✅ BẬT' : '⏸️ TẮT'}</p>
                            </div>
                        </div>
                    </div>

                    {/* Gán loại bù hao cho từng gia công (In Nhanh) */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <h3 className="font-bold text-slate-800 mb-1">Gán loại bù hao cho gia công (In Nhanh)</h3>
                        <p className="text-xs text-slate-500 mb-4">Mỗi mục gia công gắn với 1 loại bù hao ở trên. Nhờ vậy gia công mã tùy biến của bạn vẫn được cộng % bù hao đúng loại khi báo giá.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                            {procs.length === 0 ? (
                                <p className="text-sm text-slate-400 col-span-2 text-center py-4">Chưa có mục gia công nào.</p>
                            ) : procs.map(p => (
                                <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-slate-100 hover:border-slate-200">
                                    <span className="text-sm text-slate-700 truncate" title={`${p.name} (${p.code})`}>{p.name} <span className="text-slate-400 text-xs">({p.code})</span></span>
                                    <select
                                        value={config.waste_category_map?.[p.code] ?? ''}
                                        onChange={e => setConfig(c => ({ ...c, waste_category_map: { ...(c.waste_category_map || {}), [p.code]: e.target.value } }))}
                                        className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white shrink-0">
                                        {WASTE_CATEGORIES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
