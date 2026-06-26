'use client';

import { useEffect } from 'react';

export default function AppError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log to error reporting service in production
        if (process.env.NODE_ENV === 'production') {
            // TODO: Integrate with error reporting (e.g., Sentry)
        }
    }, [error]);

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '50vh',
            padding: 40,
            textAlign: 'center',
        }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{
                fontSize: 20,
                fontWeight: 600,
                color: '#0f172a',
                marginBottom: 8,
            }}>
                Đã xảy ra lỗi
            </h2>
            <p style={{
                fontSize: 14,
                color: '#64748b',
                marginBottom: 24,
                maxWidth: 400,
            }}>
                Ứng dụng gặp sự cố không mong muốn. Vui lòng thử lại hoặc liên hệ quản trị viên nếu lỗi tiếp tục.
            </p>
            {process.env.NODE_ENV !== 'production' && (
                <pre style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 8,
                    padding: 16,
                    fontSize: 12,
                    color: '#dc2626',
                    maxWidth: 500,
                    overflow: 'auto',
                    marginBottom: 24,
                    textAlign: 'left',
                    whiteSpace: 'pre-wrap',
                }}>
                    {error.message}
                </pre>
            )}
            <button
                onClick={reset}
                style={{
                    padding: '10px 24px',
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                }}
            >
                🔄 Thử lại
            </button>
        </div>
    );
}
