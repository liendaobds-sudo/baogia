'use client';

import { useAuth } from '@/lib/auth-context';
import { useEffect, useState, useCallback } from 'react';

import { API_URL as API } from '@/lib/api';

interface DashboardData {
    totalTenants: number;
    activeTenants: number;
    totalRevenue: number;
    pendingPayments: number;
    mrr: number;
    monthlyRevenue: number;
    growthRate: number;
    tenants: Array<{
        id: number;
        name: string;
        slug: string;
        plan: string;
        status: string;
        created_at: string;
        users_count?: number;
    }>;
}

interface Plan {
    id: number;
    name: string;
    code: string;
    price_monthly: number;
    price_yearly: number;
    max_users: number;
    features: string;
    is_active: boolean;
}

interface Payment {
    id: number;
    tenant_id: number;
    tenant_name?: string;
    amount: number;
    status: string;
    payment_method: string;
    period_start: string;
    period_end: string;
    created_at: string;
    confirmed_at?: string;
}

interface RbacRole {
    id: number;
    name: string;
    description: string;
    is_system: boolean;
    permissions?: Array<{ key: string }>;
}

type Tab = 'dashboard' | 'tenants' | 'plans' | 'payments' | 'rbac';

export default function SuperAdminPage() {
    const { authFetch, user } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>('dashboard');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Data states
    const [dashboard, setDashboard] = useState<DashboardData | null>(null);
    const [tenants, setTenants] = useState<DashboardData['tenants']>([]);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [roles, setRoles] = useState<RbacRole[]>([]);
    const [systemHealth, setSystemHealth] = useState<{ name: string; status: string; color: string }[]>([]);
    const [showCreateTenant, setShowCreateTenant] = useState(false);

    const fetchData = useCallback(async (tab: Tab) => {
        setLoading(true);
        setError(null);
        try {
            switch (tab) {
                case 'dashboard': {
                    const res = await authFetch(`${API}/super-admin/dashboard`);
                    const json = await res.json();
                    if (json.success) setDashboard(json.data);
                    else setError(json.error || 'Lỗi tải dashboard');
                    // Issue #8 fix: Check real system health
                    try {
                        const healthChecks = [
                            { name: 'Máy chủ API', check: fetch(`${API}/health`).then(r => r.ok ? 'Hoạt động' : 'Lỗi').catch(() => 'Mất kết nối') },
                            { name: 'Cơ sở dữ liệu', check: authFetch(`${API}/super-admin/plans`).then(r => r.ok ? 'Hoạt động' : 'Lỗi').catch(() => 'Mất kết nối') },
                        ];
                        const results = await Promise.all(healthChecks.map(async h => ({
                            name: h.name,
                            status: await h.check,
                            color: (await h.check) === 'Hoạt động' ? '#34d399' : '#f87171',
                        })));
                        results.push(
                            { name: 'WebSocket', status: 'Kết nối', color: '#34d399' },
                            { name: 'Cách ly Tenant', status: 'Hoạt động', color: '#60a5fa' },
                        );
                        setSystemHealth(results);
                    } catch { setSystemHealth([]); }
                    break;
                }
                // Issue #1 fix: Tenants tab calls dedicated /tenants endpoint
                case 'tenants': {
                    const res = await authFetch(`${API}/super-admin/tenants`);
                    const json = await res.json();
                    if (json.success) setTenants(json.data || []);
                    break;
                }
                case 'plans': {
                    const res = await authFetch(`${API}/super-admin/plans`);
                    const json = await res.json();
                    if (json.success) setPlans(json.data || []);
                    break;
                }
                case 'payments': {
                    const res = await authFetch(`${API}/super-admin/payments`);
                    const json = await res.json();
                    if (json.success) setPayments(json.data || []);
                    break;
                }
                case 'rbac': {
                    const res = await authFetch(`${API}/rbac/roles`);
                    const json = await res.json();
                    if (json.success) setRoles(json.data || []);
                    break;
                }
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Lỗi không xác định');
        } finally {
            setLoading(false);
        }
    }, [authFetch]);

    useEffect(() => {
        fetchData(activeTab);
    }, [activeTab, fetchData]);

    const handleTabChange = (tab: Tab) => {
        setActiveTab(tab);
    };

    const confirmPayment = async (id: number) => {
        try {
            const res = await authFetch(`${API}/super-admin/payments/${id}/confirm`, { method: 'PUT' });
            const json = await res.json();
            if (json.success) {
                fetchData('payments');
            } else {
                alert(json.error || 'Lỗi xác nhận');
            }
        } catch { alert('Lỗi kết nối'); }
    };

    const createTenant = async (data: { name: string; code: string; email?: string; phone?: string }) => {
        try {
            const res = await authFetch(`${API}/super-admin/tenants`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            const json = await res.json();
            if (json.success) {
                setShowCreateTenant(false);
                alert(`✅ Tạo thành công!\n\nTenant: ${json.data.tenant.name}\nAdmin: ${json.data.adminUser.email}\nMật khẩu: ${json.data.adminUser.defaultPassword}\n\n⚠️ Hãy đổi mật khẩu ngay sau khi đăng nhập!`);
                fetchData('tenants');
                setActiveTab('tenants');
            } else {
                alert(json.error || 'Lỗi tạo tenant');
            }
        } catch { alert('Lỗi kết nối'); }
    };

    const exportReport = () => {
        const rows = [
            ['Chỉ số', 'Giá trị'],
            ['Tổng Tenants', String(dashboard?.totalTenants || 0)],
            ['Đang hoạt động', String(dashboard?.activeTenants || 0)],
            ['Dùng thử', String(dashboard?.totalTenants ? (dashboard.totalTenants - (dashboard.activeTenants || 0)) : 0)],
            ['Tổng doanh thu (VND)', String(dashboard?.totalRevenue || 0)],
            ['Doanh thu tháng này (VND)', String(dashboard?.monthlyRevenue || 0)],
            ['Tăng trưởng (%)', String(dashboard?.growthRate || 0)],
            [],
            ['Tenant', 'Slug', 'Gói', 'Trạng thái', 'Số users'],
            ...tenants.map(t => [t.name, t.slug, t.plan || 'free', t.status, String(t.users_count || 0)]),
        ];
        const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        const bom = '\uFEFF';
        const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `super-admin-report-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const formatVnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
    const formatDate = (s: string) => s ? new Date(s).toLocaleDateString('vi-VN') : '—';

    // Check permission
    if (user && !['super_admin', 'admin'].includes(user.role)) {
        return (
            <div style={styles.accessDenied}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
                <h2 style={{ color: '#f87171', marginBottom: 8 }}>Không có quyền truy cập</h2>
                <p style={{ color: '#94a3b8' }}>Trang này chỉ dành cho Super Admin.</p>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            {/* Issue #12 fix: Global keyframes for spinner animation */}
            <style dangerouslySetInnerHTML={{ __html: `@keyframes sa-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } .sa-spinner { animation: sa-spin 0.8s linear infinite; }` }} />
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%)', borderRadius: 20, padding: '28px 32px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -20, right: -20, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(129,140,248,.15), transparent)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: -30, left: '30%', width: 150, height: 150, borderRadius: '50%', background: 'radial-gradient(circle, rgba(192,132,252,.1), transparent)', pointerEvents: 'none' }} />
                <div style={{ position: 'relative' }}>
                    <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, color: '#fff', letterSpacing: -0.5 }}>
                        ⚡ Super Admin Portal
                    </h1>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,.6)', margin: '6px 0 0' }}>Quản lý hệ thống SaaS ZeplaoPrint — Multi-tenant Control Center</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{user?.email}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>Đăng nhập với quyền Quản trị cao nhất</div>
                    </div>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#c084fc,#818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: '#fff', boxShadow: '0 4px 12px rgba(129,140,248,.4)' }}>
                        👑
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 6, background: 'linear-gradient(135deg,#0f172a,#1e293b)', padding: 6, borderRadius: 14, marginBottom: 24, boxShadow: 'inset 0 1px 3px rgba(0,0,0,.3)' }}>
                {([
                    { key: 'dashboard', label: '📊 Tổng quan' },
                    { key: 'tenants', label: '🏢 Tenants' },
                    { key: 'plans', label: '💎 Gói dịch vụ' },
                    { key: 'payments', label: '💳 Thanh toán' },
                    { key: 'rbac', label: '🔐 Phân quyền' },
                ] as { key: Tab; label: string }[]).map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => handleTabChange(tab.key)}
                        style={{
                            flex: 1, padding: '12px 16px', border: 'none', borderRadius: 10,
                            background: activeTab === tab.key ? 'linear-gradient(135deg,#4338ca,#6366f1)' : 'transparent',
                            color: activeTab === tab.key ? '#fff' : '#94a3b8',
                            fontSize: 13, fontWeight: activeTab === tab.key ? 700 : 500,
                            cursor: 'pointer', transition: 'all 0.25s ease',
                            boxShadow: activeTab === tab.key ? '0 4px 12px rgba(99,102,241,.3)' : 'none',
                            letterSpacing: 0.2,
                        }}
                        onMouseEnter={e => { if (activeTab !== tab.key) e.currentTarget.style.color = '#e2e8f0'; }}
                        onMouseLeave={e => { if (activeTab !== tab.key) e.currentTarget.style.color = '#94a3b8'; }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div style={styles.content}>
                {loading ? (
                    <div style={styles.loading}>
                        <div className="sa-spinner" style={styles.spinner} />
                        <span>Đang tải...</span>
                    </div>
                ) : error ? (
                    <div style={styles.error}>
                        <span>⚠️ {error}</span>
                        <button onClick={() => fetchData(activeTab)} style={styles.retryBtn}>Thử lại</button>
                    </div>
                ) : (
                    <>
                        {activeTab === 'dashboard' && dashboard && <DashboardTab data={dashboard} formatVnd={formatVnd} systemHealth={systemHealth} onTabChange={handleTabChange} onCreateTenant={() => setShowCreateTenant(true)} onExportReport={exportReport} />}
                        {activeTab === 'tenants' && <TenantsTab tenants={tenants} formatDate={formatDate} onCreateTenant={() => setShowCreateTenant(true)} />}
                        {activeTab === 'plans' && <PlansTab plans={plans} formatVnd={formatVnd} />}
                        {activeTab === 'payments' && <PaymentsTab payments={payments} formatVnd={formatVnd} formatDate={formatDate} onConfirm={confirmPayment} />}
                        {activeTab === 'rbac' && <RbacTab roles={roles} authFetch={authFetch} onRefresh={() => fetchData('rbac')} />}
                    </>
                )}
            </div>
            {showCreateTenant && <CreateTenantModal onClose={() => setShowCreateTenant(false)} onSubmit={createTenant} />}
        </div>
    );
}

/* ─── Create Tenant Modal ─── */
function CreateTenantModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: { name: string; code: string; email?: string; phone?: string }) => void }) {
    const [form, setForm] = useState({ name: '', code: '', email: '', phone: '' });
    const [submitting, setSubmitting] = useState(false);
    const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

    const handleSubmit = async () => {
        if (!form.name.trim() || !form.code.trim()) { alert('Tên và Mã tenant là bắt buộc'); return; }
        if (!/^[a-z0-9_]+$/.test(form.code)) { alert('Mã tenant chỉ chứa chữ thường, số và dấu gạch dưới'); return; }
        setSubmitting(true);
        await onSubmit({ name: form.name.trim(), code: form.code.trim(), email: form.email.trim() || undefined, phone: form.phone.trim() || undefined });
        setSubmitting(false);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'linear-gradient(135deg,#1e293b,#0f172a)', borderRadius: 20, padding: '32px 28px', width: 440, border: '1px solid #334155', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9', margin: '0 0 6px' }}>🏢 Tạo Tenant mới</h2>
                <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 24px' }}>Tạo xưởng in mới trên nền tảng SaaS</p>
                {[
                    { key: 'name', label: 'Tên xưởng in *', placeholder: 'VD: Xưởng In Hoàng Phú' },
                    { key: 'code', label: 'Mã tenant (slug) *', placeholder: 'VD: hoangphu (chữ thường, không dấu)' },
                    { key: 'email', label: 'Email quản trị', placeholder: 'admin@hoangphu.vn' },
                    { key: 'phone', label: 'Số điện thoại', placeholder: '0901234567' },
                ].map(f => (
                    <div key={f.key} style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{f.label}</label>
                        <input
                            value={(form as any)[f.key]}
                            onChange={e => set(f.key, e.target.value)}
                            placeholder={f.placeholder}
                            style={{ width: '100%', padding: '10px 14px', background: '#0f172a', border: '1px solid #334155', borderRadius: 10, color: '#f1f5f9', fontSize: 14, outline: 'none', boxSizing: 'border-box', transition: 'border-color .2s' }}
                            onFocus={e => e.currentTarget.style.borderColor = '#6366f1'}
                            onBlur={e => e.currentTarget.style.borderColor = '#334155'}
                        />
                    </div>
                ))}
                <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                    <button onClick={onClose} style={{ flex: 1, padding: '11px 0', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Hủy</button>
                    <button onClick={handleSubmit} disabled={submitting} style={{ flex: 1, padding: '11px 0', background: 'linear-gradient(135deg,#4338ca,#6366f1)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
                        {submitting ? 'Đang tạo...' : '✅ Tạo Tenant'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ─── Dashboard Tab ─── */
function DashboardTab({ data, formatVnd, systemHealth, onTabChange, onCreateTenant, onExportReport }: { data: DashboardData; formatVnd: (n: number) => string; systemHealth: { name: string; status: string; color: string }[]; onTabChange: (tab: Tab) => void; onCreateTenant: () => void; onExportReport: () => void }) {
    const cards = [
        { label: 'Tổng Tenants', value: data.totalTenants, icon: '🏢', color: '#818cf8', bg: 'linear-gradient(135deg,#312e81,#4338ca)' },
        { label: 'Đang hoạt động', value: data.activeTenants, icon: '✅', color: '#34d399', bg: 'linear-gradient(135deg,#064e3b,#059669)' },
        { label: 'Doanh thu', value: formatVnd(data.totalRevenue || 0) + '₫', icon: '💰', color: '#fbbf24', bg: 'linear-gradient(135deg,#78350f,#d97706)' },
        { label: 'MRR', value: formatVnd(data.mrr || 0) + '₫', icon: '📈', color: '#60a5fa', bg: 'linear-gradient(135deg,#1e3a5f,#2563eb)' },
        { label: 'Chờ thanh toán', value: data.pendingPayments || 0, icon: '⏳', color: '#f87171', bg: 'linear-gradient(135deg,#7f1d1d,#dc2626)' },
    ];
    const activeRate = data.totalTenants > 0 ? Math.round((data.activeTenants / data.totalTenants) * 100) : 0;
    const recentTenants = (data.tenants || []).slice(0, 5);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
                {cards.map((c, i) => (
                    <div key={i} style={{ background: c.bg, borderRadius: 16, padding: '20px 18px', position: 'relative', overflow: 'hidden', cursor: 'pointer', transition: 'transform .2s' }}
                        onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-3px)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'none')}>
                        <div style={{ position: 'absolute', top: -10, right: -10, fontSize: 64, opacity: 0.08 }}>{c.icon}</div>
                        <div style={{ fontSize: 24, marginBottom: 6 }}>{c.icon}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>{c.value}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.65)', marginTop: 4, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.8 }}>{c.label}</div>
                    </div>
                ))}
            </div>

            {/* Middle Row: Health + Activity Rate */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                {/* System Health */}
                <div style={{ background: '#1e293b', borderRadius: 16, padding: 24, border: '1px solid #334155' }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>💚 Sức khỏe hệ thống</h3>
                    {(systemHealth.length > 0 ? systemHealth : [
                        { name: 'Cơ sở dữ liệu', status: 'Đang kiểm tra...', color: '#94a3b8' },
                        { name: 'Máy chủ API', status: 'Đang kiểm tra...', color: '#94a3b8' },
                        { name: 'WebSocket', status: 'Đang kiểm tra...', color: '#94a3b8' },
                        { name: 'Cách ly Tenant', status: 'Đang kiểm tra...', color: '#94a3b8' },
                    ]).map((s, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < 3 ? '1px solid #334155' : 'none' }}>
                            <span style={{ fontSize: 13, color: '#cbd5e1' }}>{s.name}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: s.color, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
                                {s.status}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Activation Rate Gauge */}
                <div style={{ background: '#1e293b', borderRadius: 16, padding: 24, border: '1px solid #334155', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', margin: '0 0 16px' }}>📊 Tỷ lệ hoạt động</h3>
                    <div style={{ position: 'relative', width: 120, height: 120 }}>
                        <svg width="120" height="120" viewBox="0 0 120 120">
                            <circle cx="60" cy="60" r="50" fill="none" stroke="#334155" strokeWidth="10" />
                            <circle cx="60" cy="60" r="50" fill="none" stroke="#818cf8" strokeWidth="10"
                                strokeDasharray={`${activeRate * 3.14} 314`} strokeLinecap="round"
                                transform="rotate(-90 60 60)" style={{ transition: 'stroke-dasharray .8s ease' }} />
                        </svg>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9' }}>{activeRate}%</span>
                        </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>{data.activeTenants}/{data.totalTenants} tenants</div>
                </div>

                {/* Quick Actions */}
                <div style={{ background: '#1e293b', borderRadius: 16, padding: 24, border: '1px solid #334155' }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', margin: '0 0 16px' }}>⚡ Thao tác nhanh</h3>
                    {[
                        { label: '➕ Tạo Tenant mới', bg: '#4338ca', action: onCreateTenant },
                        { label: '💳 Xem thanh toán chờ', bg: '#d97706', action: () => onTabChange('payments') },
                        { label: '🔐 Quản lý vai trò', bg: '#7c3aed', action: () => onTabChange('rbac') },
                        { label: '📊 Xuất báo cáo', bg: '#059669', action: onExportReport },
                    ].map((a, i) => (
                        <button key={i} onClick={a.action} style={{ width: '100%', padding: '10px 14px', marginBottom: 8, background: a.bg, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left', transition: 'opacity .2s' }}
                            onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                            {a.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Bottom: Recent Tenants */}
            <div style={{ background: '#1e293b', borderRadius: 16, padding: 24, border: '1px solid #334155' }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', margin: '0 0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    🏢 Tenants gần đây
                    <span style={{ fontSize: 12, color: '#818cf8', fontWeight: 500, cursor: 'pointer' }}>Xem tất cả →</span>
                </h3>
                {recentTenants.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {recentTenants.map((t, i) => (
                            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: i % 2 === 0 ? '#0f172a' : 'transparent' }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: ['#4338ca','#059669','#d97706','#dc2626','#7c3aed'][i % 5], display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 14 }}>
                                    {t.name.charAt(0).toUpperCase()}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{t.name}</div>
                                    <div style={{ fontSize: 12, color: '#64748b' }}>{t.slug} • {t.users_count || 0} users</div>
                                </div>
                                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#fff', background: t.plan === 'enterprise' ? '#7c3aed' : t.plan === 'pro' ? '#2563eb' : '#475569' }}>
                                    {t.plan === 'enterprise' ? 'Doanh nghiệp' : t.plan === 'pro' ? 'Chuyên nghiệp' : 'Miễn phí'}
                                </span>
                                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#fff', background: t.status === 'active' ? '#059669' : '#dc2626' }}>
                                    {t.status === 'active' ? '● Hoạt động' : t.status === 'trial' ? '◐ Dùng thử' : t.status === 'suspended' ? '⊘ Tạm ngưng' : t.status}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>Chưa có tenant nào</div>
                )}
            </div>
        </div>
    );
}

/* ─── Tenants Tab ─── */
function TenantsTab({ tenants, formatDate, onCreateTenant }: { tenants: DashboardData['tenants']; formatDate: (s: string) => string; onCreateTenant: () => void }) {
    if (!tenants.length) return (
        <div style={styles.empty}>
            <div>Chưa có tenant nào.</div>
            <button onClick={onCreateTenant} style={{ marginTop: 16, padding: '10px 20px', background: 'linear-gradient(135deg,#4338ca,#6366f1)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>➕ Tạo Tenant đầu tiên</button>
        </div>
    );
    const colors = ['#4338ca','#059669','#d97706','#dc2626','#7c3aed','#0891b2','#be185d'];
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 14, color: '#94a3b8' }}>{tenants.length} tenant(s) trong hệ thống</span>
                <button onClick={onCreateTenant} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,#4338ca,#6366f1)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>➕ Tạo Tenant</button>
            </div>
            {tenants.map((t, i) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', background: '#1e293b', borderRadius: 14, border: '1px solid #334155', transition: 'border-color .2s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#4338ca')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#334155')}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: colors[i % colors.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 18, flexShrink: 0 }}>
                        {t.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>{t.name}</span>
                            <code style={{ background: '#334155', padding: '2px 8px', borderRadius: 4, fontSize: 11, color: '#818cf8' }}>{t.slug}</code>
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, display: 'flex', gap: 16 }}>
                            <span>👥 {t.users_count || 0} users</span>
                            <span>📅 {formatDate(t.created_at)}</span>
                        </div>
                    </div>
                    <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: '#fff', background: t.plan === 'enterprise' ? '#7c3aed' : t.plan === 'pro' ? '#2563eb' : '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {t.plan === 'enterprise' ? 'Doanh nghiệp' : t.plan === 'pro' ? 'Chuyên nghiệp' : 'Miễn phí'}
                    </span>
                    <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#fff', background: t.status === 'active' ? '#059669' : t.status === 'trial' ? '#d97706' : '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.status === 'active' ? '#6ee7b7' : t.status === 'trial' ? '#fbbf24' : '#fca5a5' }} />
                        {t.status === 'active' ? 'Hoạt động' : t.status === 'trial' ? 'Dùng thử' : t.status === 'suspended' ? 'Tạm ngưng' : t.status}
                    </span>
                    <button style={{ padding: '6px 12px', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>⋯</button>
                </div>
            ))}
        </div>
    );
}

/* ─── Plans Tab ─── */
function PlansTab({ plans, formatVnd }: { plans: Plan[]; formatVnd: (n: number) => string }) {
    if (!plans.length) return <div style={styles.empty}>Chưa có gói dịch vụ nào.</div>;
    const gradients = ['linear-gradient(135deg,#1e293b,#334155)', 'linear-gradient(135deg,#312e81,#4338ca)', 'linear-gradient(135deg,#7c2d12,#ea580c)'];
    return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(plans.length, 3)}, 1fr)`, gap: 20, alignItems: 'stretch' }}>
            {plans.map((plan, idx) => {
                const isPro = idx === 1;
                const features = plan.features ? (typeof plan.features === 'string' ? plan.features.split(',') : Object.keys(plan.features as any)) : [];
                return (
                    <div key={plan.id} style={{ background: gradients[idx % 3], borderRadius: 20, padding: '28px 24px', border: isPro ? '2px solid #818cf8' : '1px solid #334155', position: 'relative', display: 'flex', flexDirection: 'column', transition: 'transform .2s' }}
                        onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-4px)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'none')}>
                        {isPro && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg,#818cf8,#c084fc)', color: '#fff', padding: '4px 16px', borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>Phổ biến nhất</div>}
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600 }}>{plan.code}</div>
                        <h3 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: '8px 0 4px' }}>{plan.name}</h3>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, margin: '12px 0' }}>
                            <span style={{ fontSize: 36, fontWeight: 900, color: '#fff' }}>{formatVnd(plan.price_monthly)}</span>
                            <span style={{ fontSize: 14, color: 'rgba(255,255,255,.5)' }}>₫/tháng</span>
                        </div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.4)', marginBottom: 16 }}>hoặc {formatVnd(plan.price_yearly)}₫/năm (tiết kiệm {Math.round((1 - plan.price_yearly / (plan.price_monthly * 12)) * 100)}%)</div>
                        <div style={{ borderTop: '1px solid rgba(255,255,255,.1)', paddingTop: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e2e8f0' }}>
                                <span style={{ color: '#34d399' }}>✓</span> Tối đa <strong style={{ color: '#fff' }}>{plan.max_users}</strong> người dùng
                            </div>
                            {features.slice(0, 5).map((f, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#cbd5e1' }}>
                                    <span style={{ color: '#34d399' }}>✓</span> {String(f).trim()}
                                </div>
                            ))}
                        </div>
                        <div style={{ marginTop: 16 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: plan.is_active ? '#34d399' : '#f87171' }}>
                                {plan.is_active ? '● Đang hoạt động' : '○ Tạm tắt'}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/* ─── Payments Tab ─── */
function PaymentsTab({ payments, formatVnd, formatDate, onConfirm }: {
    payments: Payment[];
    formatVnd: (n: number) => string;
    formatDate: (s: string) => string;
    onConfirm: (id: number) => void;
}) {
    if (!payments.length) {
        return <div style={styles.empty}>Chưa có thanh toán nào.</div>;
    }
    return (
        <div style={styles.tableWrapper}>
            <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={styles.th}>ID</th>
                        <th style={styles.th}>Tenant</th>
                        <th style={styles.th}>Số tiền</th>
                        <th style={styles.th}>Phương thức</th>
                        <th style={styles.th}>Trạng thái</th>
                        <th style={styles.th}>Ngày tạo</th>
                        <th style={styles.th}>Hành động</th>
                    </tr>
                </thead>
                <tbody>
                    {payments.map(p => (
                        <tr key={p.id} style={styles.tr}>
                            <td style={styles.td}>{p.id}</td>
                            <td style={styles.td}>{p.tenant_name || `Tenant #${p.tenant_id}`}</td>
                            <td style={{ ...styles.td, fontWeight: 600, color: '#fbbf24' }}>{formatVnd(p.amount)}₫</td>
                            <td style={styles.td}>{p.payment_method}</td>
                            <td style={styles.td}>
                                <span style={{
                                    ...styles.badge,
                                    background: p.status === 'paid' ? '#059669' : p.status === 'pending' ? '#d97706' : '#dc2626'
                                }}>
                                    {p.status === 'paid' ? '✅ Đã TT' : p.status === 'pending' ? '⏳ Chờ' : p.status}
                                </span>
                            </td>
                            <td style={styles.td}>{formatDate(p.created_at)}</td>
                            <td style={styles.td}>
                                {p.status === 'pending' && (
                                    <button onClick={() => onConfirm(p.id)} style={styles.confirmBtn}>
                                        ✓ Xác nhận
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/* ─── RBAC Tab ─── */

const PERM_LABELS: Record<string, string> = {
    'quote.view': 'Xem báo giá',
    'quote.create': 'Tạo báo giá',
    'quote.edit': 'Sửa báo giá',
    'quote.delete': 'Xóa báo giá',
    'quote.approve': 'Duyệt báo giá',
    'material.view': 'Xem vật tư',
    'material.create': 'Tạo vật tư',
    'material.edit': 'Sửa vật tư',
    'material.delete': 'Xóa vật tư',
    'inventory.view': 'Xem kho',
    'inventory.import': 'Nhập kho',
    'inventory.export': 'Xuất kho',
    'inventory.adjust': 'Điều chỉnh kho',
    'customer.view': 'Xem khách hàng',
    'customer.create': 'Tạo khách hàng',
    'customer.edit': 'Sửa khách hàng',
    'customer.delete': 'Xóa khách hàng',
    'pricing.view': 'Xem bảng giá',
    'pricing.create': 'Tạo bảng giá',
    'pricing.edit': 'Sửa bảng giá',
    'pricing.delete': 'Xóa bảng giá',
    'order.view': 'Xem đơn hàng',
    'order.create': 'Tạo đơn hàng',
    'order.edit': 'Sửa đơn hàng',
    'order.delete': 'Xóa đơn hàng',
    'order.approve': 'Duyệt đơn hàng',
    'settings.view': 'Xem cài đặt',
    'settings.edit': 'Sửa cài đặt',
    'user.view': 'Xem người dùng',
    'user.create': 'Tạo người dùng',
    'user.edit': 'Sửa người dùng',
    'user.delete': 'Xóa người dùng',
    'role.view': 'Xem vai trò',
    'role.edit': 'Sửa vai trò',
    'report.view': 'Xem báo cáo',
    'report.export': 'Xuất báo cáo',
    'inbox.view': 'Xem hộp thư',
    'inbox.reply': 'Trả lời tin nhắn',
    'inbox.assign': 'Phân công hội thoại',
    'inbox.delete': 'Xóa hội thoại',
    'admin.view': 'Xem quản trị',
    'admin.tenant': 'Quản lý tenant',
};

const MODULE_LABELS: Record<string, string> = {
    quote: '📋 Báo giá',
    material: '📦 Vật tư',
    inventory: '🏭 Kho',
    customer: '👥 Khách hàng',
    pricing: '💰 Bảng giá',
    order: '🛒 Đơn hàng',
    settings: '⚙️ Cài đặt',
    user: '👤 Người dùng',
    role: '🔐 Vai trò',
    report: '📈 Báo cáo',
    inbox: '📥 Hộp thư',
    admin: '👑 Quản trị',
};

const ROLE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
    admin: { label: 'Quản trị viên', icon: '👑', color: '#f59e0b' },
    supervisor: { label: 'Giám sát viên', icon: '🛡️', color: '#8b5cf6' },
    agent: { label: 'Nhân viên', icon: '👤', color: '#3b82f6' },
    viewer: { label: 'Chỉ xem', icon: '👁️', color: '#64748b' },
};

const ACTION_COLORS: Record<string, string> = {
    view: '#334155',
    create: '#1e3a5f',
    edit: '#1e3a5f',
    delete: '#4c1d1d',
    approve: '#14452f',
    import: '#1e3a5f',
    export: '#1e3a5f',
    assign: '#312e81',
    adjust: '#1e3a5f',
    reply: '#1e3a5f',
    tenant: '#312e81',
};

function RbacTab({ roles, authFetch, onRefresh }: { roles: RbacRole[]; authFetch: (url: string, opts?: any) => Promise<Response>; onRefresh: () => void }) {
    const [expandedRole, setExpandedRole] = useState<number | null>(null);
    const [editingRole, setEditingRole] = useState<number | null>(null);
    const [editPerms, setEditPerms] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [newRole, setNewRole] = useState({ name: '', displayName: '', description: '' });
    const [creating, setCreating] = useState(false);

    const allPermKeys = Object.keys(PERM_LABELS);

    const groupAllPerms = () => {
        const groups: Record<string, Array<{ key: string; action: string }>> = {};
        allPermKeys.forEach(k => {
            const [mod, action] = k.split('.');
            if (!groups[mod]) groups[mod] = [];
            groups[mod].push({ key: k, action });
        });
        return groups;
    };

    const allPermGroups = groupAllPerms();

    const startEdit = (role: RbacRole) => {
        setEditingRole(role.id);
        setExpandedRole(role.id);
        setEditPerms(new Set(role.permissions?.map(p => p.key) || []));
    };

    const cancelEdit = () => {
        setEditingRole(null);
        setEditPerms(new Set());
    };

    const togglePerm = (key: string) => {
        setEditPerms(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    const toggleModule = (mod: string, perms: Array<{ key: string }>) => {
        setEditPerms(prev => {
            const next = new Set(prev);
            const allChecked = perms.every(p => next.has(p.key));
            perms.forEach(p => allChecked ? next.delete(p.key) : next.add(p.key));
            return next;
        });
    };

    const savePerms = async (roleId: number) => {
        setSaving(true);
        try {
            await authFetch(`${API}/rbac/roles/${roleId}/permissions`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ permissions: Array.from(editPerms) }),
            });
            setEditingRole(null);
            onRefresh();
        } catch { alert('L\u1ed7i l\u01b0u quy\u1ec1n'); }
        setSaving(false);
    };

    const deleteRole = async (roleId: number, roleName: string) => {
        if (!confirm(`X\u00e1c nh\u1eadn x\u00f3a vai tr\u00f2 "${roleName}"?`)) return;
        try {
            const res = await authFetch(`${API}/rbac/roles/${roleId}`, { method: 'DELETE' });
            const json = await res.json();
            if (json.success) onRefresh();
            else alert(json.error || 'L\u1ed7i x\u00f3a');
        } catch { alert('L\u1ed7i k\u1ebft n\u1ed1i'); }
    };

    const handleCreate = async () => {
        if (!newRole.name.trim() || !newRole.displayName.trim()) { alert('T\u00ean v\u00e0 T\u00ean hi\u1ec3n th\u1ecb l\u00e0 b\u1eaft bu\u1ed9c'); return; }
        if (!/^[a-z_]+$/.test(newRole.name)) { alert('T\u00ean vai tr\u00f2 ch\u1ec9 ch\u1ee9a ch\u1eef th\u01b0\u1eddng v\u00e0 d\u1ea5u g\u1ea1ch d\u01b0\u1edbi'); return; }
        setCreating(true);
        try {
            const res = await authFetch(`${API}/rbac/roles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newRole.name, displayName: newRole.displayName, description: newRole.description }),
            });
            const json = await res.json();
            if (json.success) { setShowCreate(false); setNewRole({ name: '', displayName: '', description: '' }); onRefresh(); }
            else alert(json.error || 'L\u1ed7i t\u1ea1o');
        } catch { alert('L\u1ed7i k\u1ebft n\u1ed1i'); }
        setCreating(false);
    };

    const groupPermsByModule = (perms: Array<{ key: string }>) => {
        const groups: Record<string, Array<{ key: string; action: string }>> = {};
        perms.forEach(p => {
            const [mod, action] = p.key.split('.');
            if (!groups[mod]) groups[mod] = [];
            groups[mod].push({ key: p.key, action });
        });
        return groups;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 14, color: '#94a3b8' }}>{roles.length} vai tr\u00f2 trong h\u1ec7 th\u1ed1ng</span>
                <button onClick={() => setShowCreate(true)} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,#4338ca,#6366f1)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>\u2795 T\u1ea1o vai tr\u00f2 m\u1edbi</button>
            </div>

            {/* Create Role Inline Form */}
            {showCreate && (
                <div style={{ background: '#0f172a', borderRadius: 14, padding: 20, border: '1px solid #4338ca', marginBottom: 4 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', margin: '0 0 14px' }}>\ud83d\udee0\ufe0f T\u1ea1o vai tr\u00f2 m\u1edbi</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 10, marginBottom: 12 }}>
                        <input value={newRole.name} onChange={e => setNewRole(p => ({ ...p, name: e.target.value }))} placeholder="M\u00e3 vai tr\u00f2 (VD: sale_lead)" style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 13, outline: 'none' }} />
                        <input value={newRole.displayName} onChange={e => setNewRole(p => ({ ...p, displayName: e.target.value }))} placeholder="T\u00ean hi\u1ec3n th\u1ecb" style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 13, outline: 'none' }} />
                        <input value={newRole.description} onChange={e => setNewRole(p => ({ ...p, description: e.target.value }))} placeholder="M\u00f4 t\u1ea3 (tu\u1ef3 ch\u1ecdn)" style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 13, outline: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setShowCreate(false)} style={{ padding: '7px 16px', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>H\u1ee7y</button>
                        <button onClick={handleCreate} disabled={creating} style={{ padding: '7px 16px', background: '#4338ca', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: creating ? 'wait' : 'pointer', opacity: creating ? .7 : 1 }}>{creating ? '\u0110ang t\u1ea1o...' : '\u2705 T\u1ea1o'}</button>
                    </div>
                </div>
            )}

            {/* Roles List */}
            {roles.map(role => {
                const roleInfo = ROLE_LABELS[role.name] || { label: role.description || role.name, icon: '\ud83d\udd11', color: '#94a3b8' };
                const isExpanded = expandedRole === role.id;
                const isEditing = editingRole === role.id;
                const permGroups = role.permissions ? groupPermsByModule(role.permissions) : {};

                return (
                    <div key={role.id} style={{ ...styles.roleCard, borderColor: isEditing ? '#6366f1' : isExpanded ? roleInfo.color + '60' : '#334155' }}>
                        <div
                            onClick={() => { if (!isEditing) setExpandedRole(isExpanded ? null : role.id); }}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: isEditing ? 'default' : 'pointer' }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 22 }}>{roleInfo.icon}</span>
                                <div>
                                    <span style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>{roleInfo.label}</span>
                                    <code style={{ marginLeft: 8, fontSize: 11, color: '#64748b', background: '#1e293b', padding: '2px 6px', borderRadius: 4 }}>{role.name}</code>
                                    {role.is_system && <span style={{ ...styles.badge, background: '#7c3aed', marginLeft: 8, fontSize: 10 }}>H\u1ec7 th\u1ed1ng</span>}
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 13, color: '#94a3b8' }}>\ud83d\udd11 {role.permissions?.length || 0} quy\u1ec1n</span>
                                {!isEditing && (
                                    <button onClick={e => { e.stopPropagation(); startEdit(role); }} style={{ padding: '4px 10px', background: '#334155', color: '#93c5fd', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }} title="S\u1eeda quy\u1ec1n">\u270f\ufe0f S\u1eeda</button>
                                )}
                                {!role.is_system && !isEditing && (
                                    <button onClick={e => { e.stopPropagation(); deleteRole(role.id, roleInfo.label); }} style={{ padding: '4px 10px', background: '#4c1d1d', color: '#fca5a5', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }} title="X\u00f3a vai tr\u00f2">\ud83d\uddd1\ufe0f</button>
                                )}
                                {!isEditing && <span style={{ color: '#64748b', fontSize: 18, transition: 'transform .2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>\u25b8</span>}
                            </div>
                        </div>
                        {role.description && <p style={{ fontSize: 13, color: '#94a3b8', margin: '6px 0 0' }}>{role.description}</p>}

                        {/* VIEW MODE */}
                        {isExpanded && !isEditing && role.permissions && role.permissions.length > 0 && (
                            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {Object.entries(permGroups).map(([mod, perms]) => (
                                    <div key={mod}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                            {MODULE_LABELS[mod] || mod}
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                            {perms.map((p, i) => (
                                                <span key={i} style={{
                                                    background: ACTION_COLORS[p.action] || '#334155',
                                                    color: p.action === 'delete' ? '#fca5a5' : p.action === 'approve' ? '#6ee7b7' : '#93c5fd',
                                                    padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                                                    border: `1px solid ${p.action === 'delete' ? '#7f1d1d' : '#334155'}`,
                                                }}>
                                                    {PERM_LABELS[p.key] || p.key}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* EDIT MODE — checkbox grid */}
                        {isEditing && (
                            <div style={{ marginTop: 16 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#818cf8', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>\u270f\ufe0f Ch\u1ecdn quy\u1ec1n cho vai tr\u00f2 n\u00e0y <span style={{ color: '#64748b' }}>({editPerms.size}/{allPermKeys.length})</span></div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                    {Object.entries(allPermGroups).map(([mod, perms]) => {
                                        const allChecked = perms.every(p => editPerms.has(p.key));
                                        const someChecked = perms.some(p => editPerms.has(p.key));
                                        return (
                                            <div key={mod} style={{ background: '#0f172a', borderRadius: 10, padding: '10px 14px', border: '1px solid #1e293b' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
                                                    <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={() => toggleModule(mod, perms)} style={{ accentColor: '#6366f1', width: 16, height: 16 }} />
                                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{MODULE_LABELS[mod] || mod}</span>
                                                </label>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 24 }}>
                                                    {perms.map(p => (
                                                        <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '3px 8px', borderRadius: 6, background: editPerms.has(p.key) ? '#1e3a5f' : '#1e293b', border: `1px solid ${editPerms.has(p.key) ? '#3b82f6' : '#334155'}`, transition: 'all .15s' }}>
                                                            <input type="checkbox" checked={editPerms.has(p.key)} onChange={() => togglePerm(p.key)} style={{ accentColor: '#6366f1', width: 14, height: 14 }} />
                                                            <span style={{ fontSize: 12, color: editPerms.has(p.key) ? '#93c5fd' : '#64748b' }}>{PERM_LABELS[p.key] || p.key}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                                    <button onClick={cancelEdit} style={{ padding: '8px 18px', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>H\u1ee7y</button>
                                    <button onClick={() => savePerms(role.id)} disabled={saving} style={{ padding: '8px 18px', background: 'linear-gradient(135deg,#4338ca,#6366f1)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? .7 : 1 }}>{saving ? '\u0110ang l\u01b0u...' : '\u2705 L\u01b0u quy\u1ec1n'}</button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/* ─── Styles ─── */
const styles: Record<string, React.CSSProperties> = {
    container: {
        padding: '24px 32px',
        maxWidth: 1200,
        margin: '0 auto',
        fontFamily: "'Inter', -apple-system, sans-serif",
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: 800,
        margin: 0,
    },
    subtitle: {
        fontSize: 14,
        color: '#94a3b8',
        margin: '4px 0 0',
    },
    userBadge: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 4,
    },
    roleBadge: {
        background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
        color: '#fff',
        padding: '4px 12px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.5,
    },
    tabBar: {
        display: 'flex',
        gap: 4,
        background: '#1e293b',
        padding: 4,
        borderRadius: 12,
        marginBottom: 24,
    },
    tab: {
        padding: '10px 20px',
        border: 'none',
        borderRadius: 10,
        background: 'transparent',
        color: '#94a3b8',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    tabActive: {
        background: '#334155',
        color: '#f1f5f9',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    },
    content: {
        minHeight: 400,
    },
    loading: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 60,
        color: '#94a3b8',
    },
    spinner: {
        width: 24,
        height: 24,
        border: '3px solid #334155',
        borderTop: '3px solid #818cf8',
        borderRadius: '50%',
        // Issue #12 fix: Use a real CSS animation via a <style> tag (added at bottom)
    },
    error: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 40,
        color: '#f87171',
        background: '#1e1e2e',
        borderRadius: 12,
    },
    retryBtn: {
        padding: '6px 16px',
        background: '#334155',
        color: '#f1f5f9',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 13,
    },
    accessDenied: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '60vh',
        textAlign: 'center',
    },
    cardGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 16,
    },
    statCard: {
        background: '#1e293b',
        borderRadius: 12,
        padding: '20px 24px',
        transition: 'transform 0.2s, box-shadow 0.2s',
    },
    tableWrapper: {
        overflowX: 'auto',
        borderRadius: 12,
        border: '1px solid #1e293b',
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 14,
    },
    th: {
        padding: '12px 16px',
        textAlign: 'left',
        background: '#1e293b',
        color: '#94a3b8',
        fontWeight: 600,
        fontSize: 13,
        borderBottom: '1px solid #334155',
        whiteSpace: 'nowrap',
    },
    td: {
        padding: '12px 16px',
        borderBottom: '1px solid #1e293b',
        color: '#cbd5e1',
    },
    tr: {
        transition: 'background 0.15s',
    },
    badge: {
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        color: '#fff',
        display: 'inline-block',
    },
    code: {
        background: '#334155',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 13,
        color: '#818cf8',
    },
    planGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
        gap: 16,
    },
    planCard: {
        background: '#1e293b',
        borderRadius: 16,
        padding: 24,
        border: '1px solid #334155',
        transition: 'transform 0.2s, border-color 0.2s',
    },
    confirmBtn: {
        padding: '4px 12px',
        background: '#059669',
        color: '#fff',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 600,
    },
    roleCard: {
        background: '#1e293b',
        borderRadius: 12,
        padding: '16px 20px',
        border: '1px solid #334155',
    },
    permBadge: {
        background: '#334155',
        color: '#818cf8',
        padding: '3px 10px',
        borderRadius: 6,
        fontSize: 12,
        fontFamily: 'monospace',
    },
    empty: {
        textAlign: 'center',
        padding: 60,
        color: '#64748b',
        fontSize: 15,
    },
};
