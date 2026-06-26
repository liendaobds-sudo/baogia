// ============================================================
// Panel fill — dựng đa giác KÍN cho mỗi panel của khuôn bế, ghép thành 1 path `d`
// để tô màu theo hình dạng thật (port từ printsolutions NestingCanvas).
// Thuần, không React. Dùng cho preview xếp khuôn (tô nền từng con).
// ============================================================
import { Panel, PathSegment } from './types';

interface Pt { x: number; y: number }

function segStart(seg: PathSegment): Pt {
    if (seg.type === 'bezier' && seg.controlPoints) return seg.controlPoints[0];
    return seg.points[0];
}
function segEnd(seg: PathSegment): Pt {
    if (seg.type === 'bezier' && seg.controlPoints) return seg.controlPoints[3];
    return seg.points[seg.points.length - 1];
}
function ptsClose(a: Pt, b: Pt, tol = 0.5): boolean {
    return Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol;
}
function segToSvg(seg: PathSegment, isFirst: boolean): string {
    if (seg.type === 'bezier' && seg.controlPoints) {
        const [p0, cp1, cp2, p3] = seg.controlPoints;
        const prefix = isFirst ? `M ${p0.x} ${p0.y} ` : '';
        return `${prefix}C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${p3.x} ${p3.y}`;
    }
    if (seg.type === 'arc') {
        const pts = seg.points;
        if (pts.length === 0) return '';
        const prefix = isFirst ? `M ${pts[0].x} ${pts[0].y} ` : '';
        return prefix + pts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ');
    }
    const [p1, p2] = seg.points;
    return isFirst ? `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}` : `L ${p2.x} ${p2.y}`;
}
function reverseSegment(seg: PathSegment): PathSegment {
    if (seg.type === 'bezier' && seg.controlPoints) {
        const [p0, cp1, cp2, p3] = seg.controlPoints;
        return { ...seg, points: [p3, cp2, cp1, p0], controlPoints: [p3, cp2, cp1, p0] };
    }
    return { ...seg, points: [...seg.points].reverse() };
}

/** Nối các đoạn rời thành chuỗi liên tục (đầu-cuối khớp). */
function chainSegments(segs: PathSegment[]): PathSegment[] {
    if (segs.length === 0) return [];
    const used = new Array(segs.length).fill(false);
    const chain: PathSegment[] = [segs[0]];
    used[0] = true;
    let changed = true;
    while (changed) {
        changed = false;
        const tail = segEnd(chain[chain.length - 1]);
        for (let i = 0; i < segs.length; i++) {
            if (used[i]) continue;
            if (ptsClose(tail, segStart(segs[i]))) { chain.push(segs[i]); used[i] = true; changed = true; break; }
            if (ptsClose(tail, segEnd(segs[i]))) { chain.push(reverseSegment(segs[i])); used[i] = true; changed = true; break; }
        }
        if (!changed) {
            const head = segStart(chain[0]);
            for (let i = 0; i < segs.length; i++) {
                if (used[i]) continue;
                if (ptsClose(head, segEnd(segs[i]))) { chain.unshift(segs[i]); used[i] = true; changed = true; break; }
                if (ptsClose(head, segStart(segs[i]))) { chain.unshift(reverseSegment(segs[i])); used[i] = true; changed = true; break; }
            }
        }
    }
    return chain;
}

/** Ghép tất cả panel thành 1 path `d` (mỗi panel 1 đa giác kín; fallback bbox nếu không khép). */
export function buildPanelFillPaths(panels: Panel[]): string {
    const parts: string[] = [];
    for (const panel of panels) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasPoints = false;
        for (const seg of panel.paths) {
            const points = seg.type === 'bezier' && seg.controlPoints ? seg.controlPoints : seg.points;
            for (const p of points) {
                if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
                hasPoints = true;
            }
        }
        if (panel.pivotEdge) {
            for (const p of panel.pivotEdge) {
                if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
                hasPoints = true;
            }
        }
        if (!hasPoints || maxX - minX < 0.1 || maxY - minY < 0.1) continue;

        const segs = [...panel.paths];
        if (panel.pivotEdge) {
            const [a, b] = panel.pivotEdge;
            segs.push({ points: [a, b], tag: 'CREASE', type: 'line' } as PathSegment);
        }
        const chain = chainSegments(segs);
        if (chain.length >= 3) {
            const start = segStart(chain[0]);
            const end = segEnd(chain[chain.length - 1]);
            if (ptsClose(start, end, 1.0)) {
                const d = chain.map((seg, i) => segToSvg(seg, i === 0)).join(' ');
                parts.push(d + ' Z');
                continue;
            }
        }
        parts.push(`M ${minX} ${minY} L ${maxX} ${minY} L ${maxX} ${maxY} L ${minX} ${maxY} Z`);
    }
    return parts.join(' ');
}


// ============================================================
// buildDielineFill — tô nền theo ĐƯỜNG BAO NGOÀI (silhouette) của toàn bộ khuôn.
// Dùng allPaths (gồm cả hình học KHÔNG nằm trong panel, vd đáy túi/quai) → tô đầy đủ.
// Thuật toán: dựng nửa-cạnh có hướng, men theo mặt (face traversal) lấy vòng kín
// có diện tích lớn nhất = đường bao ngoài. Fallback: bbox nếu không khép.
// ============================================================
function buildDielineFill(paths: PathSegment[]): string {
    const key = (p: Pt) => `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`;
    interface HE { from: Pt; to: Pt; seg: PathSegment; }
    const hes: HE[] = [];
    for (const s of paths) {
        const a = segStart(s), b = segEnd(s);
        if (ptsClose(a, b, 0.4)) continue; // bỏ đoạn suy biến
        hes.push({ from: a, to: b, seg: s });
        hes.push({ from: b, to: a, seg: reverseSegment(s) });
    }
    if (hes.length < 3) return '';

    const out = new Map<string, number[]>();
    hes.forEach((h, i) => {
        const k = key(h.from);
        const arr = out.get(k); if (arr) arr.push(i); else out.set(k, [i]);
    });
    const ang = (from: Pt, to: Pt) => Math.atan2(to.y - from.y, to.x - from.x);

    const visited = new Array(hes.length).fill(false);
    const loops: HE[][] = [];
    for (let s = 0; s < hes.length; s++) {
        if (visited[s]) continue;
        const loop: HE[] = [];
        let cur = s, guard = 0;
        while (cur >= 0 && !visited[cur] && guard++ < 100000) {
            visited[cur] = true;
            const h = hes[cur];
            loop.push(h);
            const incoming = ang(h.to, h.from); // hướng quay ngược về điểm vừa tới
            const cands = out.get(key(h.to)) ?? [];
            // Men theo mặt: chọn cạnh kế tiếp xoay "trái nhất" so với hướng tới.
            let best = -1, bestTurn = Infinity;
            for (const ci of cands) {
                if (visited[ci]) continue;
                const turnRaw = incoming - ang(hes[ci].from, hes[ci].to);
                let turn = turnRaw % (Math.PI * 2);
                if (turn <= 1e-9) turn += Math.PI * 2; // tránh quay lại chính cạnh vừa đi
                if (turn < bestTurn) { bestTurn = turn; best = ci; }
            }
            if (best < 0) break;
            if (best === s) break; // khép vòng
            cur = best;
        }
        if (loop.length >= 3 && ptsClose(loop[loop.length - 1].to, loop[0].from, 1.0)) loops.push(loop);
    }

    const area = (loop: HE[]) => {
        let a = 0;
        for (const h of loop) a += h.from.x * h.to.y - h.to.x * h.from.y;
        return Math.abs(a) / 2;
    };
    let best: HE[] | null = null, bestA = 0;
    for (const l of loops) { const a = area(l); if (a > bestA) { bestA = a; best = l; } }
    if (!best || bestA < 1) return '';

    // Guard phủ: chỉ dùng silhouette khi vòng bao gần như phủ hết bbox toàn khuôn,
    // nếu không (vòng men ra mặt con) → trả '' để controller fallback panel-fill.
    let aMinX = Infinity, aMinY = Infinity, aMaxX = -Infinity, aMaxY = -Infinity;
    for (const h of hes) {
        aMinX = Math.min(aMinX, h.from.x); aMinY = Math.min(aMinY, h.from.y);
        aMaxX = Math.max(aMaxX, h.from.x); aMaxY = Math.max(aMaxY, h.from.y);
    }
    let lMinX = Infinity, lMinY = Infinity, lMaxX = -Infinity, lMaxY = -Infinity;
    for (const h of best) {
        lMinX = Math.min(lMinX, h.from.x); lMinY = Math.min(lMinY, h.from.y);
        lMaxX = Math.max(lMaxX, h.from.x); lMaxY = Math.max(lMaxY, h.from.y);
    }
    const allW = aMaxX - aMinX, allH = aMaxY - aMinY;
    const covW = allW > 0 ? (lMaxX - lMinX) / allW : 1;
    const covH = allH > 0 ? (lMaxY - lMinY) / allH : 1;
    if (covW < 0.9 || covH < 0.9) return '';

    return best.map((h, i) => segToSvg(h.seg, i === 0)).join(' ') + ' Z';
}

export { buildDielineFill };
