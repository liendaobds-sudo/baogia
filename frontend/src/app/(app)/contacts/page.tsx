'use client';

import { useAuth } from '@/lib/auth-context';
import { downloadAuthenticatedFile } from '@/lib/authenticated-download';
import { useState, useEffect, useCallback, useRef } from 'react';

import { API_URL as API } from '@/lib/api';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';

interface ContactItem {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    phone: string | null;
    email: string | null;
    tags: string[];
    channel: { id: string; name: string; type: string } | null;
    conversationCount: number;
    lastContactAt: string | null;
    createdAt: string;
}

export default function ContactsPage() {
    const { token, authFetch } = useAuth();
    const [mounted, setMounted] = useState(false);
    const [contacts, setContacts] = useState<ContactItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<any>(null);
    const [editMode, setEditMode] = useState(false);
    const [editForm, setEditForm] = useState({ phone: '', email: '', tags: '' });

    const headers = useCallback(() => ({
        'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json',
    }), [token]);

    // Audit 2026-07-25: trước đây `fetchContacts` phụ thuộc TRỰC TIẾP vào `search` ⇒ mỗi ký tự
    // gõ là 1 request `LIKE %x%` + đếm hội thoại. Nay debounce 300ms (giống trang báo giá) và
    // huỷ request cũ bằng AbortController để response cũ không ghi đè response mới.
    const debouncedSearch = useDebouncedValue(search, 300);
    const fetchAbortRef = useRef<AbortController | null>(null);

    const fetchContacts = useCallback(async () => {
        fetchAbortRef.current?.abort();
        const controller = new AbortController();
        fetchAbortRef.current = controller;
        try {
            const params = new URLSearchParams({ page: String(page), limit: '15' });
            if (debouncedSearch) params.set('search', debouncedSearch);
            const res = await fetch(`${API}/contacts?${params}`, { headers: headers(), signal: controller.signal });
            if (res.ok) {
                const data = await res.json();
                setContacts(data.data || []);
                setTotal(data.total || 0);
            }
        } catch (err) {
            if ((err as Error)?.name !== 'AbortError') console.error(err);
        }
    }, [headers, page, debouncedSearch]);

    // Đổi từ khoá tìm kiếm ⇒ về trang 1 (tránh ở trang 5 của kết quả cũ mà kết quả mới chỉ 1 trang).
    useEffect(() => { setPage(1); }, [debouncedSearch]);

    // Huỷ request đang bay khi unmount.
    useEffect(() => () => fetchAbortRef.current?.abort(), []);

    const fetchDetail = useCallback(async (id: string) => {
        try {
            const res = await fetch(`${API}/contacts/${id}`, { headers: headers() });
            if (res.ok) setDetail(await res.json());
        } catch { /* ignore */ }
    }, [headers]);

    useEffect(() => { setMounted(true); }, []);
    useEffect(() => { if (mounted && token) fetchContacts(); }, [mounted, token, fetchContacts]);
    useEffect(() => { if (selectedId && token) fetchDetail(selectedId); }, [selectedId, token, fetchDetail]);

    const handleSaveEdit = async () => {
        if (!selectedId) return;
        await fetch(`${API}/contacts/${selectedId}`, {
            method: 'PUT', headers: headers(),
            body: JSON.stringify({
                phone: editForm.phone,
                email: editForm.email,
                tags: editForm.tags.split(',').map(t => t.trim()).filter(Boolean),
            }),
        });
        setEditMode(false);
        fetchContacts();
        fetchDetail(selectedId);
    };

    const handleExportCSV = async () => {
        try {
            await downloadAuthenticatedFile(
                authFetch,
                `${API}/contacts/export/csv`,
                'contacts.csv',
            );
        } catch (error) {
            console.error('Export contacts failed:', error);
        }
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

    const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';

    const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#d97706', '#dc2626', '#e11d48'];
    const getAvatarColor = (name: string) => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

    return (
        <div style={{ display: 'flex', height: '100vh', background: '#f8fafc' }}>
            {/* ── LEFT: Contact List ──────────────────── */}
            <div style={{
                width: 380, display: 'flex', flexDirection: 'column', background: '#fff',
                borderRight: '1px solid #e2e8f0',
            }}>
                {/* Header */}
                <div style={{ padding: '20px 20px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <div>
                            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" style={{ verticalAlign: -3, marginRight: 8 }}>
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                </svg>
                                Danh bạ liên hệ
                            </h2>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                                fontSize: 11, padding: '4px 10px', borderRadius: 20,
                                background: '#eef2ff', color: '#4f46e5', fontWeight: 600,
                            }}>{total} liên hệ</span>
                            <button onClick={handleExportCSV} title="Xuất CSV"
                                style={{
                                    width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0',
                                    background: '#fafbfc', cursor: 'pointer', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', transition: 'all 150ms',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#eef2ff'; e.currentTarget.style.borderColor = '#c7d2fe'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#fafbfc'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                            </button>
                        </div>
                    </div>

                    {/* Search */}
                    <div style={{ position: 'relative' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"
                            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input className="input" placeholder="Tìm theo tên, SĐT, email..." value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1); }}
                            style={{ width: '100%', paddingLeft: 38, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }} />
                    </div>
                </div>

                {/* Contact List */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {contacts.length === 0 ? (
                        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                            <div style={{ fontSize: 36, marginBottom: 12 }}>
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ margin: '0 auto' }}>
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                </svg>
                            </div>
                            <div style={{ fontSize: 13 }}>{search ? 'Không tìm thấy kết quả' : 'Chưa có liên hệ nào'}</div>
                        </div>
                    ) : contacts.map(c => (
                        <div key={c.id} onClick={() => setSelectedId(c.id)}
                            style={{
                                padding: '14px 20px', cursor: 'pointer',
                                borderBottom: '1px solid #f1f5f9',
                                background: selectedId === c.id ? '#eef2ff' : 'transparent',
                                borderLeft: selectedId === c.id ? '3px solid #4f46e5' : '3px solid transparent',
                                transition: 'all 150ms ease',
                            }}
                            onMouseEnter={e => { if (selectedId !== c.id) e.currentTarget.style.background = '#f8fafc'; }}
                            onMouseLeave={e => { if (selectedId !== c.id) e.currentTarget.style.background = 'transparent'; }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span style={{
                                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                                    background: `linear-gradient(135deg, ${getAvatarColor(c.displayName || '?')}20, ${getAvatarColor(c.displayName || '?')}35)`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 700, color: getAvatarColor(c.displayName || '?'), fontSize: 15,
                                }}>{c.displayName?.charAt(0) || '?'}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a', marginBottom: 2 }}>{c.displayName || 'Không tên'}</div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', gap: 10 }}>
                                        {c.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72" /></svg>
                                            {c.phone}
                                        </span>}
                                        {c.conversationCount > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                                            {c.conversationCount}
                                        </span>}
                                    </div>
                                </div>
                                <span style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 500 }}>{formatDate(c.lastContactAt)}</span>
                            </div>
                            {c.tags && c.tags.length > 0 && (
                                <div style={{ display: 'flex', gap: 4, marginTop: 6, marginLeft: 52 }}>
                                    {c.tags.slice(0, 3).map((t, i) => (
                                        <span key={i} style={{
                                            fontSize: 10, background: '#eef2ff', color: '#4f46e5',
                                            padding: '2px 8px', borderRadius: 6, fontWeight: 500,
                                        }}>{t}</span>
                                    ))}
                                    {c.tags.length > 3 && <span style={{ fontSize: 10, color: '#94a3b8' }}>+{c.tags.length - 3}</span>}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Pagination */}
                {total > 15 && (
                    <div style={{
                        padding: '12px 20px', borderTop: '1px solid #f1f5f9',
                        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8,
                    }}>
                        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                            style={{
                                padding: '6px 12px', fontSize: 12, borderRadius: 8,
                                background: page <= 1 ? '#f8fafc' : '#fff', border: '1px solid #e2e8f0',
                                cursor: page <= 1 ? 'default' : 'pointer', color: page <= 1 ? '#cbd5e1' : '#334155',
                            }}>← Trước</button>
                        <span style={{
                            fontSize: 12, color: '#64748b', padding: '4px 12px',
                            background: '#f1f5f9', borderRadius: 6, fontWeight: 600,
                        }}>Trang {page}</span>
                        <button disabled={contacts.length < 15} onClick={() => setPage(p => p + 1)}
                            style={{
                                padding: '6px 12px', fontSize: 12, borderRadius: 8,
                                background: contacts.length < 15 ? '#f8fafc' : '#fff', border: '1px solid #e2e8f0',
                                cursor: contacts.length < 15 ? 'default' : 'pointer', color: contacts.length < 15 ? '#cbd5e1' : '#334155',
                            }}>Sau →</button>
                    </div>
                )}
            </div>

            {/* ── RIGHT: Contact Detail ──────────────── */}
            <div style={{ flex: 1, overflowY: 'auto', background: '#f8fafc' }}>
                {detail ? (
                    <div style={{ padding: '28px 32px' }}>
                        {/* Profile Header */}
                        <div style={{
                            background: '#fff', borderRadius: 16, padding: '24px 28px', marginBottom: 20,
                            border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <span style={{
                                    width: 56, height: 56, borderRadius: 16,
                                    background: `linear-gradient(135deg, ${getAvatarColor(detail.displayName || '?')}, ${getAvatarColor(detail.displayName || '?')}cc)`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 700, color: '#fff', fontSize: 22,
                                    boxShadow: `0 4px 12px ${getAvatarColor(detail.displayName || '?')}40`,
                                }}>{detail.displayName?.charAt(0) || '?'}</span>
                                <div style={{ flex: 1 }}>
                                    <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#0f172a' }}>{detail.displayName}</h2>
                                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            padding: '2px 8px', borderRadius: 6,
                                            background: '#f0fdf4', color: '#16a34a', fontSize: 11, fontWeight: 600,
                                        }}>
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                                            {detail.channel?.name || 'Zalo OA'}
                                        </span>
                                        <span>Liên hệ từ {formatDate(detail.firstContactAt)}</span>
                                    </div>
                                </div>
                                <button onClick={() => {
                                    setEditMode(!editMode);
                                    setEditForm({ phone: detail.phone || '', email: detail.email || '', tags: (detail.tags || []).join(', ') });
                                }}
                                    style={{
                                        padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                                        background: editMode ? '#fef2f2' : '#f8fafc',
                                        border: `1px solid ${editMode ? '#fecaca' : '#e2e8f0'}`,
                                        color: editMode ? '#dc2626' : '#334155',
                                        cursor: 'pointer', transition: 'all 150ms',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                                >
                                    {editMode ? '✕ Hủy' : '✏️ Chỉnh sửa'}
                                </button>
                            </div>
                        </div>

                        {/* Edit Form */}
                        {editMode && (
                            <div style={{
                                background: '#fff', borderRadius: 16, padding: 20, marginBottom: 20,
                                border: '1px solid #e0e7ff', boxShadow: '0 0 0 3px #eef2ff',
                            }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 14 }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" style={{ verticalAlign: -3, marginRight: 6 }}>
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                    Chỉnh sửa thông tin
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>Điện thoại</label>
                                        <input className="input" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                                            style={{ borderRadius: 10, background: '#f8fafc' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>Email</label>
                                        <input className="input" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                                            style={{ borderRadius: 10, background: '#f8fafc' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>Tags (phẩy phân cách)</label>
                                        <input className="input" value={editForm.tags} onChange={e => setEditForm({ ...editForm, tags: e.target.value })}
                                            style={{ borderRadius: 10, background: '#f8fafc' }} />
                                    </div>
                                </div>
                                <button className="btn btn-primary" onClick={handleSaveEdit}
                                    style={{ marginTop: 14, padding: '8px 20px', fontSize: 13, borderRadius: 10, fontWeight: 600 }}>
                                    💾 Lưu thay đổi
                                </button>
                            </div>
                        )}

                        {/* Info Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
                            <InfoCard icon={
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0891b2" strokeWidth="2">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72" />
                                </svg>
                            } label="Điện thoại" value={detail.phone || '—'} color="#0891b2" />
                            <InfoCard icon={
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                                </svg>
                            } label="Email" value={detail.email || '—'} color="#7c3aed" />
                            <InfoCard icon={
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                            } label="Tổng tin nhắn" value={detail.totalMessages || 0} color="#2563eb" />
                        </div>

                        {/* Tags */}
                        {detail.tags && detail.tags.length > 0 && (
                            <div style={{
                                background: '#fff', borderRadius: 16, padding: '18px 20px', marginBottom: 20,
                                border: '1px solid #f1f5f9',
                            }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 10 }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ verticalAlign: -2, marginRight: 6 }}>
                                        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
                                    </svg>
                                    Tags
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {detail.tags.map((t: string, i: number) => (
                                        <span key={i} style={{
                                            fontSize: 12, background: '#eef2ff', color: '#4f46e5',
                                            padding: '4px 12px', borderRadius: 8, fontWeight: 500,
                                        }}>{t}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Conversations */}
                        <div style={{
                            background: '#fff', borderRadius: 16, padding: '18px 20px',
                            border: '1px solid #f1f5f9',
                        }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                                Lịch sử hội thoại
                                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>({detail.conversations?.length || 0})</span>
                            </div>
                            {(detail.conversations || []).length === 0 ? (
                                <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 20 }}>Chưa có hội thoại</div>
                            ) : (detail.conversations || []).map((conv: any) => (
                                <div key={conv.id} style={{
                                    padding: '12px 14px', borderRadius: 10, marginBottom: 8,
                                    border: '1px solid #f1f5f9', background: '#fafbfc',
                                    transition: 'all 150ms ease',
                                }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#e0e7ff'; e.currentTarget.style.background = '#f8faff'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#f1f5f9'; e.currentTarget.style.background = '#fafbfc'; }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{
                                                fontSize: 11, padding: '3px 10px', borderRadius: 6, fontWeight: 600,
                                                background: conv.status === 'new' ? '#dcfce7' : conv.status === 'closed' ? '#f1f5f9' : '#dbeafe',
                                                color: conv.status === 'new' ? '#16a34a' : conv.status === 'closed' ? '#94a3b8' : '#2563eb',
                                            }}>{conv.status === 'new' ? '🟢 Mới' : conv.status === 'closed' ? '⚪ Đóng' : '🔵 ' + conv.status}</span>
                                            {conv.assignee && <span style={{ fontSize: 12, color: '#64748b' }}>→ {conv.assignee.fullName}</span>}
                                        </div>
                                        <span style={{ fontSize: 11, color: '#cbd5e1' }}>{formatDate(conv.updatedAt)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1" style={{ margin: '0 auto 16px' }}>
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Chọn một liên hệ</div>
                            <div style={{ fontSize: 13 }}>để xem chi tiết thông tin</div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function InfoCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
    return (
        <div style={{
            padding: '18px 16px', background: '#fff', borderRadius: 14,
            border: '1px solid #f1f5f9',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            transition: 'all 200ms ease',
        }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
            <div style={{
                width: 36, height: 36, borderRadius: 10, marginBottom: 10,
                background: color + '12', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {icon}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{value}</div>
        </div>
    );
}
