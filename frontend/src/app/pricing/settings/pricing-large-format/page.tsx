"use client";
import { useEffect, useState, useCallback } from 'react';
import { api } from '../../_components/apiClient';
import React from 'react';

interface LFTier {
    id: number;
    materialId: number;
    materialName?: string;
    materialCode?: string;
    areaFrom: number;
    areaTo: number;
    pricePerSqm: number;
}

interface Material { id: number; name: string; }

export default function PricingLargeFormatPage() {
    const [tiers, setTiers] = useState<LFTier[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const loadData = useCallback(async () => {
        setLoading(true);
        const [tiersRes, matsRes] = await Promise.all([
            api.get<LFTier[]>('/erp/large-format-pricing'),
            api.get<Material[]>('/erp/materials?scope=large_format'),
        ]);
        if (tiersRes.success && tiersRes.data) setTiers(tiersRes.data);
        if (matsRes.success && matsRes.data) setMaterials(matsRes.data);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const groups: Record<string, { material: string; technology: string; unit: string; tiers: LFTier[] }> = {};
    tiers.forEach(t => {
        const key = `${t.materialId}_lf`;
        if (!groups[key]) {
            const mat = materials.find(m => m.id == t.materialId);
            groups[key] = { material: mat?.name || t.materialName || t.materialCode || 'Vật tư In Khổ Lớn', technology: 'Cơ bản', unit: 'm²', tiers: [] };
        }
        groups[key].tiers.push(t);
    });

    const groupEntries = Object.entries(groups);
    const toggleGroup = (key: string) => {
        setExpandedGroups(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
    };

    const handleDeleteGroup = async (key: string) => {
        const g = groups[key];
        if (!g || !confirm(`Xóa tất cả ${g.tiers.length} mốc giá của "${g.material}"?`)) return;
        await Promise.all(g.tiers.map(t => api.delete(`/erp/large-format-pricing/${t.id}`)));
        await loadData();
    };

    const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

    if (loading) return <div className="flex items-center justify-center h-full"><svg className="animate-spin h-8 w-8 text-indigo-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>;

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6">
            <div className="mb-6">
                <h1 className="text-2xl font-black text-slate-800 tracking-tight">Định Mức Giá In Khổ Lớn</h1>
                <p className="text-slate-500 text-sm mt-1">Bảng giá theo m² cho sản phẩm in phẳng khổ lớn: banner, decal, pp, hiflex.</p>
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 sticky top-0 z-10 text-slate-600 text-[11px] font-bold uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-3 w-8"></th>
                                <th className="px-4 py-3">Vật tư</th>
                                <th className="px-4 py-3 text-center">Công nghệ</th>
                                <th className="px-4 py-3 text-center">Đơn vị</th>
                                <th className="px-4 py-3 text-center">Số mốc</th>
                                <th className="px-4 py-3 text-right">Khoảng giá</th>
                                <th className="px-4 py-3 text-center w-20">Xóa</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {groupEntries.length === 0 ? (
                                <tr><td colSpan={7} className="px-6 py-10 text-center text-slate-500">Chưa có định mức khổ lớn</td></tr>
                            ) : groupEntries.map(([key, g]) => {
                                const isExpanded = expandedGroups.has(key);
                                const prices = g.tiers.map(t => t.pricePerSqm);
                                const minP = Math.min(...prices);
                                const maxP = Math.max(...prices);
                                const range = minP === maxP ? `${fmt(minP)}₫/${g.unit}` : `${fmt(minP)} – ${fmt(maxP)}₫/${g.unit}`;

                                return (
                                    <React.Fragment key={key}>
                                        <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => toggleGroup(key)}>
                                            <td className="px-4 py-3"><svg className={`w-3 h-3 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg></td>
                                            <td className="px-4 py-3 font-semibold text-slate-800">{g.material}</td>
                                            <td className="px-4 py-3 text-center"><span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">{g.technology}</span></td>
                                            <td className="px-4 py-3 text-center text-slate-500">{g.unit}</td>
                                            <td className="px-4 py-3 text-center"><span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">{g.tiers.length} mốc</span></td>
                                            <td className="px-4 py-3 text-right font-bold text-emerald-600">{range}</td>
                                            <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                                                <button onClick={() => handleDeleteGroup(key)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                            </td>
                                        </tr>
                                        {isExpanded && g.tiers.sort((a, b) => a.areaFrom - b.areaFrom).map(tier => (
                                            <tr key={tier.id} className="bg-slate-50/50">
                                                <td></td>
                                                <td className="px-4 py-2 text-xs text-slate-500 pl-10">
                                                    {fmt(tier.areaFrom)} → {tier.areaTo ? fmt(tier.areaTo) : 'Trở lên'} {g.unit}
                                                </td>
                                                <td colSpan={3}></td>
                                                <td className="px-4 py-2 text-right font-bold text-sm text-slate-700">{fmt(tier.pricePerSqm)}₫/{g.unit}</td>
                                                <td></td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="mt-4 text-center text-xs text-slate-400">{groupEntries.length} nhóm • {tiers.length} mốc giá</div>
        </div>
    );
}
