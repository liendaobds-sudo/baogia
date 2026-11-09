"use client";
import React from 'react';
import Link from 'next/link';

export interface MarkupSummary {
    pricing_method: 'markup' | 'margin';
    default_markup: number;
    min_margin: number;
    price_rounding: number;
}

/**
 * Tính giá bán dự kiến trên 1 đơn vị (tờ hoặc m²) từ giá vốn thuần theo cấu hình Markup/Margin.
 * Khớp công thức PricingService.calculateSellingPrice ở backend.
 */
export function computePreviewSellingUnit(cost: number, markup?: MarkupSummary | null): number {
    if (!cost || cost <= 0) return 0;
    const hasValidMarkup = markup && !Array.isArray(markup) && typeof markup.default_markup === 'number';
    const m: MarkupSummary = hasValidMarkup ? markup : { pricing_method: 'markup', default_markup: 50, min_margin: 20, price_rounding: 100 };
    const pct = Number(m.default_markup) || 0;
    let price = m.pricing_method === 'margin'
        ? (pct >= 100 ? cost / 0.5 : cost / (1 - pct / 100))
        : cost * (1 + pct / 100);
    const minMargin = Number(m.min_margin) || 0;
    if (minMargin > 0 && minMargin < 100) {
        const minPrice = cost / (1 - minMargin / 100);
        if (price < minPrice) price = minPrice;
    }
    const r = Number(m.price_rounding) || 0;
    if (r > 0) price = Math.ceil(price / r) * r;
    return Math.round(price);
}

const TABS = [
    { key: 'tiers', href: '/pricing/settings/pricing-tiers', label: '📄 Định mức Khổ nhỏ (Theo tờ)' },
    { key: 'large-format', href: '/pricing/settings/pricing-large-format', label: '🖼️ Định mức Khổ lớn (Theo m²)' },
    { key: 'printers', href: '/pricing/settings/printers', label: '🖨️ Chi phí Máy in' },
    { key: 'waste', href: '/pricing/settings/waste-config', label: '♻️ Bù hao In nhanh' },
    { key: 'markup', href: '/pricing/settings/pricing-markup', label: '📈 Lợi nhuận & Làm tròn' },
] as const;

export type DigitalSettingsTabKey = typeof TABS[number]['key'];

export function DigitalSettingsNav({
    activeTab,
    markup,
}: {
    activeTab: DigitalSettingsTabKey;
    markup?: MarkupSummary | null;
}) {
    const hasValidMarkup = markup && !Array.isArray(markup) && typeof markup.default_markup === 'number';
    const m: MarkupSummary = hasValidMarkup ? markup : { pricing_method: 'markup', default_markup: 50, min_margin: 20, price_rounding: 100 };

    return (
        <div className="mb-5 bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
                {TABS.map((t) => {
                    const active = activeTab === t.key;
                    return (
                        <Link
                            key={t.href}
                            href={t.href}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                active
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'bg-slate-50 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200/70'
                            }`}
                        >
                            {t.label}
                        </Link>
                    );
                })}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] bg-indigo-50/70 border border-indigo-100 px-3 py-1.5 rounded-lg">
                <span className="text-slate-500 font-medium">Quy tắc Giá bán:</span>
                <span className="font-bold text-indigo-700">
                    {m.pricing_method === 'margin' ? `Margin ${m.default_markup}%` : `Markup +${m.default_markup}%`}
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-600">Sàn biên: <b>{m.min_margin}%</b></span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-600">Làm tròn: <b>{m.price_rounding > 0 ? `${m.price_rounding}₫` : 'Không'}</b></span>
            </div>
        </div>
    );
}
