'use client';

import { useAuth } from '@/lib/auth-context';
import { useState, useEffect, useCallback } from 'react';

import { API_URL as API } from '@/lib/api';

interface CannedItem {
    id: string;
    title: string;
    content: string;
    category: string;
    shortcut: string;
    useCount: number;
    isGlobal: boolean;
    triggerKeywords: string;
    autoReply: boolean;
    createdAt: string;
}

const CATEGORIES = ['sản phẩm', 'kỹ thuật', 'giá cả', 'chính sách', 'chung'];
const CAT_COLORS: Record<string, { bg: string; color: string; icon: string; label: string }> = {
    'sản phẩm': { bg: '#dbeafe', color: '#2563eb', icon: '📦', label: 'Sản phẩm' },
    'kỹ thuật': { bg: '#dcfce7', color: '#16a34a', icon: '⚙️', label: 'Kỹ thuật' },
    'giá cả': { bg: '#fef3c7', color: '#d97706', icon: '💰', label: 'Giá cả' },
    'chính sách': { bg: '#ede9fe', color: '#7c3aed', icon: '📋', label: 'Chính sách' },
    'chung': { bg: '#f1f5f9', color: '#64748b', icon: '💬', label: 'Chung' },
};

export default function QuickRepliesPage() {
    const { token } = useAuth();
    const [mounted, setMounted] = useState(false);
    const [items, setItems] = useState<CannedItem[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [searchQ, setSearchQ] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [form, setForm] = useState({ title: '', content: '', category: 'chung', shortcut: '/', triggerKeywords: '', autoReply: false });
    const [formError, setFormError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const headers = useCallback(() => ({
        'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json',
    }), [token]);

    const fetchItems = useCallback(async () => {
        try {
            const res = await fetch(`${API}/canned-responses`, { headers: headers() });
            if (res.ok) {
                const data = await res.json();
                setItems(Array.isArray(data) ? data : []);
            }
        } catch (err) { console.error(err); }
    }, [headers]);

    useEffect(() => { setMounted(true); }, []);
    useEffect(() => { if (mounted && token) fetchItems(); }, [mounted, token, fetchItems]);

    const handleSave = async () => {
        // Validate client trước khi gửi (tránh tạo mẫu rỗng).
        if (!form.title.trim() || !form.content.trim()) {
            setFormError('Vui lòng nhập tiêu đề và nội dung.');
            return;
        }
        setSaving(true);
        setFormError(null);
        try {
            const res = editingId
                ? await fetch(`${API}/canned-responses/${editingId}`, {
                    method: 'PUT', headers: headers(), body: JSON.stringify(form),
                })
                : await fetch(`${API}/canned-responses`, {
                    method: 'POST', headers: headers(), body: JSON.stringify(form),
                });
            if (!res.ok) {
                setFormError(res.status === 401 || res.status === 403
                    ? 'Bạn không có quyền lưu mẫu trả lời.'
                    : `Lưu thất bại (lỗi ${res.status}).`);
                return;
            }
            setShowForm(false);
            setEditingId(null);
            setForm({ title: '', content: '', category: 'chung', shortcut: '/', triggerKeywords: '', autoReply: false });
            fetchItems();
        } catch (err) {
            console.error(err);
            setFormError('Không kết nối được máy chủ.');
        } finally { setSaving(false); }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`${API}/canned-responses/${id}`, { method: 'DELETE', headers: headers() });
            if (!res.ok) {
                setFormError(res.status === 401 || res.status === 403
                    ? 'Bạn không có quyền xóa mẫu trả lời.'
                    : `Xóa thất bại (lỗi ${res.status}).`);
                return;
            }
            setConfirmDeleteId(null);
            fetchItems();
        } catch (err) {
            console.error(err);
            setFormError('Không kết nối được máy chủ.');
        }
    };

    const startEdit = (item: CannedItem) => {
        setEditingId(item.id);
        setFormError(null);
        setForm({ title: item.title, content: item.content, category: item.category, shortcut: item.shortcut, triggerKeywords: item.triggerKeywords || '', autoReply: item.autoReply || false });
        setShowForm(true);
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

    const filtered = searchQ
        ? items.filter(i => i.title.toLowerCase().includes(searchQ.toLowerCase()) || i.content.toLowerCase().includes(searchQ.toLowerCase()) || (i.triggerKeywords || '').toLowerCase().includes(searchQ.toLowerCase()))
        : items;

    const grouped = CATEGORIES.map(cat => ({
        category: cat,
        items: filtered.filter(i => i.category === cat),
    })).filter(g => g.items.length > 0);

    return (
        <div style={{ padding: '24px 28px', background: '#f8fafc', minHeight: '100vh' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                        Trả lời nhanh
                    </h1>
                    <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Quản lý mẫu trả lời để tăng tốc hỗ trợ khách hàng</p>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, padding: '6px 12px', borderRadius: 10, background: '#eef2ff', color: '#4f46e5', fontWeight: 600 }}>
                        {items.length} mẫu
                    </span>
                    <button onClick={() => { setShowForm(true); setEditingId(null); setFormError(null); setForm({ title: '', content: '', category: 'chung', shortcut: '/', triggerKeywords: '', autoReply: false }); }}
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
                        Tạo mẫu
                    </button>
                </div>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 20 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"
                    style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}>
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input className="input" placeholder="Tìm kiếm mẫu trả lời..." value={searchQ}
                    onChange={e => setSearchQ(e.target.value)}
                    style={{ width: '100%', paddingLeft: 40, borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0' }} />
            </div>

            {/* Add/Edit Form */}
            {showForm && (
                <div style={{
                    background: '#fff', borderRadius: 16, padding: '22px 24px', marginBottom: 24,
                    border: '1px solid #e0e7ff', boxShadow: '0 0 0 3px #eef2ff',
                }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        {editingId ? 'Sửa mẫu' : 'Tạo mẫu mới'}
                    </div>
                    {formError && (
                        <div style={{
                            padding: '8px 14px', marginBottom: 14, borderRadius: 10, fontSize: 13, fontWeight: 500,
                            background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
                        }}>{formError}</div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Tiêu đề</label>
                            <input className="input" placeholder="VD: Chào khách mới" value={form.title}
                                onChange={e => setForm({ ...form, title: e.target.value })}
                                style={{ borderRadius: 10, background: '#f8fafc' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Danh mục</label>
                                <select className="input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                                    style={{ borderRadius: 10, background: '#f8fafc' }}>
                                    {CATEGORIES.map(c => <option key={c} value={c}>{(CAT_COLORS[c]?.label || c)}</option>)}
                                </select>
                            </div>
                            <div style={{ width: 110 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Phím tắt</label>
                                <input className="input" placeholder="/chao" value={form.shortcut}
                                    onChange={e => setForm({ ...form, shortcut: e.target.value })}
                                    style={{ borderRadius: 10, background: '#f8fafc', fontFamily: 'monospace' }} />
                            </div>
                        </div>
                    </div>
                    <div style={{ marginTop: 14 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>
                            🔑 Từ khóa kích hoạt <span style={{ fontWeight: 400, color: '#94a3b8' }}>(phân cách bằng dấu phẩy — AI dùng để khớp câu hỏi khách hàng)</span>
                        </label>
                        <input className="input" placeholder="VD: thanh toán, chuyển khoản, đặt cọc, COD" value={form.triggerKeywords}
                            onChange={e => setForm({ ...form, triggerKeywords: e.target.value })}
                            style={{ borderRadius: 10, background: '#f8fafc', width: '100%' }} />
                    </div>
                    <div style={{ marginTop: 14 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Nội dung trả lời</label>
                        <textarea className="input" rows={4} placeholder="Nội dung mẫu trả lời…" value={form.content}
                            onChange={e => setForm({ ...form, content: e.target.value })}
                            style={{ resize: 'vertical', fontFamily: 'inherit', borderRadius: 10, background: '#f8fafc', lineHeight: 1.6 }} />
                    </div>
                    <div style={{ marginTop: 10 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                            <input type="checkbox" checked={form.autoReply}
                                onChange={e => setForm({ ...form, autoReply: e.target.checked })}
                                style={{ width: 16, height: 16, accentColor: '#4f46e5' }} />
                            🤖 Tự động trả lời <span style={{ fontWeight: 400, color: '#94a3b8' }}>— AI sẽ tự gửi khi khớp từ khóa (không cần nhân viên xác nhận)</span>
                        </label>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                        <button onClick={handleSave}
                            style={{
                                padding: '8px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                                background: '#4f46e5', color: '#fff', border: 'none',
                                cursor: 'pointer', transition: 'all 150ms',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#4338ca'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#4f46e5'; }}
                        >{editingId ? '💾 Cập nhật' : '✨ Tạo mẫu'}</button>
                        <button onClick={() => { setShowForm(false); setEditingId(null); setFormError(null); }}
                            style={{
                                padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500,
                                background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0',
                                cursor: 'pointer', transition: 'all 150ms',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; }}
                        >Hủy</button>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {items.length === 0 && !showForm && (
                <div style={{
                    padding: 48, textAlign: 'center', background: '#fff', borderRadius: 16,
                    border: '1px solid #f1f5f9',
                }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ margin: '0 auto 12px', display: 'block' }}>
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Chưa có mẫu trả lời nhanh</div>
                    <div style={{ fontSize: 13, color: '#94a3b8' }}>Tạo mẫu để tăng tốc trả lời khách hàng</div>
                </div>
            )}

            {/* Grouped Items */}
            {grouped.map(group => {
                const cat = CAT_COLORS[group.category] || CAT_COLORS['Khác'];
                return (
                    <div key={group.category} style={{ marginBottom: 24 }}>
                        <div style={{
                            fontSize: 13, fontWeight: 700, color: '#64748b', marginBottom: 10,
                            display: 'flex', alignItems: 'center', gap: 8,
                            textTransform: 'uppercase', letterSpacing: 0.5,
                        }}>
                            <span style={{ fontSize: 14 }}>{cat.icon}</span>
                            {cat.label || group.category}
                            <span style={{
                                fontSize: 11, padding: '2px 8px', borderRadius: 6,
                                background: cat.bg, color: cat.color, fontWeight: 600,
                            }}>{group.items.length}</span>
                        </div>
                        <div style={{ display: 'grid', gap: 10 }}>
                            {group.items.map(item => (
                                <div key={item.id} style={{
                                    padding: '16px 18px', borderRadius: 14,
                                    background: '#fff', border: '1px solid #f1f5f9',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                                    transition: 'all 150ms ease',
                                }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#e0e7ff'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#f1f5f9'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)'; }}
                                >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                            <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{item.title}</span>
                                            <span style={{
                                                fontSize: 11, background: '#eef2ff', color: '#4f46e5',
                                                padding: '2px 8px', borderRadius: 6, fontFamily: 'monospace', fontWeight: 600,
                                            }}>{item.shortcut}</span>
                                        </div>
                                        {item.triggerKeywords && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>🔑</span>
                                                {item.triggerKeywords.split(',').slice(0, 6).map((kw, ki) => (
                                                    <span key={ki} style={{
                                                        fontSize: 11, padding: '1px 7px', borderRadius: 6,
                                                        background: '#fef3c7', color: '#92400e', fontWeight: 500,
                                                    }}>{kw.trim()}</span>
                                                ))}
                                                {item.triggerKeywords.split(',').length > 6 && (
                                                    <span style={{ fontSize: 11, color: '#94a3b8' }}>+{item.triggerKeywords.split(',').length - 6}</span>
                                                )}
                                                {item.autoReply && (
                                                    <span style={{
                                                        fontSize: 10, padding: '1px 6px', borderRadius: 6,
                                                        background: '#dcfce7', color: '#16a34a', fontWeight: 600, marginLeft: 4,
                                                    }}>🤖 Auto</span>
                                                )}
                                            </div>
                                        )}
                                        <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                            {item.content.length > 150 ? item.content.substring(0, 150) + '…' : item.content}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, marginLeft: 16 }}>
                                        <span style={{
                                            fontSize: 11, color: '#94a3b8', background: '#f1f5f9',
                                            padding: '3px 8px', borderRadius: 6, fontWeight: 600,
                                        }}>{item.useCount}×</span>
                                        <button onClick={() => startEdit(item)}
                                            style={{
                                                width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0',
                                                background: '#fff', cursor: 'pointer', display: 'flex',
                                                alignItems: 'center', justifyContent: 'center', transition: 'all 150ms',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.background = '#eef2ff'; e.currentTarget.style.borderColor = '#c7d2fe'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                                        >
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2">
                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                            </svg>
                                        </button>
                                        {confirmDeleteId === item.id ? (
                                            <>
                                                <button onClick={() => handleDelete(item.id)}
                                                    style={{
                                                        height: 30, borderRadius: 8, border: 'none', padding: '0 10px',
                                                        background: '#dc2626', color: '#fff', cursor: 'pointer',
                                                        fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center',
                                                    }}>✓ Xóa</button>
                                                <button onClick={() => setConfirmDeleteId(null)}
                                                    style={{
                                                        width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0',
                                                        background: '#f8fafc', cursor: 'pointer', display: 'flex',
                                                        alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#64748b',
                                                    }}>✕</button>
                                            </>
                                        ) : (
                                            <button onClick={() => setConfirmDeleteId(item.id)}
                                                style={{
                                                    width: 30, height: 30, borderRadius: 8, border: '1px solid #fecaca',
                                                    background: '#fff', cursor: 'pointer', display: 'flex',
                                                    alignItems: 'center', justifyContent: 'center', transition: 'all 150ms',
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
                                            >
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                                                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
