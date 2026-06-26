"use client";
import { useEffect, useState, useCallback } from 'react';
import { api } from './_components/apiClient';
import Link from 'next/link';

interface QuoteStats {
    total: number; draft: number; pending: number; approved: number;
    sent: number; accepted: number; completed: number; rejected: number; cancelled: number;
}
interface DashboardOverview {
    quotes: QuoteStats;
    revenue: { total: number; thisMonth: number; lastMonth: number };
    materials: { total: number; lowStock: number };
    customers: { total: number };
    conversionRate: number;
    thisMonthQuotes: number; lastMonthQuotes: number;
}
interface ChartPoint { month: string; quotes: number; revenue: number }
interface TopItem { product?: string; name?: string; phone?: string; count?: number; quotes?: number; revenue: number }
interface Alert { type: string; severity: string; message: string; count?: number }

export default function DashboardPage() {
    const [overview, setOverview] = useState<DashboardOverview | null>(null);
    const [chart, setChart] = useState<ChartPoint[]>([]);
    const [topProducts, setTopProducts] = useState<TopItem[]>([]);
    const [topCustomers, setTopCustomers] = useState<TopItem[]>([]);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [ov, ch, tp, tc, al] = await Promise.all([
                api.get<DashboardOverview>('/erp/dashboard'),
                api.get<ChartPoint[]>('/erp/dashboard/revenue-chart'),
                api.get<TopItem[]>('/erp/dashboard/top-products'),
                api.get<TopItem[]>('/erp/dashboard/top-customers'),
                api.get<Alert[]>('/erp/dashboard/alerts'),
            ]);
            if (ov.success && ov.data) setOverview(ov.data);
            if (ch.success && ch.data) setChart(ch.data);
            if (tp.success && tp.data) setTopProducts(tp.data);
            if (tc.success && tc.data) setTopCustomers(tc.data);
            if (al.success && al.data) setAlerts(al.data);
        } catch { /* fallback */ }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
    const fmtCurrency = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
    const pctChange = (cur: number, prev: number) => {
        if (prev === 0) return cur > 0 ? '+100%' : '—';
        const pct = Math.round(((cur - prev) / prev) * 100);
        return pct >= 0 ? `+${pct}%` : `${pct}%`;
    };

    if (loading) return (
        <div className="flex items-center justify-center h-full">
            <svg className="animate-spin h-8 w-8 text-indigo-500" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
        </div>
    );

    const q = overview?.quotes || { total: 0, draft: 0, pending: 0, approved: 0, sent: 0, accepted: 0, completed: 0, rejected: 0, cancelled: 0 };
    const rev = overview?.revenue || { total: 0, thisMonth: 0, lastMonth: 0 };
    const mat = overview?.materials || { total: 0, lowStock: 0 };

    const kpis = [
        { label: 'Tổng Báo Giá', value: fmt(q.total), icon: '📋', gradient: 'from-blue-500 to-indigo-600', bg: 'bg-blue-50', sub: `${fmt(overview?.thisMonthQuotes || 0)} tháng này` },
        { label: 'Chờ Duyệt', value: fmt(q.pending), icon: '⏳', gradient: 'from-amber-500 to-orange-600', bg: 'bg-amber-50', sub: `${fmt(q.draft)} bản nháp` },
        { label: 'Doanh Thu', value: fmtCurrency(rev.thisMonth), icon: '💰', gradient: 'from-emerald-500 to-green-600', bg: 'bg-emerald-50', sub: pctChange(rev.thisMonth, rev.lastMonth) + ' so tháng trước' },
        { label: 'Vật Tư', value: fmt(mat.total), icon: '📦', gradient: 'from-violet-500 to-purple-600', bg: 'bg-violet-50', sub: mat.lowStock > 0 ? `⚠️ ${mat.lowStock} sắp hết` : '✅ Đủ hàng' },
    ];

    const statusBars = [
        { label: 'Bản nháp', count: q.draft, color: 'bg-slate-400' },
        { label: 'Chờ duyệt', count: q.pending, color: 'bg-amber-500' },
        { label: 'Đã duyệt', count: q.approved, color: 'bg-blue-500' },
        { label: 'Đã gửi', count: q.sent, color: 'bg-indigo-500' },
        { label: 'Đã chấp nhận', count: q.accepted, color: 'bg-teal-500' },
        { label: 'Hoàn thành', count: q.completed, color: 'bg-emerald-500' },
        { label: 'Từ chối', count: q.rejected, color: 'bg-red-400' },
        { label: 'Đã huỷ', count: q.cancelled, color: 'bg-slate-300' },
    ];

    // Simple bar chart using CSS
    const maxRevenue = Math.max(...chart.map(c => c.revenue), 1);

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6 overflow-y-auto">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Dashboard</h1>
                    <p className="text-slate-500 text-sm mt-1">Tổng quan hệ thống Pricing ERP • Tỷ lệ chuyển đổi: <span className="font-bold text-indigo-600">{overview?.conversionRate || 0}%</span></p>
                </div>
                <button onClick={loadData} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
                    🔄 Refresh
                </button>
            </div>

            {/* Alerts */}
            {alerts.length > 0 && (
                <div className="mb-4 space-y-2">
                    {alerts.map((a, i) => (
                        <div key={i} className={`flex items-center gap-3 p-3 rounded-xl text-sm font-medium border ${
                            a.severity === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                            a.severity === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
                            'bg-blue-50 border-blue-200 text-blue-800'
                        }`}>
                            <span>{a.severity === 'warning' ? '⚠️' : a.severity === 'error' ? '🚨' : 'ℹ️'}</span>
                            {a.message}
                        </div>
                    ))}
                </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {kpis.map((kpi, i) => (
                    <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-3xl">{kpi.icon}</span>
                            <span className={`${kpi.bg} w-10 h-10 rounded-xl flex items-center justify-center`}>
                                <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${kpi.gradient}`} />
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">{kpi.label}</p>
                        <p className="text-2xl font-black text-slate-800 mt-1">{kpi.value}</p>
                        <p className="text-xs text-slate-400 mt-1">{kpi.sub}</p>
                    </div>
                ))}
            </div>

            {/* Charts + Status */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* Revenue Chart */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h3 className="font-bold text-slate-800 mb-4">📊 Doanh thu 12 tháng</h3>
                    {chart.length > 0 ? (
                        <div className="flex items-end gap-1 h-48">
                            {chart.map((c, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center group relative" title={`${c.month}: ${fmtCurrency(c.revenue)} (${c.quotes} BG)`}>
                                    <div className="w-full flex flex-col items-center justify-end h-40">
                                        <div
                                            className="w-full max-w-[32px] bg-gradient-to-t from-indigo-500 to-blue-400 rounded-t-md transition-all hover:from-indigo-600 hover:to-blue-500 cursor-pointer"
                                            style={{ height: `${Math.max((c.revenue / maxRevenue) * 100, 2)}%`, minHeight: 4 }}
                                        />
                                    </div>
                                    <span className="text-[10px] text-slate-400 mt-1 truncate w-full text-center">{c.month.slice(5)}</span>
                                    {/* Tooltip */}
                                    <div className="absolute bottom-full mb-2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                                        {fmtCurrency(c.revenue)} • {c.quotes} BG
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="h-48 flex items-center justify-center text-slate-400 bg-gradient-to-br from-slate-50 to-indigo-50/30 rounded-xl border border-dashed border-slate-200">
                            <div className="text-center">
                                <p className="text-4xl mb-2">📈</p>
                                <p className="text-sm font-medium">Chưa có dữ liệu doanh thu</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Status Distribution */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h3 className="font-bold text-slate-800 mb-4">📊 Phân bổ trạng thái</h3>
                    <div className="space-y-3">
                        {statusBars.filter(s => s.count > 0).map((s, i) => (
                            <div key={i}>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-slate-600">{s.label}</span>
                                    <span className="font-bold text-slate-800">{s.count}</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-2">
                                    <div className={`${s.color} h-2 rounded-full transition-all duration-500`} style={{ width: `${q.total > 0 ? (s.count / q.total) * 100 : 0}%` }} />
                                </div>
                            </div>
                        ))}
                        {statusBars.every(s => s.count === 0) && (
                            <div className="text-center py-6 text-slate-400">
                                <p className="text-2xl mb-1">📭</p>
                                <p className="text-sm">Chưa có báo giá</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Top Products + Top Customers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Products */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h3 className="font-bold text-slate-800 mb-4">🏆 Top sản phẩm</h3>
                    {topProducts.length > 0 ? (
                        <div className="space-y-3">
                            {topProducts.map((p, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black text-white ${i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-amber-700' : 'bg-slate-300'}`}>
                                        {i + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-800 truncate">{p.product}</p>
                                        <p className="text-xs text-slate-400">{p.count} báo giá</p>
                                    </div>
                                    <span className="text-sm font-bold text-slate-700">{fmtCurrency(p.revenue)}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-6 text-slate-400 text-sm">Chưa có dữ liệu</div>
                    )}
                </div>

                {/* Top Customers */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h3 className="font-bold text-slate-800 mb-4">👥 Top khách hàng</h3>
                    {topCustomers.length > 0 ? (
                        <div className="space-y-3">
                            {topCustomers.map((c, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black text-white ${i === 0 ? 'bg-indigo-500' : i === 1 ? 'bg-indigo-400' : 'bg-slate-300'}`}>
                                        {i + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                                        <p className="text-xs text-slate-400">{c.phone} • {c.quotes} BG</p>
                                    </div>
                                    <span className="text-sm font-bold text-slate-700">{fmtCurrency(c.revenue)}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-6 text-slate-400 text-sm">Chưa có dữ liệu</div>
                    )}
                </div>
            </div>

            {/* Quick Links */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                <Link href="/pricing/quotes/new" className="bg-gradient-to-r from-indigo-500 to-blue-600 text-white rounded-xl p-4 text-center hover:shadow-lg hover:-translate-y-0.5 transition-all">
                    <span className="text-2xl">➕</span>
                    <p className="text-sm font-bold mt-1">Tạo Báo Giá</p>
                </Link>
                <Link href="/pricing/quotes" className="bg-white border border-slate-200 text-slate-700 rounded-xl p-4 text-center hover:shadow-md hover:-translate-y-0.5 transition-all">
                    <span className="text-2xl">📋</span>
                    <p className="text-sm font-bold mt-1">Ds. Báo Giá</p>
                </Link>
                <Link href="/pricing/materials" className="bg-white border border-slate-200 text-slate-700 rounded-xl p-4 text-center hover:shadow-md hover:-translate-y-0.5 transition-all">
                    <span className="text-2xl">📦</span>
                    <p className="text-sm font-bold mt-1">Quản lý Vật Tư</p>
                </Link>
                <Link href="/pricing/products" className="bg-white border border-slate-200 text-slate-700 rounded-xl p-4 text-center hover:shadow-md hover:-translate-y-0.5 transition-all">
                    <span className="text-2xl">🎨</span>
                    <p className="text-sm font-bold mt-1">Sản Phẩm</p>
                </Link>
            </div>
        </div>
    );
}
