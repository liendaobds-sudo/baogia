import React from 'react';
import { calculateGridLayout, calculateStaggeredLayout } from '../_utils/layout-engine';

export interface PreviewLayoutSVGProps {
    masterData: Record<string, unknown> | null;
    paperSizeId: string;
    shape: string;
    itemWidth: number;
    itemHeight: number;
    gapH: number;
    gapV: number;
}

export function PreviewLayoutSVG({
    masterData,
    paperSizeId,
    shape,
    itemWidth,
    itemHeight,
    gapH,
    gapV
}: PreviewLayoutSVGProps) {
    if (!masterData?.paper_sizes || !paperSizeId) return null;
    const paperSize = (masterData.paper_sizes as any[]).find(p => p.id.toString() === paperSizeId);
    if (!paperSize) return null;

    const w = parseFloat(paperSize.width_mm || paperSize.widthMm) || 0;
    const h = parseFloat(paperSize.height_mm || paperSize.heightMm) || 0;
    if (w <= 0 || h <= 0) return null;
    
    let ml = parseFloat(paperSize.margin_left || paperSize.marginLeft) || 0;
    let mr = parseFloat(paperSize.margin_right || paperSize.marginRight) || 0;
    let mt = parseFloat(paperSize.margin_top || paperSize.marginTop) || 0;
    let mb = parseFloat(paperSize.margin_bottom || paperSize.marginBottom) || 0;
    
    if (isNaN(ml)) ml = 0; if (isNaN(mr)) mr = 0;
    if (isNaN(mt)) mt = 0; if (isNaN(mb)) mb = 0;

    const isRound = shape === 'circle' || shape === 'round';
    const layout = isRound 
        ? calculateStaggeredLayout(w, h, ml, mr, mt, mb, itemWidth, itemHeight, gapH, gapV)
        : calculateGridLayout(w, h, ml, mr, mt, mb, itemWidth, itemHeight, gapH, gapV);

    
    if (layout.itemsPerSheet <= 0) return (
        <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs text-center px-4">
            Kích thước sản phẩm quá lớn so với vùng in hữu dụng của khổ giấy!
        </div>
    );

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    layout.placements.forEach(p => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x + p.width);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y + p.height);
    });

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const offsetX = ml + (layout.usableWidth - contentW) / 2 - minX;
    const offsetY = mt + (layout.usableHeight - contentH) / 2 - minY;

    // Dynamic font sizing based on item dimensions
    const avgItemSize = Math.min(layout.placements[0]?.width || 30, layout.placements[0]?.height || 30);
    const numFontSize = Math.max(8, Math.min(avgItemSize * 0.5, 26));
    const dimFontSize = Math.max(6, Math.min(avgItemSize * 0.28, 14));
    const hasRotated = layout.placements.some(p => p.rotated);
    const totalItems = layout.placements.length;

    // Scale factor for labels based on paper size
    const sc = Math.max(1, Math.min(w, h) / 100);
    const labelFs = Math.max(12, sc * 5.5);
    const badgeH = Math.max(16, sc * 6);
    const badgeFs = Math.max(8, sc * 3.5);

    // Padding for dimension labels
    const pad = Math.max(50, Math.min(w, h) * 0.1);
    const dimOffset = pad * 0.55;
    const viewMinX = -pad * 0.9;
    const viewMinY = -pad * 0.9;
    const viewW = w + pad * 1.8;
    const viewH = h + pad * 1.8;

    return (
        <div className="absolute inset-0 flex items-center justify-center bg-transparent p-3 min-h-0 overflow-hidden">
            <svg viewBox={`${viewMinX} ${viewMinY} ${viewW} ${viewH}`} width="100%" height="100%" className="drop-shadow-md rounded-sm" preserveAspectRatio="xMidYMid meet">
                <defs>
                    <pattern id="margin-hatch" patternUnits="userSpaceOnUse" width="4" height="4">
                        <path d="M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2" stroke="#e2e8f0" strokeWidth="0.5"/>
                    </pattern>
                    <filter id="item-shadow" x="-10%" y="-10%" width="120%" height="120%">
                        <feDropShadow dx="0.3" dy="0.3" stdDeviation="0.4" floodColor="#000" floodOpacity="0.15"/>
                    </filter>
                </defs>

                {/* Paper sheet background */}
                <rect x="0" y="0" width={w} height={h} fill="white" rx="2" stroke="#cbd5e1" strokeWidth="1.2"/>

                {/* Margin areas (hatched) */}
                {ml > 0 && <rect x="0" y="0" width={ml} height={h} fill="url(#margin-hatch)" opacity="0.6"/>}
                {mr > 0 && <rect x={w - mr} y="0" width={mr} height={h} fill="url(#margin-hatch)" opacity="0.6"/>}
                {mt > 0 && <rect x="0" y="0" width={w} height={mt} fill="url(#margin-hatch)" opacity="0.6"/>}
                {mb > 0 && <rect x="0" y={h - mb} width={w} height={mb} fill="url(#margin-hatch)" opacity="0.6"/>}

                {/* Printable area border */}
                <rect x={ml} y={mt} width={layout.usableWidth} height={layout.usableHeight} fill="none" stroke="#94a3b8" strokeDasharray="3 2" strokeWidth="0.8" />

                {/* Items */}
                {layout.placements.map((p, idx) => {
                    const fill = p.rotated ? '#3b82f6' : '#22c55e';
                    const fillLight = p.rotated ? '#dbeafe' : '#dcfce7';
                    const stroke = p.rotated ? '#2563eb' : '#16a34a';
                    const x = +(offsetX + p.x).toFixed(2);
                    const y = +(offsetY + p.y).toFixed(2);
                    const isRoundShape = shape === 'circle' || shape === 'round';
                    const rx = isRoundShape ? p.width / 2 : Math.min(1, avgItemSize * 0.03);
                    const ry = isRoundShape ? p.height / 2 : rx;
                    const showDim = idx === 0 && avgItemSize > 15;
                    
                    return (
                        <g key={idx} filter="url(#item-shadow)">
                            {isRoundShape ? (
                                <ellipse
                                    cx={x + p.width / 2}
                                    cy={y + p.height / 2}
                                    rx={rx}
                                    ry={ry}
                                    fill={fillLight}
                                    stroke={stroke}
                                    strokeWidth="0.6"
                                />
                            ) : (
                                <rect 
                                    x={x}
                                    y={y}
                                    width={p.width}
                                    height={p.height}
                                    fill={fillLight}
                                    stroke={stroke}
                                    strokeWidth="0.6"
                                    rx={rx}
                                />
                            )}
                            {/* Item number */}
                            <text 
                                x={x + p.width / 2} 
                                y={x + p.height / 2 > 0 ? y + p.height / 2 + (showDim ? -dimFontSize * 0.3 : 0) : y + p.height / 2} 
                                fontSize={numFontSize} 
                                textAnchor="middle" 
                                dominantBaseline="middle" 
                                fill={fill}
                                fontFamily="system-ui, -apple-system, sans-serif" 
                                fontWeight="700"
                                opacity="0.9"
                            >
                                {idx + 1}
                            </text>
                            {/* Dimension label on first item */}
                            {showDim && (
                                <text 
                                    x={x + p.width / 2} 
                                    y={y + p.height / 2 + numFontSize * 0.7} 
                                    fontSize={dimFontSize} 
                                    textAnchor="middle" 
                                    dominantBaseline="middle" 
                                    fill={stroke}
                                    fontFamily="system-ui, sans-serif" 
                                    fontWeight="600"
                                    opacity="0.7"
                                >
                                    {p.rotated ? `${itemHeight}×${itemWidth}` : `${itemWidth}×${itemHeight}`}
                                </text>
                            )}
                            {/* Rotation indicator */}
                            {p.rotated && avgItemSize > 20 && (
                                <text x={x + p.width - dimFontSize * 0.6} y={y + dimFontSize * 0.8} fontSize={dimFontSize * 1.2} textAnchor="middle" dominantBaseline="middle" fill={stroke} opacity="0.6">↻</text>
                            )}
                        </g>
                    );
                })}

                {/* Width dimension arrow (bottom) */}
                <line x1="0" y1={h + dimOffset} x2={w} y2={h + dimOffset} stroke="#64748b" strokeWidth={sc * 0.4}/>
                <line x1="0" y1={h + dimOffset - pad * 0.25} x2="0" y2={h + dimOffset + pad * 0.25} stroke="#64748b" strokeWidth={sc * 0.3}/>
                <line x1={w} y1={h + dimOffset - pad * 0.25} x2={w} y2={h + dimOffset + pad * 0.25} stroke="#64748b" strokeWidth={sc * 0.3}/>
                <rect x={w/2 - labelFs * 4} y={h + dimOffset - labelFs * 0.7} width={labelFs * 8} height={labelFs * 1.4} fill="white" rx="2"/>
                <text x={w/2} y={h + dimOffset + 1} fontSize={labelFs} fill="#334155" textAnchor="middle" dominantBaseline="middle" fontFamily="system-ui, sans-serif" fontWeight="800">{w} mm</text>

                {/* Height dimension arrow (right) */}
                <line x1={w + dimOffset} y1="0" x2={w + dimOffset} y2={h} stroke="#64748b" strokeWidth={sc * 0.4}/>
                <line x1={w + dimOffset - pad * 0.25} y1="0" x2={w + dimOffset + pad * 0.25} y2="0" stroke="#64748b" strokeWidth={sc * 0.3}/>
                <line x1={w + dimOffset - pad * 0.25} y1={h} x2={w + dimOffset + pad * 0.25} y2={h} stroke="#64748b" strokeWidth={sc * 0.3}/>
                <g transform={`translate(${w + dimOffset + 2}, ${h/2}) rotate(-90)`}>
                    <rect x={-labelFs * 3.5} y={-labelFs * 0.8} width={labelFs * 7} height={labelFs * 1.5} fill="white" rx="2"/>
                    <text x="0" y="1" fontSize={labelFs} fill="#334155" textAnchor="middle" dominantBaseline="middle" fontFamily="system-ui, sans-serif" fontWeight="800">{h} mm</text>
                </g>




                {/* Legend (bottom-left inside) */}
                {hasRotated && (
                    <g transform={`translate(3, ${h - badgeH - 2})`}>
                        <rect x="0" y="0" width={w * 0.45} height={badgeH} fill="white" fillOpacity="0.92" rx="3" stroke="#e2e8f0" strokeWidth={sc * 0.3}/>
                        <rect x={sc * 1.5} y={badgeH * 0.2} width={badgeH * 0.5} height={badgeH * 0.5} fill="#dcfce7" stroke="#16a34a" strokeWidth={sc * 0.3} rx="1"/>
                        <text x={sc * 1.5 + badgeH * 0.5 + sc} y={badgeH * 0.55} fontSize={badgeFs * 0.85} fill="#475569" fontFamily="system-ui, sans-serif" fontWeight="600">Thường</text>
                        <rect x={w * 0.22} y={badgeH * 0.2} width={badgeH * 0.5} height={badgeH * 0.5} fill="#dbeafe" stroke="#2563eb" strokeWidth={sc * 0.3} rx="1"/>
                        <text x={w * 0.22 + badgeH * 0.5 + sc} y={badgeH * 0.55} fontSize={badgeFs * 0.85} fill="#475569" fontFamily="system-ui, sans-serif" fontWeight="600">Xoay ↻</text>
                    </g>
                )}

                {/* Margin labels */}
                {ml > 5 && <text x={ml/2} y={h/2} fontSize={Math.min(ml * 0.6, labelFs * 0.8)} fill="#94a3b8" textAnchor="middle" dominantBaseline="middle" fontFamily="system-ui" fontWeight="700" transform={`rotate(-90, ${ml/2}, ${h/2})`}>{ml}</text>}
                {mr > 5 && <text x={w - mr/2} y={h/2} fontSize={Math.min(mr * 0.6, labelFs * 0.8)} fill="#94a3b8" textAnchor="middle" dominantBaseline="middle" fontFamily="system-ui" fontWeight="700" transform={`rotate(90, ${w - mr/2}, ${h/2})`}>{mr}</text>}
                {mt > 5 && <text x={w/2} y={mt/2 + 1} fontSize={Math.min(mt * 0.6, labelFs * 0.8)} fill="#94a3b8" textAnchor="middle" dominantBaseline="middle" fontFamily="system-ui" fontWeight="700">{mt}</text>}
                {mb > 5 && <text x={w/2} y={h - mb/2 + 1} fontSize={Math.min(mb * 0.6, labelFs * 0.8)} fill="#94a3b8" textAnchor="middle" dominantBaseline="middle" fontFamily="system-ui" fontWeight="700">{mb}</text>}
            </svg>
        </div>
    );
}
