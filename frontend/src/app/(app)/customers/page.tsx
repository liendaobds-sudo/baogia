'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Trang Khách hàng CSKH — redirect sang CRM chính tại App Báo giá/ERP.
 *
 * Khách hàng là thực thể trung tâm của ERP, được quản lý tập trung tại
 * `/pricing/customers` với đầy đủ tính năng: lifecycle pipeline, lịch sử
 * báo giá, timeline tương tác, inline edit. Route này giữ lại để không
 * phá bookmark/link cũ — tự động chuyển hướng.
 */
export default function CustomersRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/pricing/customers');
    }, [router]);

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#94a3b8' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ width: 36, height: 36, border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
                Đang chuyển hướng đến Quản lý Khách hàng...
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        </div>
    );
}
