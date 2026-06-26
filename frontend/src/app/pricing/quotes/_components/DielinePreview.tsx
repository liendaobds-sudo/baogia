"use client";
import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../../_components/apiClient';

/**
 * DielinePreview — preview HỢP NHẤT cho báo giá hộp offset:
 *  • Khuôn bế trải phẳng (CUT/CREASE).
 *  • Dàn khuôn THẬT lên khổ in (nesting thông minh) — vẽ đúng vị trí + góc xoay từng con,
 *    kèm số con/tờ + % sử dụng giấy.
 * Gọi POST /pricing/offset/dieline (kích thước cm).
 */

interface Pt { x: number; y: number; }
interface Seg { tag: 'CUT' | 'CREASE' | 'BLEED'; type: string; points: Pt[]; controlPoints?: Pt[]; }
interface Placed { x: number; y: number; rotation: number; }
interface SheetNest {
    khoIn: string; khoGiayLon: string; loaiKem?: string; sheetWmm: number; sheetHmm: number;
    countPerSheet: number; utilization: number; label: string; positions: Placed[];
}
interface DielineData {
    boxType: string;
    flat: { widthCm: number; heightCm: number; standardCode: string; warnings: string[] };
    paths: Seg[];
    contourD: string;
    bbox: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
    sheets: SheetNest[];
    config: { margin: { top: number; right: number; bottom: number; left: number }; gripperMargin: number };
}

interface Props { boxType?: string; rong?: number; hong?: number; cao?: number; thickness?: number; mi?: number; handleHoles?: boolean; mieng?: string; itemW?: number; itemH?: number; flatShape?: string; envFlapShape?: string; envStyle?: string; selectedKhoIn?: string; onSelectSheet?: (khoIn: string) => void; }

type Tab = '2d' | 'nest';

/** Đặt 1 khuôn vào vị trí (x,y) + xoay quanh tâm bbox (port từ NestingCanvas). */
function dieTransform(pos: Placed, bb: DielineData['bbox']): string {
    const { x, y, rotation } = pos;
    const cx = bb.minX + bb.width / 2;
    const cy = bb.minY + bb.height / 2;
    if (rotation === 180) return `translate(${x - bb.minX}, ${y - bb.minY}) rotate(180, ${cx}, ${cy})`;
    if (rotation === 90) {
        const dx = (bb.height - bb.width) / 2, dy = (bb.width - bb.height) / 2;
        return `translate(${x - bb.minX + dx}, ${y - bb.minY + dy}) rotate(-90, ${cx}, ${cy})`;
    }
    if (rotation === 270) {
        const dx = (bb.height - bb.width) / 2, dy = (bb.width - bb.height) / 2;
        return `translate(${x - bb.minX + dx}, ${y - bb.minY + dy}) rotate(90, ${cx}, ${cy})`;
    }
    return `translate(${x - bb.minX}, ${y - bb.minY})`;
}

const STROKE: Record<string, { color: string; dash: string }> = {
    CUT: { color: '#1e293b', dash: 'none' },
    CREASE: { color: '#ef4444', dash: '4,3' },
    BLEED: { color: '#3b82f6', dash: '2,2' },
};

// ── Chain helpers (port từ DielineCanvas2D gốc) ──────────────────────────────
// Gom các đoạn CÙNG tag + endpoint trùng thành 1 đường liền mạch → tránh hở/gãy
// ở góc cho các khuôn nhiều bezier nhỏ (Tray/Pizza). Render mỗi chain là 1 <path>.
const ptEq = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;

function segEndpoints(seg: Seg): [Pt, Pt] {
    if (seg.type === 'bezier' && seg.controlPoints) {
        return [seg.controlPoints[0], seg.controlPoints[3]];
    }
    return [seg.points[0], seg.points[seg.points.length - 1]];
}

function segContinuation(seg: Seg): string {
    if (seg.type === 'bezier' && seg.controlPoints) {
        const [, c1, c2, p3] = seg.controlPoints;
        return `C ${c1.x},${c1.y} ${c2.x},${c2.y} ${p3.x},${p3.y}`;
    }
    return seg.points.slice(1).map((p) => `L ${p.x},${p.y}`).join(' ');
}

function buildChains(segments: Seg[]): { tag: Seg['tag']; segs: Seg[] }[] {
    const chains: { tag: Seg['tag']; segs: Seg[] }[] = [];
    const used = new Set<number>();
    for (let i = 0; i < segments.length; i++) {
        if (used.has(i)) continue;
        const chain: Seg[] = [segments[i]];
        used.add(i);
        let extended = true;
        while (extended) {
            extended = false;
            const [, chainEnd] = segEndpoints(chain[chain.length - 1]);
            for (let j = 0; j < segments.length; j++) {
                if (used.has(j) || segments[j].tag !== chain[0].tag) continue;
                const [jStart] = segEndpoints(segments[j]);
                if (ptEq(chainEnd, jStart)) { chain.push(segments[j]); used.add(j); extended = true; break; }
            }
        }
        chains.push({ tag: chain[0].tag, segs: chain });
    }
    return chains;
}

function chainToSvgD(chain: Seg[]): string {
    const [start] = segEndpoints(chain[0]);
    let d = `M ${start.x},${start.y} ` + segContinuation(chain[0]);
    for (let i = 1; i < chain.length; i++) d += ' ' + segContinuation(chain[i]);
    const [chainStart] = segEndpoints(chain[0]);
    const [, chainEnd] = segEndpoints(chain[chain.length - 1]);
    if (ptEq(chainStart, chainEnd) && chain.length > 1) d += ' Z';
    return d;
}

export default function DielinePreview({ boxType, rong, hong, cao, thickness, mi, handleHoles, mieng, itemW, itemH, flatShape, envFlapShape, envStyle, selectedKhoIn, onSelectSheet }: Props) {
    const [data, setData] = useState<DielineData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sheetIdx, setSheetIdx] = useState(0);
    const [tab, setTab] = useState<Tab>('2d');
    const [nestMode, setNestMode] = useState<'smart' | 'grid'>('smart');

    const load = useCallback(async () => {
        const isEnvelope = boxType === 'envelope' && !!rong && !!cao;
        const isBox = !!boxType && boxType !== 'envelope' && !!rong && !!hong && !!cao;
        const isFlat = !boxType && !!itemW && !!itemH;
        if (!isEnvelope && !isBox && !isFlat) { setData(null); return; }
        setLoading(true); setError(null);
        try {
            const body = isEnvelope
                ? { boxType, rong, cao, envFlapShape, envStyle, nestMode }
                : isBox
                ? { boxType, rong, hong, cao, T: thickness, mi, handleHoles, mieng, nestMode }
                : { itemW, itemH, flatShape, nestMode };
            const res = await api.post<DielineData>('/pricing/offset/dieline', body);
            if (res.success && res.data) { setData(res.data); setSheetIdx(0); }
            else { setError(res.error || 'Không tính được khuôn'); setData(null); }
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Lỗi'); setData(null);
        }
        setLoading(false);
    }, [boxType, rong, hong, cao, thickness, mi, handleHoles, mieng, itemW, itemH, flatShape, envFlapShape, envStyle, nestMode]);

    useEffect(() => { load(); }, [load]);

    // Đồng bộ khổ + ĐỀ XUẤT KHỔ TỐI ƯU: sheets đã sort theo số con giảm dần (index 0 = tối ưu).
    // Nếu khổ đang chọn nằm trong danh sách → giữ; nếu chưa chọn/không có → tự chọn khổ tối ưu.
    useEffect(() => {
        if (!data || data.sheets.length === 0) return;
        const i = selectedKhoIn ? data.sheets.findIndex((s) => s.khoIn === selectedKhoIn) : -1;
        if (i >= 0) setSheetIdx(i);
        else { setSheetIdx(0); onSelectSheet?.(data.sheets[0].khoIn); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, selectedKhoIn]);

    // Chuẩn hoá paths về gốc (0..W, 0..H), lật Y (engine gốc dưới-trái → SVG y-xuống).
    const localPaths = useMemo(() => {
        if (!data) return [];
        const { minX, minY, height } = data.bbox;
        const mapPt = (p: Pt): Pt => ({ x: p.x - minX, y: (minY + height) - p.y });
        return data.paths.map((s) => ({
            ...s,
            points: s.points.map(mapPt),
            controlPoints: s.controlPoints?.map(mapPt),
        }));
    }, [data]);

    const sheet = data?.sheets?.[sheetIdx];

    // Cắt phẳng dạng chữ nhật (tờ rơi / SP khác) → bản vẽ 2D vô nghĩa, chỉ hiện Xếp khuôn.
    const hide2D = !boxType && flatShape === 'rect';
    const effTab: Tab = hide2D ? 'nest' : tab;

    // SVG 1 khuôn (trải phẳng) + DIM kích thước tổng (rộng × cao khổ trải, cm).
    const flatSvg = useMemo(() => {
        if (!data) return null;
        const { width, height } = data.bbox;
        const dpad = Math.max(width, height) * 0.16 + 14;
        const sw = Math.max(width, height) / 380;
        const dimFs = Math.max(width, height) * 0.045;
        const sw2 = Math.max(width, height) / 300;
        const cmW = Math.round(width) / 10, cmH = Math.round(height) / 10;
        return (
            <svg viewBox={`${-dpad} ${-dpad} ${width + dpad * 2} ${height + dpad * 2}`} className="w-full h-80 bg-white rounded-lg border border-slate-200" preserveAspectRatio="xMidYMid meet">
                {buildChains(localPaths).map((chain, i) => {
                    const stl = STROKE[chain.tag] || STROKE.CUT;
                    return (
                        <path key={i} d={chainToSvgD(chain.segs)} fill="none" stroke={stl.color}
                            strokeDasharray={stl.dash} strokeWidth={sw} vectorEffect="non-scaling-stroke"
                            strokeLinecap="round" strokeLinejoin="round" />
                    );
                })}
                {/* DIM: kích thước khổ trải — mũi tên dưới (rộng) + phải (cao) */}
                <g stroke="#64748b" strokeWidth={sw2} vectorEffect="non-scaling-stroke">
                    <line x1={0} y1={height + dpad * 0.5} x2={width} y2={height + dpad * 0.5} />
                    <line x1={0} y1={height + dpad * 0.5 - dpad * 0.16} x2={0} y2={height + dpad * 0.5 + dpad * 0.16} />
                    <line x1={width} y1={height + dpad * 0.5 - dpad * 0.16} x2={width} y2={height + dpad * 0.5 + dpad * 0.16} />
                    <line x1={width + dpad * 0.5} y1={0} x2={width + dpad * 0.5} y2={height} />
                    <line x1={width + dpad * 0.5 - dpad * 0.16} y1={0} x2={width + dpad * 0.5 + dpad * 0.16} y2={0} />
                    <line x1={width + dpad * 0.5 - dpad * 0.16} y1={height} x2={width + dpad * 0.5 + dpad * 0.16} y2={height} />
                </g>
                <rect x={width / 2 - dimFs * 2.6} y={height + dpad * 0.5 - dimFs * 0.85} width={dimFs * 5.2} height={dimFs * 1.7} fill="#f8fafc" rx={2} />
                <text x={width / 2} y={height + dpad * 0.5 + dimFs * 0.35} textAnchor="middle" fontSize={dimFs} fontWeight={700} fill="#334155">{cmW} cm</text>
                <g transform={`translate(${width + dpad * 0.5}, ${height / 2}) rotate(-90)`}>
                    <rect x={-dimFs * 2.6} y={-dimFs * 0.85} width={dimFs * 5.2} height={dimFs * 1.7} fill="#f8fafc" rx={2} />
                    <text x={0} y={dimFs * 0.35} textAnchor="middle" fontSize={dimFs} fontWeight={700} fill="#334155">{cmH} cm</text>
                </g>
            </svg>
        );
    }, [data, localPaths]);

    // SVG dàn khuôn lên khổ in — tô nền theo hình dạng khuôn (cam=gốc, xanh=xoay) + lề/cắn nhíp.
    const sheetSvg = useMemo(() => {
        if (!data || !sheet || sheet.positions.length === 0) return null;
        const bb = data.bbox;
        const flipT = `translate(0, ${bb.minY + bb.maxY}) scale(1, -1)`;
        const { margin, gripperMargin } = data.config;
        const effBottom = Math.max(margin.bottom, gripperMargin);
        const W = sheet.sheetWmm, H = sheet.sheetHmm;
        // DIM: chừa lề để vẽ mũi tên kích thước (mm) + tiêu đề số con — đồng bộ preview In Nhanh.
        const dpad = Math.max(48, Math.min(W, H) * 0.14);
        const dimFs = Math.max(11, Math.min(W, H) * 0.05);
        const sw2 = Math.max(W, H) / 240;
        const cmW = Math.round(W) / 10, cmH = Math.round(H) / 10;
        return (
            <svg viewBox={`${-dpad} ${-dpad} ${W + dpad * 2} ${H + dpad * 2}`} className="w-full h-80 bg-slate-100 rounded-lg border border-slate-200" preserveAspectRatio="xMidYMid meet">
                <defs>
                    <path id="dl-fill" d={data.contourD} transform={flipT} fillRule="evenodd" />
                    <g id="dl-lines" transform={flipT}>
                        {buildChains(data.paths).map((chain, i) => {
                            const isCrease = chain.tag === 'CREASE';
                            return (
                                <path key={i} d={chainToSvgD(chain.segs)} fill="none"
                                    stroke={isCrease ? '#ef4444' : '#334155'}
                                    strokeDasharray={isCrease ? '3,2' : 'none'}
                                    strokeWidth={isCrease ? 0.5 : 0.8} vectorEffect="non-scaling-stroke"
                                    strokeLinecap="round" strokeLinejoin="round" />
                            );
                        })}
                    </g>
                </defs>
                {/* Tiêu đề khổ in + số con/tờ (trên cùng) */}
                <text x={W / 2} y={-dpad * 0.45} textAnchor="middle" fontSize={dimFs * 1.15} fontWeight={800} fill="#334155">
                    Khổ in {cmW}×{cmH} cm · {sheet.countPerSheet} con/tờ
                </text>
                {/* Tờ giấy */}
                <rect x={0} y={0} width={W} height={H} fill="white" stroke="#94a3b8" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
                {/* Cắn nhíp (đáy) */}
                <rect x={0} y={H - gripperMargin} width={W} height={gripperMargin} fill="rgba(239,68,68,0.08)" stroke="rgba(239,68,68,0.3)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
                {/* Vùng in hợp lệ */}
                <rect x={margin.left} y={margin.top} width={W - margin.left - margin.right} height={H - margin.top - effBottom}
                    fill="none" stroke="#60a5fa" strokeDasharray="5,3" strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
                {/* Các khuôn đã dàn */}
                {sheet.positions.map((pos, idx) => {
                    const rotated = pos.rotation === 180 || pos.rotation === 270;
                    return (
                        <g key={idx} transform={dieTransform(pos, bb)} opacity={0.92}>
                            <use href="#dl-fill"
                                fill={rotated ? 'rgba(96,165,250,0.20)' : 'rgba(249,140,50,0.20)'}
                                stroke={rotated ? 'rgba(37,99,235,0.45)' : 'rgba(234,88,12,0.45)'}
                                strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
                            <use href="#dl-lines" />
                        </g>
                    );
                })}
                {/* DIM: kích thước tờ in (mm → hiển thị cm) — mũi tên dưới (rộng) + phải (cao) */}
                <g stroke="#64748b" strokeWidth={sw2} vectorEffect="non-scaling-stroke">
                    <line x1={0} y1={H + dpad * 0.5} x2={W} y2={H + dpad * 0.5} />
                    <line x1={0} y1={H + dpad * 0.5 - dpad * 0.18} x2={0} y2={H + dpad * 0.5 + dpad * 0.18} />
                    <line x1={W} y1={H + dpad * 0.5 - dpad * 0.18} x2={W} y2={H + dpad * 0.5 + dpad * 0.18} />
                    <line x1={W + dpad * 0.5} y1={0} x2={W + dpad * 0.5} y2={H} />
                    <line x1={W + dpad * 0.5 - dpad * 0.18} y1={0} x2={W + dpad * 0.5 + dpad * 0.18} y2={0} />
                    <line x1={W + dpad * 0.5 - dpad * 0.18} y1={H} x2={W + dpad * 0.5 + dpad * 0.18} y2={H} />
                </g>
                <rect x={W / 2 - dimFs * 3} y={H + dpad * 0.5 - dimFs * 0.85} width={dimFs * 6} height={dimFs * 1.7} fill="#f1f5f9" rx={2} />
                <text x={W / 2} y={H + dpad * 0.5 + dimFs * 0.35} textAnchor="middle" fontSize={dimFs} fontWeight={700} fill="#334155">{cmW} cm</text>
                <g transform={`translate(${W + dpad * 0.5}, ${H / 2}) rotate(-90)`}>
                    <rect x={-dimFs * 3} y={-dimFs * 0.85} width={dimFs * 6} height={dimFs * 1.7} fill="#f1f5f9" rx={2} />
                    <text x={0} y={dimFs * 0.35} textAnchor="middle" fontSize={dimFs} fontWeight={700} fill="#334155">{cmH} cm</text>
                </g>
            </svg>
        );
    }, [data, sheet]);

    if (!boxType && !(itemW && itemH)) return null;

    // Thẻ chọn khổ giấy (dùng chung cho top-5 và danh sách cuộn) — giữ index gốc để chọn/đánh dấu.
    const renderSheetCard = (im: SheetNest, i: number) => {
        const isSelected = i === sheetIdx;
        const isBest = i === 0;
        return (
            <div key={im.khoIn} onClick={() => { setSheetIdx(i); onSelectSheet?.(im.khoIn); }}
                className={`cursor-pointer rounded-lg border px-3 py-2 transition-all flex items-center justify-between gap-2 ${
                    isSelected ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' :
                    isBest ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}>
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-bold text-[12px] text-slate-800 truncate">{im.khoIn}</span>
                    {isBest && <span className="bg-emerald-500 text-white text-[8px] px-1.5 py-0.5 rounded leading-none flex-shrink-0">🏆</span>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 text-[11px]">
                    <span className="text-slate-500 font-semibold">{im.countPerSheet} con/tờ</span>
                    {im.loaiKem && <span className="text-[10px] font-medium text-slate-400">{im.loaiKem}</span>}
                </div>
            </div>
        );
    };

    return (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                <h4 className="text-sm font-bold text-slate-800">{hide2D ? 'Xếp bài in' : 'Khuôn bế & Xếp khuôn'}</h4>
                {data && <span className="text-xs text-slate-500">{hide2D ? 'Kích thước' : 'Khổ trải'} <b>{data.flat.widthCm}×{data.flat.heightCm}cm</b>{hide2D ? '' : ` · ${data.flat.standardCode}`}</span>}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-slate-200 mb-3">
                {((hide2D ? [['nest', 'Xếp khuôn']] : [['2d', 'Bản vẽ 2D'], ['nest', 'Xếp khuôn']]) as [Tab, string][]).map(([id, label]) => (
                    <button key={id} onClick={() => setTab(id)}
                        className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 transition-colors ${effTab === id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                        {label}{id === 'nest' && sheet ? ` · ${sheet.countPerSheet} con/tờ` : ''}
                    </button>
                ))}
            </div>

            {loading && <div className="text-sm text-slate-400 py-10 text-center">Đang dựng khuôn bế…</div>}
            {error && <div className="text-sm text-red-500 py-4 text-center">{error}</div>}

            {data && !loading && (
                <>
                    {effTab === '2d' && (
                        <div>
                            {flatSvg}
                            {/* Chú thích nét + thông số kích thước nhập */}
                            <div className="mt-2 flex items-center justify-between flex-wrap gap-2 text-[11px]">
                                <div className="flex items-center gap-3">
                                    <span className="flex items-center gap-1"><span className="inline-block w-4 h-0 border-t-2 border-slate-800" /> Cắt</span>
                                    <span className="flex items-center gap-1"><span className="inline-block w-4 h-0 border-t-2 border-dashed border-red-500" /> Cấn / gấp</span>
                                </div>
                                <div className="text-slate-500 font-semibold">
                                    {boxType && boxType !== 'envelope' && rong && hong && cao
                                        ? <>Rộng {rong} × Hông {hong} × Cao {cao} cm{mi ? ` · Mí ${mi} cm` : ''}</>
                                        : boxType === 'envelope' && rong && cao
                                        ? <>Bì {rong} × {cao} cm</>
                                        : itemW && itemH
                                        ? <>{itemW} × {itemH} cm</>
                                        : null}
                                </div>
                            </div>
                            {data.flat.warnings?.length > 0 && (
                                <div className="mt-2 text-[11px] text-amber-600">⚠️ {data.flat.warnings.join(' · ')}</div>
                            )}
                        </div>
                    )}

                    {effTab === 'nest' && (
                        <div>
                            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                                <span className="text-[11px] font-semibold text-slate-500 mr-1">🧠 Chế độ xếp:</span>
                                {([['smart', '✨ Xếp tối ưu'], ['grid', '▦ Grid (lưới đều)']] as ['smart' | 'grid', string][]).map(([id, label]) => (
                                    <button key={id} onClick={() => setNestMode(id)}
                                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${nestMode === id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Dàn lên khổ in</span>
                                {sheet && (
                                    <span className="text-xs">
                                        <b className="text-indigo-600">{sheet.countPerSheet} con/tờ</b>
                                        <span className="text-slate-400"> · {sheet.utilization}%</span>
                                    </span>
                                )}
                            </div>
                            {sheetSvg || <div className="h-72 flex items-center justify-center text-sm text-slate-400 bg-slate-50 rounded-lg border border-slate-200">Hộp quá lớn so với khổ</div>}
                            {sheet?.label && <div className="text-[10px] text-slate-400 mt-1 text-center">{sheet.label}</div>}

                            <div className="mt-3">
                                <div className="text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">Khổ giấy (số con/tờ) · 🏆 = tối ưu</div>
                                <div className="flex flex-col gap-1.5 max-h-[210px] overflow-y-auto custom-scrollbar pr-1">
                                    {data.sheets.map((im, i) => renderSheetCard(im, i))}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
