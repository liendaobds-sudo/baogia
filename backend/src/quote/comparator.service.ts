/**
 * ComparatorService — Bộ_So_Sánh_Giá đa Phương_Pháp_In (Phase 4).
 *
 * Tính Giá theo nhiều Phương_Pháp_In trên **cùng một bộ Thông_Số** (Req 5.4), chọn
 * phương pháp có `priceBeforeVat` nhỏ nhất (Req 5.2), loại phương pháp không tính được
 * giá kèm lý do nhưng vẫn giữ phần còn lại (Req 5.5), và nếu chỉ một phương pháp áp dụng
 * được thì trả Giá đơn — không bảng so sánh (Req 5.6).
 *
 * Nguyên tắc: dùng đúng một `Specification` cho mọi phương pháp; không thay đổi Thông_Số
 * giữa các phương pháp. Mỗi phương pháp được tính qua {@link MethodRegistry} → plugin bọc
 * engine hiện hữu (KHÔNG đổi số học — Req 6.1).
 *
 * Ngoài so sánh tại một số lượng, service còn dò Điểm_Hoà_Vốn `q*` trên một dải số
 * lượng cho một cặp Phương_Pháp_In (task 10.4): tính lại `priceBeforeVat` của từng
 * phương pháp trên cùng một Thông_Số, chỉ thay đổi `quantity`, rồi giao phần dò đảo
 * chiều cho hàm thuần {@link detectBreakEven}. Báo "không có điểm hoà vốn" khi không
 * đảo chiều trong dải (Req 5.3).
 *
 * Lưu ý phạm vi: service KHÔNG áp VAT cấp báo giá (task 10.6 — xem `vat.ts`).
 * Plugin trả `priceBeforeVat`; VAT áp một lần ở tầng báo giá (Req 8).
 *
 * _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
 */
import { Injectable } from '@nestjs/common';
import {
    BreakEvenPoint,
    PairPriceSample,
    detectBreakEven,
} from './break-even';
import { MethodRegistry } from './method-registry.service';
import {
    MethodId,
    PriceResult,
    PricingConfigView,
    ProductRef,
    Specification,
} from './types/method-plugin.types';

/** Một Phương_Pháp_In bị loại khỏi so sánh kèm lý do không khả dụng (Req 5.5). */
export interface ExcludedMethod {
    methodId: MethodId;
    reason: string;
}

/** Chế độ kết quả so sánh. */
export type ComparisonMode = 'none' | 'single' | 'comparison';

/**
 * Kết quả của Bộ_So_Sánh_Giá cho một Sản_Phẩm + một bộ Thông_Số + một số lượng.
 *
 * - `mode='none'`    : không có phương pháp nào tính được giá.
 * - `mode='single'`  : đúng một phương pháp tính được giá ⇒ trả Giá đơn, không bảng (Req 5.6).
 * - `mode='comparison'`: ≥2 phương pháp tính được giá ⇒ bảng so sánh, đánh dấu rẻ hơn (Req 5.2).
 */
export interface ComparisonResult {
    mode: ComparisonMode;
    product: ProductRef;
    /** Số lượng đang xét (lấy từ Thông_Số dùng chung — Req 5.4). */
    quantity: number;
    /** Các kết quả tính được giá (ok=true), sắp xếp theo `priceBeforeVat` tăng dần. */
    results: PriceResult[];
    /** Phương pháp rẻ hơn (priceBeforeVat nhỏ nhất); undefined khi `mode='none'` (Req 5.2). */
    cheapestMethodId?: MethodId;
    /** Giá của phương pháp rẻ hơn; undefined khi `mode='none'`. */
    cheapest?: PriceResult;
    /** Phương pháp bị loại (appliesTo=false / ok=false / lỗi tính) kèm lý do (Req 5.5). */
    excluded: ExcludedMethod[];
}

/** Mẫu giá của một cặp Phương_Pháp_In tại một số lượng (dùng cho dò điểm hoà vốn). */
export interface BreakEvenSample {
    quantity: number;
    /** priceBeforeVat của phương pháp A; null khi không tính được giá tại số lượng này. */
    priceA: number | null;
    /** priceBeforeVat của phương pháp B; null khi không tính được giá tại số lượng này. */
    priceB: number | null;
    /** Phương pháp rẻ hơn tại số lượng này; null khi bằng giá hoặc thiếu giá. */
    cheaperMethodId: MethodId | null;
}

/**
 * Kết quả dò Điểm_Hoà_Vốn trên một dải số lượng cho một cặp Phương_Pháp_In (Req 5.3).
 *
 * - `hasBreakEven=true`  : thứ tự rẻ-hơn đảo chiều trong dải ⇒ `breakEven.quantity = q*`.
 * - `hasBreakEven=false` : không đảo chiều (hoặc thiếu dữ liệu) ⇒ `message` nêu lý do
 *   ("không có điểm hoà vốn").
 */
export interface BreakEvenResult {
    product: ProductRef;
    methodA: MethodId;
    methodB: MethodId;
    hasBreakEven: boolean;
    /** Điểm_Hoà_Vốn khi `hasBreakEven=true`. */
    breakEven?: BreakEvenPoint;
    /** Lý do khi không có điểm hoà vốn / thiếu dữ liệu (Req 5.3). */
    message?: string;
    /** Mẫu giá theo từng số lượng đã xét (để UI vẽ đường giá / kiểm tra). */
    samples: BreakEvenSample[];
}

@Injectable()
export class ComparatorService {
    constructor(private readonly methodRegistry: MethodRegistry) {}

    /**
     * So sánh Giá của các Phương_Pháp_In ứng viên trên cùng một bộ Thông_Số.
     *
     * @param product          Sản_Phẩm method-agnostic.
     * @param spec             Một bộ Thông_Số dùng chung cho MỌI phương pháp (Req 5.4).
     * @param candidateMethods Tập phương pháp KHẢ DỤNG (đã lọc theo Cờ_Năng_Lực) cần xét.
     * @param cfg              Tham số giá đọc/ghi đè từ cấu hình (Req 7); mặc định rỗng.
     */
    async compare(
        product: ProductRef,
        spec: Specification,
        candidateMethods: MethodId[],
        cfg: PricingConfigView = {},
    ): Promise<ComparisonResult> {
        const results: PriceResult[] = [];
        const excluded: ExcludedMethod[] = [];

        // Khử trùng lặp để không tính một phương pháp hai lần.
        const uniqueMethods = Array.from(new Set(candidateMethods));

        for (const methodId of uniqueMethods) {
            await this.evaluateMethod(methodId, product, spec, cfg, results, excluded);
        }

        // Chọn phương pháp rẻ hơn: priceBeforeVat nhỏ nhất, dùng CÙNG bộ Thông_Số (Req 5.2, 5.4).
        results.sort((a, b) => a.priceBeforeVat - b.priceBeforeVat);

        // Chế độ kết quả theo số phương pháp tính được giá (Req 5.6):
        // 0 ⇒ none; 1 ⇒ single (không bảng so sánh); ≥2 ⇒ comparison.
        let mode: ComparisonMode = 'none';
        if (results.length === 1) {
            mode = 'single';
        } else if (results.length >= 2) {
            mode = 'comparison';
        }

        const cheapest = results.length > 0 ? results[0] : undefined;

        return {
            mode,
            product,
            quantity: spec.quantity,
            results,
            cheapestMethodId: cheapest?.methodId,
            cheapest,
            excluded,
        };
    }

    /**
     * Dò Điểm_Hoà_Vốn `q*` trên một dải số lượng cho một cặp Phương_Pháp_In (Req 5.3 — task 10.4).
     *
     * Tính lại `priceBeforeVat` của cả hai phương pháp trên **cùng một bộ Thông_Số**, chỉ
     * thay đổi `quantity` theo từng giá trị trong dải; số lượng nào một phương pháp không
     * tính được giá sẽ bị loại khỏi phân tích đảo chiều (giá = null). Sau đó giao việc dò
     * đảo chiều cho hàm thuần {@link detectBreakEven}. Báo "không có điểm hoà vốn" khi
     * không có đảo chiều trong dải.
     *
     * @param product    Sản_Phẩm method-agnostic.
     * @param spec       Bộ Thông_Số nền (mọi trường trừ `quantity` giữ nguyên cho mọi mẫu).
     * @param methodA    Phương_Pháp_In thứ nhất của cặp.
     * @param methodB    Phương_Pháp_In thứ hai của cặp.
     * @param quantities Dải số lượng cần xét (sẽ được khử trùng lặp, lọc số dương, sắp tăng dần).
     * @param cfg        Tham số giá đọc/ghi đè từ cấu hình (Req 7); mặc định rỗng.
     */
    async findBreakEven(
        product: ProductRef,
        spec: Specification,
        methodA: MethodId,
        methodB: MethodId,
        quantities: number[],
        cfg: PricingConfigView = {},
    ): Promise<BreakEvenResult> {
        // Chuẩn hoá dải số lượng: chỉ số nguyên dương, khử trùng lặp, sắp xếp tăng dần.
        const normalizedQuantities = Array.from(
            new Set(
                (quantities ?? []).filter(
                    (q) => Number.isFinite(q) && q > 0 && Number.isInteger(q),
                ),
            ),
        ).sort((a, b) => a - b);

        const samples: BreakEvenSample[] = [];
        for (const quantity of normalizedQuantities) {
            // CÙNG một Thông_Số, CHỈ thay đổi số lượng (Req 5.4).
            const specAtQ: Specification = { ...spec, quantity };
            const priceA = await this.priceBeforeVatOf(methodA, product, specAtQ, cfg);
            const priceB = await this.priceBeforeVatOf(methodB, product, specAtQ, cfg);

            let cheaperMethodId: MethodId | null = null;
            if (priceA !== null && priceB !== null) {
                if (priceA < priceB) cheaperMethodId = methodA;
                else if (priceB < priceA) cheaperMethodId = methodB;
            }

            samples.push({ quantity, priceA, priceB, cheaperMethodId });
        }

        const pairSamples: PairPriceSample[] = samples.map((s) => ({
            quantity: s.quantity,
            priceA: s.priceA,
            priceB: s.priceB,
        }));

        const analysis = detectBreakEven(methodA, methodB, pairSamples);

        return {
            product,
            methodA,
            methodB,
            hasBreakEven: analysis.hasBreakEven,
            breakEven: analysis.breakEven,
            message: analysis.message,
            samples,
        };
    }

    /**
     * Tính `priceBeforeVat` của một Phương_Pháp_In cho một bộ Thông_Số; trả `null` nếu
     * phương pháp không áp dụng được, không tính được giá, chưa đăng ký, hoặc engine ném lỗi.
     * Không ném — để việc dò điểm hoà vốn vẫn tiếp tục trên các số lượng/phương pháp còn lại.
     */
    private async priceBeforeVatOf(
        methodId: MethodId,
        product: ProductRef,
        spec: Specification,
        cfg: PricingConfigView,
    ): Promise<number | null> {
        try {
            const plugin = this.methodRegistry.getPlugin(methodId);
            if (!plugin.appliesTo(product, spec)) {
                return null;
            }
            const result = await plugin.calculate(product, spec, cfg);
            if (!result.ok || !Number.isFinite(result.priceBeforeVat)) {
                return null;
            }
            return result.priceBeforeVat;
        } catch {
            return null;
        }
    }

    /**
     * Tính giá một phương pháp và phân loại vào `results` (ok) hoặc `excluded` (Req 5.5).
     * Không ném: mọi lỗi (chưa đăng ký, appliesTo=false, ok=false, exception) ⇒ loại kèm lý do,
     * để các phương pháp còn lại vẫn được so sánh.
     */
    private async evaluateMethod(
        methodId: MethodId,
        product: ProductRef,
        spec: Specification,
        cfg: PricingConfigView,
        results: PriceResult[],
        excluded: ExcludedMethod[],
    ): Promise<void> {
        try {
            const plugin = this.methodRegistry.getPlugin(methodId);

            // Phương pháp không áp dụng được cho Sản_Phẩm + Thông_Số ⇒ loại kèm lý do (Req 5.5).
            if (!plugin.appliesTo(product, spec)) {
                excluded.push({
                    methodId,
                    reason: `Phương_Pháp_In '${methodId}' không áp dụng cho sản phẩm '${product.code}' (quoteType '${product.quoteType}').`,
                });
                return;
            }

            const result = await plugin.calculate(product, spec, cfg);

            if (!result.ok) {
                // Plugin không tính được giá cho bộ Thông_Số đã cho (Req 5.5).
                excluded.push({
                    methodId,
                    reason:
                        result.unavailableReason ??
                        `Phương_Pháp_In '${methodId}' không tính được giá cho bộ Thông_Số đã cho.`,
                });
                return;
            }

            results.push(result);
        } catch (err) {
            // Phương pháp chưa đăng ký hoặc lỗi tính giá bất ngờ ⇒ loại kèm lý do, vẫn giữ phần còn lại.
            excluded.push({
                methodId,
                reason:
                    err instanceof Error
                        ? err.message
                        : `Lỗi không xác định khi tính giá Phương_Pháp_In '${methodId}'.`,
            });
        }
    }
}
