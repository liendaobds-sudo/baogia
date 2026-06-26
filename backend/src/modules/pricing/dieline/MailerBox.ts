// ============================================================
// FEFCO 0427 — Mailer Box / Roll End Tuck Top
// Hộp nắp gài liền tự khóa — pizza, e‑commerce, gift box.
//
// Layout NGANG (cuộn ngang, giống RTE), thuận cho buildDustFlap:
//
//                   [DF‑TL]        [DF‑TR]
//    ┌──Tab─Cuộn─────┼──────────────┼──────Cuộn─Tab──┐
//    │   Side Top     │             │     Side Top    │
// [Front]─────────[BOTTOM + SLOTS]──────[Back]──[Lid]──[Tuck]
//    │   Side Bot     │             │     Side Bot    │
//    └──Tab─Cuộn─────┼──────────────┼──────Cuộn─Tab──┘
//                   [DF‑BL]        [DF‑BR]
//
// Gốc (0,0) = góc dưới‑trái mặt BOTTOM.
// X: Front(‑D→0) | Bottom(0→L) | Back(L→L+D) | Lid | Tuck
// Y: SideBot(‑) | Bottom(0→W) | SideTop(+)
// ============================================================

import {
    BoxParams,
    DielineModel,
    Panel,
    PathSegment,
} from './types';

import {
    pt,
    line,
    snap,
    computeBoundingBox,
} from './utils';


/**
 * Sinh bản vẽ khuôn bế Mailer Box (FEFCO 0427).
 * Thuật toán tham số hóa 100%, bù trừ T theo cơ học gập.
 */
export function generateMailerBox(params: BoxParams): DielineModel {
    const { L, W, D, T, C } = params;

    const allPaths: PathSegment[] = [];
    const panels: Panel[] = [];

    // ── THÔNG SỐ ĐỘNG ──
    const T_fold = snap(2 * T);
    const X_outer = snap(2 * D + T);
    const X_tab = snap(X_outer + T + 1);

    const so = snap(D + 5);          // Vị trí tab (cách mép X)
    const sl = snap(W * 0.15);       // Chiều dài tab
    const slot_w = snap(T + 1);      // Bề rộng slot

    const dx = snap(T + C);          // Độ thu hẹp nắp
    const lid_H = snap(W - T);       // Chiều dài nắp
    const H_tuck = snap(D * 0.5);    // Chiều cao tai gài
    const chamf = snap(C * 4);       // Góc vát tuck

    // ============================================================
    // 1. BOTTOM (ĐÁY) — ROOT
    // ============================================================
    const bottomPaths: PathSegment[] = [
        line(pt(0, 0), pt(L, 0), 'CREASE'),
        line(pt(L, 0), pt(L, W), 'CREASE'),
        line(pt(L, W), pt(0, W), 'CREASE'),
        line(pt(0, W), pt(0, 0), 'CREASE'),
    ];
    allPaths.push(...bottomPaths);
    panels.push({
        name: 'bottom', label: 'Đáy', paths: bottomPaths,
        parent: null, pivotEdge: null, foldAngle: 0, foldDirection: 1,
    });

    // ── SLOTS trên Bottom (4 khe, dịch vào 2T từ mép Y) ──
    const slotPositions = [
        { x: so, y: snap(2 * T) },
        { x: so, y: snap(W - 2 * T - slot_w) },
        { x: snap(L - so - sl), y: snap(2 * T) },
        { x: snap(L - so - sl), y: snap(W - 2 * T - slot_w) },
    ];
    for (const s of slotPositions) {
        allPaths.push(
            line(pt(s.x, s.y), pt(snap(s.x + sl), s.y), 'CUT'),
            line(pt(snap(s.x + sl), s.y), pt(snap(s.x + sl), snap(s.y + slot_w)), 'CUT'),
            line(pt(snap(s.x + sl), snap(s.y + slot_w)), pt(s.x, snap(s.y + slot_w)), 'CUT'),
            line(pt(s.x, snap(s.y + slot_w)), pt(s.x, s.y), 'CUT'),
        );
    }

    // ============================================================
    // 2. FRONT (MẶT TRƯỚC) — Trái Bottom
    // ============================================================
    const frontPaths: PathSegment[] = [
        line(pt(snap(-D), 0), pt(snap(-D), W), 'CUT'),
    ];
    allPaths.push(...frontPaths);
    panels.push({
        name: 'front', label: 'Mặt trước', paths: frontPaths,
        parent: 'bottom', pivotEdge: [pt(0, 0), pt(0, W)],
        foldAngle: 90, foldDirection: 1,
    });

    // ============================================================
    // 3. BACK + LID + TUCK — Phải Bottom
    // ============================================================

    // -- 3a. Back: bản lề nắp tại x = L+D --
    const backPaths: PathSegment[] = [
        line(pt(snap(L + D), 0), pt(snap(L + D), W), 'CREASE'),
    ];
    allPaths.push(...backPaths);
    panels.push({
        name: 'back', label: 'Mặt sau', paths: backPaths,
        parent: 'bottom', pivotEdge: [pt(L, 0), pt(L, W)],
        foldAngle: -90, foldDirection: -1,
    });

    // -- 3b. Lid (thu hẹp dx, mọc sang phải) --
    const lidL = snap(L + D);
    const lidR = snap(L + D + lid_H);

    const lidPaths: PathSegment[] = [
        // Viền dưới (vát vào dx)
        line(pt(lidL, 0), pt(snap(lidL + dx), dx), 'CUT'),
        line(pt(snap(lidL + dx), dx), pt(lidR, dx), 'CUT'),
        // Viền trên (vát vào dx)
        line(pt(lidL, W), pt(snap(lidL + dx), snap(W - dx)), 'CUT'),
        line(pt(snap(lidL + dx), snap(W - dx)), pt(lidR, snap(W - dx)), 'CUT'),
        // Cấn tai gài (CREASE)
        line(pt(lidR, dx), pt(lidR, snap(W - dx)), 'CREASE'),
    ];
    allPaths.push(...lidPaths);
    panels.push({
        name: 'lid', label: 'Nắp', paths: lidPaths,
        parent: 'back', pivotEdge: [pt(lidL, 0), pt(lidL, W)],
        foldAngle: -90, foldDirection: -1,
    });

    // -- 3c. Tuck Flap (bo vát góc chamf) --
    const tuckL = lidR;
    const tuckR = snap(lidR + H_tuck);

    const tuckPaths: PathSegment[] = [
        line(pt(tuckL, dx), pt(snap(tuckR - chamf), dx), 'CUT'),
        line(pt(snap(tuckR - chamf), dx), pt(tuckR, snap(dx + chamf)), 'CUT'),
        line(pt(tuckR, snap(dx + chamf)), pt(tuckR, snap(W - dx - chamf)), 'CUT'),
        line(pt(tuckR, snap(W - dx - chamf)), pt(snap(tuckR - chamf), snap(W - dx)), 'CUT'),
        line(pt(snap(tuckR - chamf), snap(W - dx)), pt(tuckL, snap(W - dx)), 'CUT'),
    ];
    allPaths.push(...tuckPaths);
    panels.push({
        name: 'tuck_top', label: 'Lưỡi gài nắp', paths: tuckPaths,
        parent: 'lid', pivotEdge: [pt(tuckL, dx), pt(tuckL, snap(W - dx))],
        foldAngle: 90, foldDirection: 1,
    });

    // ============================================================
    // 4. TAI CHẶN BỤI (DUST FLAPS) — dùng buildDustFlap (cuộn ngang)
    //    Phía tiếp giáp side wall (junction): xiên giống RTE
    //    Phía không tiếp giáp (far): THẲNG xuống nối mặt chính
    // ============================================================
    const dfXL_front = snap(-D);  // Khít mép Front panel
    const dfXR_front = 0;
    const dfXL_back = L;
    const dfXR_back = snap(L + D);  // Khít mép Back panel

    function buildMailerDustFlap(
        xLeft: number, xRight: number,
        yBase: number, height: number,
        dir: 1 | -1,
    ): PathSegment[] {
        const paths: PathSegment[] = [];
        const w = xRight - xLeft;
        const yTip = snap(yBase + dir * height);

        // Tỷ lệ xiên giống buildDustFlap
        const sx = snap(w * 0.05);

        // Cân đối: xiên CẢ HAI bên
        const pBL = pt(xLeft, yBase);
        const pML = pt(snap(xLeft + sx), snap(yBase + dir * sx));
        const pTL = pt(snap(xLeft + 2 * sx), yTip);
        const pTR = pt(snap(xRight - 2 * sx), yTip);
        const pMR = pt(snap(xRight - sx), snap(yBase + dir * sx));
        const pBR = pt(xRight, yBase);

        // CUT: trái xiên lên
        paths.push(line(pBL, pML, 'CUT'));
        paths.push(line(pML, pTL, 'CUT'));
        // CUT: đỉnh
        paths.push(line(pTL, pTR, 'CUT'));
        // CUT: phải xiên xuống
        paths.push(line(pTR, pMR, 'CUT'));
        paths.push(line(pMR, pBR, 'CUT'));

        return paths;
    }

    // Trước‑Trên: junction ở PHẢI (xRight=0 tiếp giáp side wall)
    const dfFT = buildMailerDustFlap(dfXL_front, dfXR_front, W, D, 1);
    allPaths.push(line(pt(dfXL_front, W), pt(0, W), 'CREASE'));
    allPaths.push(...dfFT);
    panels.push({
        name: 'dust_front_top', label: 'Tai bụi trước‑trên', paths: dfFT,
        parent: 'front', pivotEdge: [pt(dfXL_front, W), pt(0, W)],
        foldAngle: -90, foldDirection: -1,
    });

    // Trước‑Dưới: junction ở PHẢI
    const dfFB = buildMailerDustFlap(dfXL_front, dfXR_front, 0, D, -1);
    allPaths.push(line(pt(dfXL_front, 0), pt(0, 0), 'CREASE'));
    allPaths.push(...dfFB);
    panels.push({
        name: 'dust_front_bot', label: 'Tai bụi trước‑dưới', paths: dfFB,
        parent: 'front', pivotEdge: [pt(dfXL_front, 0), pt(0, 0)],
        foldAngle: 90, foldDirection: 1,
    });

    // Sau‑Trên: junction ở TRÁI (xLeft=L tiếp giáp side wall)
    const dfBT = buildMailerDustFlap(dfXL_back, dfXR_back, W, D, 1);
    allPaths.push(line(pt(L, W), pt(dfXR_back, W), 'CREASE'));
    allPaths.push(...dfBT);
    panels.push({
        name: 'dust_back_top', label: 'Tai bụi sau‑trên', paths: dfBT,
        parent: 'back', pivotEdge: [pt(L, W), pt(dfXR_back, W)],
        foldAngle: -90, foldDirection: -1,
    });

    // Sau‑Dưới: junction ở TRÁI
    const dfBB = buildMailerDustFlap(dfXL_back, dfXR_back, 0, D, -1);
    allPaths.push(line(pt(L, 0), pt(dfXR_back, 0), 'CREASE'));
    allPaths.push(...dfBB);
    panels.push({
        name: 'dust_back_bot', label: 'Tai bụi sau‑dưới', paths: dfBB,
        parent: 'back', pivotEdge: [pt(L, 0), pt(dfXR_back, 0)],
        foldAngle: 90, foldDirection: 1,
    });

    // ============================================================
    // 5. VÁCH HÔNG CUỘN (SIDE WALLS) — mọc dọc Y từ Bottom
    // ============================================================
    function buildSideWallHoriz(isTop: boolean): PathSegment[] {
        const dirY = isTop ? 1 : -1;
        const Y0 = isTop ? W : 0;
        const paths: PathSegment[] = [];

        const Y1 = snap(Y0 + dirY * D);
        const Y2 = snap(Y0 + dirY * (D + T_fold));
        const Y_base = snap(Y0 + dirY * X_outer);
        const Y_tab_ext = snap(Y0 + dirY * X_tab);

        // Đường cấn kép
        paths.push(line(pt(0, Y1), pt(L, Y1), 'CREASE'));
        paths.push(line(pt(C, Y2), pt(snap(L - C), Y2), 'CREASE'));

        // Viền liên tục (CUT)
        paths.push(line(pt(0, Y0), pt(0, Y1), 'CUT'));
        paths.push(line(pt(0, Y1), pt(C, Y2), 'CUT'));
        paths.push(line(pt(C, Y2), pt(C, Y_base), 'CUT'));
        // Tab 1
        paths.push(line(pt(C, Y_base), pt(so, Y_base), 'CUT'));
        paths.push(line(pt(so, Y_base), pt(so, Y_tab_ext), 'CUT'));
        paths.push(line(pt(so, Y_tab_ext), pt(snap(so + sl), Y_tab_ext), 'CUT'));
        paths.push(line(pt(snap(so + sl), Y_tab_ext), pt(snap(so + sl), Y_base), 'CUT'));
        // Thân giữa
        paths.push(line(pt(snap(so + sl), Y_base), pt(snap(L - so - sl), Y_base), 'CUT'));
        // Tab 2
        paths.push(line(pt(snap(L - so - sl), Y_base), pt(snap(L - so - sl), Y_tab_ext), 'CUT'));
        paths.push(line(pt(snap(L - so - sl), Y_tab_ext), pt(snap(L - so), Y_tab_ext), 'CUT'));
        paths.push(line(pt(snap(L - so), Y_tab_ext), pt(snap(L - so), Y_base), 'CUT'));
        // Phần phải
        paths.push(line(pt(snap(L - so), Y_base), pt(snap(L - C), Y_base), 'CUT'));
        paths.push(line(pt(snap(L - C), Y_base), pt(snap(L - C), Y2), 'CUT'));
        paths.push(line(pt(snap(L - C), Y2), pt(L, Y1), 'CUT'));
        paths.push(line(pt(L, Y1), pt(L, Y0), 'CUT'));

        return paths;
    }

    // Side Wall Top
    const swTopPaths = buildSideWallHoriz(true);
    allPaths.push(...swTopPaths);
    panels.push({
        name: 'side_top', label: 'Hông trên', paths: swTopPaths,
        parent: 'bottom', pivotEdge: [pt(0, W), pt(L, W)],
        foldAngle: -90, foldDirection: -1,
    });

    // Side Wall Bottom
    const swBotPaths = buildSideWallHoriz(false);
    allPaths.push(...swBotPaths);
    panels.push({
        name: 'side_bot', label: 'Hông dưới', paths: swBotPaths,
        parent: 'bottom', pivotEdge: [pt(0, 0), pt(L, 0)],
        foldAngle: 90, foldDirection: 1,
    });

    // ============================================================
    // 6. Bounding Box & Return
    // ============================================================
    const bb = computeBoundingBox(allPaths);

    return {
        name: 'Mailer Box',
        standardCode: 'FEFCO-0427',
        description: 'Hộp nắp gài liền tự khóa — Mailer Box / Roll End Tuck Top',
        panels, allPaths, boundingBox: bb, params,
    };
}
