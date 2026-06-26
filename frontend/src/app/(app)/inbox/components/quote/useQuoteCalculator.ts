import { useState } from 'react';
import { ProductTemplate, MasterData, FIELD_MASTER_MAP } from './types';

import { API_URL as API } from '@/lib/api';
import {
    buildPricingPayload,
    type NormalizedInput,
    type LooseInput,
    type BoundInput,
    type LargeFormatInput,
    type ProcessingInput,
    InvalidPayloadError,
} from '@/lib/quote/buildPricingPayload';
import { readPricingResult } from '@/lib/quote/readPricingResult';

/**
 * Helper: đọc giá trị form từ nhiều field_code khả dĩ.
 */
function getField(formData: Record<string, string>, ...codes: string[]): string {
    for (const c of codes) {
        if (formData[c]?.trim()) return formData[c].trim();
    }
    return '';
}

/**
 * Đổi heuristic đơn vị khổ lớn (giữ NGUYÊN hành vi mini hiện có) → mm.
 * Lưu ý: được giữ để tránh hồi quy giá khổ lớn; sau khi quy đổi ra mm, payload
 * đi qua Lớp_Dựng_Payload dưới dạng đơn vị tường minh `mm`.
 */
function largeFormatToMm(raw: number): number {
    let v = raw || 0;
    if (v > 0 && v <= 10) v *= 1000;       // m → mm
    else if (v > 10 && v <= 300) v *= 10;  // cm → mm
    return Math.round(v);
}

/** Map state mini (loose) → NormalizedInput */
function toLooseInput(
    formData: Record<string, string>,
    masterData: MasterData,
    processingItems: ProcessingInput[],
    selectedAccessories: Array<{ id: number; qty: number; name?: string; price?: number }>,
): LooseInput {
    const materialId = getField(formData, 'material', 'vat_lieu', 'chat_lieu');
    const paperSizeId = getField(formData, 'paper_size', 'kich_thuoc_giay');
    const resolvedPaperSizeId = parseInt(paperSizeId) || (() => {
        const mat = masterData.materials.find(m => String(m.id) === materialId);
        return (mat as any)?.paper_size_id || undefined;
    })();
    return {
        product_type: 'loose',
        material_id: parseInt(materialId) || 0,
        paper_size_id: resolvedPaperSizeId,
        quantity: parseInt(getField(formData, 'quantity', 'so_luong') || '0') || 0,
        // Kích thước mini nhập theo cm → khai báo đơn vị tường minh 'cm'
        item_width: { value: parseFloat(getField(formData, 'kich_thuoc_w', 'size_w')) || 0, unit: 'cm' },
        item_height: { value: parseFloat(getField(formData, 'kich_thuoc_h', 'size_h')) || 0, unit: 'cm' },
        print_side: getField(formData, 'printSides', 'so_mat_in', 'print_side') || 'single',
        print_type: masterData.config?.default_print_type || '4c',
        shape: getField(formData, 'shape', 'hinh_dang') || 'rectangle',
        // gap để trống → Lớp_Dựng_Payload áp DEFAULT_GAP_MM thống nhất với chi tiết
        processing: processingItems,
        accessories: selectedAccessories,
    };
}

/** Map state mini (bound) → NormalizedInput */
function toBoundInput(
    formData: Record<string, string>,
    template: ProductTemplate,
    selectedProcessing: Array<{ id: number; name?: string; section?: 'cover' | 'inner' }>,
    selectedAccessories: Array<{ id: number; qty: number; name?: string; price?: number }>,
): BoundInput {
    const pageCount = parseInt(getField(formData, 'page_count', 'so_trang') || '0') || 24;
    const bindingType = getField(formData, 'bindingType', 'kieu_dong', 'binding_type') || 'ghim_long';

    const coverMaterialId = getField(formData, 'coverMaterial', 'vat_lieu_bia', 'cover_material');
    const coverPaperSizeId = getField(formData, 'cover_paper_size', 'paper_size', 'kich_thuoc_giay');
    const innerMaterialId = getField(formData, 'innerMaterial', 'vat_lieu_ruot', 'inner_material', 'material', 'vat_lieu');
    const innerPaperSizeId = getField(formData, 'inner_paper_size', 'paper_size', 'kich_thuoc_giay');

    // Gia công bìa (cán màng, v.v.) — gom từ field cover_* / can_mang map sang processingOptions
    const coverProcessing: ProcessingInput[] = [];
    for (const f of template.fields || []) {
        if ((f.field_code.startsWith('cover_') || f.field_code === 'can_mang') &&
            FIELD_MASTER_MAP[f.field_code] === 'processingOptions' && formData[f.field_code]) {
            coverProcessing.push({ id: parseInt(formData[f.field_code]) });
        }
    }
    // Gia công thành phẩm người dùng chọn ở khối "Gia công" của mini, gắn nhãn
    // bìa/ruột (section). Mặc định 'cover' (cán màng/ép kim thường áp lên bìa —
    // parity với báo giá thủ công). Tránh bỏ rơi âm thầm khiến lệch giá. Khử
    // trùng theo id trong từng section.
    const innerProcessing: ProcessingInput[] = [];
    for (const p of selectedProcessing) {
        if (p.id == null) continue;
        if (p.section === 'inner') {
            if (!innerProcessing.some(c => c.id === p.id)) {
                innerProcessing.push({ id: p.id, ...(p.name ? { name: p.name } : {}) });
            }
        } else if (!coverProcessing.some(c => c.id === p.id)) {
            coverProcessing.push({ id: p.id, ...(p.name ? { name: p.name } : {}) });
        }
    }

    return {
        product_type: 'bound',
        quantity: parseInt(getField(formData, 'quantity', 'so_luong') || '0') || 0,
        page_count: pageCount,
        binding_type: bindingType,
        cover: {
            material_id: parseInt(coverMaterialId) || 0,
            paper_size_id: parseInt(coverPaperSizeId) || 1,
            print_side: getField(formData, 'cover_print_side') || 'double',
            print_type: getField(formData, 'cover_print_type') || '4c',
            ...(coverProcessing.length > 0 ? { processing: coverProcessing } : {}),
        },
        inner: {
            material_id: parseInt(innerMaterialId) || 0,
            paper_size_id: parseInt(innerPaperSizeId) || 1,
            print_side: getField(formData, 'inner_print_side') || 'double',
            print_type: getField(formData, 'inner_print_type') || '4c',
            ...(innerProcessing.length > 0 ? { processing: innerProcessing } : {}),
        },
        // page_count ruột = max(0, page_count - 4) do Lớp_Dựng_Payload tính (parity với chi tiết)
        accessories: selectedAccessories,
    };
}

/** Map state mini (large_format) → NormalizedInput */
function toLargeFormatInput(
    formData: Record<string, string>,
    masterData: MasterData,
    processingItems: ProcessingInput[],
    selectedAccessories: Array<{ id: number; qty: number; name?: string; price?: number }>,
): LargeFormatInput {
    const materialId = getField(formData, 'material', 'vat_lieu', 'chat_lieu');
    const wMm = largeFormatToMm(parseFloat(getField(formData, 'kich_thuoc_w', 'size_w', 'width')));
    const hMm = largeFormatToMm(parseFloat(getField(formData, 'kich_thuoc_h', 'size_h', 'height')));
    return {
        product_type: 'large_format',
        material_id: parseInt(materialId) || 0,
        quantity: parseInt(getField(formData, 'quantity', 'so_luong') || '0') || 1,
        width: { value: wMm, unit: 'mm' },
        height: { value: hMm, unit: 'mm' },
        print_type: getField(formData, 'printType', 'loai_in', 'print_type') || masterData.config?.default_print_type || 'uv',
        processing: processingItems,
        accessories: selectedAccessories,
    };
}

export function useQuoteCalculator(
    token: string,
    selectedTemplate: ProductTemplate | null,
    formData: Record<string, string>,
    masterData: MasterData,
    selectedAccessories: Array<{ id: number; name: string; qty: number; price: number }>,
    selectedProcessing: Array<{ id: number; name: string; price: number; qty?: number; unit?: string; section?: 'cover' | 'inner' }> = []
) {
    const [quoteResult, setQuoteResult] = useState<import('./types').QuoteResult | null>(null);
    const [isCalculating, setIsCalculating] = useState(false);

    const handleCalculate = async () => {
        if (!selectedTemplate) return;
        setIsCalculating(true);
        setQuoteResult(null);
        try {
            // Processing & accessories chuẩn hóa (kèm name để engine khổ lớn khớp theo tên)
            const processingItems: ProcessingInput[] = selectedProcessing.map(p => ({ id: p.id, name: p.name }));
            const accPayload = selectedAccessories.map(a => ({ id: a.id, qty: a.qty, name: a.name, price: a.price }));
            const productType = selectedTemplate.product_type || 'loose';

            // Map state → Đầu_Vào_Chuẩn_Hóa rồi dựng payload bằng Lớp_Dựng_Payload DÙNG CHUNG
            let normalized: NormalizedInput;
            switch (productType) {
                case 'bound':
                    normalized = toBoundInput(formData, selectedTemplate, selectedProcessing, accPayload);
                    break;
                case 'large_format':
                    normalized = toLargeFormatInput(formData, masterData, processingItems, accPayload);
                    break;
                default:
                    normalized = toLooseInput(formData, masterData, processingItems, accPayload);
                    break;
            }

            const payload = buildPricingPayload(normalized);
            // Gắn mã sản phẩm để backend kiểm tra whitelist (đồng bộ với báo giá thủ công).
            if (selectedTemplate.code) (payload as any).product_code = selectedTemplate.code;

            const res = await fetch(`${API}/quote/pricing-calc`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload),
            });

            const json = await res.json().catch(() => ({}));
            const norm = readPricingResult(json);

            if (!res.ok) {
                setQuoteResult({ error: `Lỗi ${res.status}`, requiresManualQuote: true, reason: norm.error || 'Không thể tính giá' });
            } else if (norm.requiresManualQuote) {
                setQuoteResult({ requiresManualQuote: true, reason: norm.reason });
            } else if (norm.ok) {
                // Giữ object thô để hiển thị đầy đủ breakdown/leadtime
                setQuoteResult(json);
            } else {
                setQuoteResult({ error: norm.error || 'Lỗi tính giá', requiresManualQuote: true, reason: norm.error });
            }
        } catch (err) {
            if (err instanceof InvalidPayloadError) {
                setQuoteResult({ requiresManualQuote: true, reason: err.message });
            } else {
                setQuoteResult({ error: 'Lỗi mạng', requiresManualQuote: true, reason: 'Không kết nối được server' });
            }
        } finally {
            setIsCalculating(false);
        }
    };

    return {
        quoteResult,
        setQuoteResult,
        isCalculating,
        handleCalculate
    };
}
