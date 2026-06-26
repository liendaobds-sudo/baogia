/**
 * OffsetMethodPlugin — bọc `EngineOffsetService.calculate` thành Plugin_Phương_Pháp.
 *
 * Adapter MỎNG: KHÔNG đổi số học engine offset (Req 6.1, 6.2). Nhiệm vụ:
 *  - Ánh xạ `Specification` (method-agnostic) → một trong 5 input offset theo `quoteType`
 *    ({to_roi, bi_thu_folder, sp_khac, hop_giay, tui_giay}).
 *  - Lấy `tongChuaVAT` của `QuoteResult` làm `priceBeforeVat` (VAT áp một lần ở tầng báo giá).
 *  - Ở chế độ hợp nhất, truyền `vatRate = 0` xuống engine để VAT KHÔNG bị cộng hai lần
 *    (Req 8.4). Route cũ `POST /pricing/offset/calculate` gọi thẳng engine với body gốc nên
 *    hành vi VAT cũ được giữ nguyên — plugin này chỉ phục vụ tầng `/quote/*`.
 *  - Đọc chiết khấu từ cấu hình (`PricingConfigView.discountRate`) thay vì hằng số (Req 7.2);
 *    khi không cung cấp, engine dùng mặc định cấu hình.
 *  - Chuyển lỗi engine (`OffsetPricingError`, thiếu tham số, giá trị ngoài whitelist
 *    `productConfig`) thành `PriceResult { ok: false, unavailableReason }` (Req 5.5).
 *
 * Tự đăng ký vào MethodRegistry khi module khởi tạo (OnModuleInit) — không phụ thuộc
 * wiring module dùng chung, tránh tranh chấp với các plugin khác (Req 6.1).
 *
 * _Requirements: 6.1, 6.2, 5.5, 7.2_
 */
import { Injectable, OnModuleInit } from '@nestjs/common';
import {
    EngineOffsetService,
    OffsetEngineInput,
} from '../../modules/pricing/offset-engine/engine-offset.service';
import { MethodRegistry } from '../method-registry.service';
import {
    MethodId,
    MethodPlugin,
    PriceResult,
    PricingConfigView,
    ProductRef,
    Specification,
} from '../types/method-plugin.types';

/** 5 loại offset mà plugin phục vụ (gợi ý định tuyến từ `quoteType`). */
const OFFSET_QUOTE_TYPES = new Set<string>([
    'to_roi',
    'bi_thu_folder',
    'sp_khac',
    'hop_giay',
    'tui_giay',
]);

@Injectable()
export class OffsetMethodPlugin implements MethodPlugin, OnModuleInit {
    readonly methodId: MethodId = 'offset';

    constructor(
        private readonly engineOffset: EngineOffsetService,
        private readonly registry: MethodRegistry,
    ) {}

    /** Tự đăng ký vào MethodRegistry (Req 6.1). */
    onModuleInit(): void {
        this.registry.register(this);
    }

    /**
     * Offset áp dụng cho đúng 5 loại; câu hỏi "thiếu tham số / ngoài whitelist" được trả lời
     * ở `calculate` (engine ném lỗi → ok:false + lý do), nên `appliesTo` chỉ xét `quoteType`.
     */
    appliesTo(product: ProductRef, _spec: Specification): boolean {
        return !!product && OFFSET_QUOTE_TYPES.has(product.quoteType);
    }

    async calculate(
        product: ProductRef,
        spec: Specification,
        cfg: PricingConfigView,
    ): Promise<PriceResult> {
        if (!this.appliesTo(product, spec)) {
            return this.fail(
                `Phương pháp offset không áp dụng cho loại sản phẩm '${product?.quoteType}'.`,
            );
        }

        let input: OffsetEngineInput;
        try {
            input = this.mapSpecToInput(product, spec, cfg);
        } catch (err) {
            return this.fail(
                err instanceof Error ? err.message : 'Ánh xạ thông số offset thất bại',
            );
        }

        // Engine trả { success, data?, error? }; OffsetPricingError đã được engine bắt → success:false.
        const res = this.engineOffset.calculate(input);
        if (!res.success || !res.data) {
            return this.fail(
                res.error ?? 'Không tính được giá offset cho bộ thông số đã cho',
            );
        }

        const q = res.data;
        const qty = spec.quantity > 0 ? spec.quantity : 1;
        // priceBeforeVat = tongChuaVAT (trước VAT). VAT áp một lần ở tầng báo giá (Req 8).
        const priceBeforeVat = q.tongChuaVAT;

        return {
            ok: true,
            methodId: this.methodId,
            // Offset dựng giá trực tiếp từ bảng chi phí — không tách markup; cost = selling trước VAT.
            costSubtotal: q.tongChuaVAT,
            sellingSubtotal: q.tongChuaVAT,
            // tongChuaVAT là tổng dòng TRƯỚC chiết khấu; chiết khấu offset áp riêng (xem breakdown)
            // nên giữ identity priceBeforeVat = sellingSubtotal - discountAmount với discountAmount = 0.
            discountAmount: 0,
            priceBeforeVat,
            pricePerItem: priceBeforeVat / qty,
            // Giữ nguyên QuoteResult gốc (gồm vat/chietKhau/khachTra/meta) để truy vết & hiển thị.
            breakdown: { ...q },
        };
    }

    /**
     * Ánh xạ `Specification` → 1 trong 5 input offset theo `quoteType`.
     *
     * Tham số riêng theo phương pháp (soMatIn, soKemIn/soMau, vatTuBeMat, khuon, be, mi,
     * dayXach...) lấy từ `spec.attributes`; các trường dùng chung (số lượng, kích thước,
     * giấy, khổ in) ánh xạ từ tầng Thông_Số. `vatRate = 0` (VAT ở tầng báo giá);
     * `chietKhauRate` đọc từ cấu hình khi có (Req 7.2).
     */
    private mapSpecToInput(
        product: ProductRef,
        spec: Specification,
        cfg: PricingConfigView,
    ): OffsetEngineInput {
        const attrs = (spec.attributes ?? {}) as Record<string, unknown>;
        const dims = spec.dimensions ?? {};

        // Nền: tham số riêng method từ attributes; trường dùng chung ghi đè bên dưới.
        const base: Record<string, unknown> = { ...attrs };
        base.type = product.quoteType;
        base.soLuong = spec.quantity;
        if (spec.materialCode != null) base.materialCode = spec.materialCode;
        if (spec.paperSizeCode != null) base.khoIn = spec.paperSizeCode;

        // Chế độ hợp nhất: VAT áp một lần ở tầng báo giá → engine không cộng VAT (Req 8.4).
        base.vatRate = 0;
        // Chiết khấu đọc từ cấu hình (Req 7.2); thiếu → engine dùng mặc định cấu hình.
        if (typeof cfg?.discountRate === 'number') {
            base.chietKhauRate = cfg.discountRate;
        }

        switch (product.quoteType) {
            // Tờ rơi / Bì thư-Folder / SP khác: khổ ĐỘNG dùng rộng×cao (cm); khổ TĨNH dùng
            // `kichThuoc` từ attributes (engine tự phân nhánh theo có/không `kichThuoc`).
            case 'to_roi':
            case 'bi_thu_folder':
            case 'sp_khac':
                if (dims.width != null) base.rong = dims.width;
                if (dims.height != null) base.cao = dims.height;
                break;
            // Hộp giấy / Túi giấy: kích thước khối cao×rộng×hông.
            case 'hop_giay':
            case 'tui_giay':
                if (dims.width != null) base.rong = dims.width;
                if (dims.height != null) base.cao = dims.height;
                if (dims.depth != null) base.hong = dims.depth;
                break;
        }

        return base as unknown as OffsetEngineInput;
    }

    /** Dựng kết quả "không khả dụng" kèm lý do (Req 5.5). */
    private fail(reason: string): PriceResult {
        return {
            ok: false,
            methodId: this.methodId,
            costSubtotal: 0,
            sellingSubtotal: 0,
            discountAmount: 0,
            priceBeforeVat: 0,
            pricePerItem: 0,
            breakdown: {},
            unavailableReason: reason,
        };
    }
}
