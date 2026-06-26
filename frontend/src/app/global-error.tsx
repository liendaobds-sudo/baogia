'use client';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html lang="vi">
            <body style={{ margin: 0, fontFamily: "'Inter', sans-serif" }}>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '100vh',
                    padding: 40,
                    textAlign: 'center',
                    background: '#f8fafc',
                }}>
                    <div style={{ fontSize: 56, marginBottom: 16 }}>💥</div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                        Lỗi hệ thống
                    </h1>
                    <p style={{ fontSize: 14, color: '#64748b', marginBottom: 24, maxWidth: 420, lineHeight: 1.6 }}>
                        Ứng dụng gặp lỗi nghiêm trọng. Vui lòng thử lại hoặc tải lại trang.
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
                    <div style={{ display: 'flex', gap: 12 }}>
                        <button
                            onClick={reset}
                            style={{
                                padding: '10px 24px', background: '#2563eb', color: '#fff',
                                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer',
                            }}
                        >
                            🔄 Thử lại
                        </button>
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                padding: '10px 24px', background: '#f1f5f9', color: '#334155',
                                border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer',
                            }}
                        >
                            ↻ Tải lại trang
                        </button>
                    </div>
                </div>
            </body>
        </html>
    );
}
