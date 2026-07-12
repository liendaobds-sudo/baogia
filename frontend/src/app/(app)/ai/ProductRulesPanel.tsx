'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';

const PRICING_API = 'http://localhost:4000/api/v1/erp';

interface ProductField {
    id: number;
    template_id: number;
    field_name: string;
    field_code?: string;
    field_type: string;
    label: string;
    required: number;
    default_value: string | null;
    options: Record<string, any>;
    sort_order: number;
    ai_question?: string;
    ai_keywords?: string[];
}

interface ProductTemplate {
    id: number;
    code: string;
    name: string;
    product_type: string;
    parent_category: string;
    keywords: string[];
    icon: string | null;
    is_active: number;
    fields: ProductField[];
    field_count: number;
    required_count: number;
}

const TYPE_INFO: Record<string, { label: string; color: string; icon: string; bg: string }> = {
    loose: { label: 'Sản phẩm rời', color: '#4f46e5', icon: '📄', bg: '#eef2ff' },
    bound: { label: 'Sản phẩm cuốn', color: '#7c3aed', icon: '📕', bg: '#f5f3ff' },
    large_format: { label: 'Khổ lớn', color: '#0891b2', icon: '🖼️', bg: '#ecfeff' },
};

const FIELD_TYPE_LABELS: Record<string, string> = {
    number: '🔢 Số',
    text: '✏️ Văn bản',
    select: '📋 Chọn 1',
    multiselect: '☑️ Chọn nhiều',
};

export default function ProductRulesPanel() {
    const { token } = useAuth();
    const [templates, setTemplates] = useState<ProductTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [editingField, setEditingField] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [confirmDeleteFieldId, setConfirmDeleteFieldId] = useState<number | null>(null);
    const [filter, setFilter] = useState<string>('all');

    // Backend /erp/* yêu cầu JWT → luôn đính token (trước đây gọi trần → 401 sau khi khoá auth).
    const authHeaders = useCallback((json = false): Record<string, string> => {
        const h: Record<string, string> = {};
        if (token) h['Authorization'] = `Bearer ${token}`;
        if (json) h['Content-Type'] = 'application/json';
        return h;
    }, [token]);

    const fetchTemplates = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${PRICING_API}/products`, { headers: authHeaders() });
            if (res.ok) {
                const data = await res.json();
                setTemplates(data.data || data || []);
            }
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, [authHeaders]);

    useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    const saveField = async (fieldId: number, updates: Partial<ProductField>) => {
        setSaving(true);
        try {
            const res = await fetch(`${PRICING_API}/ai-fields/${fieldId}`, {
                method: 'PUT',
                headers: authHeaders(true),
                body: JSON.stringify(updates),
            });
            if (res.ok) {
                showToast('✅ Đã lưu thay đổi');
                fetchTemplates();
                setEditingField(null);
            }
        } catch (err) { showToast('❌ Lỗi khi lưu'); }
        finally { setSaving(false); }
    };

    const deleteField = async (fieldId: number) => {
        try {
            await fetch(`${PRICING_API}/ai-fields/${fieldId}`, { method: 'DELETE', headers: authHeaders() });
            setConfirmDeleteFieldId(null);
            showToast('🗑️ Đã xóa');
            fetchTemplates();
        } catch (err) { showToast('❌ Lỗi khi xóa'); }
    };

    const addField = async (templateId: number) => {
        try {
            await fetch(`${PRICING_API}/products/${templateId}/ai-fields`, {
                method: 'POST',
                headers: authHeaders(true),
                body: JSON.stringify({
                    field_name: 'new_field',
                    field_type: 'text',
                    label: 'Trường mới',
                    required: 0,
                    sort_order: 99,
                }),
            });
            showToast('➕ Đã thêm trường mới');
            fetchTemplates();
        } catch (err) { showToast('❌ Lỗi'); }
    };

    const filtered = filter === 'all' ? templates : templates.filter(t => t.product_type === filter);

    // Group by product_type
    const groups = filtered.reduce((acc, t) => {
        const key = t.product_type || 'other';
        if (!acc[key]) acc[key] = [];
        acc[key].push(t);
        return acc;
    }, {} as Record<string, ProductTemplate[]>);

    if (loading) return (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#4f46e5', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
            Đang tải product rules...
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    return (
        <div>
            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', top: 20, right: 20, zIndex: 999,
                    padding: '10px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600,
                    background: toast.startsWith('✅') ? '#dcfce7' : toast.startsWith('❌') ? '#fef2f2' : '#dbeafe',
                    color: toast.startsWith('✅') ? '#16a34a' : toast.startsWith('❌') ? '#dc2626' : '#2563eb',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                    animation: 'slideIn 200ms ease',
                }}>{toast}</div>
            )}
            <style>{`@keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>

            {/* Header + Filter */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                        🤖 AI Product Rules
                        <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 8, background: '#eef2ff', color: '#4f46e5', fontWeight: 600 }}>
                            {templates.length} sản phẩm
                        </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                        Cấu hình các trường thông tin AI cần hỏi cho từng loại sản phẩm
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
                    {[
                        { key: 'all', label: 'Tất cả' },
                        { key: 'loose', label: '📄 Rời' },
                        { key: 'bound', label: '📕 Cuốn' },
                        { key: 'large_format', label: '🖼️ Khổ lớn' },
                    ].map(f => (
                        <button key={f.key} onClick={() => setFilter(f.key)}
                            style={{
                                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                border: 'none', cursor: 'pointer',
                                background: filter === f.key ? '#fff' : 'transparent',
                                color: filter === f.key ? '#0f172a' : '#94a3b8',
                                boxShadow: filter === f.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                            }}
                        >{f.label}</button>
                    ))}
                </div>
            </div>

            {/* Product groups */}
            {Object.entries(groups).map(([type, products]) => {
                const info = TYPE_INFO[type] || { label: type, color: '#64748b', icon: '📦', bg: '#f8fafc' };
                return (
                    <div key={type} style={{ marginBottom: 24 }}>
                        <div style={{
                            fontSize: 13, fontWeight: 700, color: info.color,
                            marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                            <span>{info.icon}</span> {info.label}
                            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>({products.length})</span>
                        </div>

                        <div style={{ display: 'grid', gap: 8 }}>
                            {products.map(template => {
                                const isExpanded = expandedId === template.id;
                                return (
                                    <div key={template.id} style={{
                                        background: '#fff', borderRadius: 14,
                                        border: `1px solid ${isExpanded ? info.color + '30' : '#f1f5f9'}`,
                                        boxShadow: isExpanded ? `0 0 0 3px ${info.color}08` : '0 1px 2px rgba(0,0,0,0.03)',
                                        transition: 'all 200ms ease', overflow: 'hidden',
                                    }}>
                                        {/* Template Header */}
                                        <div onClick={() => setExpandedId(isExpanded ? null : template.id)}
                                            style={{
                                                padding: '14px 18px', cursor: 'pointer',
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <span style={{
                                                    width: 36, height: 36, borderRadius: 10, display: 'flex',
                                                    alignItems: 'center', justifyContent: 'center', fontSize: 16,
                                                    background: info.bg,
                                                }}>{info.icon}</span>
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
                                                        {template.name}
                                                    </div>
                                                    <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', gap: 8, marginTop: 2 }}>
                                                        <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '1px 6px', borderRadius: 4 }}>
                                                            {template.code}
                                                        </span>
                                                        {template.keywords?.slice(0, 3).map((k: string, i: number) => (
                                                            <span key={i} style={{ color: '#94a3b8' }}>#{k}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <span style={{
                                                    fontSize: 11, padding: '3px 10px', borderRadius: 8, fontWeight: 600,
                                                    background: (template.field_count || 0) > 0 ? '#dcfce7' : '#fef3c7',
                                                    color: (template.field_count || 0) > 0 ? '#16a34a' : '#d97706',
                                                }}>
                                                    {template.field_count || 0} trường
                                                    {(template.required_count || 0) > 0 && ` (${template.required_count} bắt buộc)`}
                                                </span>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"
                                                    style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 200ms' }}>
                                                    <polyline points="6 9 12 15 18 9" />
                                                </svg>
                                            </div>
                                        </div>

                                        {/* Expanded: Fields List */}
                                        {isExpanded && (
                                            <div style={{ borderTop: '1px solid #f1f5f9' }}>
                                                {(template.fields || []).length === 0 ? (
                                                    <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                                                        Chưa có trường nào. Bấm &quot;Thêm trường&quot; để bắt đầu.
                                                    </div>
                                                ) : (
                                                    <div style={{ padding: '4px 0' }}>
                                                        {/* Fields table header */}
                                                        <div style={{
                                                            display: 'grid', gridTemplateColumns: '40px 1fr 100px 80px 80px 60px',
                                                            padding: '8px 18px', fontSize: 11, fontWeight: 600, color: '#94a3b8',
                                                            background: '#f8fafc',
                                                        }}>
                                                            <span>#</span>
                                                            <span>TÊN TRƯỜNG</span>
                                                            <span>LOẠI</span>
                                                            <span style={{ textAlign: 'center' }}>BẮT BUỘC</span>
                                                            <span>MẶC ĐỊNH</span>
                                                            <span></span>
                                                        </div>

                                                        {template.fields.map((field, idx) => (
                                                            <div key={field.id} style={{
                                                                display: 'grid', gridTemplateColumns: '40px 1fr 100px 80px 80px 60px',
                                                                padding: '10px 18px', alignItems: 'center',
                                                                borderBottom: idx < template.fields.length - 1 ? '1px solid #f8fafc' : 'none',
                                                                fontSize: 13, transition: 'background 150ms',
                                                            }}
                                                                onMouseEnter={e => { e.currentTarget.style.background = '#f8faff'; }}
                                                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                                            >
                                                                <span style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 600 }}>{idx + 1}</span>
                                                                <div>
                                                                    <div style={{ fontWeight: 600, color: '#0f172a' }}>
                                                                        {field.label || field.field_name}
                                                                    </div>
                                                                    <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
                                                                        {field.field_code || field.field_name}
                                                                        {field.ai_question && (
                                                                            <span style={{ marginLeft: 8, color: '#7c3aed', fontFamily: 'inherit' }}>
                                                                                💬 &quot;{field.ai_question.substring(0, 50)}...&quot;
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <span style={{
                                                                    fontSize: 11, padding: '2px 8px', borderRadius: 6,
                                                                    background: '#f1f5f9', color: '#64748b', fontWeight: 500,
                                                                }}>
                                                                    {FIELD_TYPE_LABELS[field.field_type] || field.field_type || '—'}
                                                                </span>
                                                                <div style={{ textAlign: 'center' }}>
                                                                    <span onClick={() => saveField(field.id, { required: field.required ? 0 : 1 })}
                                                                        style={{
                                                                            cursor: 'pointer', fontSize: 16, display: 'inline-block',
                                                                            transition: 'transform 150ms',
                                                                        }}
                                                                        title={field.required ? 'Bắt buộc — bấm để tắt' : 'Tùy chọn — bấm để bật'}
                                                                    >
                                                                        {field.required ? '✅' : '⬜'}
                                                                    </span>
                                                                </div>
                                                                <span style={{ fontSize: 12, color: '#94a3b8' }}>
                                                                    {field.default_value || '—'}
                                                                </span>
                                                                <div style={{ display: 'flex', gap: 4 }}>
                                                                    {confirmDeleteFieldId === field.id ? (
                                                                        <>
                                                                            <button onClick={() => deleteField(field.id)}
                                                                                title="Xác nhận xóa"
                                                                                style={{
                                                                                    width: 24, height: 24, borderRadius: 6, border: 'none',
                                                                                    background: '#dc2626', color: '#fff', cursor: 'pointer',
                                                                                    fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                                }}>✓</button>
                                                                            <button onClick={() => setConfirmDeleteFieldId(null)}
                                                                                title="Hủy"
                                                                                style={{
                                                                                    width: 24, height: 24, borderRadius: 6, border: '1px solid #e2e8f0',
                                                                                    background: '#f8fafc', color: '#64748b', cursor: 'pointer',
                                                                                    fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                                }}>✕</button>
                                                                        </>
                                                                    ) : (
                                                                        <button onClick={() => setConfirmDeleteFieldId(field.id)}
                                                                            title="Xóa trường"
                                                                            style={{
                                                                                width: 24, height: 24, borderRadius: 6, border: 'none',
                                                                                background: '#fef2f2', color: '#dc2626', cursor: 'pointer',
                                                                                fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                            }}>✕</button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Add field button */}
                                                <div style={{ padding: '10px 18px', borderTop: '1px solid #f1f5f9' }}>
                                                    <button onClick={() => addField(template.id)}
                                                        style={{
                                                            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                                            background: '#f8fafc', border: '1px dashed #cbd5e1',
                                                            color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                                        }}
                                                    >
                                                        ➕ Thêm trường
                                                    </button>
                                                </div>

                                                {/* AI Preview */}
                                                {(template.fields || []).length > 0 && (
                                                    <div style={{
                                                        margin: '0 18px 14px', padding: '12px 16px', borderRadius: 10,
                                                        background: '#fefce8', border: '1px solid #fde68a',
                                                    }}>
                                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#854d0e', marginBottom: 8 }}>
                                                            💡 AI sẽ hỏi khách:
                                                        </div>
                                                        <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.8 }}>
                                                            {template.fields
                                                                .filter(f => f.required)
                                                                .map((f, i) => (
                                                                    <div key={f.id}>
                                                                        <strong>{i + 1}.</strong>{' '}
                                                                        {f.ai_question || `${f.label || f.field_name}?`}
                                                                        {(f.options?.choices || f.options?.labels) && (
                                                                            <span style={{ color: '#b45309', fontSize: 11 }}>
                                                                                {' '}({(f.options?.labels || f.options?.choices || []).slice(0, 4).join(', ')}
                                                                                {(f.options?.choices || []).length > 4 ? '...' : ''})
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            {template.fields.filter(f => !f.required).length > 0 && (
                                                                <div style={{ marginTop: 4, color: '#a16207', fontStyle: 'italic' }}>
                                                                    + {template.fields.filter(f => !f.required).length} trường tùy chọn
                                                                    ({template.fields.filter(f => !f.required).map(f => f.label || f.field_name).join(', ')})
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
