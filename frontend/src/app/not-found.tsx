import Link from 'next/link';

export default function NotFound() {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: 40,
            textAlign: 'center',
            background: '#f8fafc',
            fontFamily: "'Inter', sans-serif",
        }}>
            <div style={{ fontSize: 64, marginBottom: 12 }}>🔍</div>
            <h1 style={{ fontSize: 72, fontWeight: 800, color: '#e2e8f0', margin: '0 0 8px', lineHeight: 1 }}>
                404
            </h1>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
                Không tìm thấy trang
            </h2>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 32, maxWidth: 400, lineHeight: 1.6 }}>
                Trang bạn đang tìm không tồn tại hoặc đã bị di chuyển.
            </p>
            <Link
                href="/inbox"
                style={{
                    padding: '10px 28px',
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 500,
                    textDecoration: 'none',
                    display: 'inline-block',
                }}
            >
                ← Về trang Inbox
            </Link>
        </div>
    );
}
