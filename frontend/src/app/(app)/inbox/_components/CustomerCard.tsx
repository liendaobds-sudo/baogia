'use client';

import { useState, useEffect } from 'react';
import { API_URL } from '@/lib/api';

interface CustomerCardProps {
    token: string;
    phone?: string;
}

interface CustomerData {
    found: boolean;
    customer?: {
        id: number; code: string; name: string;
        phone: string; email: string; company: string;
    };
    stats?: { totalOrders: number; totalSpent: number; lastOrderDate: string };
    recentOrders?: { id: number; code: string; total: number; status: string; created_at: string }[];
    isNewCustomer?: boolean;
}

export function CustomerCard({ token, phone }: CustomerCardProps) {
    const [data, setData] = useState<CustomerData | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!phone || !token) { setData(null); return; }
        setLoading(true);
        fetch(`${API_URL}/erp/customers?action=lookup&phone=${encodeURIComponent(phone)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(j => setData(j.success ? j.data : { found: false }))
            .catch(() => setData({ found: false }))
            .finally(() => setLoading(false));
    }, [phone, token]);

    if (!phone) return null;
    if (loading) return <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Đang tra cứu...</div>;
    if (!data) return null;

    if (!data.found) {
        return (
            <div style={{ padding: 16 }}>
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#c2410c', marginBottom: 6 }}>🆕 Khách hàng mới</div>
                    <div style={{ fontSize: 12, color: '#9a3412' }}>Chưa có hồ sơ với SĐT <strong>{phone}</strong></div>
                    <div style={{ fontSize: 11, color: '#ea580c', marginTop: 6, fontStyle: 'italic' }}>
                        Khi tạo báo giá, hệ thống sẽ tự động tạo hồ sơ khách hàng.
                    </div>
                </div>
            </div>
        );
    }

    const c = data.customer!;
    const s = data.stats!;
    const formatCurrency = (n: number) => n ? n.toLocaleString('vi-VN') + 'đ' : '0đ';

    return (
        <div style={{ padding: 16 }}>
            {/* Profile */}
            <div style={{ background: 'linear-gradient(135deg, #eef2ff, #f8fafc)', border: '1px solid #e0e7ff', borderRadius: 12, padding: 16, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: '#c7d2fe', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18 }}>
                        {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: 15, color: '#1e293b' }}>{c.name}</div>
                        {c.company && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>🏢 {c.company}</div>}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: '#dbeafe', color: '#1d4ed8' }}>{c.code}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#f0fdf4', color: '#16a34a', fontFamily: 'monospace' }}>{c.phone}</span>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#1e293b' }}>{s.totalOrders}</div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Đơn hàng</div>
                </div>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: '#059669' }}>{formatCurrency(s.totalSpent)}</div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Tổng chi tiêu</div>
                </div>
            </div>

            {/* Recent Orders */}
            {data.recentOrders && data.recentOrders.length > 0 && (
                <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Báo giá gần đây</div>
                    {data.recentOrders.map(o => (
                        <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f8fafc', borderRadius: 8, marginBottom: 4, border: '1px solid #f1f5f9' }}>
                            <div>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5' }}>{o.code}</span>
                                <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 6 }}>{new Date(o.created_at).toLocaleDateString('vi-VN')}</span>
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 800, color: '#1e293b' }}>{formatCurrency(o.total)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
