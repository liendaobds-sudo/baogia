'use client';

import { useAuth } from '@/lib/auth-context';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from '@/lib/socket-context';

import { API_URL as API } from '@/lib/api';

interface ChannelItem {
    id: string;
    type: string;
    name: string;
    externalId: string;
    isActive: boolean;
    webhookSecret: string;
    createdAt: string;
}

interface AuditEntry {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    user: { id: string; fullName: string } | null;
    oldValue: any;
    newValue: any;
    createdAt: string;
}

const CHANNEL_TYPES = [
    { value: 'zalo_oa', label: 'Zalo OA', icon: '💬', color: '#2563eb', bg: '#dbeafe' },
    { value: 'facebook_page', label: 'Facebook Page', icon: '📘', color: '#1877f2', bg: '#dbeafe' },
];

const TAB_CONFIG = [
    { key: 'channels' as const, label: 'Kênh kết nối', iconPath: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01' },
    { key: 'zalo_personal' as const, label: 'Zalo Cá Nhân', iconPath: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z' },
    { key: 'staff' as const, label: 'Nhân sự', iconPath: 'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z' },
    { key: 'audit' as const, label: 'Nhật ký', iconPath: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5h6M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2' },
    { key: 'system' as const, label: 'Hệ thống', iconPath: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
];

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    admin: { label: 'Admin', color: '#7c3aed', bg: '#ede9fe' },
    supervisor: { label: 'Supervisor', color: '#2563eb', bg: '#dbeafe' },
    agent: { label: 'Nhân viên', color: '#059669', bg: '#d1fae5' },
};

interface StaffMember {
    id: string; email: string; fullName: string;
    role: string; isActive: boolean; lastLoginAt: string | null; createdAt: string;
}

export default function SettingsPage() {
    const { token, user } = useAuth();
    const { socket } = useSocket();
    const [mounted, setMounted] = useState(false);
    const [activeTab, setActiveTab] = useState<'channels' | 'zalo_personal' | 'staff' | 'audit' | 'system'>(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const tab = params.get('tab');
            if (tab && ['channels', 'zalo_personal', 'staff', 'audit', 'system'].includes(tab)) {
                return tab as any;
            }
        }
        return 'channels';
    });
    // New state for Zalo custom deletion confirm
    const [confirmZaloDeleteId, setConfirmZaloDeleteId] = useState<string | null>(null);

    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [staffSearch, setStaffSearch] = useState('');
    const [showStaffForm, setShowStaffForm] = useState(false);
    const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
    const [staffForm, setStaffForm] = useState({ email: '', password: '', fullName: '', role: 'agent' });
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [channels, setChannels] = useState<ChannelItem[]>([]);
    const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({ type: 'zalo_oa', name: '', externalId: '', webhookSecret: '' });

    // Zalo Personal State
    const [zaloAccounts, setZaloAccounts] = useState<any[]>([]);
    const [showZaloForm, setShowZaloForm] = useState(false);
    const [zaloDisplayName, setZaloDisplayName] = useState('');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [pendingQrAccountId, setPendingQrAccountId] = useState<string | null>(null);
    const [qrError, setQrError] = useState<string | null>(null);

    const [zaloMediaPath, setZaloMediaPath] = useState('');
    const [zaloMediaPathSaving, setZaloMediaPathSaving] = useState(false);

    const headers = useCallback(() => ({
        'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json',
    }), [token]);

    const fetchChannels = useCallback(async () => {
        try {
            const res = await fetch(`${API}/channels`, { headers: headers() });
            if (res.ok) {
                const data = await res.json();
                setChannels(Array.isArray(data) ? data : []);
            }
        } catch (err) { console.error(err); }
    }, [headers]);

    const fetchZaloPersonalAccounts = useCallback(async () => {
        try {
            const res = await fetch(`${API}/zalo-personal/accounts`, { headers: headers() });
            if (res.ok) {
                const data = await res.json();
                setZaloAccounts(Array.isArray(data) ? data : []);
            }
        } catch (err) { console.error(err); }
    }, [headers]);

    const fetchAudit = useCallback(async () => {
        try {
            const res = await fetch(`${API}/audit?limit=50`, { headers: headers() });
            if (res.ok) {
                const data = await res.json();
                setAuditLogs(data.data || []);
            }
        } catch (err) { console.error(err); }
    }, [headers]);

    const fetchMediaSettings = useCallback(async () => {
        try {
            const res = await fetch(`${API}/media/settings`, { headers: headers() });
            if (res.ok) {
                const data = await res.json();
                setZaloMediaPath(data.zalo_media_storage_path || '');
            }
        } catch { /* ignore */ }
    }, [headers]);

    const saveMediaSettings = async () => {
        try {
            setZaloMediaPathSaving(true);
            await fetch(`${API}/media/settings`, {
                method: 'POST', headers: headers(),
                body: JSON.stringify({ zalo_media_storage_path: zaloMediaPath })
            });
            alert('Cập nhật cấu hình lưu trữ thành công!');
        } catch {
            alert('Lỗi cập nhật cấu hình');
        } finally {
            setZaloMediaPathSaving(false);
        }
    };

    useEffect(() => { setMounted(true); }, []);

    // Ẩn tab theo quyền (backend đã chặn, nhưng tránh hiển thị tab 403 cho non-admin).
    // Chỉ admin/super_admin thấy mọi tab; supervisor chỉ thấy "Nhân sự"; còn lại: không tab nào.
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const allowedTabKeys = TAB_CONFIG
        .filter(t => isAdmin || (user?.role === 'supervisor' && t.key === 'staff'))
        .map(t => t.key);
    useEffect(() => {
        if (allowedTabKeys.length === 0) {
            if (activeTab) setActiveTab('' as any); // không quyền → không render nội dung tab nào
        } else if (!allowedTabKeys.includes(activeTab)) {
            setActiveTab(allowedTabKeys[0] as any);
        }
    }, [user, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchStaff = useCallback(async () => {
        try {
            const res = await fetch(`${API}/users`, { headers: headers() });
            if (res.ok) { const json = await res.json(); setStaff(json.data || []); }
        } catch { /* ignore */ }
    }, [headers]);

    const saveStaff = async () => {
        try {
            if (editingStaff) {
                await fetch(`${API}/users/${editingStaff.id}`, {
                    method: 'PUT', headers: headers(),
                    body: JSON.stringify({ fullName: staffForm.fullName, role: staffForm.role }),
                });
            } else {
                await fetch(`${API}/users`, {
                    method: 'POST', headers: headers(),
                    body: JSON.stringify(staffForm),
                });
            }
            setShowStaffForm(false); setEditingStaff(null);
            setStaffForm({ email: '', password: '', fullName: '', role: 'agent' });
            fetchStaff();
        } catch { /* ignore */ }
    };

    const toggleStaffActive = async (user: StaffMember) => {
        try {
            await fetch(`${API}/users/${user.id}`, {
                method: 'PUT', headers: headers(),
                body: JSON.stringify({ isActive: !user.isActive }),
            });
            fetchStaff();
        } catch { /* ignore */ }
    };

    const deleteStaff = async (userId: string) => {
        try {
            await fetch(`${API}/users/${userId}`, {
                method: 'DELETE', headers: headers(),
            });
            setConfirmDeleteId(null);
            fetchStaff();
        } catch { /* ignore */ }
    };

    useEffect(() => {
        if (mounted && token) {
            fetchChannels();
            if (activeTab === 'staff') fetchStaff();
            if (activeTab === 'audit') fetchAudit();
            if (activeTab === 'zalo_personal') fetchZaloPersonalAccounts();
            if (activeTab === 'system') fetchMediaSettings();
        }
    }, [mounted, token, activeTab, fetchChannels, fetchStaff, fetchAudit, fetchZaloPersonalAccounts, fetchMediaSettings, headers]);


    // WebSocket Listeners for Zalo QR
    useEffect(() => {
        if (!socket || !pendingQrAccountId) return;

        console.log('Subscribing to account:', pendingQrAccountId);
        socket.emit('join_account', { accountId: pendingQrAccountId });

        const onQr = (data: { accountId: string; qrImage: string }) => {
            console.log('Got QR:', data);
            if (data.accountId === pendingQrAccountId) {
                setQrCode(data.qrImage);
                setQrError(null);
            }
        };

        const onQrExpired = (data: { accountId: string }) => {
            if (data.accountId === pendingQrAccountId) {
                setQrError('Mã QR đã hết hạn. Hệ thống đang tạo mã mới...');
            }
        };

        const onConnected = (data: { accountId: string }) => {
            if (data.accountId === pendingQrAccountId) {
                setShowZaloForm(false);
                setPendingQrAccountId(null);
                setQrCode(null);
                fetchZaloPersonalAccounts();
                alert('Kết nối Zalo Cá Nhân thành công!');
            }
        };

        const onError = (data: { accountId: string; error: string }) => {
            if (data.accountId === pendingQrAccountId) {
                setQrError(data.error);
            }
        };

        socket.on('zalo:qr', onQr);
        socket.on('zalo:qr-expired', onQrExpired);
        socket.on('zalo:connected', onConnected);
        socket.on('zalo:error', onError);

        return () => {
            socket.emit('leave_account', { accountId: pendingQrAccountId });
            socket.off('zalo:qr', onQr);
            socket.off('zalo:qr-expired', onQrExpired);
            socket.off('zalo:connected', onConnected);
            socket.off('zalo:error', onError);
        };
    }, [socket, pendingQrAccountId, fetchZaloPersonalAccounts]);

    // Theo dõi RỚT KẾT NỐI ngoài luồng QR: trước đây chỉ nghe sự kiện khi đang mở modal QR
    // → session chết lúc không thao tác thì user không hề biết. Nay luôn nghe disconnected/
    // reconnect-failed khi đang ở tab Zalo, cập nhật liveStatus tại chỗ + poll nhẹ 30s dự phòng.
    useEffect(() => {
        if (!socket || activeTab !== 'zalo_personal') return;

        const patchStatus = (accountId: string, liveStatus: string) => {
            setZaloAccounts(prev => prev.map(a => a.id === accountId ? { ...a, liveStatus } : a));
        };
        const onDisconnected = (data: { accountId: string }) => patchStatus(data.accountId, 'disconnected');
        const onReconnectFailed = (data: { accountId: string }) => patchStatus(data.accountId, 'qr_pending');

        socket.on('zalo:disconnected', onDisconnected);
        socket.on('zalo:reconnect-failed', onReconnectFailed);
        const poll = setInterval(fetchZaloPersonalAccounts, 30000);

        return () => {
            socket.off('zalo:disconnected', onDisconnected);
            socket.off('zalo:reconnect-failed', onReconnectFailed);
            clearInterval(poll);
        };
    }, [socket, activeTab, fetchZaloPersonalAccounts]);

    const handleCreateZaloAccount = async () => {
        if (!zaloDisplayName.trim() || !user) return;
        setQrError('Đang khởi tạo kết nối Zalo...');
        try {
            // 1. Tạo account
            const res = await fetch(`${API}/zalo-personal/accounts`, {
                method: 'POST', headers: headers(),
                body: JSON.stringify({ displayName: zaloDisplayName, ownerUserId: user.id }),
            });
            if (!res.ok) throw new Error('Không thể tạo tài khoản');
            const data = await res.json();
            
            // 2. Lưu ID để Socket subscribe và đợi Socket join phòng
            setPendingQrAccountId(data.id);
            fetchZaloPersonalAccounts();
            await new Promise(r => setTimeout(r, 500)); 

            // 3. Kích hoạt lấy QR
            const qrRes = await fetch(`${API}/zalo-personal/accounts/${data.id}/qr`, {
                method: 'POST', headers: headers(),
            });
            const qrData = await qrRes.json();
            if (!qrData.success) {
                setQrError(qrData.error || 'Lỗi khởi tạo QR');
            }
        } catch (err: any) {
            setQrError(err.message);
        }
    };

    const handleReconnectZalo = async (id: string) => {
        // Mở lại modal QR cho account này và gọi /qr để quét mã mới!
        setZaloDisplayName('Đang khởi tạo lại...');
        setPendingQrAccountId(id);
        setShowZaloForm(true);
        setQrCode(null);
        setQrError('Đang tải mã QR mới...');
        
        // Cần chờ 500ms để React cập nhật state pendingQrAccountId vào closure của Socket listener và join room
        await new Promise(r => setTimeout(r, 500));
        
        try {
            const res = await fetch(`${API}/zalo-personal/accounts/${id}/qr`, {
                method: 'POST', headers: headers(),
            });
            const data = await res.json();
            if (!data.success) {
                setQrError(data.error || 'Lỗi khởi tạo QR');
            }
        } catch (err: any) {
            setQrError(err.message);
        }
    };

    const handleDeleteZalo = async (id: string) => {
        setConfirmZaloDeleteId(null);
        try {
            const res = await fetch(`${API}/zalo-personal/accounts/${id}`, {
                method: 'DELETE', headers: headers(),
            });
            if (!res.ok) {
                const text = await res.text();
                // Using custom UI to show error instead of alert if possible, but fallback to alert just in case
                console.error('Lỗi khi xóa: ' + text);
                return;
            }
            fetchZaloPersonalAccounts();
        } catch (err: any) { console.error('Lỗi: ' + err.message); }
    };

    if (!mounted) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#94a3b8' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ width: 36, height: 36, border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
                Đang tải...
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        </div>
    );

    const handleSaveChannel = async () => {
        try {
            if (editingId) {
                await fetch(`${API}/channels/${editingId}`, {
                    method: 'PUT', headers: headers(), body: JSON.stringify(form),
                });
            } else {
                await fetch(`${API}/channels`, {
                    method: 'POST', headers: headers(), body: JSON.stringify(form),
                });
            }
            setShowForm(false);
            setEditingId(null);
            setForm({ type: 'zalo_oa', name: '', externalId: '', webhookSecret: '' });
            fetchChannels();
        } catch (err) { console.error(err); }
    };

    const startEdit = (ch: ChannelItem) => {
        setEditingId(ch.id);
        setForm({ type: ch.type, name: ch.name, externalId: ch.externalId, webhookSecret: ch.webhookSecret || '' });
        setShowForm(true);
    };

    return (
        <div style={{ padding: '24px 28px', background: '#f8fafc', minHeight: '100vh' }}>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    </svg>
                    Cài đặt
                </h1>
                <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Quản lý kênh kết nối và thông tin hệ thống</p>
            </div>

            {/* Tabs */}
            <div style={{
                display: 'flex', gap: 4, marginBottom: 24,
                background: '#fff', borderRadius: 12, padding: 4,
                border: '1px solid #e2e8f0', width: 'fit-content',
            }}>
                {allowedTabKeys.length === 0 && (
                    <span style={{ fontSize: 13, color: '#64748b', padding: '8px 12px' }}>
                        Bạn không có quyền truy cập mục Cài đặt. Vui lòng liên hệ quản trị viên.
                    </span>
                )}
                {TAB_CONFIG.filter(t => allowedTabKeys.includes(t.key)).map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                        style={{
                            padding: '8px 18px', fontSize: 13, fontWeight: 600,
                            border: 'none', cursor: 'pointer', borderRadius: 8,
                            background: activeTab === tab.key ? '#4f46e5' : 'transparent',
                            color: activeTab === tab.key ? '#fff' : '#64748b',
                            transition: 'all 200ms ease',
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d={tab.iconPath} />
                            {tab.key === 'system' && <circle cx="12" cy="12" r="3" />}
                        </svg>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ═══ Channels Tab ═══ */}
            {activeTab === 'channels' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>Kênh đã kết nối</span>
                            <span style={{
                                fontSize: 11, padding: '3px 10px', borderRadius: 8,
                                background: '#eef2ff', color: '#4f46e5', fontWeight: 600,
                            }}>{channels.length}</span>
                        </div>
                        <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ type: 'zalo_oa', name: '', externalId: '', webhookSecret: '' }); }}
                            style={{
                                padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                                background: '#4f46e5', color: '#fff', border: 'none',
                                cursor: 'pointer', transition: 'all 150ms',
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#4338ca'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#4f46e5'; e.currentTarget.style.transform = 'translateY(0)'; }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            Thêm kênh
                        </button>
                    </div>

                    {/* Channel Form */}
                    {showForm && (
                        <div style={{
                            background: '#fff', borderRadius: 16, padding: '22px 24px', marginBottom: 20,
                            border: '1px solid #e0e7ff', boxShadow: '0 0 0 3px #eef2ff',
                        }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                                {editingId ? 'Sửa kênh' : 'Thêm kênh mới'}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Loại kênh</label>
                                    <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                                        style={{ borderRadius: 10, background: '#f8fafc' }}>
                                        {CHANNEL_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.icon} {ct.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Tên hiển thị</label>
                                    <input className="input" placeholder="VD: Zalo OA In Ấn Đẹp" value={form.name}
                                        onChange={e => setForm({ ...form, name: e.target.value })}
                                        style={{ borderRadius: 10, background: '#f8fafc' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>External ID (OA ID)</label>
                                    <input className="input" placeholder="VD: 123456789" value={form.externalId}
                                        onChange={e => setForm({ ...form, externalId: e.target.value })}
                                        style={{ borderRadius: 10, background: '#f8fafc' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Webhook Secret</label>
                                    <input className="input" type="password" placeholder="••••••••" value={form.webhookSecret}
                                        onChange={e => setForm({ ...form, webhookSecret: e.target.value })}
                                        style={{ borderRadius: 10, background: '#f8fafc' }} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                                <button onClick={handleSaveChannel}
                                    style={{
                                        padding: '8px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                                        background: '#4f46e5', color: '#fff', border: 'none',
                                        cursor: 'pointer', transition: 'all 150ms',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#4338ca'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = '#4f46e5'; }}
                                >{editingId ? '💾 Cập nhật' : '✨ Tạo kênh'}</button>
                                <button onClick={() => { setShowForm(false); setEditingId(null); }}
                                    style={{
                                        padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500,
                                        background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0',
                                        cursor: 'pointer', transition: 'all 150ms',
                                    }}>Hủy</button>
                            </div>
                        </div>
                    )}

                    {/* Empty State */}
                    {channels.length === 0 && !showForm && (
                        <div style={{
                            padding: 48, textAlign: 'center', background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9',
                        }}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ margin: '0 auto 12px', display: 'block' }}>
                                <path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01" />
                                <circle cx="12" cy="12" r="10" />
                            </svg>
                            <div style={{ fontSize: 15, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Chưa có kênh nào</div>
                            <div style={{ fontSize: 13, color: '#94a3b8' }}>Bấm &quot;Thêm kênh&quot; để kết nối Zalo OA hoặc Facebook Page</div>
                        </div>
                    )}

                    {/* Channel List */}
                    <div style={{ display: 'grid', gap: 10 }}>
                        {channels.map(ch => {
                            const ct = CHANNEL_TYPES.find(t => t.value === ch.type);
                            return (
                                <div key={ch.id} style={{
                                    padding: '18px 20px', borderRadius: 14,
                                    background: '#fff', border: '1px solid #f1f5f9',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    transition: 'all 150ms ease',
                                }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#e0e7ff'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#f1f5f9'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)'; }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                        <span style={{
                                            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                                            background: ct?.bg || '#f1f5f9',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 20,
                                        }}>{ct?.icon || '📡'}</span>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{ch.name}</div>
                                            <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                                <span>{ct?.label || ch.type}</span>
                                                <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#cbd5e1' }} />
                                                <span style={{ fontFamily: 'monospace' }}>ID: {ch.externalId}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <span style={{
                                            display: 'flex', alignItems: 'center', gap: 6,
                                            padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                            background: ch.isActive ? '#dcfce7' : '#fef2f2',
                                            color: ch.isActive ? '#16a34a' : '#dc2626',
                                        }}>
                                            <span style={{
                                                width: 7, height: 7, borderRadius: '50%',
                                                background: ch.isActive ? '#22c55e' : '#ef4444',
                                                boxShadow: ch.isActive ? '0 0 6px #22c55e40' : 'none',
                                            }} />
                                            {ch.isActive ? 'Hoạt động' : 'Tắt'}
                                        </span>
                                        <button onClick={() => startEdit(ch)}
                                            style={{
                                                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                                background: '#f8fafc', border: '1px solid #e2e8f0',
                                                cursor: 'pointer', transition: 'all 150ms', color: '#334155',
                                                display: 'flex', alignItems: 'center', gap: 4,
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.background = '#eef2ff'; e.currentTarget.style.borderColor = '#c7d2fe'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2">
                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                            </svg>
                                            Sửa
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ═══ Zalo Personal Tab ═══ */}
            {activeTab === 'zalo_personal' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>Zalo Cá Nhân</span>
                            <span style={{
                                fontSize: 11, padding: '3px 10px', borderRadius: 8,
                                background: '#eef2ff', color: '#4f46e5', fontWeight: 600,
                            }}>{zaloAccounts.length}</span>
                        </div>
                        <button onClick={() => { setShowZaloForm(true); setZaloDisplayName(''); setQrCode(null); setQrError(null); setPendingQrAccountId(null); }}
                            style={{
                                padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                                background: '#0891b2', color: '#fff', border: 'none',
                                cursor: 'pointer', transition: 'all 150ms',
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#0e7490'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#0891b2'; e.currentTarget.style.transform = 'translateY(0)'; }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            Thêm Zalo Mới
                        </button>
                    </div>

                    {/* Zalo Form & QR Modal */}
                    {showZaloForm && (
                        <div style={{
                            background: '#fff', borderRadius: 16, padding: '24px', marginBottom: 20,
                            border: '1px solid #cffafe', boxShadow: '0 0 0 4px #ecfeff',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
                        }}>
                            {!qrCode && !pendingQrAccountId ? (
                                <div style={{ width: '100%', maxWidth: 400 }}>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 16, textAlign: 'center' }}>
                                        Kết nối Zalo Cá Nhân
                                    </div>
                                    <label style={{ fontSize: 13, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 8 }}>Tên gợi nhớ (Ví dụ: Zalo CSKH 01)</label>
                                    <input className="input" placeholder="Nhập tên..." value={zaloDisplayName}
                                        onChange={e => setZaloDisplayName(e.target.value)}
                                        style={{ borderRadius: 10, background: '#f8fafc', marginBottom: 16, width: '100%' }} />
                                    
                                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                                        <button onClick={handleCreateZaloAccount} disabled={!zaloDisplayName.trim()}
                                            style={{
                                                padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                                                background: zaloDisplayName.trim() ? '#4f46e5' : '#cbd5e1', color: '#fff', border: 'none',
                                                cursor: zaloDisplayName.trim() ? 'pointer' : 'not-allowed',
                                            }}>Khởi tạo QR Code</button>
                                        <button onClick={() => setShowZaloForm(false)}
                                            style={{
                                                padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                                                background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer',
                                            }}>Hủy</button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                                        Quét mã QR để đăng nhập
                                    </div>
                                    <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24, maxWidth: 300 }}>
                                        Mở ứng dụng Zalo trên điện thoại, chọn biểu tượng quét mã QR và hướng camera vào mã này.
                                    </div>

                                    {qrError ? (
                                        <div style={{ padding: 20, background: '#fef2f2', color: '#dc2626', borderRadius: 12, marginBottom: 16, fontWeight: 500, border: '1px solid #fecaca' }}>
                                            ⚠️ {qrError}
                                        </div>
                                    ) : qrCode ? (
                                        <div style={{ padding: 16, background: '#fff', borderRadius: 16, border: '2px dashed #e2e8f0', display: 'inline-block' }}>
                                            <img src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`} alt="Zalo QR" style={{ width: 220, height: 220, objectFit: 'contain' }} />
                                        </div>
                                    ) : (
                                        <div style={{ padding: 40, border: '2px dashed #e2e8f0', borderRadius: 16, color: '#94a3b8' }}>
                                            Đang lấy mã QR từ máy chủ Zalo...
                                        </div>
                                    )}

                                    <div style={{ marginTop: 20 }}>
                                        <button onClick={() => setShowZaloForm(false)}
                                            style={{
                                                padding: '8px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                                                background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer',
                                            }}>Đóng lại</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Zalo List */}
                    {!showZaloForm && zaloAccounts.length === 0 && (
                        <div style={{
                            padding: 48, textAlign: 'center', background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9',
                        }}>
                            <div style={{ fontSize: 40, marginBottom: 10 }}>📱</div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Chưa có Zalo Cá Nhân nào</div>
                            <div style={{ fontSize: 13, color: '#94a3b8' }}>Bấm &quot;Thêm Zalo Mới&quot; để tạo một luồng kết nối tự động.</div>
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
                        {zaloAccounts.map(acc => {
                            const isConnected = acc.liveStatus === 'connected';
                            const isQrPending = acc.liveStatus === 'qr_pending';
                            
                            return (
                                <div key={acc.id} style={{
                                    padding: '20px', borderRadius: 16,
                                    background: '#fff', border: '1px solid #f1f5f9',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)', position: 'relative',
                                }}>
                                    <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
                                        <img src={acc.avatarUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(acc.displayName) + '&background=random'} 
                                             alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid #f8fafc' }} />
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{acc.displayName || 'Zalo Account'}</div>
                                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, fontFamily: 'monospace' }}>
                                                UID: {acc.zaloUid || 'Đang chờ...'}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                                        <div style={{ background: '#f8fafc', padding: '10px', borderRadius: 10 }}>
                                            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, fontWeight: 600 }}>TRẠNG THÁI</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, 
                                                color: isConnected ? '#16a34a' : isQrPending ? '#d97706' : '#dc2626' }}>
                                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: isConnected ? '#22c55e' : isQrPending ? '#f59e0b' : '#ef4444' }} />
                                                {isConnected ? 'Hoạt động' : isQrPending ? 'Chờ quét QR' : 'Mất kết nối'}
                                            </div>
                                        </div>
                                        <div style={{ background: '#f8fafc', padding: '10px', borderRadius: 10 }}>
                                            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, fontWeight: 600 }}>TIN ĐÃ GỬI (Hôm nay)</div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                                                {acc.dailySendCount || 0} <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>/ 200</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 8 }}>
                                        {!isConnected && !isQrPending && (
                                            <button onClick={() => handleReconnectZalo(acc.id)}
                                                style={{
                                                    flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                                    background: '#e0f2fe', color: '#0284c7', border: 'none', cursor: 'pointer',
                                                }}>🔄 Thử kết nối lại</button>
                                        )}
                                        <button onClick={() => setConfirmZaloDeleteId(acc.id)}
                                            style={{
                                                flex: isConnected ? 1 : 'unset', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                                background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer',
                                            }}>🗑️ Xóa kênh</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Custom Confirm Modal for Zalo deletion */}
                    {confirmZaloDeleteId && (
                        <div style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(15,23,42,0.6)', zIndex: 9999,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
                        }}>
                            <div style={{
                                width: '100%', maxWidth: 400, background: '#fff', borderRadius: 20,
                                padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
                            }}>
                                <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>Xác nhận xóa kênh</div>
                                <div style={{ fontSize: 14, color: '#475569', marginBottom: 24, lineHeight: 1.5 }}>
                                    Bạn có chắc chắn muốn xóa kênh Zalo này không? Các hộp thoại của kênh sẽ bị ẩn đi.
                                </div>
                                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                                    <button onClick={() => setConfirmZaloDeleteId(null)}
                                        style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                                        Hủy bỏ
                                    </button>
                                    <button onClick={() => handleDeleteZalo(confirmZaloDeleteId)}
                                        style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                                        Xóa ngay
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ═══ Staff Tab ═══ */}
            {activeTab === 'staff' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>Danh sách nhân sự</span>
                            <span style={{
                                fontSize: 11, padding: '3px 10px', borderRadius: 8,
                                background: '#eef2ff', color: '#4f46e5', fontWeight: 600,
                            }}>{staff.length}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input placeholder="🔍 Tìm kiếm..." className="input"
                                value={staffSearch} onChange={e => setStaffSearch(e.target.value)}
                                style={{ fontSize: 12, padding: '6px 14px', borderRadius: 10, width: 200 }} />
                            <button onClick={() => { setShowStaffForm(true); setEditingStaff(null); setStaffForm({ email: '', password: '', fullName: '', role: 'agent' }); }}
                                style={{
                                    padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                                    background: '#4f46e5', color: '#fff', border: 'none',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#4338ca'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#4f46e5'; }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                                Thêm nhân sự
                            </button>
                        </div>
                    </div>

                    {/* Staff Form */}
                    {showStaffForm && (
                        <div style={{
                            background: '#fff', borderRadius: 16, padding: '22px 24px', marginBottom: 20,
                            border: '1px solid #e0e7ff', boxShadow: '0 0 0 3px #eef2ff',
                        }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                👤 {editingStaff ? 'Sửa nhân sự' : 'Thêm nhân sự mới'}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Họ tên *</label>
                                    <input className="input" placeholder="Nguyễn Văn A" value={staffForm.fullName}
                                        onChange={e => setStaffForm({ ...staffForm, fullName: e.target.value })}
                                        style={{ borderRadius: 10, background: '#f8fafc' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Email *</label>
                                    <input className="input" placeholder="email@company.vn" value={staffForm.email}
                                        onChange={e => setStaffForm({ ...staffForm, email: e.target.value })}
                                        disabled={!!editingStaff}
                                        style={{ borderRadius: 10, background: editingStaff ? '#f1f5f9' : '#f8fafc' }} />
                                </div>
                                {!editingStaff && (
                                    <div>
                                        <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Mật khẩu *</label>
                                        <input className="input" type="password" placeholder="Tối thiểu 6 ký tự" value={staffForm.password}
                                            onChange={e => setStaffForm({ ...staffForm, password: e.target.value })}
                                            style={{ borderRadius: 10, background: '#f8fafc' }} />
                                    </div>
                                )}
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Vai trò</label>
                                    <select className="input" value={staffForm.role}
                                        onChange={e => setStaffForm({ ...staffForm, role: e.target.value })}
                                        style={{ borderRadius: 10, background: '#f8fafc' }}>
                                        <option value="agent">👤 Nhân viên (Agent)</option>
                                        <option value="supervisor">👁️ Supervisor</option>
                                        <option value="admin">⚙️ Admin</option>
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                                <button onClick={saveStaff}
                                    disabled={!staffForm.fullName || (!editingStaff && (!staffForm.email || !staffForm.password))}
                                    style={{
                                        padding: '8px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                                        background: '#4f46e5', color: '#fff', border: 'none',
                                        cursor: 'pointer', opacity: (!staffForm.fullName || (!editingStaff && (!staffForm.email || !staffForm.password))) ? 0.5 : 1,
                                    }}>{editingStaff ? '💾 Cập nhật' : '✨ Tạo tài khoản'}</button>
                                <button onClick={() => { setShowStaffForm(false); setEditingStaff(null); }}
                                    style={{
                                        padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500,
                                        background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer',
                                    }}>Hủy</button>
                            </div>
                        </div>
                    )}

                    {/* Staff Table */}
                    <div style={{
                        background: '#fff', borderRadius: 16, overflow: 'hidden',
                        border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                    <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 12 }}>NHÂN SỰ</th>
                                    <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 12 }}>VAI TRÒ</th>
                                    <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 12 }}>TRẠNG THÁI</th>
                                    <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 12 }}>ĐĂNG NHẬP</th>
                                    <th style={{ padding: '12px 18px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 12 }}>HÀNH ĐỘNG</th>
                                </tr>
                            </thead>
                            <tbody>
                                {staff
                                    .filter(u => {
                                        const q = staffSearch.toLowerCase();
                                        return !q || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.includes(q);
                                    })
                                    .map(u => {
                                        const rc = ROLE_CONFIG[u.role] || ROLE_CONFIG.agent;
                                        return (
                                            <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 150ms' }}
                                                onMouseEnter={e => { e.currentTarget.style.background = '#f8faff'; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                            >
                                                <td style={{ padding: '12px 18px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <span style={{
                                                            width: 32, height: 32, borderRadius: '50%', background: rc.bg,
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontWeight: 700, color: rc.color, fontSize: 13,
                                                        }}>{u.fullName.charAt(0)}</span>
                                                        <div>
                                                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{u.fullName}</div>
                                                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{u.email}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 18px' }}>
                                                    <span style={{
                                                        padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                                                        background: rc.bg, color: rc.color,
                                                    }}>{rc.label}</span>
                                                </td>
                                                <td style={{ padding: '12px 18px' }}>
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                                        padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                                                        background: u.isActive ? '#dcfce7' : '#fef2f2',
                                                        color: u.isActive ? '#16a34a' : '#dc2626',
                                                    }}>
                                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: u.isActive ? '#22c55e' : '#ef4444' }} />
                                                        {u.isActive ? 'Hoạt động' : 'Vô hiệu'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 18px', fontSize: 12, color: '#94a3b8' }}>
                                                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('vi-VN') : 'Chưa đăng nhập'}
                                                </td>
                                                <td style={{ padding: '12px 18px', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                                                        <button onClick={() => {
                                                            setEditingStaff(u);
                                                            setStaffForm({ email: u.email, password: '', fullName: u.fullName, role: u.role });
                                                            setShowStaffForm(true);
                                                        }}
                                                            style={{
                                                                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                                                background: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer',
                                                                color: '#4f46e5',
                                                            }}>✏️ Sửa</button>
                                                        <button onClick={() => toggleStaffActive(u)}
                                                            style={{
                                                                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                                                background: u.isActive ? '#fef2f2' : '#dcfce7',
                                                                border: '1px solid ' + (u.isActive ? '#fecaca' : '#bbf7d0'),
                                                                cursor: 'pointer', color: u.isActive ? '#dc2626' : '#16a34a',
                                                            }}>{u.isActive ? '🚫 Vô hiệu' : '✅ Kích hoạt'}</button>
                                                        {confirmDeleteId === u.id ? (
                                                            <>
                                                                <button onClick={() => deleteStaff(u.id)}
                                                                    style={{
                                                                        padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                                                        background: '#dc2626', border: 'none',
                                                                        cursor: 'pointer', color: '#fff',
                                                                    }}>✓ Xác nhận xóa</button>
                                                                <button onClick={() => setConfirmDeleteId(null)}
                                                                    style={{
                                                                        padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                                                        background: '#f8fafc', border: '1px solid #e2e8f0',
                                                                        cursor: 'pointer', color: '#64748b',
                                                                    }}>Hủy</button>
                                                            </>
                                                        ) : (
                                                            <button onClick={() => setConfirmDeleteId(u.id)}
                                                                style={{
                                                                    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                                                    background: '#fff', border: '1px solid #fecaca',
                                                                    cursor: 'pointer', color: '#dc2626',
                                                                }}>🗑️ Xóa</button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                        {staff.length === 0 && (
                            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                                Chưa có nhân sự. Bấm &quot;Thêm nhân sự&quot; để tạo tài khoản.
                            </div>
                        )}
                    </div>

                    {/* Role legend */}
                    <div style={{
                        marginTop: 16, padding: '12px 18px', background: '#fefce8', borderRadius: 12,
                        border: '1px solid #fde68a', fontSize: 12, color: '#854d0e', lineHeight: 1.6,
                    }}>
                        <strong>📋 Vai trò:</strong>{' '}
                        <strong>Admin</strong> — quản trị toàn bộ hệ thống |{' '}
                        <strong>Supervisor</strong> — giám sát, xem báo cáo |{' '}
                        <strong>Nhân viên</strong> — xử lý hội thoại, cộng tác viên/freelancer
                    </div>
                </div>
            )}

            {/* ═══ Audit Tab ═══ */}
            {activeTab === 'audit' && (
                <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2">
                            <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                        </svg>
                        Nhật ký hoạt động
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', color: '#94a3b8', fontWeight: 500 }}>{auditLogs.length}</span>
                    </div>
                    {auditLogs.length === 0 ? (
                        <div style={{
                            padding: 48, textAlign: 'center', background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9',
                        }}>
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ margin: '0 auto 8px', display: 'block' }}>
                                <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                            </svg>
                            <div style={{ fontSize: 13, color: '#94a3b8' }}>Chưa có nhật ký</div>
                        </div>
                    ) : (
                        <div style={{
                            background: '#fff', borderRadius: 16, overflow: 'hidden',
                            border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc' }}>
                                        <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 12 }}>THỜI GIAN</th>
                                        <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 12 }}>NGƯỜI DÙNG</th>
                                        <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 12 }}>HÀNH ĐỘNG</th>
                                        <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 12 }}>ĐỐI TƯỢNG</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {auditLogs.map(log => (
                                        <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 150ms' }}
                                            onMouseEnter={e => { e.currentTarget.style.background = '#f8faff'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            <td style={{ padding: '12px 18px', color: '#94a3b8', fontSize: 12 }}>
                                                {new Date(log.createdAt).toLocaleString('vi-VN')}
                                            </td>
                                            <td style={{ padding: '12px 18px', fontWeight: 500, color: '#334155' }}>{log.user?.fullName || 'System'}</td>
                                            <td style={{ padding: '12px 18px' }}>
                                                <span style={{
                                                    padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                                                    background: log.action.includes('create') ? '#dcfce7' :
                                                        log.action.includes('update') ? '#dbeafe' :
                                                            log.action.includes('delete') ? '#fef2f2' : '#f1f5f9',
                                                    color: log.action.includes('create') ? '#16a34a' :
                                                        log.action.includes('update') ? '#2563eb' :
                                                            log.action.includes('delete') ? '#dc2626' : '#64748b',
                                                }}>{log.action}</span>
                                            </td>
                                            <td style={{ padding: '12px 18px', fontSize: 12, color: '#64748b' }}>
                                                <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
                                                    {log.entityType}
                                                </span>
                                                <span style={{ color: '#cbd5e1', margin: '0 4px' }}>:</span>
                                                <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{log.entityId.substring(0, 8)}…</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}


            {/* ═══ System Tab ═══ */}
            {activeTab === 'system' && (
                <div>


                    <div style={{
                        marginTop: 20, background: '#fff', borderRadius: 16, overflow: 'hidden',
                        border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', fontWeight: 600, fontSize: 14, color: '#0f172a' }}>
                            💾 Cấu hình lưu trữ tệp (Zalo Media Archiver)
                        </div>
                        <div style={{ padding: '20px' }}>
                            <label style={{ fontSize: 13, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 8 }}>Absolute Path thư mục đích</label>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <input className="input" placeholder="VD: E:\Zalo_Zeplao_Backups" value={zaloMediaPath}
                                    onChange={e => setZaloMediaPath(e.target.value)}
                                    style={{ flex: 1, borderRadius: 10, background: '#f8fafc', padding: '10px 14px', border: '1px solid #e2e8f0', outline: 'none' }} />
                                <button onClick={saveMediaSettings} disabled={zaloMediaPathSaving}
                                    style={{
                                        padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                                        background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer',
                                        opacity: zaloMediaPathSaving ? 0.7 : 1
                                    }}>
                                    {zaloMediaPathSaving ? 'Đang lưu...' : 'Lưu cấu hình'}
                                </button>
                            </div>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                                Nếu bỏ trống, hệ thống sẽ tự lưu vào bộ nhớ mặc định của phần mềm. Để mở rộng dung lượng qua ổ cứng ngoài, hãy điền đường dẫn cụ thể (VD: <code>E:\Zalo_Backups</code> đối với Windows).
                            </div>
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}