/**
 * Mô hình BÙ HAO THEO CÔNG ĐOẠN (quantity cascade) cho engine offset — "siêu cấp".
 *
 * Thay cho cách cũ (một % hao phẳng áp lên tổng tiền ở `totals.ts`, + chèn bù hao tờ rời rạc
 * trong từng product → double-count, thiếu nhất quán), mô hình này phản ánh đúng dòng số lượng
 * thực tế của xưởng:
 *
 *   - Công đoạn TRƯỚC & TRONG IN (pha giấy, in, cán màng, tráng phủ, bồi) → bù hao theo TỜ IN.
 *   - Công đoạn SAU IN (bế, dán, gấp, ép kim, đóng gói) → bù hao theo SỐ LƯỢNG THÀNH PHẨM (con).
 *
 * Nguyên lý: số thành phẩm "tốt" cần ở cuối kéo NGƯỢC lên đầu. Mỗi công đoạn phải sản xuất dư
 * để bù hao của chính nó + đủ nuôi công đoạn sau:
 *
 *     qtyIn(stage) = ceil( qtyOut(stage) / (1 − rate(stage)) + makeready(stage) )
 *     qtyOut(stage_trước) = qtyIn(stage_sau)
 *
 * Tại ranh giới piece → sheet (công đoạn bế tách tờ thành con): sheets = ceil(pieces / soCon).
 *
 * LÕI THUẦN — không I/O, không phụ thuộc DB. Dễ test property-based.
 *
 * _Tài liệu thiết kế: docs/offset-waste-model.md_
 */

export type WasteBasis = 'sheet' | 'piece';

/** Định mức hao của MỘT công đoạn. */
export interface StageWaste {
    code: string;
    basis: WasteBasis;
    /** Hao cố định canh máy/khuôn (theo `basis`): vd 50 tờ canh kẽm, 100 con canh bế. */
    makeready: number;
    /** Tỷ lệ hao chạy 0..1 (theo `basis`). */
    rate: number;
}

/** Số lượng đi qua một công đoạn sau khi cascade. */
export interface StageQty {
    code: string;
    basis: WasteBasis;
    /** Số lượng gross ĐI VÀO công đoạn (đã làm tròn lên đơn vị nguyên). */
    qtyIn: number;
    /** Số lượng tốt RA KHỎI công đoạn (= đầu vào công đoạn sau). */
    qtyOut: number;
    /** Phần hao = qtyIn − qtyOut. */
    waste: number;
}

export interface CascadeResult {
    /** Theo thứ tự sản xuất gốc (đầu → cuối). */
    stages: StageQty[];
    /** Số lượng đi vào công đoạn ĐẦU TIÊN của chuỗi (đầu vào chuỗi). */
    input: number;
}

const clampRate = (r: number): number => (Number.isFinite(r) ? Math.min(Math.max(r, 0), 0.99) : 0);
const safeMakeready = (m: number): number => (Number.isFinite(m) && m > 0 ? m : 0);

/**
 * Cascade NGƯỢC qua chuỗi công đoạn (truyền theo THỨ TỰ SẢN XUẤT: đầu → cuối).
 * @param good số đơn vị TỐT cần ở đầu ra công đoạn cuối.
 * @returns qtyIn của từng công đoạn (giữ thứ tự gốc) + `input` = qtyIn của công đoạn đầu tiên.
 *
 * Bất biến:
 *  - qtyIn ≥ qtyOut với mọi công đoạn (rate ≥ 0, makeready ≥ 0).
 *  - rate=0, makeready=0 ở mọi công đoạn ⇒ input = good (thoái biến "không hao").
 *  - tăng rate/makeready của bất kỳ công đoạn ⇒ input không giảm (đơn điệu).
 */
export function cascade(good: number, stages: StageWaste[]): CascadeResult {
    const g = Number.isFinite(good) && good > 0 ? good : 0;
    let needOut = g;
    const out: StageQty[] = [];
    for (let i = stages.length - 1; i >= 0; i--) {
        const s = stages[i];
        const rate = clampRate(s.rate);
        const makeready = safeMakeready(s.makeready);
        const qtyIn = needOut <= 0 ? 0 : Math.ceil(needOut / (1 - rate) + makeready);
        out.unshift({ code: s.code, basis: s.basis, qtyIn, qtyOut: needOut, waste: qtyIn - needOut });
        needOut = qtyIn;
    }
    return { stages: out, input: needOut };
}

/**
 * Cascade đầy đủ cho một sản phẩm có ranh giới piece → sheet tại công đoạn bế.
 *
 * @param good          số thành phẩm tốt cần giao (Q).
 * @param soCon         số con / tờ in (suy từ kích thước trải thực × khổ giấy).
 * @param pieceStages   công đoạn 'piece' SAU in theo thứ tự sản xuất (vd [bế, dán, đóng gói]).
 * @param sheetStages   công đoạn 'sheet' TRƯỚC/ TRONG in theo thứ tự sản xuất (vd [pha giấy, in, cán]).
 *
 * @returns
 *  - piecesIntoPress: tổng số con phải IN ra (đầu vào chuỗi piece).
 *  - sheetsNet: số tờ in tối thiểu = ceil(piecesIntoPress / soCon).
 *  - sheetsGross: số tờ giấy phải xuất kho (đầu vào chuỗi sheet).
 *  - pieceQty / sheetQty: qtyIn theo từng công đoạn để tính chi phí.
 */
export function cascadeProduct(
    good: number,
    soCon: number,
    pieceStages: StageWaste[],
    sheetStages: StageWaste[],
): {
    piecesIntoPress: number;
    sheetsNet: number;
    sheetsGross: number;
    pieceQty: StageQty[];
    sheetQty: StageQty[];
} {
    const pieceCascade = cascade(good, pieceStages);
    const piecesIntoPress = pieceStages.length ? pieceCascade.input : (Number.isFinite(good) && good > 0 ? good : 0);

    const soConSafe = Number.isFinite(soCon) && soCon > 0 ? soCon : 0;
    const sheetsNet = soConSafe > 0 ? Math.ceil(piecesIntoPress / soConSafe) : 0;

    const sheetCascade = cascade(sheetsNet, sheetStages);
    const sheetsGross = sheetStages.length ? sheetCascade.input : sheetsNet;

    return {
        piecesIntoPress,
        sheetsNet,
        sheetsGross,
        pieceQty: pieceCascade.stages,
        sheetQty: sheetCascade.stages,
    };
}

/** Tiện ích: lấy qtyIn của một công đoạn theo code (0 nếu không có). */
export function qtyOf(stages: StageQty[], code: string): number {
    return stages.find((s) => s.code === code)?.qtyIn ?? 0;
}
