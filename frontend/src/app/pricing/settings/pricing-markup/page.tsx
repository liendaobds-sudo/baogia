"use client";
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../_components/apiClient';

/**
 * Lợi nhuận & Làm tròn — In Nhanh (digital). CẤU HÌNH ĐƯỢC, không gán cứng.
 * Giá bán in nhanh = giá vốn × (1 + markup) [hoặc giá vốn / (1 - margin)], làm tròn lên.
 * Lưu vào pricing_config: pricing_method / default_markup / min_margin / price_rounding.
 * Engine in nhanh (PricingService.calculateSellingPrice) dùng các giá trị này.
 */
interface MarkupData {
    pricing_method: 'markup' | 'margin';
    default_markup: number;
    min_margin: number;
    price_rounding: number;
}

const ROUNDING_OPTIONS = [
    { value: 0, label: 'Không làm tròn' },
    { value: 100, label: '100đ' },
    { value: 500, label: '500đ' },
    { value: 1000, label: '1.000đ' },
];

export default function PricingMarkupPage() {
    const [data, setData] = useState<MarkupData>({ pricing_method: 'markup', default_markup: 50, min_margin: 20, price_rounding: 100 });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get<MarkupData>('/erp/pricing-markup');
            if (res.success && res.data) setData({ ...data, ...res.data });
        } catch { /* keep defaults */ }
        setLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const showToast = (msg: string, type: 'success' | 'error') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await api.post('/erp/pricing-markup', {
                pricing_method: data.pricing_method,
                default_markup: Number(data.default_markup) || 0,
                min_margin: Number(data.min_margin) || 0,
                price_rounding: Number(data.price_rounding) || 0,
            });
            if (res.success) showToast('Đã lưu cấu hình lợi nhuận', 'success');
            else throw new Error(res.error);
        } catch (e: unknown) {
            showToast('Lỗi: ' + (e instanceof Error ? e.message : 'Unknown'), 'error');
        }
        setSaving(false);
    };

    // Ví dụ minh hoạ tác động trên giá vốn 100.000đ
    const preview = (() => {
        const cost = 100000;
        const pct = Number(data.default_markup) || 0;
        let price = data.pricing_method === 'margin'
            ? (pct >= 100 ? cost / (1 - 0.5) : cost / (1 - pct / 100))
            : cost * (1 + pct / 100);
        const minPrice = cost / (1 - (Number(data.min_margin) || 0) / 100);
        if (price < minPrice) price = minPrice;
        const r = Number(data.price_rounding) || 0;
        if (r > 0) price = Math.ceil(price / r) * r;
        return Math.round(price);
    })();

    if (loading) return <div className="flex items-center justify-center h-full"><svg className="animate-spin h-8 w-8 text-indigo-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>;

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6">
            {toast && <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>{toast.msg}</div>}

            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Lợi nhuận & Làm tròn — In Nhanh</h1>
                    <p className="text-slate-500 text-sm mt-1">Cách quy đổi giá vốn → giá bán cho báo giá in nhanh. VAT đặt ở{' '}
                        <Link href="/pricing/settings/company-info" className="text-indigo-600 underline">Thông tin công ty</Link>.</p>
                </div>
                <button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50">
                    {saving ? 'Đang lưu...' : '💾 Lưu'}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto space-y-6">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                        <div className="font-bold text-slate-800 text-sm mb-1">Phương pháp tính</div>
                        <p className="text-[11px] text-slate-400 mb-3">Markup: cộng % trên giá vốn. Margin: % lợi nhuận trên giá bán.</p>
                        <div className="flex gap-2">
                            {(['markup', 'margin'] as const).map(m => (
                                <button key={m} onClick={() => setData(d => ({ ...d, pricing_method: m }))}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${data.pricing_method === m ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                                    {m === 'markup' ? 'Markup (cộng lời)' : 'Margin (biên lời)'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                            <div className="font-bold text-slate-800 text-sm mb-1">{data.pricing_method === 'margin' ? 'Biên lợi nhuận mặc định' : 'Markup mặc định'}</div>
                            <p className="text-[11px] text-slate-400 mb-3">Áp cho mỗi báo giá in nhanh.</p>
                            <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 px-2 w-fit">
                                <input type="number" min={0} max={500} step={1} value={data.default_markup}
                                    onChange={e => setData(d => ({ ...d, default_markup: parseFloat(e.target.value) || 0 }))}
                                    className="w-24 text-center text-sm font-bold py-1.5 bg-transparent focus:outline-none" />
                                <span className="text-xs text-slate-500 font-bold pr-1">%</span>
                            </div>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                            <div className="font-bold text-slate-800 text-sm mb-1">Biên lợi nhuận tối thiểu</div>
                            <p className="text-[11px] text-slate-400 mb-3">Sàn — giá bán không xuống dưới mức biên này.</p>
                            <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 px-2 w-fit">
                                <input type="number" min={0} max={100} step={1} value={data.min_margin}
                                    onChange={e => setData(d => ({ ...d, min_margin: parseFloat(e.target.value) || 0 }))}
                                    className="w-24 text-center text-sm font-bold py-1.5 bg-transparent focus:outline-none" />
                                <span className="text-xs text-slate-500 font-bold pr-1">%</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                        <div className="font-bold text-slate-800 text-sm mb-1">Làm tròn giá bán</div>
                        <p className="text-[11px] text-slate-400 mb-3">Làm tròn LÊN tới bội số gần nhất.</p>
                        <div className="flex flex-wrap gap-2">
                            {ROUNDING_OPTIONS.map(o => (
                                <button key={o.value} onClick={() => setData(d => ({ ...d, price_rounding: o.value }))}
                                    className={`px-3 py-2 rounded-lg text-sm font-bold border transition-colors ${data.price_rounding === o.value ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5">
                        <div className="text-[12px] font-black uppercase tracking-wider text-indigo-500 mb-1">Ví dụ minh hoạ</div>
                        <p className="text-sm text-slate-700">Giá vốn <b>100.000đ</b> → giá bán (chưa VAT): <b className="text-indigo-700">{new Intl.NumberFormat('vi-VN').format(preview)}đ</b></p>
                    </div>
                </div>
            </div>
        </div>
    );
}
