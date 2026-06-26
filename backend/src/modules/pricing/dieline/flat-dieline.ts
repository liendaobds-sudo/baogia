// ============================================================
// Flat Dieline Size — cầu nối engine khuôn bế ↔ tính giá offset.
//
// Engine sinh khuôn bế trải phẳng (đơn vị mm). Với hộp/bao bì, KHỔ TRẢI thật
// (gồm tai dán, nắp gài, đáy, mép keo) lớn hơn nhiều so với L×W×D danh nghĩa →
// đây mới là kích thước đúng để xếp bài & tính số con/tờ.
//
// `flatDielineSize()` trả kích thước bao (bounding box) của toàn bộ panel, quy
// về cm để khớp hệ đơn vị khổ in của EngineOffset (soConTrenKho/imposeFromKhoIn).
// ============================================================
import { BoxParams, DielineModel, DEFAULT_PARAMS } from './types';
import { computeBoundingBox, snap } from './utils';
import { generateReverseTuckEnd } from './ReverseTuckEnd';
import { generateSnapLockBottom } from './SnapLockBottom';
import { generateGableBox } from './GableBox';
import { generatePaperBag } from './PaperBag';
import { generateMailerBox } from './MailerBox';
import { generatePizzaBox } from './PizzaBox';
import { generateCupSleeve } from './CupSleeve';
import { generateEnvelope } from './Envelope';
import { generateMatchboxTray } from './MatchboxTray';

export type BoxType = BoxParams['boxType'];

/** Bảng điều phối loại hộp → hàm sinh khuôn bế. */
const GENERATORS: Record<BoxType, (p: BoxParams) => DielineModel> = {
    rte: generateReverseTuckEnd,
    slb: generateSnapLockBottom,
    gable: generateGableBox,
    paper_bag: generatePaperBag,
    cup_sleeve: generateCupSleeve,
    mailer: generateMailerBox,
    pizza: generatePizzaBox,
    envelope: generateEnvelope,
    tray: generateMatchboxTray,
};

export const SUPPORTED_BOX_TYPES = Object.keys(GENERATORS) as BoxType[];

/** Sinh model khuôn bế từ thông số (ghép lên mặc định). Ném lỗi nếu loại không hỗ trợ. */
export function generateDieline(params: Partial<BoxParams>): DielineModel {
    const full = { ...DEFAULT_PARAMS, ...params } as BoxParams;
    const gen = GENERATORS[full.boxType];
    if (!gen) throw new Error(`Loại hộp không hỗ trợ: ${full.boxType}`);
    return gen(full);
}

export interface FlatDielineSize {
    boxType: BoxType;
    /** Khổ trải (đơn vị mm) — đúng đơn vị thông số đầu vào. */
    widthMm: number;
    heightMm: number;
    /** Khổ trải quy về cm — khớp hệ đơn vị khổ in của EngineOffset. */
    widthCm: number;
    heightCm: number;
    standardCode: string;
    warnings: string[];
}

/**
 * Tính KHỔ TRẢI (bounding box toàn panel) của một khuôn bế.
 * @param params thông số hộp (boxType + L/W/D/T...). Thiếu trường nào lấy mặc định.
 */
export function flatDielineSize(params: Partial<BoxParams>): FlatDielineSize {
    const full = { ...DEFAULT_PARAMS, ...params } as BoxParams;
    const model = generateDieline(full);
    const allPaths = model.allPaths;
    const bbox = computeBoundingBox(allPaths);
    return {
        boxType: full.boxType,
        widthMm: bbox.width,
        heightMm: bbox.height,
        widthCm: snap(bbox.width / 10, 2),
        heightCm: snap(bbox.height / 10, 2),
        standardCode: model.standardCode,
        warnings: model.warnings ?? [],
    };
}
