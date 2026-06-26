'use client';

/**
 * Bộ_So_Sánh_Giá (Price Comparator UI) — Task 11.2 / Phase 4.
 *
 * Hiển thị bảng so sánh giá đa Phương_Pháp_In cho CÙNG một Sản_Phẩm + một bộ Thông_Số
 * (Req 5.1, 5.4), đánh dấu phương án rẻ hơn theo số lượng đang xét (Req 5.2), nêu lý do
 * các Phương_Pháp_In bị loại (Req 5.5), và — khi cung cấp dải số lượng — hiển thị
 * Điểm_Hoà_Vốn `q*` giữa các cặp phương pháp (Req 5.3). Khi chỉ một phương pháp áp dụng
 * được ⇒ chỉ hiển thị Giá đơn, không bảng so sánh (Req 5.6).
 *
 * VAT là giá trị chung cấp báo giá, khai báo MỘT LẦN ở mục khách hàng (Req 8.1) qua
 * `CustomerInfo` (store `useQuoteCart.vatRate`). Comparator đọc lại `vatRate` đó và gửi
 * `vat_rate` tới `POST /quote/compare`; backend áp VAT đúng một lần trên dòng được chọn
 * (Req 8.3, 8.4) — UI hiển thị tổng-có-VAT mỗi phương pháp để tham khảo.
 *
 * Kết nối từ Cổng_Tạo_Báo_Giá khi NV_Báo_Giá chọn chế độ so sánh (mode='compare').
 *
 * _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6, 8.1_
 */

import { useCallback, useState } from 'react';
import { API_URL } from '@/lib/api';
import { formatVND } from '@/lib/format/currency';
import { useToast } from '@/lib/ui/toast';
import { useQuoteCart } from '../_store/useQuoteCart';
import type { MethodId } from '@/lib/scope/types';

/* -------------------------------------------------------------------------- */
/* Kiểu dữ liệu — khớp hình trả về của `POST /quote/compare` (QuoteController)  */
/* -------------------------------------------------------------------------- */

interface QuoteVatResult {
    sumPriceBeforeVat: number;
    vatRatePercent: number;
    vatAmount: number;
    grandTotal: number;
}

/** Một dòng kết quả tính được giá (PriceResult + cờ rẻ nhất + VAT từng phương pháp). */
interface PriceResultRow {
    ok: boolean;
    methodId: MethodId;
    costSubtotal: number;
    sellingSubtotal: number;
    discountAmount: number;
    priceBeforeVat: number;
    pricePerItem: number;
    breakdown: Record<string, unknown>;
    unavailableReason?: string;
    isCheapest: boolean;
    vat: QuoteVatResult;
}

interface ExcludedMethod {
    methodId: MethodId;
    reason: string;
}

interface BreakEvenPoint {
    quantity: number;
    lowerQuantity: number;
    upperQuantity: number;
    lowerMethodId: MethodId;
    upperMethodId: MethodId;
}

interface BreakEvenResult {
    methodA: MethodId;
    methodB: MethodId;
    hasBreakEven: boolean;
    breakEven?: BreakEvenPoint;
    message?: string;
    samples: { quantity: number; priceA: number | null; priceB: number | null; cheaperMethodId: MethodId | null }[];
}

interface CompareResponse {
    unitId: string;
    product: { code: string; quoteType: string };
    quantity: number;
    vatRatePercent: number;
    comparison: {
        mode: 'none' | 'single' | 'comparison';
        cheapestMethodId?: MethodId;
        results: PriceResultRow[];
        excluded: ExcludedMethod[];
    };
    vat: QuoteVatResult;
    breakEven: BreakEvenResult[];
}

/* -------------------------------------------------------------------------- */
/* Nhãn người đọc cho Phương_Pháp_In                                           */
/* -------------------------------------------------------------------------- */

const METHOD_META: Record<string, { label: string; icon: string }> = {
    digital: { label: 'In nhanh (Digital)', icon: '🖨️' },
    offset: { label: 'In Offset', icon: '⚙️' },
};
const methodLabel = (m: MethodId) => METHOD_META[m]?.label ?? String(m);
const methodIcon = (m: MethodId) => METHOD_META[m]?.icon ?? '🧾';

/* -------------------------------------------------------------------------- */
/* Props                                                                       */
/* -------------------------------------------------------------------------- */

export interface PriceComparatorProps {
    token: string | null;
    productCode: string;
    quoteType: string;
    productName: string;
    /** Phương_Pháp_Khả_Dụng áp dụng được cho sản phẩm (đã lọc theo Cờ_Năng_Lực). */
    methods: MethodId[];
    onBack: () => void;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export function PriceComparator({ token, productCode, quoteType, productName, methods, onBack }: PriceComparatorProps) {
    const toast = useToast();
    // VAT cấp báo giá — nguồn duy nhất ở mục khách hàng (Req 8.1).
    const vatRate = useQuoteCart((s) => s.vatRate);

    // ── Thông_Số dùng chung cho MỌI phương pháp (Req 5.4) ──
    const [quantity, setQuantity] = useState<number>(1000);
    const [width, setWidth] = useState<string>('');
    const [height, setHeight] = useState<string>('');
    const [depth, setDepth] = useState<string>('');
    const [materialCode, setMaterialCode] = useState<string>('');
    const [paperSizeCode, setPaperSizeCode] = useState<string>('');

    // ── Dải số lượng để dò Điểm_Hoà_Vốn (Req 5.3) ──
    const [breakEvenEnabled, setBreakEvenEnabled] = useState<boolean>(true);
    const [beMin, setBeMin] = useState<number>(100);
    const [beMax, setBeMax] = useState<number>(5000);

    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<CompareResponse | null>(null);

    const handleCompare = useCallback(async () => {
        if (!Number.isFinite(quantity) || quantity < 1) {
            toast.show('error', 'Vui lòng nhập số lượng hợp lệ (≥ 1).');
            return;
        }

        // Dựng Thông_Số: chỉ gửi trường có giá trị (backend bỏ qua trường rỗng).
        const spec: Record<string, unknown> = { quantity: Math.floor(quantity) };
        const dims: Record<string, number> = {};
        if (width.trim()) dims.width = Number(width);
        if (height.trim()) dims.height = Number(height);
        if (depth.trim()) dims.depth = Number(depth);
        if (Object.keys(dims).length > 0) spec.dimensions = dims;
        if (materialCode.trim()) spec.materialCode = materialCode.trim();
        if (paperSizeCode.trim()) spec.paperSizeCode = paperSizeCode.trim();

        const body: Record<string, unknown> = {
            productCode,
            quoteType,
            spec,
            vat_rate: vatRate,
            methods,
        };

        // Dải số lượng dò điểm hoà vốn (Req 5.3).
        if (breakEvenEnabled) {
            const min = Math.max(1, Math.floor(beMin));
            const max = Math.max(min, Math.floor(beMax));
            body.quantityRange = { min, max };
        }

        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/quote-tool/compare`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                let message = `So sánh giá thất bại (mã ${res.status})`;
                try {
                    const err = await res.json();
                    const m = Array.isArray(err?.message) ? err.message.join(', ') : err?.message;
                    message = m || err?.error || message;
                } catch {
                    /* giữ message theo status */
                }
                toast.show('error', message);
                return;
            }

            const data: CompareResponse = await res.json();
            setResult(data);
        } catch (e) {
            console.error(e);
            toast.show('error', 'Có lỗi xảy ra khi so sánh giá.');
        } finally {
            setLoading(false);
        }
    }, [quantity, width, height, depth, materialCode, paperSizeCode, productCode, quoteType, vatRate, methods, breakEvenEnabled, beMin, beMax, token, toast]);

    const inputCls =
        'w-full px-3 py-2 border border-slate-200 rounded-md text-[13px] font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-all bg-slate-50 focus:bg-white';
    const labelCls = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1';

    return (
        <div className="absolute inset-0 overflow-y-auto p-6 custom-scrollbar">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">⚖️ So sánh giá đa phương pháp</h2>
                        <p className="text-sm text-slate-500 mt-0.5">
                            {productName} — {methods.map(methodLabel).join(' • ')}
                        </p>
                    </div>
                    <button onClick={onBack} className="h-9 px-4 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-md text-[13px] font-bold shadow-sm transition-colors">
                        ← Quay lại chọn phương pháp
                    </button>
                </div>

                {/* Thông số dùng chung */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5 shadow-sm">
                    <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-wider mb-3">Thông số dùng chung</h3>
                    <p className="text-[11px] text-slate-400 mb-3">Cùng một bộ thông số được áp cho mọi phương pháp khi so sánh.</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        <div>
                            <label className={labelCls}>Số lượng <span className="text-rose-500">*</span></label>
                            <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 0)} className={`${inputCls} font-mono`} />
                        </div>
                        <div>
                            <label className={labelCls}>Rộng (cm)</label>
                            <input type="number" min={0} value={width} onChange={(e) => setWidth(e.target.value)} placeholder="—" className={`${inputCls} font-mono`} />
                        </div>
                        <div>
                            <label className={labelCls}>Cao (cm)</label>
                            <input type="number" min={0} value={height} onChange={(e) => setHeight(e.target.value)} placeholder="—" className={`${inputCls} font-mono`} />
                        </div>
                        <div>
                            <label className={labelCls}>Hông (cm)</label>
                            <input type="number" min={0} value={depth} onChange={(e) => setDepth(e.target.value)} placeholder="—" className={`${inputCls} font-mono`} />
                        </div>
                        <div>
                            <label className={labelCls}>Mã vật tư</label>
                            <input value={materialCode} onChange={(e) => setMaterialCode(e.target.value)} placeholder="—" className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Mã khổ giấy</label>
                            <input value={paperSizeCode} onChange={(e) => setPaperSizeCode(e.target.value)} placeholder="—" className={inputCls} />
                        </div>
                    </div>

                    {/* Dải số lượng dò điểm hoà vốn */}
                    <div className="mt-4 pt-4 border-t border-slate-100">
                        <label className="flex items-center gap-2 text-[12px] font-bold text-slate-600 mb-2 cursor-pointer">
                            <input type="checkbox" checked={breakEvenEnabled} onChange={(e) => setBreakEvenEnabled(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                            Dò điểm hoà vốn trên dải số lượng
                        </label>
                        {breakEvenEnabled && (
                            <div className="grid grid-cols-2 gap-3 max-w-xs">
                                <div>
                                    <label className={labelCls}>Từ SL</label>
                                    <input type="number" min={1} value={beMin} onChange={(e) => setBeMin(parseInt(e.target.value, 10) || 1)} className={`${inputCls} font-mono`} />
                                </div>
                                <div>
                                    <label className={labelCls}>Đến SL</label>
                                    <input type="number" min={1} value={beMax} onChange={(e) => setBeMax(parseInt(e.target.value, 10) || 1)} className={`${inputCls} font-mono`} />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="mt-4 flex items-center gap-3">
                        <button
                            onClick={handleCompare}
                            disabled={loading}
                            className={`h-10 px-6 text-white rounded-lg text-[13px] font-bold shadow transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${loading ? 'bg-slate-500' : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:shadow-lg'}`}
                        >
                            {loading
                                ? <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                : '⚖️'}
                            SO SÁNH GIÁ
                        </button>
                        <span className="text-[11px] text-slate-400">VAT cấp báo giá: <strong className="text-slate-600">{vatRate}%</strong> (chỉnh ở mục Khách hàng)</span>
                    </div>
                </div>

                {/* Kết quả */}
                {result && <ComparisonResultView result={result} />}
            </div>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Hiển thị kết quả so sánh                                                    */
/* -------------------------------------------------------------------------- */

function ComparisonResultView({ result }: { result: CompareResponse }) {
    const { comparison, vat, breakEven, quantity } = result;
    const { mode, results, excluded } = comparison;

    return (
        <div className="space-y-5">
            {/* (A) Không có phương pháp tính được giá (Req 5.5) */}
            {mode === 'none' && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 text-center">
                    <p className="text-3xl mb-2">📭</p>
                    <p className="text-rose-700 font-bold">Không có phương pháp nào tính được giá cho bộ thông số này.</p>
                </div>
            )}

            {/* (B) Đúng một phương pháp ⇒ giá đơn, không bảng so sánh (Req 5.6) */}
            {mode === 'single' && results[0] && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <p className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">Chỉ một phương pháp áp dụng được</p>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-2xl">{methodIcon(results[0].methodId)}</span>
                            <span className="font-black text-slate-800">{methodLabel(results[0].methodId)}</span>
                        </div>
                        <div className="text-right">
                            <p className="text-[11px] text-slate-400">Giá trước VAT ({quantity} sp)</p>
                            <p className="font-black text-indigo-600 text-lg">{formatVND(results[0].priceBeforeVat)}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* (C) ≥2 phương pháp ⇒ bảng so sánh (Req 5.2) */}
            {mode === 'comparison' && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                        <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-wider">Bảng so sánh giá ({quantity} sp)</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                                    <th className="text-left font-bold px-4 py-2.5">Phương pháp</th>
                                    <th className="text-right font-bold px-4 py-2.5">Giá bán</th>
                                    <th className="text-right font-bold px-4 py-2.5">Chiết khấu</th>
                                    <th className="text-right font-bold px-4 py-2.5">Trước VAT</th>
                                    <th className="text-right font-bold px-4 py-2.5">VAT</th>
                                    <th className="text-right font-bold px-4 py-2.5">Tổng có VAT</th>
                                    <th className="text-right font-bold px-4 py-2.5">Đơn giá / sp</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((r) => (
                                    <tr key={r.methodId} className={`border-b border-slate-50 ${r.isCheapest ? 'bg-emerald-50' : ''}`}>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg">{methodIcon(r.methodId)}</span>
                                                <span className="font-bold text-slate-800">{methodLabel(r.methodId)}</span>
                                                {r.isCheapest && (
                                                    <span className="ml-1 text-[10px] font-black uppercase bg-emerald-600 text-white px-2 py-0.5 rounded-full">Rẻ hơn</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-slate-600">{formatVND(r.sellingSubtotal)}</td>
                                        <td className="px-4 py-3 text-right font-mono text-slate-500">{r.discountAmount > 0 ? `- ${formatVND(r.discountAmount)}` : '—'}</td>
                                        <td className={`px-4 py-3 text-right font-mono font-bold ${r.isCheapest ? 'text-emerald-700' : 'text-slate-800'}`}>{formatVND(r.priceBeforeVat)}</td>
                                        <td className="px-4 py-3 text-right font-mono text-slate-500">{formatVND(r.vat.vatAmount)}</td>
                                        <td className={`px-4 py-3 text-right font-mono font-black ${r.isCheapest ? 'text-emerald-700' : 'text-slate-800'}`}>{formatVND(r.vat.grandTotal)}</td>
                                        <td className="px-4 py-3 text-right font-mono text-slate-500">{formatVND(r.pricePerItem)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {/* VAT cấp báo giá: áp một lần trên phương án được chọn (Req 8.3, 8.4) */}
                    <div className="px-5 py-3 bg-indigo-50 border-t border-indigo-100 text-[12px] text-indigo-800 flex flex-wrap items-center justify-between gap-2">
                        <span>
                            Phương án rẻ hơn:{' '}
                            <strong>{comparison.cheapestMethodId ? methodLabel(comparison.cheapestMethodId) : '—'}</strong>
                        </span>
                        <span>
                            Tổng trước VAT <strong>{formatVND(vat.sumPriceBeforeVat)}</strong> + VAT {vat.vatRatePercent}%{' '}
                            <strong>{formatVND(vat.vatAmount)}</strong> = Tổng có VAT{' '}
                            <strong className="text-indigo-900">{formatVND(vat.grandTotal)}</strong>
                        </span>
                    </div>
                    <p className="px-5 py-1.5 text-[10px] text-slate-400 bg-indigo-50/50">VAT là giá trị chung cấp báo giá, áp đúng một lần trên phương án được chọn.</p>
                </div>
            )}

            {/* (D) Điểm hoà vốn (Req 5.3) */}
            {breakEven.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-wider mb-3">📈 Điểm hoà vốn theo số lượng</h3>
                    <div className="space-y-2">
                        {breakEven.map((be, i) => (
                            <div key={`${be.methodA}-${be.methodB}-${i}`} className="text-[13px] bg-slate-50 rounded-lg px-4 py-3 border border-slate-100">
                                <span className="font-bold text-slate-700">{methodLabel(be.methodA)} ↔ {methodLabel(be.methodB)}: </span>
                                {be.hasBreakEven && be.breakEven ? (
                                    <span className="text-slate-600">
                                        Hoà vốn tại <strong className="text-amber-700">~{be.breakEven.quantity} sp</strong>. Dưới mức này{' '}
                                        <strong>{methodLabel(be.breakEven.lowerMethodId)}</strong> rẻ hơn; trên mức này{' '}
                                        <strong>{methodLabel(be.breakEven.upperMethodId)}</strong> rẻ hơn.
                                    </span>
                                ) : (
                                    <span className="text-slate-500">{be.message ?? 'Không có điểm hoà vốn trong dải.'}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* (E) Phương pháp bị loại kèm lý do (Req 5.5) */}
            {excluded.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                    <h3 className="text-[12px] font-black text-amber-800 uppercase tracking-wider mb-2">⚠️ Phương pháp bị loại</h3>
                    <ul className="space-y-1.5">
                        {excluded.map((ex) => (
                            <li key={ex.methodId} className="text-[13px] text-amber-900">
                                <strong>{methodLabel(ex.methodId)}:</strong> {ex.reason}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
