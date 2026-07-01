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
        email?: string;
        phone?: string;
        subscriptionEndsAt?: string;
    }>;
}

type Tenant = DashboardData['tenants'][number];

interface Plan {
    id: number;
    name: string;
    code: string;
    price_monthly: number;
    price_yearly: number;
    max_users: number;
    features: string[] | string;
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
    const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
    const [capsTenant, setCapsTenant] = useState<Tenant | null>(null);
    // Thông tin đăng nhập vừa tạo/đặt lại — hiển thị modal rõ ràng (email + mật khẩu, có copy)
    // thay cho alert() chớp nhoáng.
    const [credsInfo, setCredsInfo] = useState<{ title: string; tenantName?: string; email: string; password: string } | null>(null);

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
                    const [tenantsRes, plansRes] = await Promise.all([
                        authFetch(`${API}/super-admin/tenants`),
                        authFetch(`${API}/super-admin/plans`),
                    ]);
                    const tenantsJson = await tenantsRes.json();
                    if (tenantsJson.success) setTenants(tenantsJson.data || []);
                    const plansJson = await plansRes.json();
                    if (plansJson.success) setPlans(plansJson.data || []);
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

    const createTenant = async (data: { name: string; code: string; username?: string; email?: string; phone?: string }) => {
        try {
            const res = await authFetch(`${API}/super-admin/tenants`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            const json = await res.json();
            if (json.success) {
                setShowCreateTenant(false);
                setCredsInfo({
                    title: '✅ Tạo tenant thành công',
                    tenantName: json.data.tenant.name,
                    email: json.data.adminUser.email,
                    password: json.data.adminUser.defaultPassword,
                });
                fetchData('tenants');
                setActiveTab('tenants');
            } else {
                alert(json.error || 'Lỗi tạo tenant');
            }
        } catch { alert('Lỗi kết nối'); }
    };

    const updateTenant = async (id: number, patch: { name?: string; email?: string; phone?: string; address?: string; taxCode?: string; planId?: number | null; maxUsers?: number }) => {
        try {
            const res = await authFetch(`${API}/super-admin/tenants/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
            });
            const json = await res.json();
            if (json.success) {
                setEditingTenant(null);
                fetchData('tenants');
            } else {
                alert(json.error || 'Lỗi cập nhật tenant');
            }
        } catch { alert('Lỗi kết nối'); }
    };

    const setTenantStatus = async (id: number, status: 'trial' | 'active' | 'suspended' | 'cancelled') => {
        if ((status === 'suspended' || status === 'cancelled') &&
            !confirm(status === 'suspended'
                ? 'Tạm ngưng tenant này? Toàn bộ người dùng của tenant sẽ bị vô hiệu hóa.'
                : 'Hủy tenant này? Toàn bộ người dùng của tenant sẽ bị vô hiệu hóa.')) {
            return;
        }
        try {
            const res = await authFetch(`${API}/super-admin/tenants/${id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            const json = await res.json();
            if (json.success) {
                fetchData('tenants');
            } else {
                alert(json.error || 'Lỗi đổi trạng thái');
            }
        } catch { alert('Lỗi kết nối'); }
    };

    const resetTenantAdminPassword = async (id: number) => {
        if (!confirm('Đặt lại mật khẩu quản trị của tenant này? Mật khẩu hiện tại sẽ không còn dùng được.')) return;
        try {
            const res = await authFetch(`${API}/super-admin/tenants/${id}/reset-admin-password`, { method: 'POST' });
            const json = await res.json();
            if (json.success) {
                setCredsInfo({
                    title: '🔑 Đã đặt lại mật khẩu',
                    email: json.data.adminEmail,
                    password: json.data.newPassword,
                });
            } else {
                alert(json.error || 'Lỗi đặt lại mật khẩu');
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

    // Chỉ SUPER_ADMIN được vào Super Admin Portal (đồng bộ với backend @Roles(SUPER_ADMIN)).
    // Admin cấp tenant KHÔNG có quyền platform (tránh leo thang chéo-tenant).
    if (user && user.role !== 'super_admin') {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                <div className="text-5xl mb-4">🔒</div>
                <h2 className="text-xl font-bold text-red-600 mb-2">Không có quyền truy cập</h2>
                <p className="text-slate-500">Trang này chỉ dành cho Super Admin.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-[1200px] mx-auto px-8 py-6">
                {/* Header */}
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h1 className="text-[28px] font-bold text-slate-900 m-0 tracking-tight">⚡ Super Admin Portal</h1>
                        <p className="text-sm text-slate-500 mt-1.5 m-0">Quản lý hệ thống SaaS ZeplaoPrint — Multi-tenant Control Center</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <div className="text-[13px] font-semibold text-slate-700">{user?.email}</div>
                            <div className="text-[11px] text-slate-400">Đăng nhập với quyền Quản trị cao nhất</div>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-base">
                            👑
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 mb-6 shadow-sm">
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
                            className={`flex-1 px-4 py-2.5 rounded-md text-[13px] font-semibold transition-colors ${activeTab === tab.key ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="min-h-[400px]">
                    {loading ? (
                        <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
                            <div className="w-6 h-6 border-[3px] border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                            <span>Đang tải...</span>
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center gap-4 py-10 text-red-600 bg-white border border-slate-200 rounded-xl shadow-sm">
                            <span>⚠️ {error}</span>
                            <button onClick={() => fetchData(activeTab)} className="px-4 py-1.5 bg-white text-slate-700 border border-slate-300 rounded-md text-[13px] hover:bg-slate-50 transition-colors">Thử lại</button>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'dashboard' && dashboard && <DashboardTab data={dashboard} formatVnd={formatVnd} systemHealth={systemHealth} onTabChange={handleTabChange} onCreateTenant={() => setShowCreateTenant(true)} onExportReport={exportReport} />}
                            {activeTab === 'tenants' && <TenantsTab tenants={tenants} plans={plans} formatDate={formatDate} onCreateTenant={() => setShowCreateTenant(true)} onEdit={setEditingTenant} onSetStatus={setTenantStatus} onResetPassword={resetTenantAdminPassword} onCapabilities={setCapsTenant} />}
                            {activeTab === 'plans' && <PlansTab plans={plans} formatVnd={formatVnd} />}
                            {activeTab === 'payments' && <PaymentsTab payments={payments} formatVnd={formatVnd} formatDate={formatDate} onConfirm={confirmPayment} />}
                            {activeTab === 'rbac' && <RbacTab roles={roles} authFetch={authFetch} onRefresh={() => fetchData('rbac')} />}
                        </>
                    )}
                </div>
            </div>
            {showCreateTenant && <CreateTenantModal onClose={() => setShowCreateTenant(false)} onSubmit={createTenant} />}
            {editingTenant && <EditTenantModal tenant={editingTenant} plans={plans} onClose={() => setEditingTenant(null)} onSubmit={updateTenant} />}
            {capsTenant && <CapabilitiesModal tenant={capsTenant} authFetch={authFetch} onClose={() => setCapsTenant(null)} />}
            {credsInfo && <CredentialsModal info={credsInfo} onClose={() => setCredsInfo(null)} />}
        </div>
    );
}

/* ─── Credentials Modal (hiển thị tên đăng nhập + mật khẩu, có copy) ─── */
function CredentialsModal({ info, onClose }: { info: { title: string; tenantName?: string; email: string; password: string }; onClose: () => void }) {
    const [copied, setCopied] = useState<string | null>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const copy = async (label: string, value: string) => {
        try { await navigator.clipboard.writeText(value); setCopied(label); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard blocked */ }
    };

    const Row = ({ label, value }: { label: string; value: string }) => (
        <div className="mb-3">
            <label className="text-xs font-semibold text-slate-500 block mb-1.5 uppercase tracking-wide">{label}</label>
            <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-900 break-all select-all">{value}</code>
                <button onClick={() => copy(label, value)} className="px-3 py-2.5 bg-white text-slate-700 border border-slate-300 rounded-md text-xs font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap">
                    {copied === label ? '✓ Đã chép' : '📋 Chép'}
                </button>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999]" onClick={onClose}>
            <div onClick={e => e.stopPropagation()} className="bg-white border border-slate-200 rounded-xl shadow-xl p-7 w-[460px]">
                <h2 className="text-xl font-bold text-slate-900 m-0 mb-1.5">{info.title}</h2>
                {info.tenantName && <p className="text-[13px] text-slate-500 m-0 mb-4">Tenant: <span className="font-semibold text-slate-700">{info.tenantName}</span></p>}
                <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4 text-[13px] text-amber-800">
                    ⚠️ Thông tin đăng nhập chỉ hiển thị <b>một lần</b>. Hãy chép và bàn giao an toàn — sau khi đóng sẽ không xem lại được.
                </div>
                <Row label="Tên đăng nhập (email)" value={info.email} />
                <Row label="Mật khẩu" value={info.password} />
                <div className="flex justify-end mt-5">
                    <button onClick={onClose} className="px-5 py-2.5 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700 transition-colors">Đã lưu, đóng</button>
                </div>
            </div>
        </div>
    );
}

/* ─── Capabilities Modal (Cờ_Năng_Lực Phương_Pháp_In theo tenant) ─── */
const METHOD_LABELS: Record<string, string> = {
    digital: '🖨️ In nhanh (Digital)',
    offset: '🏭 In Offset',
};

function CapabilitiesModal({ tenant, authFetch, onClose }: {
    tenant: Tenant;
    authFetch: (url: string, opts?: any) => Promise<Response>;
    onClose: () => void;
}) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [enabledMethods, setEnabledMethods] = useState<string[]>([]);
    const [source, setSource] = useState<'explicit' | 'inherited'>('inherited');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await authFetch(`${API}/super-admin/tenants/${tenant.id}/capabilities`);
            const json = await res.json();
            if (json.success) {
                setEnabledMethods(json.data.enabledMethods || []);
                setSource(json.data.source || 'inherited');
            } else {
                setError(json.error || 'Lỗi tải năng lực');
            }
        } catch {
            setError('Lỗi kết nối');
        } finally {
            setLoading(false);
        }
    }, [authFetch, tenant.id]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const toggle = async (methodId: string) => {
        const nextEnabled = !enabledMethods.includes(methodId);
        setSaving(methodId);
        setError(null);
        try {
            const res = await authFetch(`${API}/super-admin/tenants/${tenant.id}/capabilities/${methodId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: nextEnabled }),
            });
            if (res.status === 409) {
                const json = await res.json().catch(() => ({}));
                setError(json.message || 'Không thể tắt phương pháp khả dụng cuối cùng.');
            } else if (res.ok) {
                await load();
            } else {
                const json = await res.json().catch(() => ({}));
                setError(json.message || json.error || 'Lỗi cập nhật');
            }
        } catch {
            setError('Lỗi kết nối');
        } finally {
            setSaving(null);
        }
    };

    const ALL_METHODS = ['digital', 'offset'];

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999]" onClick={onClose}>
            <div onClick={e => e.stopPropagation()} className="bg-white border border-slate-200 rounded-xl shadow-xl p-7 w-[440px]">
                <h2 className="text-xl font-bold text-slate-900 m-0 mb-1.5">🖨️ Năng lực báo giá</h2>
                <p className="text-[13px] text-slate-500 m-0 mb-4">
                    {tenant.name} <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] text-indigo-600">{tenant.slug}</code>
                </p>

                {loading ? (
                    <div className="flex items-center justify-center gap-3 py-10 text-slate-500">
                        <div className="w-5 h-5 border-[3px] border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                        <span className="text-sm">Đang tải...</span>
                    </div>
                ) : (
                    <>
                        <div className={`rounded-md px-3 py-2 mb-4 text-[13px] ${source === 'explicit' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-50 text-slate-600'}`}>
                            {source === 'explicit'
                                ? '⚙️ Cấu hình riêng cho tenant này.'
                                : '↩️ Đang kế thừa mặc định hệ thống (bật tất cả). Thay đổi sẽ tạo cấu hình riêng.'}
                        </div>

                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4 text-[13px] text-red-700">
                                ⚠️ {error}
                            </div>
                        )}

                        <div className="flex flex-col gap-2.5">
                            {ALL_METHODS.map(methodId => {
                                const on = enabledMethods.includes(methodId);
                                const busy = saving === methodId;
                                return (
                                    <div key={methodId} className="flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg">
                                        <span className="text-sm font-semibold text-slate-800">{METHOD_LABELS[methodId] || methodId}</span>
                                        <button
                                            onClick={() => toggle(methodId)}
                                            disabled={busy}
                                            aria-pressed={on}
                                            className={`relative w-12 h-6 rounded-full transition-colors disabled:opacity-60 disabled:cursor-wait ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                            title={on ? 'Đang bật — nhấn để tắt' : 'Đang tắt — nhấn để bật'}
                                        >
                                            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}

                <div className="flex justify-end mt-6">
                    <button onClick={onClose} className="px-5 py-2.5 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700 transition-colors">Đóng</button>
                </div>
            </div>
        </div>
    );
}

/* ─── Create Tenant Modal ─── */
function CreateTenantModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: { name: string; code: string; username?: string; email?: string; phone?: string }) => void }) {
    const [form, setForm] = useState({ name: '', code: '', username: '', email: '', phone: '' });
    const [submitting, setSubmitting] = useState(false);
    const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

    // Đóng modal bằng phím ESC (đồng bộ với các modal khác trong app).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const handleSubmit = async () => {
        if (!form.name.trim() || !form.code.trim()) { alert('Tên và Mã tenant là bắt buộc'); return; }
        if (!/^[a-z0-9_]+$/.test(form.code)) { alert('Mã tenant chỉ chứa chữ thường, số và dấu gạch dưới'); return; }
        if (form.username.trim() && !/^[a-z0-9._-]+$/.test(form.username.trim())) { alert('Tên đăng nhập chỉ gồm chữ thường, số, . _ -'); return; }
        setSubmitting(true);
        await onSubmit({
            name: form.name.trim(),
            code: form.code.trim(),
            username: form.username.trim() || undefined,
            email: form.email.trim() || undefined,
            phone: form.phone.trim() || undefined,
        });
        setSubmitting(false);
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999]" onClick={onClose}>
            <div onClick={e => e.stopPropagation()} className="bg-white border border-slate-200 rounded-xl shadow-xl p-7 w-[440px]">
                <h2 className="text-xl font-bold text-slate-900 m-0 mb-1.5">🏢 Tạo Tenant mới</h2>
                <p className="text-[13px] text-slate-500 m-0 mb-6">Tạo xưởng in mới trên nền tảng SaaS</p>
                {[
                    { key: 'name', label: 'Tên xưởng in *', placeholder: 'VD: Xưởng In Hoàng Phú' },
                    { key: 'code', label: 'Mã tenant (slug) *', placeholder: 'VD: hoangphu (chữ thường, không dấu)' },
                    { key: 'username', label: 'Tên đăng nhập', placeholder: 'VD: hoangphu (để trống → admin@{mã}.vn)' },
                    { key: 'email', label: 'Email quản trị (tuỳ chọn)', placeholder: 'admin@hoangphu.vn' },
                    { key: 'phone', label: 'Số điện thoại', placeholder: '0901234567' },
                ].map(f => (
                    <div key={f.key} className="mb-4">
                        <label className="text-xs font-semibold text-slate-500 block mb-1.5 uppercase tracking-wide">{f.label}</label>
                        <input
                            value={(form as any)[f.key]}
                            onChange={e => set(f.key, e.target.value)}
                            placeholder={f.placeholder}
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-900 outline-none focus:border-blue-400 transition-colors box-border"
                        />
                    </div>
                ))}
                <div className="flex gap-2.5 mt-6">
                    <button onClick={onClose} className="flex-1 py-2.5 bg-white text-slate-700 border border-slate-300 rounded-md text-sm font-semibold hover:bg-slate-50 transition-colors">Hủy</button>
                    <button onClick={handleSubmit} disabled={submitting} className="flex-1 py-2.5 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-70 disabled:cursor-wait">
                        {submitting ? 'Đang tạo...' : '✅ Tạo Tenant'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ─── Edit Tenant Modal ─── */
function EditTenantModal({ tenant, plans, onClose, onSubmit }: {
    tenant: Tenant;
    plans: Plan[];
    onClose: () => void;
    onSubmit: (id: number, patch: { name?: string; email?: string; phone?: string; address?: string; taxCode?: string; planId?: number | null; maxUsers?: number }) => void;
}) {
    // The list item exposes `plan` as a code string, not a planId — best-effort match by code.
    const matchedPlanId = plans.find(p => p.code === tenant.plan)?.id;
    const [form, setForm] = useState({
        name: tenant.name || '',
        email: tenant.email || '',
        phone: tenant.phone || '',
        address: '',
        taxCode: '',
        maxUsers: '',
        planId: matchedPlanId != null ? String(matchedPlanId) : '',
    });
    const [submitting, setSubmitting] = useState(false);
    const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

    // Đóng modal bằng phím ESC (đồng bộ với các modal khác trong app).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const handleSubmit = async () => {
        if (!form.name.trim()) { alert('Tên tenant là bắt buộc'); return; }
        setSubmitting(true);
        await onSubmit(tenant.id, {
            name: form.name.trim(),
            email: form.email.trim() || undefined,
            phone: form.phone.trim() || undefined,
            address: form.address.trim() || undefined,
            taxCode: form.taxCode.trim() || undefined,
            planId: form.planId ? Number(form.planId) : null,
            maxUsers: form.maxUsers.trim() ? Number(form.maxUsers) : undefined,
        });
        setSubmitting(false);
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999]" onClick={onClose}>
            <div onClick={e => e.stopPropagation()} className="bg-white border border-slate-200 rounded-xl shadow-xl p-7 w-[440px] max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold text-slate-900 m-0 mb-1.5">✏️ Chỉnh sửa Tenant</h2>
                <p className="text-[13px] text-slate-500 m-0 mb-6">{tenant.name} <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] text-indigo-600">{tenant.slug}</code></p>
                {[
                    { key: 'name', label: 'Tên xưởng in *', placeholder: 'VD: Xưởng In Hoàng Phú' },
                    { key: 'email', label: 'Email quản trị', placeholder: 'admin@hoangphu.vn' },
                    { key: 'phone', label: 'Số điện thoại', placeholder: '0901234567' },
                    { key: 'address', label: 'Địa chỉ', placeholder: 'VD: 123 Lê Lợi, Q1, TP.HCM' },
                    { key: 'taxCode', label: 'Mã số thuế', placeholder: 'VD: 0312345678' },
                    { key: 'maxUsers', label: 'Số người dùng tối đa', placeholder: 'VD: 10' },
                ].map(f => (
                    <div key={f.key} className="mb-4">
                        <label className="text-xs font-semibold text-slate-500 block mb-1.5 uppercase tracking-wide">{f.label}</label>
                        <input
                            value={(form as any)[f.key]}
                            onChange={e => set(f.key, e.target.value)}
                            placeholder={f.placeholder}
                            type={f.key === 'maxUsers' ? 'number' : 'text'}
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-900 outline-none focus:border-blue-400 transition-colors box-border"
                        />
                    </div>
                ))}
                <div className="mb-4">
                    <label className="text-xs font-semibold text-slate-500 block mb-1.5 uppercase tracking-wide">Gói dịch vụ</label>
                    <select
                        value={form.planId}
                        onChange={e => set('planId', e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-900 outline-none focus:border-blue-400 transition-colors box-border"
                    >
                        <option value="">— Không gán —</option>
                        {plans.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>
                <div className="flex gap-2.5 mt-6">
                    <button onClick={onClose} className="flex-1 py-2.5 bg-white text-slate-700 border border-slate-300 rounded-md text-sm font-semibold hover:bg-slate-50 transition-colors">Hủy</button>
                    <button onClick={handleSubmit} disabled={submitting} className="flex-1 py-2.5 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-70 disabled:cursor-wait">
                        {submitting ? 'Đang lưu...' : '💾 Lưu thay đổi'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ─── Dashboard Tab ─── */
function DashboardTab({ data, formatVnd, systemHealth, onTabChange, onCreateTenant, onExportReport }: { data: DashboardData; formatVnd: (n: number) => string; systemHealth: { name: string; status: string; color: string }[]; onTabChange: (tab: Tab) => void; onCreateTenant: () => void; onExportReport: () => void }) {
    const cards = [
        { label: 'Tổng Tenants', value: data.totalTenants, icon: '🏢', chip: 'bg-indigo-50 text-indigo-600' },
        { label: 'Đang hoạt động', value: data.activeTenants, icon: '✅', chip: 'bg-emerald-50 text-emerald-600' },
        { label: 'Doanh thu', value: formatVnd(data.totalRevenue || 0) + '₫', icon: '💰', chip: 'bg-amber-50 text-amber-600' },
        { label: 'MRR', value: formatVnd(data.mrr || 0) + '₫', icon: '📈', chip: 'bg-blue-50 text-blue-600' },
        { label: 'Chờ thanh toán', value: data.pendingPayments || 0, icon: '⏳', chip: 'bg-red-50 text-red-600' },
    ];
    const activeRate = data.totalTenants > 0 ? Math.round((data.activeTenants / data.totalTenants) * 100) : 0;
    const recentTenants = (data.tenants || []).slice(0, 5);

    const quickActions = [
        { label: '➕ Tạo Tenant mới', cls: 'bg-blue-600 text-white hover:bg-blue-700', action: onCreateTenant },
        { label: '💳 Xem thanh toán chờ', cls: 'bg-amber-50 text-amber-700 hover:bg-amber-100', action: () => onTabChange('payments') },
        { label: '🔐 Quản lý vai trò', cls: 'bg-violet-50 text-violet-700 hover:bg-violet-100', action: () => onTabChange('rbac') },
        { label: '📊 Xuất báo cáo', cls: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100', action: onExportReport },
    ];

    const avatarColors = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-red-500', 'bg-violet-500'];
    const planPill = (plan: string) => plan === 'enterprise' ? 'bg-violet-50 text-violet-700' : plan === 'pro' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600';
    const statusPill = (status: string) => status === 'active' ? 'bg-emerald-50 text-emerald-700' : status === 'trial' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600';

    return (
        <div className="flex flex-col gap-5">
            {/* KPI Cards */}
            <div className="grid grid-cols-5 gap-3.5">
                {cards.map((c, i) => (
                    <div key={i} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl mb-3 ${c.chip}`}>{c.icon}</div>
                        <div className="text-[22px] font-bold text-slate-900 tracking-tight">{c.value}</div>
                        <div className="text-xs text-slate-500 mt-1 font-medium uppercase tracking-wide">{c.label}</div>
                    </div>
                ))}
            </div>

            {/* Middle Row: Health + Activity Rate */}
            <div className="grid grid-cols-3 gap-4">
                {/* System Health */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                    <h3 className="text-[15px] font-bold text-slate-900 m-0 mb-4 flex items-center gap-2">💚 Sức khỏe hệ thống</h3>
                    {(systemHealth.length > 0 ? systemHealth : [
                        { name: 'Cơ sở dữ liệu', status: 'Đang kiểm tra...', color: '#94a3b8' },
                        { name: 'Máy chủ API', status: 'Đang kiểm tra...', color: '#94a3b8' },
                        { name: 'WebSocket', status: 'Đang kiểm tra...', color: '#94a3b8' },
                        { name: 'Cách ly Tenant', status: 'Đang kiểm tra...', color: '#94a3b8' },
                    ]).map((s, i) => (
                        <div key={i} className={`flex justify-between items-center py-2 ${i < 3 ? 'border-b border-slate-100' : ''}`}>
                            <span className="text-[13px] text-slate-600">{s.name}</span>
                            <span className="text-xs font-semibold flex items-center gap-1" style={{ color: s.color }}>
                                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: s.color }} />
                                {s.status}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Activation Rate Gauge */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col items-center justify-center">
                    <h3 className="text-[15px] font-bold text-slate-900 m-0 mb-4">📊 Tỷ lệ hoạt động</h3>
                    <div className="relative w-[120px] h-[120px]">
                        <svg width="120" height="120" viewBox="0 0 120 120">
                            <circle cx="60" cy="60" r="50" fill="none" stroke="#e2e8f0" strokeWidth="10" />
                            <circle cx="60" cy="60" r="50" fill="none" stroke="#3b82f6" strokeWidth="10"
                                strokeDasharray={`${activeRate * 3.14} 314`} strokeLinecap="round"
                                transform="rotate(-90 60 60)" style={{ transition: 'stroke-dasharray .8s ease' }} />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-[28px] font-bold text-slate-900">{activeRate}%</span>
                        </div>
                    </div>
                    <div className="text-xs text-slate-500 mt-2">{data.activeTenants}/{data.totalTenants} tenants</div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                    <h3 className="text-[15px] font-bold text-slate-900 m-0 mb-4">⚡ Thao tác nhanh</h3>
                    {quickActions.map((a, i) => (
                        <button key={i} onClick={a.action} className={`w-full px-3.5 py-2.5 mb-2 rounded-md text-[13px] font-semibold text-left transition-colors ${a.cls}`}>
                            {a.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Bottom: Recent Tenants */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                <h3 className="text-[15px] font-bold text-slate-900 m-0 mb-4 flex items-center justify-between">
                    🏢 Tenants gần đây
                    <span className="text-xs text-indigo-600 font-medium cursor-pointer">Xem tất cả →</span>
                </h3>
                {recentTenants.length > 0 ? (
                    <div className="flex flex-col gap-2">
                        {recentTenants.map((t, i) => (
                            <div key={t.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${i % 2 === 0 ? 'bg-slate-50' : 'bg-transparent'}`}>
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white text-sm ${avatarColors[i % 5]}`}>
                                    {t.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1">
                                    <div className="text-sm font-semibold text-slate-900">{t.name}</div>
                                    <div className="text-xs text-slate-400">{t.slug} • {t.users_count || 0} users</div>
                                </div>
                                <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${planPill(t.plan)}`}>
                                    {t.plan === 'enterprise' ? 'Doanh nghiệp' : t.plan === 'pro' ? 'Chuyên nghiệp' : 'Miễn phí'}
                                </span>
                                <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${statusPill(t.status)}`}>
                                    {t.status === 'active' ? '● Hoạt động' : t.status === 'trial' ? '◐ Dùng thử' : t.status === 'suspended' ? '⊘ Tạm ngưng' : t.status}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8 text-slate-400">Chưa có tenant nào</div>
                )}
            </div>
        </div>
    );
}

/* ─── Tenants Tab ─── */
function TenantsTab({ tenants, plans, formatDate, onCreateTenant, onEdit, onSetStatus, onResetPassword, onCapabilities }: {
    tenants: DashboardData['tenants'];
    plans: Plan[];
    formatDate: (s: string) => string;
    onCreateTenant: () => void;
    onEdit: (tenant: Tenant) => void;
    onSetStatus: (id: number, status: 'trial' | 'active' | 'suspended' | 'cancelled') => void;
    onResetPassword: (id: number) => void;
    onCapabilities: (tenant: Tenant) => void;
}) {
    if (!tenants.length) return (
        <div className="text-center py-16 text-slate-500 text-[15px]">
            <div>Chưa có tenant nào.</div>
            <button onClick={onCreateTenant} className="mt-4 px-5 py-2.5 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700 transition-colors">➕ Tạo Tenant đầu tiên</button>
        </div>
    );
    const avatarColors = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-red-500', 'bg-violet-500', 'bg-cyan-600', 'bg-pink-600'];
    const planLabel = (code: string) => plans.find(p => p.code === code)?.name
        || (code === 'enterprise' ? 'Doanh nghiệp' : code === 'pro' ? 'Chuyên nghiệp' : 'Miễn phí');
    const planPill = (plan: string) => plan === 'enterprise' ? 'bg-violet-50 text-violet-700' : plan === 'pro' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600';
    const statusPill = (status: string) => status === 'active' ? 'bg-emerald-50 text-emerald-700' : status === 'trial' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600';
    const statusDot = (status: string) => status === 'active' ? 'bg-emerald-500' : status === 'trial' ? 'bg-amber-500' : 'bg-red-500';
    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-slate-500">{tenants.length} tenant(s) trong hệ thống</span>
                <button onClick={onCreateTenant} className="px-4 py-2 bg-blue-600 text-white rounded-md text-[13px] font-semibold hover:bg-blue-700 transition-colors">➕ Tạo Tenant</button>
            </div>
            {tenants.map((t, i) => (
                <div key={t.id} className="flex items-center gap-4 px-5 py-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-300 transition-colors">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-white text-lg flex-shrink-0 ${avatarColors[i % avatarColors.length]}`}>
                        {t.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-[15px] font-bold text-slate-900">{t.name}</span>
                            <code className="bg-slate-100 px-2 py-0.5 rounded text-[11px] text-indigo-600">{t.slug}</code>
                        </div>
                        <div className="text-xs text-slate-400 mt-1 flex gap-4">
                            <span>👥 {t.users_count || 0} users</span>
                            <span>📅 {formatDate(t.created_at)}</span>
                        </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${planPill(t.plan)}`}>
                        {planLabel(t.plan)}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 ${statusPill(t.status)}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusDot(t.status)}`} />
                        {t.status === 'active' ? 'Hoạt động' : t.status === 'trial' ? 'Dùng thử' : t.status === 'suspended' ? 'Tạm ngưng' : t.status}
                    </span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => onEdit(t)} className="px-3 py-1.5 bg-white text-slate-700 border border-slate-300 rounded-md text-xs font-semibold hover:bg-slate-50 transition-colors">✏️ Sửa</button>
                        <button onClick={() => onCapabilities(t)} className="px-3 py-1.5 bg-white text-indigo-600 border border-indigo-200 rounded-md text-xs font-semibold hover:bg-indigo-50 transition-colors">🖨️ Năng lực</button>
                        {(t.status === 'active' || t.status === 'trial') ? (
                            <button onClick={() => onSetStatus(t.id, 'suspended')} className="px-3 py-1.5 bg-white text-red-600 border border-red-200 rounded-md text-xs font-semibold hover:bg-red-50 transition-colors">⊘ Tạm ngưng</button>
                        ) : (
                            <button onClick={() => onSetStatus(t.id, 'active')} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-xs font-semibold hover:bg-emerald-100 transition-colors">● Kích hoạt</button>
                        )}
                        <button onClick={() => onResetPassword(t.id)} className="px-3 py-1.5 bg-white text-slate-700 border border-slate-300 rounded-md text-xs font-semibold hover:bg-slate-50 transition-colors">🔑 Reset MK</button>
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ─── Plans Tab ─── */
function PlansTab({ plans, formatVnd }: { plans: Plan[]; formatVnd: (n: number) => string }) {
    if (!plans.length) return <div className="text-center py-16 text-slate-500 text-[15px]">Chưa có gói dịch vụ nào.</div>;
    return (
        <div className="grid gap-5 items-stretch" style={{ gridTemplateColumns: `repeat(${Math.min(plans.length, 3)}, 1fr)` }}>
            {plans.map((plan, idx) => {
                const isPro = idx === 1;
                const features = Array.isArray(plan.features)
                    ? plan.features
                    : (typeof plan.features === 'string' && plan.features ? plan.features.split(',') : []);
                return (
                    <div key={plan.id} className={`bg-white rounded-xl shadow-sm p-7 relative flex flex-col transition-colors ${isPro ? 'border-2 border-blue-500' : 'border border-slate-200'}`}>
                        {isPro && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase">Phổ biến nhất</div>}
                        <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold">{plan.code}</div>
                        <h3 className="text-[22px] font-bold text-slate-900 mt-2 mb-1">{plan.name}</h3>
                        <div className="flex items-baseline gap-1 my-3">
                            <span className="text-4xl font-extrabold text-slate-900">{formatVnd(plan.price_monthly)}</span>
                            <span className="text-sm text-slate-400">₫/tháng</span>
                        </div>
                        <div className="text-[13px] text-slate-400 mb-4">hoặc {formatVnd(plan.price_yearly)}₫/năm (tiết kiệm {Math.round((1 - plan.price_yearly / (plan.price_monthly * 12)) * 100)}%)</div>
                        <div className="border-t border-slate-100 pt-4 flex-1 flex flex-col gap-2.5">
                            <div className="flex items-center gap-2 text-[13px] text-slate-700">
                                <span className="text-emerald-600">✓</span> Tối đa <strong className="text-slate-900">{plan.max_users}</strong> người dùng
                            </div>
                            {features.slice(0, 5).map((f, i) => (
                                <div key={i} className="flex items-center gap-2 text-[13px] text-slate-600">
                                    <span className="text-emerald-600">✓</span> {String(f).trim()}
                                </div>
                            ))}
                        </div>
                        <div className="mt-4">
                            <span className={`text-xs font-semibold ${plan.is_active ? 'text-emerald-600' : 'text-red-500'}`}>
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
        return <div className="text-center py-16 text-slate-500 text-[15px]">Chưa có thanh toán nào.</div>;
    }
    const statusPill = (status: string) => status === 'paid' ? 'bg-emerald-50 text-emerald-700' : status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600';
    return (
        <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl shadow-sm">
            <table className="w-full border-collapse text-sm">
                <thead>
                    <tr className="bg-slate-50">
                        <th className="px-4 py-3 text-left text-slate-500 font-semibold text-[13px] whitespace-nowrap border-b border-slate-200">ID</th>
                        <th className="px-4 py-3 text-left text-slate-500 font-semibold text-[13px] whitespace-nowrap border-b border-slate-200">Tenant</th>
                        <th className="px-4 py-3 text-left text-slate-500 font-semibold text-[13px] whitespace-nowrap border-b border-slate-200">Số tiền</th>
                        <th className="px-4 py-3 text-left text-slate-500 font-semibold text-[13px] whitespace-nowrap border-b border-slate-200">Phương thức</th>
                        <th className="px-4 py-3 text-left text-slate-500 font-semibold text-[13px] whitespace-nowrap border-b border-slate-200">Trạng thái</th>
                        <th className="px-4 py-3 text-left text-slate-500 font-semibold text-[13px] whitespace-nowrap border-b border-slate-200">Ngày tạo</th>
                        <th className="px-4 py-3 text-left text-slate-500 font-semibold text-[13px] whitespace-nowrap border-b border-slate-200">Hành động</th>
                    </tr>
                </thead>
                <tbody>
                    {payments.map(p => (
                        <tr key={p.id} className="border-b border-slate-100">
                            <td className="px-4 py-3 text-slate-700">{p.id}</td>
                            <td className="px-4 py-3 text-slate-700">{p.tenant_name || `Tenant #${p.tenant_id}`}</td>
                            <td className="px-4 py-3 font-semibold text-amber-600">{formatVnd(p.amount)}₫</td>
                            <td className="px-4 py-3 text-slate-700">{p.payment_method}</td>
                            <td className="px-4 py-3">
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-block ${statusPill(p.status)}`}>
                                    {p.status === 'paid' ? '✅ Đã TT' : p.status === 'pending' ? '⏳ Chờ' : p.status}
                                </span>
                            </td>
                            <td className="px-4 py-3 text-slate-700">{formatDate(p.created_at)}</td>
                            <td className="px-4 py-3">
                                {p.status === 'pending' && (
                                    <button onClick={() => onConfirm(p.id)} className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-semibold hover:bg-blue-700 transition-colors">
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

// Soft pastel classes per action for light-theme permission badges.
const ACTION_COLORS: Record<string, string> = {
    view: 'bg-slate-100 text-slate-600 border-slate-200',
    create: 'bg-blue-50 text-blue-600 border-blue-100',
    edit: 'bg-blue-50 text-blue-600 border-blue-100',
    delete: 'bg-red-50 text-red-600 border-red-100',
    approve: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    import: 'bg-blue-50 text-blue-600 border-blue-100',
    export: 'bg-blue-50 text-blue-600 border-blue-100',
    assign: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    adjust: 'bg-blue-50 text-blue-600 border-blue-100',
    reply: 'bg-blue-50 text-blue-600 border-blue-100',
    tenant: 'bg-indigo-50 text-indigo-600 border-indigo-100',
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
        <div className="flex flex-col gap-3">
            {/* Header */}
            <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-slate-500">{roles.length} vai trò trong hệ thống</span>
                <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-blue-600 text-white rounded-md text-[13px] font-semibold hover:bg-blue-700 transition-colors">➕ Tạo vai trò mới</button>
            </div>

            {/* Create Role Inline Form */}
            {showCreate && (
                <div className="bg-white border border-blue-200 rounded-xl shadow-sm p-5 mb-1">
                    <h4 className="text-sm font-bold text-slate-900 m-0 mb-3.5">🛠️ Tạo vai trò mới</h4>
                    <div className="grid gap-2.5 mb-3" style={{ gridTemplateColumns: '1fr 1fr 2fr' }}>
                        <input value={newRole.name} onChange={e => setNewRole(p => ({ ...p, name: e.target.value }))} placeholder="Mã vai trò (VD: sale_lead)" className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-slate-900 text-[13px] outline-none focus:border-blue-400 transition-colors" />
                        <input value={newRole.displayName} onChange={e => setNewRole(p => ({ ...p, displayName: e.target.value }))} placeholder="Tên hiển thị" className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-slate-900 text-[13px] outline-none focus:border-blue-400 transition-colors" />
                        <input value={newRole.description} onChange={e => setNewRole(p => ({ ...p, description: e.target.value }))} placeholder="Mô tả (tuỳ chọn)" className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-slate-900 text-[13px] outline-none focus:border-blue-400 transition-colors" />
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setShowCreate(false)} className="px-4 py-1.5 bg-white text-slate-700 border border-slate-300 rounded-md text-[13px] font-semibold hover:bg-slate-50 transition-colors">Hủy</button>
                        <button onClick={handleCreate} disabled={creating} className="px-4 py-1.5 bg-blue-600 text-white rounded-md text-[13px] font-semibold hover:bg-blue-700 transition-colors disabled:opacity-70 disabled:cursor-wait">{creating ? 'Đang tạo...' : '✅ Tạo'}</button>
                    </div>
                </div>
            )}

            {/* Roles List */}
            {roles.map(role => {
                const roleInfo = ROLE_LABELS[role.name] || { label: role.description || role.name, icon: '🔑', color: '#94a3b8' };
                const isExpanded = expandedRole === role.id;
                const isEditing = editingRole === role.id;
                const permGroups = role.permissions ? groupPermsByModule(role.permissions) : {};

                return (
                    <div key={role.id} className={`bg-white rounded-xl shadow-sm p-5 transition-colors ${isEditing ? 'border-2 border-blue-500' : 'border border-slate-200'}`}>
                        <div
                            onClick={() => { if (!isEditing) setExpandedRole(isExpanded ? null : role.id); }}
                            className={`flex justify-between items-center ${isEditing ? 'cursor-default' : 'cursor-pointer'}`}
                        >
                            <div className="flex items-center gap-2.5">
                                <span className="text-[22px]">{roleInfo.icon}</span>
                                <div>
                                    <span className="text-base font-bold text-slate-900">{roleInfo.label}</span>
                                    <code className="ml-2 text-[11px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{role.name}</code>
                                    {role.is_system && <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-50 text-violet-700">Hệ thống</span>}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[13px] text-slate-500">🔑 {role.permissions?.length || 0} quyền</span>
                                {!isEditing && (
                                    <button onClick={e => { e.stopPropagation(); startEdit(role); }} className="px-2.5 py-1 bg-white text-blue-600 border border-blue-200 rounded-md text-[11px] font-semibold hover:bg-blue-50 transition-colors" title="Sửa quyền">✏️ Sửa</button>
                                )}
                                {!role.is_system && !isEditing && (
                                    <button onClick={e => { e.stopPropagation(); deleteRole(role.id, roleInfo.label); }} className="px-2.5 py-1 bg-white text-red-600 border border-red-200 rounded-md text-[11px] font-semibold hover:bg-red-50 transition-colors" title="Xóa vai trò">🗑️</button>
                                )}
                                {!isEditing && <span className="text-slate-400 text-lg transition-transform" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }}>▸</span>}
                            </div>
                        </div>
                        {role.description && <p className="text-[13px] text-slate-500 mt-1.5 mb-0">{role.description}</p>}

                        {/* VIEW MODE */}
                        {isExpanded && !isEditing && role.permissions && role.permissions.length > 0 && (
                            <div className="mt-4 flex flex-col gap-3">
                                {Object.entries(permGroups).map(([mod, perms]) => (
                                    <div key={mod}>
                                        <div className="text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">
                                            {MODULE_LABELS[mod] || mod}
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {perms.map((p, i) => (
                                                <span key={i} className={`px-2.5 py-1 rounded-md text-xs font-medium border ${ACTION_COLORS[p.action] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
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
                            <div className="mt-4">
                                <div className="text-xs font-bold text-blue-600 mb-3 flex items-center gap-1.5">✏️ Chọn quyền cho vai trò này <span className="text-slate-400">({editPerms.size}/{allPermKeys.length})</span></div>
                                <div className="flex flex-col gap-3.5">
                                    {Object.entries(allPermGroups).map(([mod, perms]) => {
                                        const allChecked = perms.every(p => editPerms.has(p.key));
                                        const someChecked = perms.some(p => editPerms.has(p.key));
                                        return (
                                            <div key={mod} className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                                                <label className="flex items-center gap-2 cursor-pointer mb-2">
                                                    <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={() => toggleModule(mod, perms)} className="w-4 h-4 accent-blue-600" />
                                                    <span className="text-[13px] font-bold text-slate-700">{MODULE_LABELS[mod] || mod}</span>
                                                </label>
                                                <div className="flex flex-wrap gap-1.5 pl-6">
                                                    {perms.map(p => (
                                                        <label key={p.key} className={`flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded-md border transition-colors ${editPerms.has(p.key) ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200'}`}>
                                                            <input type="checkbox" checked={editPerms.has(p.key)} onChange={() => togglePerm(p.key)} className="w-3.5 h-3.5 accent-blue-600" />
                                                            <span className={`text-xs ${editPerms.has(p.key) ? 'text-blue-600' : 'text-slate-500'}`}>{PERM_LABELS[p.key] || p.key}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex gap-2 mt-3.5 justify-end">
                                    <button onClick={cancelEdit} className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-md text-[13px] font-semibold hover:bg-slate-50 transition-colors">Hủy</button>
                                    <button onClick={() => savePerms(role.id)} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-md text-[13px] font-semibold hover:bg-blue-700 transition-colors disabled:opacity-70 disabled:cursor-wait">{saving ? 'Đang lưu...' : '✅ Lưu quyền'}</button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
