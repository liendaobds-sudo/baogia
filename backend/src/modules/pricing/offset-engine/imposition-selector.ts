/**
 * impositionSelector — chọn NGUỒN số con/tờ (Legacy_Grid ↔ Imposition_Service) + chạy song song (shadow).
 *
 * Đây là điểm tập trung DUY NHẤT để 5 hàm sản phẩm (`products/*`) lấy `So_Con`: thay vì rải
 * `if (source)` khắp nơi, mọi hàm gọi `resolveSoCon(...)`. Selector đọc cờ cấu hình
 * (`ImpositionSource`, `ShadowMode`) từ `data.tyLe.params`, tính `So_Con` theo nguồn mặc định,
 * và khi `ShadowMode` bật thì tính thêm nguồn còn lại để đính kèm số liệu đối chiếu (KHÔNG đổi giá).
 *
 * Nguyên tắc (theo design + audit-rules §4/§7):
 *   - `So_Con` trả ra dùng ĐỒNG THỜI cho giá (buildWaste) và preview/PDF (meta) → parity (Req 10.1).
 *   - `ImpositionSource` giá trị lạ → mặc định an toàn `'legacy'` + cảnh báo log (Req 6.1).
 *   - Khi `unified` là nguồn đang dùng và lỗi hình học → FAIL FAST (ném OffsetPricingError),
 *     KHÔNG âm thầm rơi về Legacy (tránh xuất giá sai lặng lẽ; rollback là hành động cấu hình
 *     có chủ đích) (Req 6.3).
 *   - Tính `unified` chỉ để SHADOW (khi nguồn đang dùng là legacy) không được phép làm vỡ giá:
 *     lỗi hình học ở nhánh shadow chỉ ghi log, không ném (Req 5.2 — shadow không đổi giá).
 *
 * _Requirements: 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 9.4_
 */
import { Logger } from '@nestjs/common';

import {
    ImpositionResult,
    ItemPosition,
    imposeUnified,
    resolveMarginConfig,
} from './imposition';
import { docKichThuocCm, imposeFromKhoIn } from './lookups';
import { pressPerParent, conPerParentSheet } from './sheet-imposition';
import {
    KhoIn,
    MarginConfig,
    OffsetPricingError,
    Params,
    PricingData,
    numParam,
} from './pricing-data';

/** Hệ số đổi đơn vị cm → mm (Imposition_Service làm việc bằng mm). */
const CM_TO_MM = 10;
/** Khe hở phẳng mặc định (cm) cho Legacy_Grid khi `params.Gap_Cm` thiếu. */
const DEFAULT_GAP_CM = 0.3;

/** Logger dùng chung cho selector (Imposition_Service là hàm thuần, không phải provider). */
const logger = new Logger('ImpositionSelector');

/** Nguồn imposition. */
export type ImpositionSource = 'legacy' | 'unified';

/**
 * Yêu cầu tính `So_Con` cho MỘT sản phẩm phẳng. Mọi hàm sản phẩm gọi với cùng hình dạng này:
 * kích thước con (cm) + bản ghi khổ in đã tra cứu + PricingData (để đọc cờ + lề/gripper/gutter).
 */
export interface SoConRequest {
    /** Bề rộng con (thành phẩm phẳng) theo CM. Thiếu/≤0 → dùng `fallback*` (không tính hình học). */
    itemWcm?: number;
    /** Bề cao con (thành phẩm phẳng) theo CM. */
    itemHcm?: number;
    /**
     * Bản ghi khổ in đã tra cứu — cung cấp khổ bài in (`khoIn`), khổ giấy lớn (`khoGiayLon`)
     * và lề (`margin*` cm) + gripper/gutter (cm) cho cả hai nguồn.
     */
    kho: KhoIn;
    /** PricingData để đọc cờ `ImpositionSource`/`ShadowMode`, `Gap_Cm`, và mặc định gripper/gutter. */
    data: PricingData;
    /** Số con/tờ bảng tĩnh — fallback Legacy khi thiếu kích thước hoặc hình học không tính được. */
    fallbackToLon?: number;
    /** Số con/bài in bảng tĩnh — fallback Legacy tương ứng. */
    fallbackBaiIn?: number;
}

/** Số liệu đối chiếu Shadow_Mode (chỉ có khi `ShadowMode` bật) — KHÔNG ảnh hưởng giá. */
export interface ShadowMetrics {
    legacyToLon: number;
    unifiedToLon: number;
    legacyBaiIn: number;
    unifiedBaiIn: number;
    /** Chênh lệch số con/tờ: unified − legacy. */
    deltaToLon: number;
}

/** Kết quả selector — nguồn `So_Con` duy nhất cho giá + preview/PDF. */
export interface SoConOutcome {
    /** Số con / tờ giấy lớn dùng cho giá VÀ preview (cùng một giá trị). */
    soConToLon: number;
    /** Số con / khổ bài in. */
    soConBaiIn: number;
    /** Nguồn đã dùng cho `soConToLon`/`soConBaiIn` ở trên (khớp cờ cấu hình). */
    source: ImpositionSource;
    /** Số liệu đối chiếu — chỉ có khi `ShadowMode` bật (Req 5.2). */
    shadow?: ShadowMetrics;
    /** Vị trí các con (mm) — chỉ có khi nhánh unified được tính (preview). */
    positions?: ItemPosition[];
    /** Margin_Config (mm) — chỉ có khi nhánh unified được tính (preview vẽ vùng in/gripper). */
    marginConfig?: MarginConfig;
    /** Vị trí các con trên KHỔ BÀI IN (mm) — chỉ có khi nhánh unified được tính (preview vẽ theo giá). */
    pressPositions?: ItemPosition[];
    /** Vùng in khả dụng của KHỔ BÀI IN (mm) — để preview vẽ vùng in/gripper theo khổ bài in. */
    pressUsableArea?: { width: number; height: number };
    /**
     * Số bài in (khổ xả) cắt được từ 1 TỜ NHẬP (khổ giấy lớn mua về). Tính hình học KHÔNG nhíp
     * (xả = cắt). Khổ xả ≡ khổ nhập → 1 (in thẳng). 0 nếu không đọc được khổ nhập.
     * GĐ B: cấp cho GĐ C đếm giấy theo tờ nhập. CHƯA nối vào giá ở GĐ B.
     */
    pressPerParent?: number;
    /**
     * Con / 1 TỜ NHẬP = con/khổ xả (`soConBaiIn`) × `pressPerParent`. Dùng để ĐẾM GIẤY
     * (giá = giá tờ nhập × số tờ nhập). 0 nếu thiếu dữ kiện. CHƯA nối vào giá ở GĐ B.
     */
    conPerParent?: number;
}

/**
 * Đọc nguồn imposition mặc định từ params. Giá trị lạ → `'legacy'` + cảnh báo log (Req 6.1).
 * `undefined`/thiếu → `'legacy'` (mặc định an toàn, không cảnh báo).
 */
/**
 * Đọc nguồn imposition mặc định từ params. Giá trị lạ → `'legacy'` + cảnh báo log (Req 6.1).
 * `undefined`/thiếu → `'legacy'` (mặc định an toàn, không cảnh báo).
 *
 * Export để các đường imposition ĐẶC THÙ (vd `tui_giay` dùng `imposeUnified` primitive trực tiếp
 * thay vì `resolveSoCon`) đọc cờ nguồn theo CÙNG quy tắc — bảo toàn parity + rollback bằng cấu hình.
 */
export function readImpositionSource(params: Params): ImpositionSource {
    const raw = params.ImpositionSource;
    if (raw === undefined || raw === null) return 'legacy';
    if (raw === 'legacy' || raw === 'unified') return raw;
    logger.warn(
        `ImpositionSource không hợp lệ: ${JSON.stringify(raw)} — dùng mặc định an toàn 'legacy'`,
    );
    return 'legacy';
}

/** Kích thước con hợp lệ để dàn khuôn hình học? */
function hasItemDims(req: SoConRequest): boolean {
    return (
        typeof req.itemWcm === 'number' &&
        Number.isFinite(req.itemWcm) &&
        req.itemWcm > 0 &&
        typeof req.itemHcm === 'number' &&
        Number.isFinite(req.itemHcm) &&
        req.itemHcm > 0
    );
}

/** Số con theo Legacy_Grid (`imposeFromKhoIn`), giữ fallback bảng tĩnh — tái lập hành vi hiện tại. */
function computeLegacy(req: SoConRequest): { soConToLon: number; soConBaiIn: number } {
    const fallbackToLon = req.fallbackToLon ?? 0;
    const fallbackBaiIn = req.fallbackBaiIn ?? 0;
    if (!hasItemDims(req)) {
        return { soConToLon: fallbackToLon, soConBaiIn: fallbackBaiIn };
    }
    const gap = numParam(req.data.tyLe.params, 'Gap_Cm') || DEFAULT_GAP_CM;
    const imp = imposeFromKhoIn(req.kho, req.itemWcm as number, req.itemHcm as number, gap);
    return {
        soConToLon: imp.soConToLon > 0 ? imp.soConToLon : fallbackToLon,
        soConBaiIn: imp.soConBaiIn > 0 ? imp.soConBaiIn : fallbackBaiIn,
    };
}

/**
 * Số con theo Imposition_Service (`imposeUnified`), mô hình dàn khuôn vật lý có lề/gripper/gutter.
 * Trả `null` khi thiếu kích thước con (không thể dàn khuôn hình học).
 *
 * @throws OffsetPricingError khi vùng in khả dụng ≤ 0 hoặc lề âm (fail fast).
 */
function computeUnified(req: SoConRequest): ImpositionResult | null {
    if (!hasItemDims(req)) return null;
    const params = req.data.tyLe.params;
    const margins = resolveMarginConfig(req.kho, params); // ném nếu lề/gripper/gutter âm (Req 1.6)
    const press = docKichThuocCm(req.kho.khoIn);
    const sheet = docKichThuocCm(req.kho.khoGiayLon);
    if (!sheet) {
        throw new OffsetPricingError(
            `Khổ in ${req.kho.khoIn || '(không rõ)'}: không đọc được kích thước khổ giấy lớn ` +
                `"${req.kho.khoGiayLon}"`,
        );
    }
    return imposeUnified({
        itemWmm: (req.itemWcm as number) * CM_TO_MM,
        itemHmm: (req.itemHcm as number) * CM_TO_MM,
        sheetWmm: sheet.w * CM_TO_MM,
        sheetHmm: sheet.h * CM_TO_MM,
        pressWmm: press ? press.w * CM_TO_MM : undefined,
        pressHmm: press ? press.h * CM_TO_MM : undefined,
        margins,
    });
}

/**
 * Nguồn `So_Con` DUY NHẤT cho mọi hàm sản phẩm offset.
 *
 * Hành vi:
 *   1. Đọc `source` (`ImpositionSource`, mặc định an toàn `'legacy'`) và `shadow` (`ShadowMode`).
 *   2. Tính `So_Con` theo `source`:
 *        - `unified`: dùng `imposeUnified` — FAIL FAST nếu lỗi hình học (KHÔNG fallback Legacy).
 *        - `legacy` : dùng `imposeFromKhoIn` (giữ fallback bảng tĩnh qua `fallback*`).
 *   3. Khi `shadow` bật: tính thêm nguồn còn lại để đính `shadow{}` đối chiếu + ghi log so sánh,
 *      nhưng KHÔNG đổi `So_Con` trả ra (Req 5.2). Lỗi hình học ở nhánh shadow (không phải nguồn
 *      đang dùng) chỉ ghi log, không ném — để shadow không làm vỡ giá.
 *
 * `marginConfig`/`positions` được đính khi nhánh unified được tính (phục vụ preview).
 */
export function resolveSoCon(req: SoConRequest): SoConOutcome {
    const params = req.data.tyLe.params;
    const source = readImpositionSource(params);
    const shadowOn = Boolean(numParam(params, 'ShadowMode'));

    let soConToLon: number;
    let soConBaiIn: number;
    let positions: ItemPosition[] | undefined;
    let pressPositions: ItemPosition[] | undefined;
    let pressUsableArea: { width: number; height: number } | undefined;
    let marginConfig: MarginConfig | undefined;

    // Giữ lại kết quả của từng nguồn để dựng số liệu shadow (chỉ tính khi cần).
    let legacy: { soConToLon: number; soConBaiIn: number } | undefined;
    let unified: ImpositionResult | null | undefined;

    if (source === 'unified') {
        // Nguồn đang dùng = unified → fail fast: để OffsetPricingError lan ra ngoài.
        unified = computeUnified(req);
        if (unified) {
            soConToLon = unified.soConToLon;
            soConBaiIn = unified.soConBaiIn;
            positions = unified.positions;
            pressPositions = unified.pressPositions;
            pressUsableArea = unified.pressUsableArea ?? undefined;
            marginConfig = resolveMarginConfig(req.kho, params);
        } else {
            // Thiếu kích thước con → không tính được hình học; dùng bảng tĩnh (không phải lỗi hình học).
            soConToLon = req.fallbackToLon ?? 0;
            soConBaiIn = req.fallbackBaiIn ?? 0;
        }
        if (shadowOn) {
            legacy = computeLegacy(req); // Legacy không bao giờ ném.
        }
    } else {
        // Nguồn đang dùng = legacy → tái lập hành vi giá trước thay đổi.
        legacy = computeLegacy(req);
        soConToLon = legacy.soConToLon;
        soConBaiIn = legacy.soConBaiIn;
        if (shadowOn) {
            // Tính unified CHỈ để đối chiếu — không được làm vỡ giá nếu hình học lỗi (Req 5.2).
            try {
                unified = computeUnified(req);
                if (unified) {
                    positions = unified.positions;
                    pressPositions = unified.pressPositions;
                    pressUsableArea = unified.pressUsableArea ?? undefined;
                    marginConfig = resolveMarginConfig(req.kho, params);
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                logger.warn(
                    `Shadow: bỏ qua nguồn unified do lỗi hình học (giá vẫn theo legacy): ${msg}`,
                );
                unified = null;
            }
        }
    }

    // GĐ B — số cầu nối khổ nhập ↔ khổ xả (hình học, KHÔNG nhíp: xả = cắt). Thuần BỔ SUNG,
    // CHƯA nối vào giá (GĐ C mới đếm giấy theo con/tờ nhập). `khoIn` = khổ xả (bài in),
    // `khoGiayLon` = khổ nhập. Thiếu kích thước → mức = 0 (caller fallback).
    const pressDim = docKichThuocCm(req.kho.khoIn);
    const parentDim = docKichThuocCm(req.kho.khoGiayLon);
    const pressPerParentSheet = pressDim && parentDim
        ? pressPerParent(pressDim.w * CM_TO_MM, pressDim.h * CM_TO_MM, parentDim.w * CM_TO_MM, parentDim.h * CM_TO_MM)
        : 0;
    const conPerParent = conPerParentSheet(soConBaiIn, pressPerParentSheet);

    const outcome: SoConOutcome = { soConToLon, soConBaiIn, source, pressPerParent: pressPerParentSheet, conPerParent };
    if (positions) outcome.positions = positions;
    if (pressPositions) outcome.pressPositions = pressPositions;
    if (pressUsableArea) outcome.pressUsableArea = pressUsableArea;
    if (marginConfig) outcome.marginConfig = marginConfig;

    if (shadowOn) {
        const legacyMetrics = legacy ?? { soConToLon: 0, soConBaiIn: 0 };
        const unifiedToLon = unified ? unified.soConToLon : 0;
        const unifiedBaiIn = unified ? unified.soConBaiIn : 0;
        outcome.shadow = {
            legacyToLon: legacyMetrics.soConToLon,
            unifiedToLon,
            legacyBaiIn: legacyMetrics.soConBaiIn,
            unifiedBaiIn,
            deltaToLon: unifiedToLon - legacyMetrics.soConToLon,
        };
        // Req 5.3 — ghi log số liệu so sánh để phân tích chênh lệch giữa hai phương pháp.
        logger.log(
            `Shadow[source=${source}] kho=${req.kho.khoIn}: ` +
                `legacyToLon=${outcome.shadow.legacyToLon} unifiedToLon=${unifiedToLon} ` +
                `deltaToLon=${outcome.shadow.deltaToLon} ` +
                `legacyBaiIn=${outcome.shadow.legacyBaiIn} unifiedBaiIn=${unifiedBaiIn}`,
        );
    }

    return outcome;
}
