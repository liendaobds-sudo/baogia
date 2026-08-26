/**
 * QuoteController (tầng năng lực — Phase 1) — API Cờ_Năng_Lực sản xuất.
 *
 * LƯU Ý PREFIX: dùng base path `quote-tool` (KHÔNG phải `quote`) để TRÁNH XUNG ĐỘT
 * route với QuoteController CRUD cũ (`modules/quote`, `@Controller('quote')`) — vốn có
 * `GET /quote/:id` sẽ nuốt mất các path tĩnh như `/quote/capabilities`, `/quote/methods`
 * (coi "capabilities"/"methods" là `:id` → query sai → 500). Tách namespace là cách an toàn.
 *
 * Endpoint:
 *  - `GET  /quote-tool/capabilities`            → liệt kê toàn bộ cờ + tập Phương_Pháp_Khả_Dụng
 *  - `PUT  /quote-tool/capabilities/:methodId`  → admin bật/tắt một phương pháp cho Đơn_Vị
 *
 * Endpoint Cổng tạo báo giá hợp nhất (Phase 2):
 *  - `GET  /quote-tool/methods?productCode=`    → phương pháp KHẢ DỤNG ∩ ÁP DỤNG ĐƯỢC cho 1 sản phẩm
 *  - `POST /quote-tool/calculate`               → định tuyến tính giá 1 phương pháp qua MethodRegistry
 *
 * Endpoint So sánh giá đa phương pháp (Phase 4):
 *  - `POST /quote-tool/compare`                 → bảng so sánh + Điểm_Hoà_Vốn + VAT cấp báo giá
 *
 * Ánh xạ lỗi: {@link LastEnabledMethodError} → HTTP 409 (ConflictException) với thông
 * báo rõ ràng khi cố tắt phương pháp khả dụng cuối cùng của Đơn_Vị đang vận hành (Req 1.6).
 *
 * Bảo vệ: yêu cầu JWT (đồng nhất với QuoteController hiện hữu). Việc bật/tắt là thao tác
 * cấu hình của quản trị, nên không để trống xác thực.
 *
 * _Requirements: 1.2, 1.3, 1.6, 1.8, 2.1, 4.3, 4.6, 4.7, 6.1, 5.1, 5.2, 5.3, 5.5, 5.6, 8.3_
 */
import {
    Body,
    ConflictException,
    Controller,
    ForbiddenException,
    Get,
    NotFoundException,
    Param,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles, RolesGuard } from '../modules/auth/roles.guard';
import { UserRole } from '../entities';
import {
    CapabilityService,
    DEFAULT_UNIT_ID,
    LastEnabledMethodError,
} from './capability.service';
import { MethodRegistry } from './method-registry.service';
import { ComparatorService } from './comparator.service';
import { applyQuoteVat, QuoteVatLine, QuoteVatResult } from './vat';
import { ProductsService } from '../modules/pricing/services/products.service';
import { SetCapabilityDto } from './dto/set-capability.dto';
import { CalculateQuoteDto } from './dto/calculate-quote.dto';
import { CompareQuoteDto } from './dto/compare-quote.dto';
import {
    MethodId,
    ProductRef,
    Specification,
} from './types/method-plugin.types';

@Controller('quote-tool')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class QuoteController {
    constructor(
        private readonly capabilityService: CapabilityService,
        private readonly methodRegistry: MethodRegistry,
        private readonly comparatorService: ComparatorService,
        private readonly productsService: ProductsService,
    ) {}

    /**
     * Liệt kê Cờ_Năng_Lực của Đơn_Vị: toàn bộ cờ (`flags`), tập phương pháp đang khả dụng
     * (`enabledMethods`) và danh sách phương pháp đã đăng ký trong registry (`registeredMethods`).
     * (Req 2.1 — nguồn dữ liệu cho IA frontend lọc menu/route.)
     */
    @Get('capabilities')
    async getCapabilities(@Query('unitId') unitId?: string) {
        const resolvedUnitId = unitId?.trim() || DEFAULT_UNIT_ID;
        // enabledMethods phân giải theo TENANT hiện hành (Req 4.6, 3.2 — bỏ qua unitId client).
        // Thiếu tenant context → baseline. flags giữ nguồn unitId cũ cho tương thích hiển thị.
        const [flags, enabledMethods] = await Promise.all([
            this.capabilityService.listFlags(resolvedUnitId),
            this.capabilityService.resolveEnabledMethods(),
        ]);

        return {
            unitId: resolvedUnitId,
            enabledMethods,
            registeredMethods: this.methodRegistry.listMethodIds(),
            flags: flags.map((f) => ({
                methodId: f.methodId,
                enabled: f.enabled,
                updatedAt: f.updatedAt,
            })),
        };
    }

    /**
     * Bật/tắt một Phương_Pháp_In cho Đơn_Vị (Req 1.2, 1.3).
     * Trả 409 khi vi phạm ràng buộc "phương pháp khả dụng cuối cùng" (Req 1.6).
     */
    // Audit 2026-07-25: route này trước CHỈ có AuthGuard('jwt') ⇒ bất kỳ user đăng nhập nào
    // (kể cả viewer) cũng bật/tắt được Phương_Pháp_In của cả đơn vị — tức ẩn/hiện menu và
    // chặn cả đường tính giá. Đây là thao tác cấu hình quản trị ⇒ giới hạn ADMIN/SUPER_ADMIN,
    // đối xứng với cùng thao tác ở `super-admin.controller`.
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    @Put('capabilities/:methodId')
    async setCapability(
        @Param('methodId') methodId: MethodId,
        @Body() dto: SetCapabilityDto,
    ) {
        const resolvedUnitId = dto.unitId?.trim() || DEFAULT_UNIT_ID;
        try {
            const saved = await this.capabilityService.setFlag(
                resolvedUnitId,
                methodId,
                dto.enabled,
            );
            return {
                unitId: saved.unitId,
                methodId: saved.methodId,
                enabled: saved.enabled,
                updatedAt: saved.updatedAt,
            };
        } catch (err) {
            if (err instanceof LastEnabledMethodError) {
                // Ràng buộc nghiệp vụ: không thể tắt phương pháp khả dụng cuối cùng (Req 1.6).
                throw new ConflictException(err.message);
            }
            throw err;
        }
    }

    /**
     * Liệt kê các Phương_Pháp_In có thể dùng để báo giá cho một sản phẩm:
     * giao của (KHẢ DỤNG theo Cờ_Năng_Lực) và (ÁP DỤNG ĐƯỢC theo `registry.appliesTo`).
     *
     * Nguồn dữ liệu định tuyến Cổng_Tạo_Báo_Giá (Req 4.3, 4.4): 0 ⇒ không có phương pháp,
     * 1 ⇒ vào thẳng Configurator, ≥2 ⇒ bắt chọn/so sánh. Chỉ trình phương pháp thuộc
     * tập Phương_Pháp_Khả_Dụng (Req 4.7).
     */
    @Get('methods')
    async getMethodsForProduct(
        @Query('productCode') productCode?: string,
        @Query('unitId') unitId?: string,
    ) {
        const product = await this.resolveProductRef(productCode);
        const resolvedUnitId = unitId?.trim() || DEFAULT_UNIT_ID;

        // Phân giải theo TENANT hiện hành (bỏ qua unitId client — Req 4.6, 3.2).
        const enabledMethods = await this.capabilityService.resolveEnabledMethods();
        // Spec tối thiểu để hỏi `appliesTo` (plugin chỉ xét quoteType ở bước này).
        const probeSpec: Specification = { quantity: 1 };

        const applicableMethods = enabledMethods.filter((methodId) => {
            // Chỉ xét phương pháp đã đăng ký trong registry; bỏ qua phương pháp khả dụng
            // nhưng chưa có plugin (không thể tính giá).
            if (!this.methodRegistry.listMethodIds().includes(methodId)) {
                return false;
            }
            try {
                return this.methodRegistry.appliesTo(methodId, product, probeSpec);
            } catch {
                return false;
            }
        });

        return {
            unitId: resolvedUnitId,
            product,
            enabledMethods,
            applicableMethods,
        };
    }

    /**
     * Định tuyến tính giá một Phương_Pháp_In qua MethodRegistry (Req 4.6, 6.1).
     *
     * Trình tự: phân giải sản phẩm → chặn phương pháp KHÔNG khả dụng (Req 4.7) → kiểm tra
     * áp dụng được → gọi plugin. Trả `PriceResult` (gồm `priceBeforeVat`; VAT áp ở tầng
     * báo giá — Req 8).
     */
    @Post('calculate')
    async calculate(@Body() dto: CalculateQuoteDto) {
        const resolvedUnitId = dto.unitId?.trim() || DEFAULT_UNIT_ID;
        const product = await this.resolveProductRef(
            dto.productCode,
            dto.quoteType,
        );

        // Chặn truy cập phương pháp không khả dụng TRƯỚC khi gọi plugin (Req 4.7, 4.6).
        // Phân giải theo TENANT hiện hành (bỏ qua unitId client — Req 3.2); thiếu context → baseline.
        const enabledMethods = await this.capabilityService.resolveEnabledMethods();
        if (!enabledMethods.includes(dto.methodId)) {
            throw new ForbiddenException(
                `Phương pháp in '${dto.methodId}' không khả dụng cho đơn vị của bạn.`,
            );
        }

        // Phương pháp phải đăng ký trong registry (ném MethodNotRegisteredError nếu không).
        const plugin = this.methodRegistry.getPlugin(dto.methodId);

        const spec = dto.spec as unknown as Specification;
        if (!plugin.appliesTo(product, spec)) {
            throw new ForbiddenException(
                `Phương_Pháp_In '${dto.methodId}' không áp dụng cho sản phẩm '${product.code}' (quoteType '${product.quoteType}').`,
            );
        }

        const result = await plugin.calculate(product, spec, dto.config ?? {});
        return result;
    }

    /**
     * So sánh giá đa Phương_Pháp_In trên CÙNG một bộ Thông_Số + dò Điểm_Hoà_Vốn + VAT
     * cấp báo giá (Req 5.1–5.6, 8.3).
     *
     * Trình tự:
     *  1. Phân giải sản phẩm từ catalog hợp nhất.
     *  2. Xác định tập ứng viên = (KHẢ DỤNG theo Cờ_Năng_Lực) ∩ (đã đăng ký registry);
     *     nếu caller chỉ định `methods`, lọc thêm theo danh sách đó (vẫn chỉ trong tập
     *     khả dụng — Req 4.7).
     *  3. {@link ComparatorService.compare}: bảng so sánh, đánh dấu phương pháp rẻ hơn,
     *     loại phương pháp không tính được giá kèm lý do; nếu chỉ 1 phương pháp áp dụng
     *     được ⇒ Giá đơn, không bảng (Req 5.2, 5.5, 5.6).
     *  4. Khi có dải số lượng (`quantities` / `quantityRange`), dò Điểm_Hoà_Vốn cho từng
     *     cặp phương pháp tính được giá (Req 5.3).
     *  5. Áp VAT cấp báo giá MỘT LẦN trên dòng được chọn (phương pháp rẻ hơn) và tính kèm
     *     VAT cho từng phương pháp để UI hiển thị (Req 8.3) — VAT không cộng chồng VAT.
     */
    @Post('compare')
    async compare(@Body() dto: CompareQuoteDto) {
        const resolvedUnitId = dto.unitId?.trim() || DEFAULT_UNIT_ID;
        const product = await this.resolveProductRef(
            dto.productCode,
            dto.quoteType,
        );

        // Tập ứng viên: chỉ phương pháp KHẢ DỤNG và ĐÃ ĐĂNG KÝ registry (Req 4.7).
        // Phân giải theo TENANT hiện hành (bỏ qua unitId client — Req 4.6, 3.2).
        const enabledMethods = await this.capabilityService.resolveEnabledMethods();
        const registered = this.methodRegistry.listMethodIds();
        let candidateMethods = enabledMethods.filter((m) =>
            registered.includes(m),
        );
        // Nếu caller chỉ định danh sách, giữ giao với tập khả dụng (không vượt quyền).
        if (dto.methods && dto.methods.length > 0) {
            const requested = new Set(dto.methods);
            candidateMethods = candidateMethods.filter((m) => requested.has(m));
        }

        const spec = dto.spec as unknown as Specification;
        const cfg = dto.config ?? {};

        const comparison = await this.comparatorService.compare(
            product,
            spec,
            candidateMethods,
            cfg,
        );

        // VAT cấp báo giá: áp MỘT LẦN trên dòng được chọn (phương pháp rẻ hơn) (Req 8.3, 8.4).
        const vatRatePercent = dto.vat_rate ?? 0;
        const chosenLines: QuoteVatLine[] = comparison.cheapest
            ? [{ priceBeforeVat: comparison.cheapest.priceBeforeVat }]
            : [];
        const vat: QuoteVatResult = applyQuoteVat(chosenLines, vatRatePercent);

        // VAT theo từng phương pháp (cùng vat_rate) để UI hiển thị tổng có VAT mỗi lựa chọn.
        const resultsWithVat = comparison.results.map((r) => ({
            ...r,
            isCheapest: r.methodId === comparison.cheapestMethodId,
            vat: applyQuoteVat([{ priceBeforeVat: r.priceBeforeVat }], vatRatePercent),
        }));

        // Điểm_Hoà_Vốn cho từng cặp phương pháp tính được giá, khi có dải số lượng (Req 5.3).
        const quantities = this.buildBreakEvenQuantities(dto);
        let breakEven: Awaited<
            ReturnType<ComparatorService['findBreakEven']>
        >[] = [];
        if (quantities.length >= 2 && comparison.results.length >= 2) {
            const methodIds = comparison.results.map((r) => r.methodId);
            for (let i = 0; i < methodIds.length; i++) {
                for (let j = i + 1; j < methodIds.length; j++) {
                    breakEven.push(
                        await this.comparatorService.findBreakEven(
                            product,
                            spec,
                            methodIds[i],
                            methodIds[j],
                            quantities,
                            cfg,
                        ),
                    );
                }
            }
        }

        return {
            unitId: resolvedUnitId,
            product,
            quantity: comparison.quantity,
            vatRatePercent: vat.vatRatePercent,
            comparison: {
                mode: comparison.mode,
                cheapestMethodId: comparison.cheapestMethodId,
                results: resultsWithVat,
                excluded: comparison.excluded,
            },
            // VAT áp một lần trên dòng được chọn (phương pháp rẻ hơn) (Req 8.3).
            vat,
            breakEven,
        };
    }

    /**
     * Dựng dải số lượng dò Điểm_Hoà_Vốn từ DTO. Ưu tiên `quantities` tường minh; nếu không
     * có thì sinh từ `quantityRange` [min, max] với `step` (mặc định suy ra ~20 mẫu, luôn
     * bao gồm `max`). Trả mảng rỗng khi không cung cấp dải nào.
     */
    private buildBreakEvenQuantities(dto: CompareQuoteDto): number[] {
        if (dto.quantities && dto.quantities.length > 0) {
            return dto.quantities;
        }
        const range = dto.quantityRange;
        if (!range) {
            return [];
        }
        const min = Math.max(1, Math.floor(range.min));
        const max = Math.max(min, Math.floor(range.max));
        if (max === min) {
            return [min];
        }
        const step =
            range.step && range.step > 0
                ? Math.floor(range.step)
                : Math.max(1, Math.floor((max - min) / 20));
        const quantities: number[] = [];
        for (let q = min; q <= max; q += step) {
            quantities.push(q);
        }
        // Đảm bảo cận trên luôn được lấy mẫu.
        if (quantities[quantities.length - 1] !== max) {
            quantities.push(max);
        }
        return quantities;
    }

    /**
     * Phân giải `productCode` → {@link ProductRef} method-agnostic từ catalog hợp nhất.
     * `quoteType` lấy từ `unified_products` (một nguồn sự thật); cho phép ghi đè tuỳ chọn.
     * @throws NotFoundException khi không có sản phẩm khớp mã.
     */
    private async resolveProductRef(
        productCode?: string,
        quoteTypeOverride?: string,
    ): Promise<ProductRef> {
        const code = productCode?.trim();
        if (!code) {
            throw new NotFoundException('Thiếu mã sản phẩm (productCode).');
        }
        const product = await this.productsService.getTemplateByCode(code);
        if (!product) {
            throw new NotFoundException(
                `Không tìm thấy sản phẩm với mã '${code}'.`,
            );
        }
        return {
            code: product.code,
            quoteType: quoteTypeOverride?.trim() || product.quoteType || 'loose',
        };
    }
}
