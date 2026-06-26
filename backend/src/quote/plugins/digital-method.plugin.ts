/**
 * DigitalMethodPlugin — Plugin_Phương_Pháp cho In_Nhanh (digital).
 *
 * Bọc `PricingFacadeService.calculatePrice` thành hợp đồng `MethodPlugin`
 * method-agnostic. Đây là *adapter mỏng*: KHÔNG đổi số học markup/giá vốn của
 * facade (Req 6.1, 6.2). Plugin chỉ:
 *   1. Ánh xạ `Specification` → `CalculatePriceInput` của facade.
 *   2. Lấy `selling_subtotal` (sau markup, TRƯỚC VAT) và `cost_subtotal` từ facade.
 *   3. Áp Chiết_Khấu đọc từ cấu hình (key `discount_rate`, đơn vị %), KHÔNG đụng VAT.
 *   4. Trả `priceBeforeVat = selling_subtotal − discountAmount` để tầng báo giá
 *      áp VAT đúng một lần (Req 8.4) — tránh VAT chồng VAT.
 *
 * `appliesTo`: digital phục vụ `quoteType ∈ {loose, bound, large_format}`.
 *
 * Đăng ký: tự đăng ký vào `MethodRegistry` khi module khởi tạo (OnModuleInit).
 *
 * _Requirements: 6.1, 6.2, 7.2, 8.4_
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PricingFacadeService } from '../../modules/pricing/services/pricing-facade.service';
import { PricingService } from '../../modules/pricing/pricing.service';
import { MethodRegistry } from '../method-registry.service';
import {
    MethodId,
    MethodPlugin,
    PriceResult,
    PricingConfigView,
    ProductRef,
    Specification,
} from '../types/method-plugin.types';

/** Các `quoteType` mà phương pháp In_Nhanh phục vụ (qua facade digital). */
const DIGITAL_QUOTE_TYPES = ['loose', 'bound', 'large_format'] as const;

/** Parse một giá trị code/số về number; trả `undefined` nếu không phải số hợp lệ. */
function toNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

@Injectable()
export class DigitalMethodPlugin implements MethodPlugin, OnModuleInit {
    readonly methodId: MethodId = 'digital';

    private readonly logger = new Logger(DigitalMethodPlugin.name);

    constructor(
        private readonly registry: MethodRegistry,
        private readonly facade: PricingFacadeService,
        private readonly pricing: PricingService,
    ) {}

    /** Tự đăng ký vào MethodRegistry khi module khởi tạo (Req 1.5, 3.6). */
    onModuleInit(): void {
        this.registry.register(this);
    }

    /** Digital áp dụng cho loose | bound | large_format (Req 5.1). */
    appliesTo(product: ProductRef, _spec: Specification): boolean {
        return (DIGITAL_QUOTE_TYPES as readonly string[]).includes(
            product.quoteType,
        );
    }

    /**
     * Tính giá bằng cách bọc facade digital, KHÔNG đổi số học markup/giá vốn.
     * Tách VAT ra: chỉ dùng `selling_subtotal`/`cost_subtotal`; VAT do tầng báo giá áp.
     */
    async calculate(
        product: ProductRef,
        spec: Specification,
        cfg: PricingConfigView,
    ): Promise<PriceResult> {
        const fail = (reason: string): PriceResult => ({
            ok: false,
            methodId: this.methodId,
            costSubtotal: 0,
            sellingSubtotal: 0,
            discountAmount: 0,
            priceBeforeVat: 0,
            pricePerItem: 0,
            breakdown: {},
            unavailableReason: reason,
        });

        if (!this.appliesTo(product, spec)) {
            return fail(
                `Phương pháp In_Nhanh không phục vụ quoteType '${product.quoteType}'.`,
            );
        }

        const input = this.mapToCalculatePriceInput(product, spec);

        let result: any;
        try {
            result = await this.facade.calculatePrice(input);
        } catch (error: unknown) {
            const msg =
                error instanceof Error ? error.message : 'Lỗi khi tính giá In_Nhanh';
            this.logger.error(`calculatePrice error: ${msg}`);
            return fail(msg);
        }

        if (!result?.success || !result.data) {
            return fail(result?.error || 'Không tính được giá In_Nhanh');
        }

        const data = result.data;
        // selling_subtotal: sau markup, TRƯỚC VAT (facade tính, plugin không đổi số học).
        const sellingSubtotal = Number(data.selling_subtotal ?? data.total ?? 0);
        const costSubtotal = Number(data.cost_subtotal ?? data.subtotal ?? 0);

        // Chiết_Khấu đọc từ cấu hình (key `discount_rate`, %), cho phép cfg ghi đè (Req 7.2).
        const discountPercent = await this.resolveDiscountPercent(cfg);
        const discountAmount = Math.round((sellingSubtotal * discountPercent) / 100);
        const priceBeforeVat = sellingSubtotal - discountAmount;

        const quantity = spec.quantity > 0 ? spec.quantity : 1;
        const pricePerItem =
            quantity > 0 ? Math.round(priceBeforeVat / quantity) : 0;

        return {
            ok: true,
            methodId: this.methodId,
            costSubtotal,
            sellingSubtotal,
            discountAmount,
            priceBeforeVat,
            pricePerItem,
            breakdown: {
                // Giữ nguyên breakdown gốc của facade để truy vết; loại các trường VAT
                // (VAT áp ở tầng báo giá — Req 8.4).
                ...(data.breakdown ?? {}),
                facade_type: data.type,
                material_cost: data.material_cost,
                processing_cost: data.processing_cost,
                accessories_cost: data.accessories_cost,
                processing_details: data.processing_details,
                accessories_details: data.accessories_details,
                discount_percent: discountPercent,
            },
        };
    }

    /**
     * Đọc % Chiết_Khấu: ưu tiên `cfg.discountRate` (caller cung cấp), nếu không
     * thì đọc key `discount_rate` từ cấu hình giá; mặc định 0 (Req 7.2, 7.4).
     */
    private async resolveDiscountPercent(cfg: PricingConfigView): Promise<number> {
        if (cfg?.discountRate !== undefined && Number.isFinite(cfg.discountRate)) {
            return cfg.discountRate as number;
        }
        const config = await this.pricing.getPricingConfig();
        const fromConfig = parseFloat(config['discount_rate'] ?? '0');
        return Number.isFinite(fromConfig) ? fromConfig : 0;
    }

    /**
     * Ánh xạ `Specification` (method-agnostic) → `CalculatePriceInput` của facade.
     * `attributes` mang tham số riêng method (print_side, print_type, shape, gap...)
     * và được trải trước, các trường core của Specification ghi đè sau.
     */
    private mapToCalculatePriceInput(
        product: ProductRef,
        spec: Specification,
    ): Record<string, unknown> {
        const input: Record<string, unknown> = { ...(spec.attributes ?? {}) };

        input.type = product.quoteType;
        input.quantity = spec.quantity;

        const materialId = toNumber(spec.materialCode);
        if (materialId !== undefined) input.material_id = materialId;

        const paperSizeId = toNumber(spec.paperSizeCode);
        if (paperSizeId !== undefined) input.paper_size_id = paperSizeId;

        const width = spec.dimensions?.width;
        if (width !== undefined) {
            input.item_width = width; // loose/bound
            input.width = width; // large_format
        }
        const height = spec.dimensions?.height;
        if (height !== undefined) {
            input.item_height = height;
            input.height = height;
        }

        if (spec.processing?.length) {
            input.processing = spec.processing.map((p) => ({
                id: toNumber(p.code) ?? 0,
                code: p.code,
                side: p.side,
            }));
        }

        if (spec.accessories?.length) {
            input.accessories = spec.accessories;
        }

        return input;
    }
}
