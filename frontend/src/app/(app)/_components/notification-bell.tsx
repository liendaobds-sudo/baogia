'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';

interface NotifItem {
    convId: string;
    text: string;
    time: string;
    label: string;
    count: number;
}

interface NotificationBellProps {
    notifCount: number;
    notifItems: NotifItem[];
    onClearAll: () => void;
    onClearCount: () => void;
}

export function NotificationBell({ notifCount, notifItems, onClearAll, onClearCount }: NotificationBellProps) {
    const [showNotif, setShowNotif] = useState(false);

    const handleToggle = () => {
        setShowNotif(prev => !prev);
        if (showNotif) onClearCount();
    };

    return (
        <div style={{ position: 'relative' }}>
            <div
                className="notification-bell"
                onClick={handleToggle}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}
                title="Thông báo"
            >
                <Bell size={20} />
                {notifCount > 0 && (
                    <span className="badge" style={{ animation: 'pulse 1.5s ease-in-out infinite', right: -4, top: -4 }}>
                        {notifCount > 9 ? '9+' : notifCount}
                    </span>
                )}
            </div>

            {showNotif && (
                <div style={{
                    position: 'absolute', bottom: 40, left: 10, width: 300,
                    background: '#fff', border: '1px solid var(--border)', borderRadius: 12,
                    boxShadow: '0 8px 30px rgba(0,0,0,0.15)', zIndex: 50, overflow: 'hidden',
                }}>
                    <div style={{
                        padding: '12px 16px', borderBottom: '1px solid var(--border)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>Thông báo</span>
                        {notifItems.length > 0 && (
                            <button
                                onClick={() => { onClearAll(); onClearCount(); }}
                                style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                                Xóa tất cả
                            </button>
                        )}
                    </div>

                    {notifItems.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                            Không có thông báo mới
                        </div>
                    ) : notifItems.map((n, i) => (
                        <div
                            key={i}
                            style={{
                                padding: '10px 16px', borderBottom: '1px solid #f1f5f9',
                                fontSize: 13, cursor: n.convId ? 'pointer' : 'default',
                            }}
                            onClick={() => {
                                if (n.convId) {
                                    window.location.href = `/inbox?conv=${n.convId}`;
                                    setShowNotif(false);
                                }
                            }}
                        >
                            <div style={{
                                display: 'flex', justifyContent: 'space-between',
                                alignItems: 'center', marginBottom: 3,
                            }}>
                                <span style={{ fontWeight: 600, fontSize: 12, color: '#475569' }}>
                                    {n.label || '💬 Tin nhắn'}
                                </span>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                    {n.count > 1 && (
                                        <span style={{
                                            fontSize: 10, padding: '1px 6px', borderRadius: 8,
                                            background: '#fee2e2', color: '#dc2626', fontWeight: 600,
                                        }}>
                                            {n.count} tin
                                        </span>
                                    )}
                                    <span style={{ fontSize: 10, color: '#94a3b8' }}>{n.time}</span>
                                </div>
                            </div>
                            <div style={{
                                color: '#64748b', fontSize: 12, lineHeight: 1.4,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {n.text}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
