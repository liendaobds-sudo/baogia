/**
 * useOffsetPricebook — Hook nạp cấu hình bảng giá Offset MỚI (EngineOffset) và gọi tính giá.
 *
 * FILE ĐỘC LẬP — dùng cho 5 loại sản phẩm offset theo bảng giá Offset v7.2:
 * tờ rơi, bì thư/folder, SP khác, hộp giấy, túi giấy.
 *
 * - GET  /pricing/offset/pricebook  → dropdown (materials, khoIn, fixedSizes, vatTuBeMat, epKim, params...)
 * - POST /pricing/offset/calculate  → QuoteResult (lines + donGia1SP) cho `type` tương ứng
 */
import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '@/lib/api';

export interface OffsetMaterialOpt {
    code: string;
    aliases: string[];
    materialName: string;
    type: string;
    gsm: number | null;
    priceVAT: number;
    sheetWidth: number;
    sheetHeight: number;
}

export interface KhoInOpt {
    khoIn: string;
    khoGiayLon: string;
    soConBaiIn: number;
    soConToLon: number;
    loaiKem: string;
}

export interface Pricebook {
    materials: OffsetMaterialOpt[];
    khoIn: KhoInOpt[];
    fixedSizes: {
        toRoi: { kichThuoc: string; khoIn: string; khoGiayLon: string }[];
        biThuFolder: { kichThuoc: string; khoIn: string; loai: string }[];
    };
    giaCong: { code: string; congDoan: string }[];
    vatTuBeMat: { ten: string; donGiaKg: number; soMat: string | null }[];
    kem: { kemNho: { soKem: number; donGia: number }[]; kemLon: { soKem: number; donGia: number }[]; donGia1Kem: { kemNho: number; kemLon: number } };
    epKim: { tiers: string[]; rows: { viTri: string }[] };
    haoHut: { mocSoLuong: number; tyLe: number }[];
    params: Record<string, number>;
    mocSoLuong: number[];
    phiCoDinh: { code: string; ten: string; giaTri: number }[];
    tuiBaiIn: string[];
    soMauOptions?: number[];
    productConfig?: Record<string, OffsetProductConfig>;
}

/** Cấu hình form theo loại sản phẩm. STRICT: mảng allowed* rỗng/thiếu = KHÔNG hiện mục nào (phải cấu hình mới hiện). */
export interface OffsetProductConfig {
    allowedMaterials?: string[];
    allowedVatTuBeMat?: string[];
    allowedEpKim?: string[];
    allowedKhoIn?: string[];
    allowedKichThuoc?: string[];
    allowedBoxTypes?: string[];
    defaults?: Record<string, string | number | boolean>;
    hidden?: string[];
    locked?: string[];
}

export interface QuoteLine {
    label: string;
    qty?: number;
    unitPrice?: number;
    amount: number;
}

export interface OffsetQuoteResult {
    lines: QuoteLine[];
    tongChuaVAT: number;
    haoHut: number;
    vat: number;
    tongGomVAT: number;
    chietKhau: number;
    khachTra: number;
    donGia1SP: number;
    meta?: OffsetQuoteMeta;
    /** Cảnh báo cấu hình (không chặn tính) từ engine. */
    warnings?: string[];
}

/** Margin_Config (mm) từ Imposition_Service — để preview vẽ vùng in/gripper. */
export interface OffsetMarginConfig {
    left: number;    // mm
    right: number;   // mm
    top: number;     // mm
    bottom: number;  // mm
    gripper: number; // mm — cộng vào MỘT cạnh (cạnh nhíp)
    gutter: number;  // mm — khe giữa các con
}

export interface OffsetQuoteMeta {
    khoBinh?: string;
    khoGiayLon?: string;
    soConBaiIn?: number;
    soConToLon?: number;
    soToLon?: number;
    luotIn?: number;
    soKem?: number;
    loaiKem?: string;
    sheetW?: number;
    sheetH?: number;
    itemW?: number;
    itemH?: number;
    // Imposition thống nhất — parity giá ≡ preview ≡ PDF (Req 2.3, 10.2).
    impositionSource?: 'legacy' | 'unified';
    marginConfig?: OffsetMarginConfig;                                   // mm
    positions?: Array<{ x: number; y: number; w: number; h: number }>;   // mm — vị trí con trên TỜ LỚN để preview
    // Khổ BÀI IN (press sheet) — preview hộp vẽ theo mức này (khớp soConBaiIn dùng cho giá).
    pressW?: number;                                                     // cm — bề rộng khổ bài in
    pressH?: number;                                                     // cm — bề cao khổ bài in
    pressPositions?: Array<{ x: number; y: number; w: number; h: number }>; // mm — vị trí con trên khổ bài in
    pressUsableArea?: { width: number; height: number };                    // mm — vùng in khả dụng khổ bài in
}

export function useOffsetPricebook(token: string | null) {
    const [pricebook, setPricebook] = useState<Pricebook | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        setLoading(true);
        fetch(`${API_URL}/pricing/offset/pricebook`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
            .then((r) => r.json())
            .then((res) => {
                if (!active) return;
                if (res?.success && res.data) setPricebook(res.data as Pricebook);
                else setError('Không tải được bảng giá offset');
            })
            .catch((e) => active && setError(e?.message || 'Lỗi tải bảng giá'))
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [token]);

    const calculate = useCallback(
        async (payload: Record<string, any>): Promise<{ ok: boolean; data?: OffsetQuoteResult; error?: string }> => {
            try {
                const res = await fetch(`${API_URL}/pricing/offset/calculate`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify(payload),
                });
                const json = await res.json();
                if (json?.success) return { ok: true, data: json.data as OffsetQuoteResult };
                return { ok: false, error: json?.error || 'Tính giá thất bại' };
            } catch (e: any) {
                return { ok: false, error: e?.message || 'Lỗi kết nối' };
            }
        },
        [token],
    );

    return { pricebook, loading, error, calculate };
}
