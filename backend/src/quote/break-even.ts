/**
 * Dò Điểm_Hoà_Vốn (break-even) giữa hai Phương_Pháp_In — Công_Cụ_Báo_Giá hợp nhất (Phase 4).
 *
 * Điểm_Hoà_Vốn `q*` là mức **số lượng** mà tại đó chi phí (giá trước VAT) của hai
 * Phương_Pháp_In bằng nhau; dưới mức này một phương pháp rẻ hơn, trên mức này phương
 * pháp kia rẻ hơn (Req 5.3). Tài liệu thiết kế (Property 11) phát biểu: với hai hàm
 * chi phí theo số lượng đơn điệu không giảm trên một dải, nếu thứ tự rẻ-hơn-đắt-hơn
 * **đảo chiều** trong dải thì báo cáo một `q*` sao cho tại số lượng < `q*` một phương
 * pháp rẻ hơn và tại số lượng > `q*` phương pháp kia rẻ hơn; nếu **không đảo chiều**
 * thì báo cáo "không có điểm hoà vốn" trong dải.
 *
 * Module này là **hàm thuần** trên một tập mẫu giá đã tính sẵn (priceBeforeVat của mỗi
 * phương pháp tại từng số lượng) — KHÔNG gọi engine, KHÔNG I/O. Phần lấy giá theo số
 * lượng (recompute qua plugin trên cùng một Thông_Số, chỉ thay đổi `quantity`) do
 * {@link ComparatorService.findBreakEven} đảm nhiệm rồi truyền mẫu vào đây. Tách như
 * vậy để logic dò đảo chiều kiểm chứng được độc lập (Property 11 — task 10.5).
 *
 * _Requirements: 5.3_
 */
import { MethodId } from './types/method-plugin.types';

/**
 * Giá trước VAT của một cặp Phương_Pháp_In tại một số lượng cụ thể.
 * `priceA` / `priceB` = null nghĩa là phương pháp tương ứng KHÔNG tính được giá tại số
 * lượng đó (sẽ bị loại khỏi phân tích đảo chiều).
 */
export interface PairPriceSample {
    quantity: number;
    /** priceBeforeVat của phương pháp A; null khi không tính được. */
    priceA: number | null;
    /** priceBeforeVat của phương pháp B; null khi không tính được. */
    priceB: number | null;
}

/** Điểm_Hoà_Vốn `q*` cùng cặp số lượng kẹp (bracket) quanh nó. */
export interface BreakEvenPoint {
    /** `q*` ước lượng (nội suy tuyến tính giữa hai số lượng kẹp, làm tròn về số nguyên). */
    quantity: number;
    /** Số lượng mẫu cuối cùng mà `lowerMethodId` còn rẻ hơn (cận dưới của khoảng đảo chiều). */
    lowerQuantity: number;
    /** Số lượng mẫu đầu tiên mà `upperMethodId` đã rẻ hơn (cận trên của khoảng đảo chiều). */
    upperQuantity: number;
    /** Phương pháp rẻ hơn ở số lượng < `q*`. */
    lowerMethodId: MethodId;
    /** Phương pháp rẻ hơn ở số lượng > `q*`. */
    upperMethodId: MethodId;
}

/** Kết quả phân tích đảo chiều trên dải số lượng. */
export interface BreakEvenAnalysis {
    /** true nếu thứ tự rẻ-hơn đảo chiều trong dải (tồn tại `q*`). */
    hasBreakEven: boolean;
    /** Điểm_Hoà_Vốn khi `hasBreakEven=true`. */
    breakEven?: BreakEvenPoint;
    /** Lý do khi không có điểm hoà vốn / không đủ dữ liệu (Req 5.3). */
    message?: string;
}

/** Dấu của hiệu giá: -1 (A rẻ hơn), 1 (B rẻ hơn), 0 (bằng nhau). */
function priceSign(diff: number): -1 | 0 | 1 {
    if (diff < 0) return -1;
    if (diff > 0) return 1;
    return 0;
}

/** Số lượng kẹp có cả hai giá hữu hạn, sắp xếp tăng dần theo số lượng. */
function comparableSamples(samples: ReadonlyArray<PairPriceSample>): PairPriceSample[] {
    return samples
        .filter(
            (s) =>
                s != null &&
                Number.isFinite(s.priceA as number) &&
                Number.isFinite(s.priceB as number),
        )
        .slice()
        .sort((a, b) => a.quantity - b.quantity);
}

/**
 * Nội suy tuyến tính `q*` nơi hiệu giá (priceA - priceB) bằng 0 giữa hai mẫu kẹp.
 * Khi `dLo = 0` (giá đã bằng nhau ở mẫu dưới) ⇒ `q* = lo.quantity` (điểm hoà vốn đúng tại đó).
 * Kết quả được làm tròn và kẹp trong [lo.quantity, hi.quantity].
 */
function interpolateBreakEven(
    lo: PairPriceSample,
    hi: PairPriceSample,
    dLo: number,
    dHi: number,
): number {
    const span = hi.quantity - lo.quantity;
    let qStar: number;
    if (dHi === dLo) {
        // Hai hiệu bằng nhau (suy biến): lấy trung điểm để tránh chia cho 0.
        qStar = lo.quantity + span / 2;
    } else {
        qStar = lo.quantity + (-dLo * span) / (dHi - dLo);
    }
    const rounded = Math.round(qStar);
    return Math.min(Math.max(rounded, lo.quantity), hi.quantity);
}

/**
 * Dò Điểm_Hoà_Vốn giữa hai Phương_Pháp_In trên dải số lượng đã cho (Req 5.3).
 *
 * Thuật toán: trên các số lượng mà CẢ HAI phương pháp tính được giá, xác định phương
 * pháp rẻ hơn tại mẫu đầu tiên (bỏ qua các mẫu bằng giá), rồi tìm mẫu đầu tiên mà
 * phương pháp rẻ hơn đảo sang bên kia. Khi có đảo chiều ⇒ nội suy `q*` giữa hai mẫu
 * kẹp. Không đảo chiều ⇒ "không có điểm hoà vốn trong dải".
 *
 * @param methodA  Định danh phương pháp A (ứng với `priceA`).
 * @param methodB  Định danh phương pháp B (ứng với `priceB`).
 * @param samples  Mẫu giá theo số lượng (priceBeforeVat của mỗi phương pháp).
 */
export function detectBreakEven(
    methodA: MethodId,
    methodB: MethodId,
    samples: ReadonlyArray<PairPriceSample>,
): BreakEvenAnalysis {
    const comparable = comparableSamples(samples);

    if (comparable.length < 2) {
        return {
            hasBreakEven: false,
            message:
                'Không đủ dữ liệu để xác định điểm hoà vốn: cần ít nhất hai số lượng mà cả hai phương pháp đều tính được giá.',
        };
    }

    const minQ = comparable[0].quantity;
    const maxQ = comparable[comparable.length - 1].quantity;
    const cheaperAt = (s: PairPriceSample): MethodId | null => {
        const sign = priceSign((s.priceA as number) - (s.priceB as number));
        if (sign < 0) return methodA;
        if (sign > 0) return methodB;
        return null; // bằng giá
    };

    // Phương pháp rẻ hơn tại mẫu đầu tiên có chênh lệch (bỏ qua các mẫu bằng giá).
    const initialIdx = comparable.findIndex(
        (s) => priceSign((s.priceA as number) - (s.priceB as number)) !== 0,
    );

    if (initialIdx === -1) {
        // Hai phương pháp bằng giá trên toàn dải ⇒ không có điểm hoà vốn đơn lẻ.
        return {
            hasBreakEven: false,
            message: `Hai phương pháp có giá bằng nhau trên toàn dải số lượng [${minQ}, ${maxQ}] — không có điểm hoà vốn đơn lẻ.`,
        };
    }

    const initialCheaper = cheaperAt(comparable[initialIdx]) as MethodId;

    // Tìm mẫu đầu tiên (sau initialIdx) mà phương pháp rẻ hơn đảo sang bên kia.
    for (let j = initialIdx + 1; j < comparable.length; j++) {
        const hi = comparable[j];
        const cheaperHi = cheaperAt(hi);
        if (cheaperHi !== null && cheaperHi !== initialCheaper) {
            const lo = comparable[j - 1];
            const dLo = (lo.priceA as number) - (lo.priceB as number);
            const dHi = (hi.priceA as number) - (hi.priceB as number);
            const qStar = interpolateBreakEven(lo, hi, dLo, dHi);
            return {
                hasBreakEven: true,
                breakEven: {
                    quantity: qStar,
                    lowerQuantity: lo.quantity,
                    upperQuantity: hi.quantity,
                    lowerMethodId: initialCheaper,
                    upperMethodId: cheaperHi,
                },
            };
        }
    }

    return {
        hasBreakEven: false,
        message: `Không có điểm hoà vốn trong dải số lượng [${minQ}, ${maxQ}]: '${initialCheaper}' luôn rẻ hơn (không có đảo chiều).`,
    };
}
