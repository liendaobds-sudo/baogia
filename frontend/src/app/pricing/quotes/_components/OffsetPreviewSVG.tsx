'use client';
/**
 * OffsetPreviewSVG — Preview bình bài In Offset (engine bảng giá Offset v7.2).
 *
 * Vẽ khổ giấy lớn + lưới "con" (số con/tờ) dựa trên `meta` engine trả về:
 *  - sheetW/sheetH (cm): khổ giấy lớn.
 *  - itemW/itemH (cm): kích thước con/bài (nếu suy được) → tính số cột×hàng khít.
 *  - soConToLon: số con/tờ lớn (dùng để khớp/hiển thị, và để ước lượng lưới khi thiếu kích thước con).
 *
 * Thiết kế để MỞ RỘNG: nhận thêm props hình học sau này (gáy, chừa nhíp, bù xén...) mà không phá API.
 */
import React from 'react';

export interface OffsetPreviewProps {
    sheetW?: number;        // cm
    sheetH?: number;        // cm
    itemW?: number;         // cm
    itemH?: number;         // cm
    soConToLon?: number;    // số con / tờ lớn
    gripperCm?: number;     // chừa nhíp (cm), mặc định 1
    gapCm?: number;         // khe hở giữa con (cm), mặc định 0.3
}

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
    sheetW, sheetH, itemW, itemH, soConToLon, gripperCm = 1, gapCm = 0.3,
}: OffsetPreviewProps) {
    const sw = sheetW && sheetW > 0 ? sheetW : 65;
    const sh = sheetH && sheetH > 0 ? sheetH : 86;
    // Vẽ khổ nằm ngang (thực tế bình bài) — cạnh dài nằm ngang.
    const W = Math.max(sw, sh);
    const H = Math.min(sw, sh);

    // Vùng vẽ SVG (viewBox theo cm, padding cho nhãn).
    const pad = 6;
    const vbW = W + pad * 2;
    const vbH = H + pad * 2;

    // Lưới con: ưu tiên tính từ kích thước con; fallback ước lượng từ soConToLon.
    let cols = 0, rows = 0, cellW = 0, cellH = 0, rotated = false;
    // Nhíp ở cạnh dài (nằm ngang), được vẽ ở dưới đáy (bottom)
    const usableW = W;
    const usableH = H - gripperCm;

    const tryFit = (iw: number, ih: number) => {
        const c = Math.max(0, Math.floor((usableW + gapCm) / (iw + gapCm)));
        const r = Math.max(0, Math.floor((usableH + gapCm) / (ih + gapCm)));
        return { c, r, n: c * r };
    };

    if (itemW && itemH && itemW > 0 && itemH > 0) {
        const a = tryFit(itemW, itemH);
        const b = tryFit(itemH, itemW);
        if (b.n > a.n) { cols = b.c; rows = b.r; cellW = itemH; cellH = itemW; rotated = true; }
        else { cols = a.c; rows = a.r; cellW = itemW; cellH = itemH; }
    }

    // Nếu không có kích thước con (vd SP khác) hoặc fit ra 0, ước lượng lưới từ soConToLon.
    if ((cols * rows === 0) && soConToLon && soConToLon > 0) {
        const g = gridFor(soConToLon, usableW / usableH);
        cols = g.cols; rows = g.rows;
        cellW = (usableW - (cols - 1) * gapCm) / cols;
        cellH = (usableH - (rows - 1) * gapCm) / rows;
    }

    const cells: { x: number; y: number; w: number; h: number }[] = [];
    if (cols > 0 && rows > 0) {
        const totalGridW = cols * cellW + (cols - 1) * gapCm;
        const totalGridH = rows * cellH + (rows - 1) * gapCm;

        // Canh giữa không gian khả dụng (sau khi trừ nhíp)
        const x0 = pad + (usableW - totalGridW) / 2;
        const y0 = pad + (usableH - totalGridH) / 2;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                cells.push({
                    x: x0 + c * (cellW + gapCm),
                    y: y0 + r * (cellH + gapCm),
                    w: cellW, h: cellH,
                });
            }
        }
    }

    return (
        <svg viewBox={`0 0 ${vbW} ${vbH}`} className="w-full h-full font-sans" preserveAspectRatio="xMidYMid meet">
            <defs>
                <pattern id="gripper-stripes" width="1.5" height="1.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="0.75" height="1.5" fill="#f59e0b" opacity="0.25" />
                </pattern>
                <filter id="shadow-sheet" x="-5%" y="-5%" width="115%" height="115%">
                    <feDropShadow dx="1" dy="1.5" stdDeviation="1.2" floodOpacity="0.15" floodColor="#0f172a" />
                </filter>
            </defs>

            {/* Khổ giấy lớn */}
            <rect x={pad} y={pad} width={W} height={H} fill="#ffffff" stroke="#cbd5e1" strokeWidth={0.5} rx={0.8} filter="url(#shadow-sheet)" />
            
            {/* Chừa nhíp (gripper) - Nằm ở cạnh dưới (cạnh dài W) */}
            <rect x={pad} y={pad + H - gripperCm} width={W} height={gripperCm} fill="url(#gripper-stripes)" rx={0.8} />
            <rect x={pad} y={pad + H - gripperCm} width={W} height={gripperCm} fill="none" stroke="#f59e0b" strokeWidth={0.3} strokeDasharray="1,1" opacity={0.5} rx={0.8} />
            
            {/* Các con */}
            {cells.map((cell, i) => (
                <g key={i}>
                    <rect x={cell.x} y={cell.y} width={cell.w} height={cell.h}
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
