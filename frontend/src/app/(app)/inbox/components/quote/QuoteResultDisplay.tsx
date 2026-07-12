import { ProductTemplate, QuoteResult } from './types';
import { formatVND } from '@/lib/format/currency';
import Link from 'next/link';

interface QuoteResultDisplayProps {
    quoteResult: QuoteResult | null;
    selectedTemplate: ProductTemplate;
    onInsertText: (text: string) => void;
    isCalculating: boolean;
    handleCalculate: () => void;
    filledCount: number;
    totalRequired: number;
    detailedHref?: string;
}

export function QuoteResultDisplay({
    quoteResult,
    selectedTemplate,
    onInsertText,
    isCalculating,
    handleCalculate,
    filledCount,
    totalRequired,
    detailedHref
}: QuoteResultDisplayProps) {
    return (
        <div className="mt-4">
            {/* Calculate Button */}
            <button
                onClick={handleCalculate}
                disabled={isCalculating}
                className={`w-full py-3 px-4 text-[15px] font-bold text-white rounded-md transition-all shadow-md flex items-center justify-center gap-2 ${
                    isCalculating
                        ? 'bg-slate-400 cursor-wait shadow-none'
                        : 'bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 hover:shadow-lg active:scale-[0.98]'
                }`}
            >
                {isCalculating ? (
                    <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Đang tính...
                    </>
                ) : (
                    <>
                        <span className="text-lg leading-none">✨</span> Tính giá ngay
                    </>
                )}
            </button>
            {filledCount < totalRequired && (
                <div className="text-[11px] text-amber-600 text-center mt-2 flex items-center justify-center gap-1 font-medium bg-amber-50/50 py-1 rounded-md border border-amber-100/50">
                    <span className="text-[10px]">⚠️</span> Thiếu {totalRequired - filledCount} trường bắt buộc — kết quả có thể chưa chính xác
                </div>
            )}

            {/* Price Result */}
            {quoteResult && (
                <div className={`mt-4 p-4 rounded-md border shadow-sm ${
                    quoteResult.requiresManualQuote 
                        ? 'bg-amber-50/80 border-amber-200' 
                        : 'bg-emerald-50/50 border-emerald-200'
                }`}>
                    {quoteResult.requiresManualQuote ? (
                        <div>
                            <div className="text-[13px] font-bold text-amber-600 mb-1 flex items-center gap-1.5">
                                <span>⚠️</span> Cần báo giá thủ công
                            </div>
                            <div className="text-xs text-amber-900 leading-relaxed">
                                {quoteResult.reason || 'Không tìm thấy bảng giá tự động cho sản phẩm này.'}
                            </div>
                        </div>
                    ) : quoteResult.total != null ? (
                        <div>
                            <div className="text-[13px] font-bold text-emerald-600 mb-2 flex items-center gap-1.5">
                                <span>💰</span> Kết quả báo giá
                            </div>
                            <div className="text-2xl font-black text-emerald-700 mb-1 tracking-tight">
                                {formatVND(Number(quoteResult.grand_total ?? quoteResult.total))}
                            </div>
                            {Number(quoteResult.vat_rate) > 0 && (
                                <div className="text-[11px] text-emerald-700/80 mb-1 font-medium">
                                    Đã gồm VAT {quoteResult.vat_rate}% (+{formatVND(Number(quoteResult.vat_amount || 0))})
                                </div>
                            )}
                            {quoteResult.breakdown && (() => {
                                const LABEL_VI: Record<string, string> = {
                                    sheets_needed: 'Số tờ cần in', waste_sheets: 'Tờ hao phí',
                                    total_sheets: 'Tổng số tờ', items_per_sheet: 'SP/tờ',
                                    efficiency: 'Hiệu suất', price_per_sheet: 'Giá/tờ',
                                    printing: 'Chi phí in', lamination: 'Cán màng',
                                    finishing: 'Gia công', material: 'Vật liệu',
                                };
                                const CURRENCY_KEYS = ['price_per_sheet', 'printing', 'lamination', 'finishing', 'material', 'total'];
                                return (
                                    <div className="text-[11px] text-slate-500 mb-3 space-y-1.5 bg-white/60 p-2.5 rounded-md border border-emerald-100/50">
                                        {Object.entries(quoteResult.breakdown).map(([key, val]) => {
                                            const label = LABEL_VI[key] || key;
                                            const isCurrency = CURRENCY_KEYS.includes(key);
                                            const formatted = isCurrency
                                                ? formatVND(Number(val))
                                                : (key === 'efficiency' ? (String(val).includes('%') ? String(val) : `${val}%`) : String(val));
                                            return (
                                                <div key={key} className="flex justify-between items-center">
                                                    <span className="text-slate-500">{label}:</span>
                                                    <span className="font-medium text-slate-700">{formatted}</span>
                                                </div>
                                            );
                                        })}
                                        {quoteResult.price_per_item !== undefined && quoteResult.price_per_item > 0 && (
                                            <div className="flex justify-between items-center border-t border-emerald-100/80 pt-1.5 mt-1.5">
                                                <span className="text-emerald-700 font-medium pb-0.5">Giá/Con:</span>
                                                <span className="font-bold text-emerald-600">
                                                    {formatVND(Number(quoteResult.grand_total_per_item ?? quoteResult.price_per_item))}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                            {quoteResult.leadtime && (
                                <div className="text-[11px] text-slate-500 border-t border-emerald-200/50 pt-2.5 flex items-center gap-1.5">
                                    <span className="text-sm">🚚</span> Giao hàng: <strong>{quoteResult.leadtime.standardDays} ngày</strong>
                                    {quoteResult.leadtime.expressDays && <span className="ml-1 text-emerald-600">| Gấp: {quoteResult.leadtime.expressDays} ngày</span>}
                                </div>
                            )}
                            {(quoteResult.warnings?.length ?? 0) > 0 && (
                                <div className="text-[11px] text-amber-600 mt-2 bg-amber-50 p-2 rounded-md border border-amber-100">
                                    ⚠️ {quoteResult.warnings?.join(', ')}
                                </div>
                            )}
                            <button
                                onClick={() => {
                                    const dispTotal = Number(quoteResult.grand_total ?? quoteResult.total);
                                    const dispPerItem = Number(quoteResult.grand_total_per_item ?? quoteResult.price_per_item);
                                    const isPerItem = Number.isFinite(dispPerItem) && dispPerItem > 0;
                                    const greeting = `Dạ, em gửi anh/chị báo giá in ${selectedTemplate.name} ạ:\n\n`;
                                    const vatStr = Number(quoteResult.vat_rate) > 0 ? ` (đã gồm VAT ${quoteResult.vat_rate}%)` : ' (chưa gồm VAT)';
                                    const totalStr = `💰 Tổng cộng: ${formatVND(dispTotal)}${vatStr}\n`;
                                    const perItemStr = isPerItem ? `💠 Đơn giá: ${formatVND(dispPerItem)} / con\n` : '';
                                    const leadtimeStr = quoteResult.leadtime ? `🚚 Giao hàng: Khoảng ${quoteResult.leadtime.standardDays} ngày\n` : '';
                                    const ending = `\nAnh/chị xem qua, nếu cần điều chỉnh hay tiến hành in thì nhắn em nhé! Cảm ơn anh/chị ạ. 😊`;
                                    
                                    const text = greeting + totalStr + perItemStr + leadtimeStr + ending;
                                    onInsertText(text);
                                }}
                                className="mt-4 w-full py-2.5 px-3 text-xs font-semibold bg-white text-indigo-600 border border-indigo-200 rounded-md hover:bg-indigo-50 hover:border-indigo-300 transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                            >
                                <span className="text-[14px]">📋</span> Copy kết quả vào chat
                            </button>
                            {detailedHref && (
                                <Link
                                    href={detailedHref}
                                    target="_blank"
                                    className="mt-2 w-full py-2.5 px-3 text-xs font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                                >
                                    <span className="text-[14px]">💾</span> Lưu / tạo đơn ở báo giá chi tiết
                                </Link>
                            )}
                        </div>
                    ) : (
                        <div className="text-xs text-rose-600 flex items-center gap-1.5 font-medium">
                            <span className="text-sm">❌</span> Lỗi tính giá: {quoteResult.error || 'Không xác định'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

