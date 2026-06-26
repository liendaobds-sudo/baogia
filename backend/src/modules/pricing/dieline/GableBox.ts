// ============================================================
// Gable Box — Hộp Quai Xách (Handle Carrier Box)
// Đáy crash-lock (giống SLB), nắp gable với lỗ quai xách.
//
// Thuật toán: Mọi tọa độ được nội suy từ biến số.
// ============================================================

import {
    BoxParams,
    DielineModel,
    Panel,
    PathSegment,
    Point2D,
} from './types';

import {
    pt,
    line,
    snap,
    computeBoundingBox,
    bezierSegment,
    arc,
} from './utils';

import {
    computeSnapLockPairs,
    buildFemaleReceiver,
    buildMaleHook,
    buildBottomDustFlap,
} from './crashLockHelpers';
import { GLUE_TAPER_RATIO } from './constants';

/**
 * Sinh bản vẽ khuôn bế Gable Box từ thông số đầu vào.
 *
 * Layout trải phẳng (nhìn từ trên):
 *
 *                    [Gable Front]  ← chứa lỗ quai
 *   [SideFlap-TL]                  [SideFlap-TR]
 *  
 *   Glue   Left  Front  Right    Back  
 *   Flap   (W)    (L)    (W)     (L)   
 *  
 *   [DustBotL]  [FemaleRcv]  [DustBotR]  [MaleHook]
 *
 * Gốc tọa độ (0,0) = góc dưới-trái của panel ngoài cùng bên trái.
 */
export function generateGableBox(params: BoxParams): DielineModel {
    const { L, W, D, T, G, glueSide, panelOrder, HH, HW, HHL, handleShape, SLP } = params;

    const allPaths: PathSegment[] = [];
    const panels: Panel[] = [];

    // ============================================================
    // A. Tọa độ X các cột (giống SLB)
    // ============================================================
    const pw = panelOrder === 'LWLW' ? [L, W, L, W] : [W, L, W, L];
    const glueOffset = glueSide === 'left' ? G : 0;
    const x1 = snap(glueOffset);
    const x2 = snap(glueOffset + pw[0]);
    const x3 = snap(glueOffset + pw[0] + pw[1]);
    const x4 = snap(glueOffset + pw[0] + pw[1] + pw[2]);
    const x5 = snap(glueOffset + pw[0] + pw[1] + pw[2] + pw[3]);
    const xGlueInner = glueSide === 'left' ? x1 : x5;
    const xGlueOuter = glueSide === 'left' ? 0 : snap(x5 + G);

    // Semantic panel edges
    const isFrontFirst = panelOrder === 'LWLW';
    const [xFrontL, xFrontR] = isFrontFirst ? [x1, x2] : [x2, x3];
    const [xBackL, xBackR] = isFrontFirst ? [x3, x4] : [x4, x5];
    const [xSideAL, xSideAR] = isFrontFirst ? [x2, x3] : [x1, x2];
    const [xSideBL, xSideBR] = isFrontFirst ? [x4, x5] : [x3, x4];

    const pn = isFrontFirst
        ? ['front', 'right', 'back', 'left']
        : ['left', 'front', 'right', 'back'];

    const sideAIsLeft = !isFrontFirst;
    const sideBIsLeft = isFrontFirst;

    // Tọa độ Y thân hộp
    const yBot = 0;
    const yTop = snap(D);

    const h = snap(T / 2); // Mỗi bên giảm T/2

    // ============================================================
    // B. THÂN HỘP (giống SLB — Bottom edges đều là CREASE)
    // ============================================================

    // --- B1. Glue Flap ---
    const glueVat = snap(G * GLUE_TAPER_RATIO);
    const gluePaths: PathSegment[] = glueSide === 'left' ? [
        line(pt(xGlueOuter, yBot + glueVat), pt(xGlueInner, yBot), 'CUT'),
        line(pt(xGlueInner, yBot), pt(xGlueInner, yTop), 'CREASE'),
        line(pt(xGlueInner, yTop), pt(xGlueOuter, yTop - glueVat), 'CUT'),
        line(pt(xGlueOuter, yTop - glueVat), pt(xGlueOuter, yBot + glueVat), 'CUT'),
    ] : [
        line(pt(xGlueInner, yBot), pt(xGlueOuter, yBot + glueVat), 'CUT'),
        line(pt(xGlueOuter, yBot + glueVat), pt(xGlueOuter, yTop - glueVat), 'CUT'),
        line(pt(xGlueOuter, yTop - glueVat), pt(xGlueInner, yTop), 'CUT'),
        line(pt(xGlueInner, yTop), pt(xGlueInner, yBot), 'CREASE'),
    ];
    allPaths.push(...gluePaths);
    panels.push({
        name: 'glue_flap', label: 'Mép dán keo', paths: gluePaths,
        parent: glueSide === 'left' ? pn[0] : pn[3],
        pivotEdge: [pt(xGlueInner, yBot), pt(xGlueInner, yTop)],
        foldAngle: glueSide === 'left' ? 90 : -90,
        foldDirection: glueSide === 'left' ? 1 : -1,
    });

    // Top edges: Front + Back đều CREASE (gable gập), SideA/B cũng CREASE (side flap)
    // Bottom edges: tất cả CREASE (crash-lock fold)

    // --- B2–B5. Body Columns ---
    const colTopTag: Array<'CUT' | 'CREASE'> = ['CREASE', 'CREASE', 'CREASE', 'CREASE'];

    // Column 0
    const x2YTop = yTop;
    const leftPaths: PathSegment[] = [
        line(pt(x2, yBot), pt(x2, x2YTop), 'CREASE'),
        line(pt(x2, yTop), pt(x1, yTop), colTopTag[0]),
    ];
    if (glueSide === 'right') {
        leftPaths.push(line(pt(x1, yTop), pt(x1, yBot), 'CUT'));
    }
    allPaths.push(...leftPaths);
    panels.push({
        name: pn[0], label: pn[0] === 'left' ? 'Hông trái' : 'Mặt trước',
        paths: leftPaths, parent: pn[1],
        pivotEdge: [pt(x2, yBot), pt(x2, yTop)],
        foldAngle: 90, foldDirection: 1,
    });

    // Column 1 — ROOT
    const frontPaths: PathSegment[] = [
        line(pt(x3, yBot), pt(x3, yTop), 'CREASE'),
        line(pt(x2, yTop), pt(x3, yTop), colTopTag[1]),
    ];
    allPaths.push(...frontPaths);
    panels.push({
        name: pn[1], label: pn[1] === 'front' ? 'Mặt trước' : 'Hông phải',
        paths: frontPaths, parent: null,
        pivotEdge: null, foldAngle: 0, foldDirection: 1,
    });

    // Column 2
    const rightPaths: PathSegment[] = [
        line(pt(x4, yBot), pt(x4, yTop), 'CREASE'),
        line(pt(x4, yTop), pt(x3, yTop), colTopTag[2]),
    ];
    allPaths.push(...rightPaths);
    panels.push({
        name: pn[2], label: pn[2] === 'right' ? 'Hông phải' : 'Mặt sau',
        paths: rightPaths, parent: pn[1],
        pivotEdge: [pt(x3, yBot), pt(x3, yTop)],
        foldAngle: -90, foldDirection: -1,
    });

    // Column 3
    const backPaths: PathSegment[] = [
        line(pt(x5, yBot), pt(x5, yTop), glueSide === 'left' ? 'CUT' : 'CREASE'),
        line(pt(x5, yTop), pt(x4, yTop), colTopTag[3]),
    ];
    allPaths.push(...backPaths);
    panels.push({
        name: pn[3], label: pn[3] === 'back' ? 'Mặt sau' : 'Hông trái',
        paths: backPaths, parent: pn[2],
        pivotEdge: [pt(x4, yBot), pt(x4, yTop)],
        foldAngle: -90, foldDirection: -1,
    });

    // --- Đường CREASE đáy liên tục (gộp 4 cột thành 1 đoạn) ---
    allPaths.push(line(pt(x1, yBot), pt(x5, yBot), 'CREASE'));

    // ============================================================
    // C. GABLE TOP — Nắp mái + quai xách
    //
    //  Cấu trúc (mỗi panel Front/Back):
    //
    //         E──────────────F           ← EF = 2/3 AB
    //        ╱│    Y───K    │╲
    //   O──P             Q──T
    //          M─────N        
    //   A─R────M───N────H─B   ← CREASE fold (AB)
    //                            
    //         Trapezoid ABCD   
    //                        
    //       D────────C        body panel top (CREASE)
    //
    //  1. ABCD: hình thang cân, h = W/2, AB = 5/6 L
    //  2. EFBA: hình thang cân trên AB, h = 0.9(W/2), EF = 2/3 AB
    //  3. OPRA, QTBH: hình chữ nhật 2 bên, h = 0.85h2, w = AB/9
    //  4. YKNM: lỗ quai xách, w = 2/5 AB, h = 1/2 h2
    // ============================================================

    // --- C1. Gable Panel Front (trên Front Panel, L wide) ---
    const gfPaths = buildGablePanel(xFrontL, xFrontR, yTop, L, W, HW, HHL, handleShape, params.handleY, params.HFH);
    allPaths.push(...gfPaths);
    panels.push({
        name: 'gable_front', label: 'Mái trước',
        paths: gfPaths, parent: 'front',
        pivotEdge: [pt(xFrontL, yTop), pt(xFrontR, yTop)],
        foldAngle: 90, foldDirection: 1,
    });

    // --- C2. Gable Panel Back (trên Back Panel, L wide) ---
    const gbPaths = buildGablePanel(xBackL, xBackR, yTop, L, W, HW, HHL, handleShape, params.handleY, params.HFH);
    allPaths.push(...gbPaths);
    panels.push({
        name: 'gable_back', label: 'Mái sau',
        paths: gbPaths, parent: 'back',
        pivotEdge: [pt(xBackL, yTop), pt(xBackR, yTop)],
        foldAngle: 90, foldDirection: 1,
    });

    // --- C3. Side Flap trái (trên SideA Panel, W wide) — Tam giác ---
    const sfLPaths = buildSideTriFlap(xSideAL, xSideAR, yTop, W, 1, HH);
    allPaths.push(...sfLPaths);
    panels.push({
        name: 'side_flap_left', label: 'Tai mái trái',
        paths: sfLPaths,
        parent: isFrontFirst ? 'right' : 'left',
        pivotEdge: [pt(xSideAL, yTop), pt(xSideAR, yTop)],
        foldAngle: 90, foldDirection: 1,
    });

    // --- C4. Side Flap phải (trên SideB Panel, W wide) — Tam giác ---
    const sfRPaths = buildSideTriFlap(xSideBL, xSideBR, yTop, W, 1, HH);
    allPaths.push(...sfRPaths);
    panels.push({
        name: 'side_flap_right', label: 'Tai mái phải',
        paths: sfRPaths,
        parent: isFrontFirst ? 'left' : 'right',
        pivotEdge: [pt(xSideBL, yTop), pt(xSideBR, yTop)],
        foldAngle: 90, foldDirection: 1,
    });

    // ============================================================
    // D. CRASH-LOCK BOTTOM (giống SLB hoàn toàn)
    // ============================================================
    const pairCount = computeSnapLockPairs(L, W, SLP);

    // --- D1. Female Receiver ---
    const femalePaths = buildFemaleReceiver(snap(xFrontL + h), snap(xFrontR - h), yBot, L, W, T, pairCount);
    allPaths.push(...femalePaths);
    panels.push({
        name: 'u_flap', label: 'Đáy khe U', paths: femalePaths,
        parent: 'front', pivotEdge: [pt(xFrontL, yBot), pt(xFrontR, yBot)],
        foldAngle: -90, foldDirection: -1,
    });

    // --- D2. Male Hook ---
    const malePaths = buildMaleHook(snap(xBackL + h), snap(xBackR - h), yBot, L, W, T, pairCount);
    allPaths.push(...malePaths);
    panels.push({
        name: 'locking_tab', label: 'Đáy lưỡi gài', paths: malePaths,
        parent: 'back', pivotEdge: [pt(xBackL, yBot), pt(xBackR, yBot)],
        foldAngle: -90, foldDirection: -1,
    });

    // --- D3. Bottom Dust Flap trái ---
    const dustBotLPaths = buildBottomDustFlap(snap(xSideAL + h), snap(xSideAR - h), yBot, L, W, T, !sideAIsLeft);
    allPaths.push(...dustBotLPaths);
    panels.push({
        name: 'side_hook_left', label: 'Tai đáy trái', paths: dustBotLPaths,
        parent: isFrontFirst ? 'right' : 'left',
        pivotEdge: [pt(xSideAL, yBot), pt(xSideAR, yBot)],
        foldAngle: -90, foldDirection: -1,
    });

    // --- D4. Bottom Dust Flap phải ---
    const dustBotRPaths = buildBottomDustFlap(snap(xSideBL + h), snap(xSideBR - h), yBot, L, W, T, !sideBIsLeft);
    allPaths.push(...dustBotRPaths);
    panels.push({
        name: 'side_hook_right', label: 'Tai đáy phải', paths: dustBotRPaths,
        parent: isFrontFirst ? 'left' : 'right',
        pivotEdge: [pt(xSideBL, yBot), pt(xSideBR, yBot)],
        foldAngle: -90, foldDirection: -1,
    });

    // ============================================================
    // D5. Nối liền cạnh flap đáy tại các junction x1–x5
    //
    // Approach: kéo dài cạnh đầu/cuối của mỗi flap đến giao điểm
    // (V-peak) rồi nối trực tiếp + bo nhọn.
    // ============================================================

    // --- lineIntersect helper ---
    const lineIntersect = (a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): Point2D | null => {
        const dx1 = a2.x - a1.x, dy1 = a2.y - a1.y;
        const dx2 = b2.x - b1.x, dy2 = b2.y - b1.y;
        const denom = dx1 * dy2 - dy1 * dx2;
        if (Math.abs(denom) < 1e-10) return null;
        const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
        return pt(snap(a1.x + t * dx1), snap(a1.y + t * dy1));
    };

    // --- pointedFillet helper ---
    const pointedFillet = (
        corner: Point2D, prev: Point2D, next: Point2D, d: number
    ): PathSegment => {
        const dx1 = prev.x - corner.x, dy1 = prev.y - corner.y;
        const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        const dx2 = next.x - corner.x, dy2 = next.y - corner.y;
        const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        if (len1 < 0.01 || len2 < 0.01) return line(prev, next, 'CUT');
        const dClamped = Math.min(d, len1 / 2, len2 / 2);
        const t1 = pt(snap(corner.x + (dx1 / len1) * dClamped), snap(corner.y + (dy1 / len1) * dClamped));
        const t2 = pt(snap(corner.x + (dx2 / len2) * dClamped), snap(corner.y + (dy2 / len2) * dClamped));
        const pull = 0.2;
        const cp1 = pt(snap(t1.x + (corner.x - t1.x) * pull), snap(t1.y + (corner.y - t1.y) * pull));
        const cp2 = pt(snap(t2.x + (corner.x - t2.x) * pull), snap(t2.y + (corner.y - t2.y) * pull));
        return bezierSegment(t1, cp1, cp2, t2, 'CUT');
    };

    const filletD = snap(Math.min(h, 2));

    // --- Map flaps theo thứ tự panel layout (slot 0–3) ---
    const bottomFlaps: Array<{
        paths: PathSegment[];
        leftIdx: number; leftIsStart: boolean;
        rightIdx: number; rightIsStart: boolean;
    }> = [];

    for (let col = 0; col < 4; col++) {
        const role = pn[col];
        if (role === 'front') {
            bottomFlaps.push({
                paths: femalePaths,
                leftIdx: 0, leftIsStart: true,
                rightIdx: femalePaths.length - 1, rightIsStart: false,
            });
        } else if (role === 'back') {
            bottomFlaps.push({
                paths: malePaths,
                leftIdx: 0, leftIsStart: true,
                rightIdx: malePaths.length - 1, rightIsStart: false,
            });
        } else {
            const sideACol = isFrontFirst ? 1 : 0;
            const isSlotA = col === sideACol;
            const dustPaths = isSlotA ? dustBotLPaths : dustBotRPaths;
            const mirrorFlag = isSlotA ? isFrontFirst : !isFrontFirst;
            if (!mirrorFlag) {
                bottomFlaps.push({
                    paths: dustPaths,
                    leftIdx: 0, leftIsStart: true,
                    rightIdx: dustPaths.length - 1, rightIsStart: false,
                });
            } else {
                bottomFlaps.push({
                    paths: dustPaths,
                    leftIdx: dustPaths.length - 1, leftIsStart: false,
                    rightIdx: 0, rightIsStart: true,
                });
            }
        }
    }

    // --- Junction x1: kéo dài flap[0] mép trái tới x1 ---
    {
        const f = bottomFlaps[0];
        const seg = f.paths[f.leftIdx];
        if (f.leftIsStart) seg.points[0] = pt(x1, seg.points[0].y);
        else seg.points[seg.points.length - 1] = pt(x1, seg.points[seg.points.length - 1].y);
    }

    // --- Junction x5: kéo dài flap[3] mép phải tới x5 ---
    {
        const f = bottomFlaps[3];
        const seg = f.paths[f.rightIdx];
        if (f.rightIsStart) seg.points[0] = pt(x5, seg.points[0].y);
        else seg.points[seg.points.length - 1] = pt(x5, seg.points[seg.points.length - 1].y);
    }

    // --- Junctions x2, x3, x4: V-peak với lineIntersect + pointedFillet ---
    const junctionXs = [x2, x3, x4];
    for (let j = 0; j < 3; j++) {
        const fL = bottomFlaps[j];
        const fR = bottomFlaps[j + 1];

        const segL = fL.paths[fL.rightIdx];
        const ptsL = segL.points;
        const jPtIdxL = fL.rightIsStart ? 0 : ptsL.length - 1;
        const prevIdxL = fL.rightIsStart ? 1 : ptsL.length - 2;

        const segR = fR.paths[fR.leftIdx];
        const ptsR = segR.points;
        const jPtIdxR = fR.leftIsStart ? 0 : ptsR.length - 1;
        const nextIdxR = fR.leftIsStart ? 1 : ptsR.length - 2;

        const meet = lineIntersect(
            ptsL[prevIdxL], ptsL[jPtIdxL],
            ptsR[jPtIdxR], ptsR[nextIdxR],
        );

        if (meet && meet.y > yBot) {
            ptsL[jPtIdxL] = meet;
            ptsR[jPtIdxR] = meet;

            const fillet = pointedFillet(meet, ptsL[prevIdxL], ptsR[nextIdxR], filletD);
            ptsL[jPtIdxL] = fillet.points[0];
            ptsR[jPtIdxR] = fillet.points[fillet.points.length - 1];
            // Splice fillet vào left flap path array
            const spliceIdx = fL.rightIsStart ? fL.rightIdx : fL.rightIdx + 1;
            fL.paths.splice(spliceIdx, 0, fillet);
            if (fL.leftIdx >= spliceIdx) fL.leftIdx++;
            allPaths.push(fillet);
        } else {
            const xJ = junctionXs[j];
            allPaths.push(line(pt(snap(xJ - h), yBot), pt(snap(xJ + h), yBot), 'CUT'));
        }
    }

    // --- Nối top: side flap ↔ gable panel tại giao điểm + bo nhọn ---
    const topFlaps = [
        { paths: sfLPaths, gableA: gfPaths, gableB: gbPaths },
        { paths: sfRPaths, gableA: gfPaths, gableB: gbPaths },
    ];

    for (const { paths: sfPaths, gableA, gableB } of topFlaps) {
        // Side flap: first seg = left edge, last seg = right edge
        for (const isLeft of [true, false]) {
            const sfSeg = isLeft ? sfPaths[0] : sfPaths[sfPaths.length - 1];
            const sfPt = isLeft ? sfSeg.points[0] : sfSeg.points[sfSeg.points.length - 1];

            // Tìm gable edge gần nhất
            for (const gable of [gableA, gableB]) {
                const candidates = [
                    { seg: gable[0], isStart: true },
                    { seg: gable[gable.length - 1], isStart: false },
                ];
                for (const c of candidates) {
                    const gPt = c.isStart ? c.seg.points[0] : c.seg.points[c.seg.points.length - 1];
                    const gap = Math.abs(gPt.x - sfPt.x) + Math.abs(gPt.y - sfPt.y);
                    if (gap < T * 3) {
                        const meet = lineIntersect(
                            sfSeg.points[0], sfSeg.points[1],
                            c.seg.points[0], c.seg.points[1],
                        );
                        if (meet && meet.y > yTop) {
                            // Kéo dài cả 2 cạnh
                            if (isLeft) sfSeg.points[0] = meet;
                            else sfSeg.points[sfSeg.points.length - 1] = meet;
                            if (c.isStart) c.seg.points[0] = meet;
                            else c.seg.points[c.seg.points.length - 1] = meet;

                            // Bo nhọn
                            const prev = isLeft ? sfSeg.points[1] : sfSeg.points[sfSeg.points.length - 2];
                            const next = c.isStart ? c.seg.points[1] : c.seg.points[c.seg.points.length - 2];
                            const fillet = pointedFillet(meet, prev, next, filletD);

                            if (isLeft) sfSeg.points[0] = fillet.points[0];
                            else sfSeg.points[sfSeg.points.length - 1] = fillet.points[0];
                            if (c.isStart) c.seg.points[0] = fillet.points[fillet.points.length - 1];
                            else c.seg.points[c.seg.points.length - 1] = fillet.points[fillet.points.length - 1];

                            // Splice fillet vào side flap
                            if (isLeft) sfPaths.splice(0, 0, fillet);
                            else sfPaths.push(fillet);
                            allPaths.push(fillet);
                        }
                    }
                }
            }
        }
    }

    // ============================================================
    // E. Bounding Box & Return
    // ============================================================
    const bb = computeBoundingBox(allPaths);

    return {
        name: 'Gable Box',
        standardCode: 'GABLE-CARRIER',
        description: 'Hộp quai xách — Bánh kem, Quà tặng',
        panels, allPaths, boundingBox: bb, params,
    };
}

// ============================================================
// buildGablePanel — Phần nắp Gable Box
//
//         E──────────────F           ← EF = 2/3 AB
//        ╱│    Y───K    │╲
//   O──P             Q──T
//          M─────N        
//   A─R────H─B   AB CREASE fold
//                            
//         Trapezoid ABCD   
//                        
//       D────────C        body panel top (đã vẽ bởi body)
//
// 1. ABCD: hình thang cân, cao = W/2, AB = 5/6 × L
// 2. EFBA: hình thang cân trên AB, cao = 0.9 × W/2, EF = 2/3 × AB
// 3. OPRA: hcn trái, cao = 0.85 × h2, rộng = AB/9
// 4. QTBH: hcn phải (đối xứng OPRA)
// 5. YKNM: lỗ quai xách, rộng = 2/5 × AB, cao = 1/2 × h2
// ============================================================
function buildGablePanel(
    xLeft: number,   // D.x
    xRight: number,  // C.x
    yBase: number,   // D.y = C.y
    panelW: number,  // L
    sideW: number,   // W
    overrideHW: number = 0,   // HW — override rộng lỗ quai (0 = dùng tỷ lệ mặc định)
    overrideHHL: number = 0,  // HHL — override cao lỗ quai (0 = dùng tỷ lệ mặc định)
    holeShape: 'oval' | 'roundRect' = 'oval', // Dạng lỗ quai
    holeYMode: 'bottom' | 'center' = 'bottom', // Vị trí lỗ
    overrideHFH: number = 0,  // HFH — override cao phần tay cầm (0 = dùng tỷ lệ mặc định)
): PathSegment[] {
    const paths: PathSegment[] = [];

    // === Step 1: Rectangle ABCD (full width = L) ===
    const h1 = snap(sideW / 2);

    const _D = pt(xLeft, yBase);
    const _C = pt(xRight, yBase);
    const _A = pt(xLeft, snap(yBase + h1));
    const _B = pt(xRight, snap(yBase + h1));

    // === Step 2: Rectangle AEFB (hẹp hơn, EF = 2/3 L, thụt vào trong) ===
    const defaultH2 = snap(0.9 * h1);
    const h2 = snap(overrideHFH > 0 ? overrideHFH : defaultH2);
    const EF_width = snap(2 / 3 * panelW);
    const insetEF = snap((panelW - EF_width) / 2);
    const _E = pt(snap(xLeft + insetEF), snap(_A.y + h2));
    const _F = pt(snap(xRight - insetEF), snap(_A.y + h2));

    // === Step 3: Tab trái — thụt vào trong bên PHẢI của A ===
    const rectH = snap(0.85 * h2);
    const rectW = snap(panelW / 9);

    const _R = pt(snap(xLeft + rectW), _A.y);  // Góc trong dưới
    const _O = pt(xLeft, snap(_A.y + rectH));   // Góc ngoài trên
    const _P = pt(snap(xLeft + rectW), snap(_A.y + rectH)); // Góc trong trên

    // === Step 3b: Tab phải — thụt vào trong bên TRÁI của B ===
    const _H = pt(snap(xRight - rectW), _B.y);  // Góc trong dưới
    const _Q = pt(snap(xRight - rectW), snap(_B.y + rectH)); // Góc trong trên
    const _T = pt(xRight, snap(_B.y + rectH));  // Góc ngoài trên

    // === Step 4: Handle hole YKNM ===
    const defaultHoleW = snap(2 / 5 * panelW);
    const defaultHoleH = snap(1 / 2 * h2);
    const holeW = snap(Math.min(overrideHW > 0 ? overrideHW : defaultHoleW, panelW - 20));
    const holeH = snap(Math.min(overrideHHL > 0 ? overrideHHL : defaultHoleH, h2 - 4));
    const holeCX = snap((_A.x + _B.x) / 2);

    // Tính toán tọa độ Y của lỗ
    let holeBottomY = _A.y;
    if (holeYMode === 'center') {
        const availableH = h2; // Chiều cao vùng chứa tay cầm
        holeBottomY = snap(_A.y + (availableH - holeH) / 2);
    }
    // Nếu 'bottom', mặc định là _A.y (sát đáy)

    const _M = pt(snap(holeCX - holeW / 2), holeBottomY);
    const _N = pt(snap(holeCX + holeW / 2), holeBottomY);
    const _Y = pt(_M.x, snap(holeBottomY + holeH));
    const _K = pt(_N.x, snap(holeBottomY + holeH));

    // ================================================================
    // CUT — Outer contour (tab thụt vào trong, bo tròn đầu tab)
    //   D → A → O    P → E → F → Q    T → B → C
    // ================================================================
    const r = snap(rectW / 2);
    const kappa = 4 * (Math.sqrt(2) - 1) / 3;
    const kLen = snap(r * kappa);

    // Tab trái arc (OP thụt vào, bo tại đỉnh)
    const oArc1 = pt(_O.x, snap(_O.y - r));                    // Start arc trên cạnh AO
    const oArcTop = pt(snap(_O.x + r), _O.y);                  // Đỉnh arc (trên)
    const pArcTop = pt(snap(_P.x - r), _P.y);                  // Đỉnh arc (trên)
    const pArc2 = pt(_P.x, snap(_P.y - r));                    // End arc trên cạnh PE

    // Tab phải arc (QT thụt vào, bo tại đỉnh)
    const qArc1 = pt(_Q.x, snap(_Q.y - r));                    // Start arc
    const qArcTop = pt(snap(_Q.x + r), _Q.y);                  // Đỉnh arc
    const tArcTop = pt(snap(_T.x - r), _T.y);                  // Đỉnh arc
    const tArc2 = pt(_T.x, snap(_T.y - r));                    // End arc

    paths.push(line(_D, _A, 'CUT'));                            // DA (trái, lên)
    paths.push(line(_A, oArc1, 'CUT'));                         // A → start arc O (lên)
    paths.push(bezierSegment(oArc1, pt(oArc1.x, snap(oArc1.y + kLen)), pt(snap(oArcTop.x - kLen), oArcTop.y), oArcTop, 'CUT'));
    paths.push(line(oArcTop, pArcTop, 'CUT'));                  // Ngang trên tab trái
    paths.push(bezierSegment(pArcTop, pt(snap(pArcTop.x + kLen), pArcTop.y), pt(pArc2.x, snap(pArc2.y + kLen)), pArc2, 'CUT'));
    paths.push(line(pArc2, _E, 'CUT'));                         // P → E (lên)
    paths.push(line(_E, _F, 'CUT'));                            // EF (trên cùng)
    paths.push(line(_F, qArc1, 'CUT'));                         // F → Q inner (xuống)
    paths.push(bezierSegment(qArc1, pt(qArc1.x, snap(qArc1.y + kLen)), pt(snap(qArcTop.x - kLen), qArcTop.y), qArcTop, 'CUT'));
    paths.push(line(qArcTop, tArcTop, 'CUT'));                  // Ngang trên tab phải
    paths.push(bezierSegment(tArcTop, pt(snap(tArcTop.x + kLen), tArcTop.y), pt(tArc2.x, snap(tArc2.y + kLen)), tArc2, 'CUT'));
    paths.push(line(tArc2, _B, 'CUT'));                         // T → B (xuống)
    paths.push(line(_B, _C, 'CUT'));                            // BC (phải, xuống)

    // ================================================================
    // CREASE — Chỉ giữ đường gập ngang AB
    // ================================================================
    paths.push(line(_A, _B, 'CREASE'));  // AB — đường gập chính

    // ================================================================
    // CUT — Lỗ quai xách YKNM
    //   oval = bo tròn góc Y,K | roundRect = góc vuông
    // ================================================================
    if (holeShape === 'oval') {
        const rH = snap(Math.min(holeW * 0.3, holeH * 0.4));
        const kLenH = snap(rH * kappa);

        const y1 = pt(_Y.x, snap(_Y.y - rH));
        const y2 = pt(snap(_Y.x + rH), _Y.y);
        const k1 = pt(snap(_K.x - rH), _K.y);
        const k2 = pt(_K.x, snap(_K.y - rH));

        paths.push(line(_M, y1, 'CUT'));
        paths.push(bezierSegment(y1,
            pt(y1.x, snap(y1.y + kLenH)),
            pt(snap(y2.x - kLenH), y2.y),
            y2, 'CUT'));
        paths.push(line(y2, k1, 'CUT'));
        paths.push(bezierSegment(k1,
            pt(snap(k1.x + kLenH), k1.y),
            pt(k2.x, snap(k2.y + kLenH)),
            k2, 'CUT'));
        paths.push(line(k2, _N, 'CUT'));
        paths.push(line(_N, _M, 'CUT'));
    } else {
        // roundRect — Bo tròn 4 góc
        const r = snap(Math.min(holeW / 4, holeH / 4, 5));
        const kLenH = snap(r * kappa);

        const n1 = pt(snap(_N.x), snap(_N.y + r));
        const n2 = pt(snap(_N.x - r), snap(_N.y));
        const m1 = pt(snap(_M.x + r), snap(_M.y));
        const m2 = pt(snap(_M.x), snap(_M.y + r));
        const y1 = pt(snap(_Y.x), snap(_Y.y - r));
        const y2 = pt(snap(_Y.x + r), snap(_Y.y));
        const k1 = pt(snap(_K.x - r), snap(_K.y));
        const k2 = pt(snap(_K.x), snap(_K.y - r));

        paths.push(line(m2, y1, 'CUT')); // Left
        paths.push(bezierSegment(y1,
            pt(y1.x, snap(y1.y + kLenH)),
            pt(snap(y2.x - kLenH), y2.y),
            y2, 'CUT')); // TL Corner

        paths.push(line(y2, k1, 'CUT')); // Top
        paths.push(bezierSegment(k1,
            pt(snap(k1.x + kLenH), k1.y),
            pt(k2.x, snap(k2.y + kLenH)),
            k2, 'CUT')); // TR Corner

        paths.push(line(k2, n1, 'CUT')); // Right
        paths.push(bezierSegment(n1,
            pt(n1.x, snap(n1.y - kLenH)),
            pt(snap(n2.x + kLenH), n2.y),
            n2, 'CUT')); // BR Corner

        paths.push(line(n2, m1, 'CUT')); // Bottom
        paths.push(bezierSegment(m1,
            pt(snap(m1.x - kLenH), m1.y),
            pt(m2.x, snap(m2.y - kLenH)),
            m2, 'CUT')); // BL Corner
    }

    return paths;
}

// ============================================================
// Side Flap — Tam giác cân, cao = h1+h2, base = W, bo góc đỉnh
// ============================================================
function buildSideTriFlap(
    xLeft: number, xRight: number,
    yBase: number, panelW: number, dir: 1 | -1,
    overrideH: number = 0, // 0 = auto (h1+h2), >0 = custom, clamp >= slotH+5
): PathSegment[] {
    const paths: PathSegment[] = [];
    const h1 = snap(panelW / 2);
    const h2 = snap(0.9 * h1);
    const defaultH = snap(h1 + h2);
    const slotH = snap(0.85 * h2);
    const minH = snap(slotH + 5);             // Tối thiểu = rãnh + 0.5cm
    const triH = snap(Math.max(overrideH > 0 ? overrideH : defaultH, minH));
    const xMid = snap((xLeft + xRight) / 2);
    const yTip = snap(yBase + dir * triH);

    // Bo tròn đỉnh
    const halfBase = (xRight - xLeft) / 2;
    const sideLen = Math.sqrt(halfBase * halfBase + triH * triH);
    const tipR = snap(Math.min(panelW * 0.40, triH * 0.30));
    const kappa = 4 * (Math.sqrt(2) - 1) / 3;
    const kLenT = snap(tipR * kappa);

    const uLx = (xLeft - xMid) / sideLen;
    const uLy = (dir * (yBase - yTip)) / sideLen;
    const uRx = (xRight - xMid) / sideLen;
    const uRy = (dir * (yBase - yTip)) / sideLen;

    const tL = pt(snap(xMid + uLx * tipR), snap(yTip + uLy * tipR));
    const tR = pt(snap(xMid + uRx * tipR), snap(yTip + uRy * tipR));

    paths.push(line(pt(xLeft, yBase), tL, 'CUT'));
    paths.push(bezierSegment(tL,
        pt(snap(tL.x - uLx * kLenT), snap(tL.y - uLy * kLenT)),
        pt(snap(tR.x - uRx * kLenT), snap(tR.y - uRy * kLenT)),
        tR, 'CUT'));
    paths.push(line(tR, pt(xRight, yBase), 'CUT'));

    // === Rnh gi (lock slot)  dọc giữa, bắt ầu từ ường nhấn ===
    const slotW = 3;                          // Rng rnh = 3mm
    const slotR = snap(slotW / 2);            // Bo trn ầu trn = bn nguyt
    const slotKLen = snap(slotR * kappa);

    const sL = pt(snap(xMid - slotW / 2), yBase);  // Gc dưi tri
    const sR = pt(snap(xMid + slotW / 2), yBase);  // Gc dưi phải
    const sTopY = snap(yBase + dir * slotH);
    const sTopL = pt(sL.x, snap(sTopY - dir * slotR));  // Bắt ầu arc tri
    const sTopR = pt(sR.x, snap(sTopY - dir * slotR));  // Bắt ầu arc phải
    const sArcTop = pt(xMid, sTopY);                     // Đnh arc

    // Vẽ rnh: dưi tri  ln  arc trn  xung  dưi phải
    paths.push(line(sL, sTopL, 'CUT'));
    paths.push(bezierSegment(sTopL,
        pt(sTopL.x, snap(sTopL.y + dir * slotKLen)),
        pt(snap(sArcTop.x - slotKLen), sArcTop.y),
        sArcTop, 'CUT'));
    paths.push(bezierSegment(sArcTop,
        pt(snap(sArcTop.x + slotKLen), sArcTop.y),
        pt(sTopR.x, snap(sTopR.y + dir * slotKLen)),
        sTopR, 'CUT'));
    paths.push(line(sTopR, sR, 'CUT'));

    return paths;
}

