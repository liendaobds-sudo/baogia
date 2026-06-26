'use client';

import { useAuth } from '@/lib/auth-context';
import { useState, useEffect, useRef } from 'react';

import { API_URL as API } from '@/lib/api';

const ROLE_LABELS: Record<string, string> = {
    admin: 'Quản trị viên',
    supervisor: 'Giám sát viên',
    agent: 'Nhân viên',
};

const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    admin: { bg: '#fef3c7', text: '#92400e', border: '#fbbf24' },
    supervisor: { bg: '#ede9fe', text: '#5b21b6', border: '#8b5cf6' },
    agent: { bg: '#dbeafe', text: '#1e40af', border: '#60a5fa' },
};

export default function ProfilePage() {
    const { user, token, authFetch } = useAuth();
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [lastLoginAt, setLastLoginAt] = useState('');
    const [createdAt, setCreatedAt] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [editingName, setEditingName] = useState(false);
    const nameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!user || !token) return;
        authFetch(`${API}/users/${user.id}`)
            .then(r => r.json())
            .then(data => {
                setFullName(data.fullName || '');
                setEmail(data.email || '');
                setRole(data.role || '');
                setAvatarUrl(data.avatarUrl || '');
                setIsActive(data.isActive !== false);
                setLastLoginAt(data.lastLoginAt || '');
                setCreatedAt(data.createdAt || '');
            })
            .catch(() => {});
    }, [user, token]);

    useEffect(() => {
        if (editingName && nameInputRef.current) {
            nameInputRef.current.focus();
            nameInputRef.current.select();
        }
    }, [editingName]);

    const handleSaveName = async () => {
        if (!user || !fullName.trim()) return;
        setSaving(true);
        setSaveMsg(null);
        try {
            const res = await authFetch(`${API}/users/${user.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullName: fullName.trim() }),
            });
            if (res.ok) {
                setSaveMsg({ type: 'success', text: 'Đã cập nhật thành công!' });
                setEditingName(false);
                // Update localStorage so sidebar reflects new name
                const savedUser = localStorage.getItem('zh_user');
                if (savedUser) {
                    const parsed = JSON.parse(savedUser);
                    parsed.fullName = fullName.trim();
                    localStorage.setItem('zh_user', JSON.stringify(parsed));
                }
            } else {
                const err = await res.json().catch(() => ({}));
                setSaveMsg({ type: 'error', text: err.message || 'Không thể cập nhật' });
            }
        } catch {
            setSaveMsg({ type: 'error', text: 'Lỗi kết nối' });
        } finally {
            setSaving(false);
            setTimeout(() => setSaveMsg(null), 3000);
        }
    };

    if (!user) return null;

    const roleStyle = ROLE_COLORS[role] || ROLE_COLORS.agent;
    const initial = fullName.charAt(0).toUpperCase();

    return (
        <div style={{ padding: '40px', maxWidth: 720, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: 32 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: 0 }}>Hồ sơ cá nhân</h1>
                <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>Thông tin tài khoản và quyền hạn của bạn</p>
            </div>

            {/* Profile Card */}
            <div style={{
                background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden'
            }}>
                {/* Banner */}
                <div style={{
                    height: 100, background: 'linear-gradient(135deg, #1e40af 0%, #7c3aed 50%, #2563eb 100%)',
                    position: 'relative'
                }} />

                {/* Avatar + Name */}
                <div style={{ position: 'relative', zIndex: 10, padding: '0 32px 24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
                        {/* Avatar */}
                        <div style={{
                            width: 88, height: 88, borderRadius: '50%', border: '4px solid #fff',
                            background: avatarUrl ? 'transparent' : 'linear-gradient(135deg, #dbeafe, #c7d2fe)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 32, fontWeight: 700, color: '#1e40af',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.12)', flexShrink: 0,
                            overflow: 'hidden', marginTop: -44,
                        }}>
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : initial}
                        </div>

                        {/* Name + Role Badge */}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {editingName ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <input
                                            ref={nameInputRef}
                                            value={fullName}
                                            onChange={e => setFullName(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                                            style={{
                                                fontSize: 22, fontWeight: 700, color: '#0f172a',
                                                border: '2px solid #3b82f6', borderRadius: 8,
                                                padding: '4px 10px', outline: 'none', background: '#f8fafc',
                                                width: 260,
                                            }}
                                        />
                                        <button onClick={handleSaveName} disabled={saving}
                                            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                            {saving ? '...' : 'Lưu'}
                                        </button>
                                        <button onClick={() => setEditingName(false)}
                                            style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>
                                            Hủy
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <span style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{fullName}</span>
                                        <button onClick={() => setEditingName(true)} title="Sửa tên"
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#94a3b8', display: 'flex' }}
                                            onMouseEnter={e => e.currentTarget.style.color = '#3b82f6'}
                                            onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                            </svg>
                                        </button>
                                    </>
                                )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                                <span style={{
                                    fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                                    background: roleStyle.bg, color: roleStyle.text, border: `1px solid ${roleStyle.border}`,
                                }}>
                                    {ROLE_LABELS[role] || role}
                                </span>
                                <span style={{
                                    fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 20,
                                    background: isActive ? '#dcfce7' : '#fee2e2',
                                    color: isActive ? '#166534' : '#991b1b',
                                    border: `1px solid ${isActive ? '#86efac' : '#fca5a5'}`,
                                }}>
                                    {isActive ? '● Đang hoạt động' : '○ Ngừng hoạt động'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Save Message */}
                    {saveMsg && (
                        <div style={{
                            padding: '10px 16px', borderRadius: 8, marginBottom: 16,
                            background: saveMsg.type === 'success' ? '#dcfce7' : '#fee2e2',
                            color: saveMsg.type === 'success' ? '#166534' : '#991b1b',
                            fontSize: 13, fontWeight: 500, border: `1px solid ${saveMsg.type === 'success' ? '#86efac' : '#fca5a5'}`,
                            animation: 'fadeIn 0.3s ease-in-out',
                        }}>
                            {saveMsg.type === 'success' ? '✅' : '❌'} {saveMsg.text}
                        </div>
                    )}

                    {/* Info Grid */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
                        background: '#f8fafc', borderRadius: 12, padding: 20,
                        border: '1px solid #f1f5f9',
                    }}>
                        <InfoItem icon="📧" label="Email" value={email} />
                        <InfoItem icon="🛡️" label="Quyền hạn" value={ROLE_LABELS[role] || role} />
                        <InfoItem icon="🏢" label="Phòng ban" value={role === 'admin' ? 'Ban Giám Đốc' : role === 'supervisor' ? 'Quản Lý' : 'Nhân Viên Tư Vấn'} />
                        <InfoItem icon="🔑" label="ID tài khoản" value={user.id.substring(0, 8) + '...'} mono />
                        <InfoItem icon="📅" label="Ngày tạo"
                            value={createdAt ? new Date(createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'} />
                        <InfoItem icon="🕐" label="Đăng nhập gần nhất"
                            value={lastLoginAt ? new Date(lastLoginAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'} />
                    </div>
                </div>
            </div>

            {/* Permissions Card */}
            <div style={{
                background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginTop: 20, padding: 24
            }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    🔐 Quyền hạn tài khoản
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <PermRow label="Xem Inbox & Tin nhắn" allowed />
                    <PermRow label="Trả lời khách hàng" allowed />
                    <PermRow label="Quản lý danh bạ" allowed />
                    <PermRow label="Xem báo cáo & Dashboard" allowed={role === 'admin' || role === 'supervisor'} />
                    <PermRow label="Quản lý nhân viên & phân quyền" allowed={role === 'admin'} />
                    <PermRow label="Cài đặt hệ thống" allowed={role === 'admin'} />
                    <PermRow label="Kết nối kênh Zalo" allowed={role === 'admin'} />
                </div>
            </div>
        </div>
    );
}

function InfoItem({ icon, label, value, mono }: { icon: string; label: string; value: string; mono?: boolean }) {
    return (
        <div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 14 }}>{icon}</span> {label}
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#0f172a', fontFamily: mono ? 'monospace' : 'inherit' }}>
                {value}
            </div>
        </div>
    );
}

function PermRow({ label, allowed }: { label: string; allowed: boolean }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', borderRadius: 8, background: '#f8fafc'
        }}>
            <span style={{ fontSize: 14, color: '#334155' }}>{label}</span>
            <span style={{
                fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 12,
                background: allowed ? '#dcfce7' : '#fee2e2',
                color: allowed ? '#166534' : '#991b1b',
            }}>
                {allowed ? '✓ Có' : '✗ Không'}
            </span>
        </div>
    );
}
