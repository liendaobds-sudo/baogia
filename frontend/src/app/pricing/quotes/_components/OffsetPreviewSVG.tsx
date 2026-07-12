'use client';
/**
 * OffsetPreviewSVG — Preview bình bài In Offset (engine bảng giá Offset v7.2).
 *
 * Vẽ khổ giấy lớn + lưới "con" (số con/tờ) dựa trên `meta` engine trả về:
 *  - sheetW/sheetH (cm): khổ giấy lớn.
 *  - itemW/itemH (cm): kích thước con/bài (nếu suy được) → tính số cột×hàng khít.
 *  - soConToLon: số con/tờ lớn (dùng để khớp/hiển thị, và để ước lượng lưới khi thiếu kích thước con).
 *  - positions (mm): vị trí THẬT của từng con do Imposition_Service tính (nguồn sự thật duy nhất).
 *    Khi CÓ positions → vẽ trực tiếp từ chúng (parity giá ≡ preview, Req 2.3/10.2), KHÔNG tự dàn khuôn lại.
 *  - marginConfig (mm): lề/gripper/gutter để vẽ vùng in khả dụng + cắn nhíp.
 *
 * Thiết kế để MỞ RỘNG: nhận thêm props hình học sau này (gáy, chừa nhíp, bù xén...) mà không phá API.
 */
import React from 'react';

/** Margin_Config (mm) — khớp `OffsetMarginConfig` từ meta engine. */
export interface PreviewMarginConfig {
    left: number; right: number; top: number; bottom: number; gripper: number; gutter: number;
}

export interface OffsetPreviewProps {
    sheetW?: number;        // cm
    sheetH?: number;        // cm
    itemW?: number;         // cm
    itemH?: number;         // cm
    soConToLon?: number;    // số con / tờ lớn
    gripperCm?: number;     // chừa nhíp (cm), mặc định 1
    gapCm?: number;         // khe hở giữa con (cm), mặc định 0.3
    /** Vị trí con (mm) từ Imposition_Service — khi có sẽ vẽ trực tiếp thay vì tự dàn khuôn. */
    positions?: Array<{ x: number; y: number; w: number; h: number }>;
    /** Margin_Config (mm) từ engine — vẽ vùng in khả dụng + cắn nhíp khi vẽ từ positions. */
    marginConfig?: PreviewMarginConfig;
}

/** Khối <defs> dùng chung cho cả hai nhánh vẽ (lưới ước lượng & positions từ meta). */
const PREVIEW_DEFS = (
    <defs>
        <pattern id="gripper-stripes" width="1.5" height="1.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="0.75" height="1.5" fill="#f59e0b" opacity="0.25" />
        </pattern>
        <filter id="shadow-sheet" x="-5%" y="-5%" width="115%" height="115%">
            <feDropShadow dx="1" dy="1.5" stdDeviation="1.2" floodOpacity="0.15" floodColor="#0f172a" />
        </filter>
    </defs>
);

/** Ước lượng số cột×hàng để xếp `n` ô khít nhất trong khung tỉ lệ ratio = W/H. */
function gridFor(n: number, ratio: number): { cols: number; rows: number } {
    if (n <= 0) return { cols: 0, rows: 0 };
    let best = { cols: 1, rows: n, waste: Infinity };
    for (let cols = 1; cols <= n; cols++) {
        const rows = Math.ceil(n / cols);
        const cellRatio = cols / rows;
        const waste = Math.abs(cellRatio - ratio) + (cols * rows - n) * 0.01;
        if (waste < best.waste) best = { cols, rows, waste };
    }
    return { cols: best.cols, rows: best.rows };
}

export function OffsetPreviewSVG({
    sheetW, sheetH, itemW, itemH, soConToLon, gripperCm = 1, gapCm = 0.3, positions, marginConfig,
}: OffsetPreviewProps) {
    const pad = 6;

    // ── Nhánh ưu tiên: VẼ TRỰC TIẾP từ `positions` (mm) do Imposition_Service trả về. ──────────
    // Đây là nguồn sự thật duy nhất → preview KHỚP cơ sở giá (Req 2.3, 10.2). Không tự dàn khuôn lại.
    if (positions && positions.length > 0 && sheetW && sheetH && sheetW > 0 && sheetH > 0) {
        // positions ở mm, khổ ở cm → vẽ trong khung cm (chia 10), giữ nguyên hướng của engine.
        const Wp = sheetW;
        const Hp = sheetH;
        const vbWp = Wp + pad * 2;
        const vbHp = Hp + pad * 2;
        const mm2cm = (v: number) => v / 10;
        const mc = marginConfig;
        // Vùng in khả dụng (sau khi trừ lề + gripper) — gripper cộng ở cạnh đáy (theo mô hình engine).
        const usable = mc
            ? {
                  x: pad + mm2cm(mc.left),
                  y: pad + mm2cm(mc.top),
                  w: Math.max(0, Wp - mm2cm(mc.left) - mm2cm(mc.right)),
                  h: Math.max(0, Hp - mm2cm(mc.top) - mm2cm(mc.bottom) - mm2cm(mc.gripper)),
              }
            : null;
        const gripCm = mc ? mm2cm(mc.gripper) : 0;
        return (
            <svg viewBox={`0 0 ${vbWp} ${vbHp}`} className="w-full h-full font-sans" preserveAspectRatio="xMidYMid meet">
                {PREVIEW_DEFS}
                {/* Khổ giấy lớn */}
                <rect x={pad} y={pad} width={Wp} height={Hp} fill="#ffffff" stroke="#cbd5e1" strokeWidth={0.5} rx={0.8} filter="url(#shadow-sheet)" />
                {/* Cắn nhíp (gripper) ở cạnh đáy */}
                {gripCm > 0 && (
                    <>
                        <rect x={pad} y={pad + Hp - gripCm} width={Wp} height={gripCm} fill="url(#gripper-stripes)" rx={0.8} />
                        <rect x={pad} y={pad + Hp - gripCm} width={Wp} height={gripCm} fill="none" stroke="#f59e0b" strokeWidth={0.3} strokeDasharray="1,1" opacity={0.5} rx={0.8} />
                    </>
                )}
                {/* Vùng in khả dụng (sau khi trừ lề + gripper) */}
                {usable && usable.w > 0 && usable.h > 0 && (
                    <rect x={usable.x} y={usable.y} width={usable.w} height={usable.h}
                        fill="none" stroke="#60a5fa" strokeDasharray="2,1.5" strokeWidth={0.3} opacity={0.7} />
                )}
                {/* Các con — vẽ ĐÚNG theo positions engine (số ô === soConToLon) */}
                {positions.map((p, i) => (
                    <g key={i}>
                        <rect data-testid="con-cell" x={pad + mm2cm(p.x)} y={pad + mm2cm(p.y)} width={mm2cm(p.w)} height={mm2cm(p.h)}
                            fill="#eef2ff" stroke="#6366f1" strokeWidth={0.3} rx={0.4}
                            className="transition-all duration-300 hover:fill-indigo-100 cursor-pointer" />
                        {i === 0 && mm2cm(p.w) > 6 && mm2cm(p.h) > 3 && itemW && itemH && (
                            <text x={pad + mm2cm(p.x) + mm2cm(p.w) / 2} y={pad + mm2cm(p.y) + mm2cm(p.h) / 2 + 0.8} textAnchor="middle"
                                  fontSize={Math.min(2.5, mm2cm(p.h) * 0.4)} fill="#4f46e5" fontWeight="bold" opacity={0.5} pointerEvents="none">
                                {mm2cm(p.w).toFixed(0)}×{mm2cm(p.h).toFixed(0)}
                            </text>
                        )}
                    </g>
                ))}
                {/* Nhãn khổ giấy */}
                <text x={pad + Wp / 2} y={pad - 2.5} textAnchor="middle" fontSize={3.2} fill="#475569" fontWeight="700" letterSpacing="0.05">
                    KHỔ IN: {Wp} × {Hp} cm
                </text>
                {gripCm > 0 && (
                    <text x={pad + Wp / 2} y={pad + Hp + 2.5} textAnchor="middle" fontSize={1.8} fill="#d97706" fontWeight="600">
                        Nhíp
                    </text>
                )}
            </svg>
        );
    }

    // ── Nhánh dự phòng (legacy): không có positions → ước lượng lưới từ soConToLon + kích thước con. ──
    const sw = sheetW && sheetW > 0 ? sheetW : 65;
    const sh = sheetH && sheetH > 0 ? sheetH : 86;
    // Vẽ khổ nằm ngang (thực tế bình bài) — cạnh dài nằm ngang.
    const W = Math.max(sw, sh);
    const H = Math.min(sw, sh);

    // Vùng vẽ SVG (viewBox theo cm, padding cho nhãn).
    const vbW = W + pad * 2;
    const vbH = H + pad * 2;

    // Lưới con: SỐ Ô = soConToLon (CƠ SỞ GIÁ) để preview KHỚP StatCard + giá (§8.4 parity).
    // itemW/itemH chỉ dùng để chọn HƯỚNG xoay + tỉ lệ ô — KHÔNG quyết định số ô.
    // (Trước đây tự fit theo kích thước với gripper riêng → số ô vẽ lệch soConToLon ngay trong panel.)
    let cols = 0, rows = 0, cellW = 0, cellH = 0, rotated = false;
    // Nhíp ở cạnh dài (nằm ngang), được vẽ ở dưới đáy (bottom)
    const usableW = W;
    const usableH = H - gripperCm;

    const tryFit = (iw: number, ih: number) => {
        const c = Math.max(0, Math.floor((usableW + gapCm) / (iw + gapCm)));
        const r = Math.max(0, Math.floor((usableH + gapCm) / (ih + gapCm)));
        return { c, r, n: c * r };
    };

    // Hướng/tỉ lệ ô từ kích thước con (nếu có): chọn chiều xếp được nhiều hơn để vẽ thật.
    if (itemW && itemH && itemW > 0 && itemH > 0) {
        const a = tryFit(itemW, itemH);
        const b = tryFit(itemH, itemW);
        rotated = b.n > a.n;
        cellW = rotated ? itemH : itemW;
        cellH = rotated ? itemW : itemH;
    }

    // Số ô cần vẽ: ưu tiên soConToLon (giá); thiếu → suy từ kích thước con (giữ hành vi cũ).
    const nCells = soConToLon && soConToLon > 0
        ? Math.floor(soConToLon)
        : (cellW > 0 && cellH > 0 ? tryFit(cellW, cellH).n : 0);

    if (nCells > 0) {
        const g = gridFor(nCells, usableW / Math.max(usableH, 0.0001));
        cols = g.cols; rows = g.rows;
        if (!(cellW > 0 && cellH > 0)) {
            // Không có kích thước con → chia đều ô theo lưới.
            cellW = (usableW - (cols - 1) * gapCm) / cols;
            cellH = (usableH - (rows - 1) * gapCm) / rows;
        } else {
            // Có kích thước con: co ô để lưới vừa khung (chỉ ảnh hưởng VISUAL, không đổi số ô).
            const needW = cols * cellW + (cols - 1) * gapCm;
            const needH = rows * cellH + (rows - 1) * gapCm;
            const s = Math.min(needW > usableW ? usableW / needW : 1, needH > usableH ? usableH / needH : 1);
            if (s < 1) { cellW *= s; cellH *= s; }
        }
    }

    const cells: { x: number; y: number; w: number; h: number }[] = [];
    if (cols > 0 && rows > 0 && nCells > 0) {
        const totalGridW = cols * cellW + (cols - 1) * gapCm;
        const totalGridH = rows * cellH + (rows - 1) * gapCm;

        // Canh giữa không gian khả dụng (sau khi trừ nhíp)
        const x0 = pad + (usableW - totalGridW) / 2;
        const y0 = pad + (usableH - totalGridH) / 2;

        // Vẽ ĐÚNG nCells ô (hàng cuối có thể khuyết) → cells.length === soConToLon.
        let count = 0;
        for (let r = 0; r < rows && count < nCells; r++) {
            for (let c = 0; c < cols && count < nCells; c++) {
                cells.push({
                    x: x0 + c * (cellW + gapCm),
                    y: y0 + r * (cellH + gapCm),
                    w: cellW, h: cellH,
                });
                count++;
            }
        }
    }

    return (
        <svg viewBox={`0 0 ${vbW} ${vbH}`} className="w-full h-full font-sans" preserveAspectRatio="xMidYMid meet">
            {PREVIEW_DEFS}

            {/* Khổ giấy lớn */}
            <rect x={pad} y={pad} width={W} height={H} fill="#ffffff" stroke="#cbd5e1" strokeWidth={0.5} rx={0.8} filter="url(#shadow-sheet)" />
            
            {/* Chừa nhíp (gripper) - Nằm ở cạnh dưới (cạnh dài W) */}
            <rect x={pad} y={pad + H - gripperCm} width={W} height={gripperCm} fill="url(#gripper-stripes)" rx={0.8} />
            <rect x={pad} y={pad + H - gripperCm} width={W} height={gripperCm} fill="none" stroke="#f59e0b" strokeWidth={0.3} strokeDasharray="1,1" opacity={0.5} rx={0.8} />
            
            {/* Các con */}
            {cells.map((cell, i) => (
                <g key={i}>
                    <rect data-testid="con-cell" x={cell.x} y={cell.y} width={cell.w} height={cell.h}
                        fill="#eef2ff" stroke="#6366f1" strokeWidth={0.3} rx={0.4} 
                        className="transition-all duration-300 hover:fill-indigo-100 cursor-pointer" />
                    {/* Label kích thước cho ô đầu tiên nếu ô đủ lớn */}
                    {i === 0 && cell.w > 6 && cell.h > 3 && itemW && itemH && (
                        <text x={cell.x + cell.w / 2} y={cell.y + cell.h / 2 + 0.8} textAnchor="middle" 
                              fontSize={Math.min(2.5, cell.h * 0.4)} fill="#4f46e5" fontWeight="bold" opacity={0.5} pointerEvents="none">
                            {rotated ? `${itemH}×${itemW}` : `${itemW}×${itemH}`}
                        </text>
                    )}
                </g>
            ))}

            {/* Nhãn khổ giấy */}
            <text x={pad + W / 2} y={pad - 2.5} textAnchor="middle" fontSize={3.2} fill="#475569" fontWeight="700" letterSpacing="0.05">
                KHỔ IN: {W} × {H} cm
            </text>
            {/* Nhãn Nhíp */}
            <text x={pad + W / 2} y={pad + H + 2.5} textAnchor="middle" fontSize={1.8} fill="#d97706" fontWeight="600">
                Nhíp
            </text>
        </svg>
    );
}
