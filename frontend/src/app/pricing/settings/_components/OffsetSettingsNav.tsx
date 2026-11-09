"use client";
import React from 'react';
import Link from 'next/link';
import { useTrialMode, isDeepConfigRoute, TrialModeSwitch } from '@/lib/scope/use-trial-mode';

const OFFSET_TABS = [
    { key: 'paper-sizes', href: '/pricing/settings/paper-sizes', label: '📐 Khổ giấy & Nhíp' },
    { key: 'offset-materials', href: '/pricing/settings/offset-materials', label: '🖨️ Kẽm · Màng · Ép kim' },
    { key: 'waste-stages', href: '/pricing/settings/waste-stages', label: '♻️ Bù hao công đoạn' },
    { key: 'offset-fees', href: '/pricing/settings/offset-fees', label: '💰 Phí & Mốc bậc giá' },
    { key: 'offset-products', href: '/pricing/settings/offset-products', label: '🎛️ Cấu hình 5 SP Offset' },
] as const;

export type OffsetSettingsTabKey = typeof OFFSET_TABS[number]['key'];

export function OffsetSettingsNav({ activeTab }: { activeTab: OffsetSettingsTabKey }) {
    const { isTrialMode } = useTrialMode();
    const visibleTabs = isTrialMode ? OFFSET_TABS.filter((t) => !isDeepConfigRoute(t.href)) : OFFSET_TABS;
    return (
        <div className="mb-5 bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
                {visibleTabs.map((t) => {
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
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-2 text-[11px] bg-indigo-50/70 border border-indigo-100 px-3 py-1.5 rounded-lg">
                    <span className="text-slate-500 font-medium">Danh mục dùng chung:</span>
                    <Link href="/pricing/settings/materials" className="font-bold text-indigo-700 hover:underline">
                        📄 Giấy in (Scope Offset)
                    </Link>
                    <span className="text-slate-300">•</span>
                    <Link href="/pricing/settings/processing" className="font-bold text-indigo-700 hover:underline">
                        ✂️ Gia công (Scope Offset)
                    </Link>
                </div>
                <TrialModeSwitch />
            </div>
        </div>
    );
}
