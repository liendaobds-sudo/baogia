'use client';

import { useAuth } from '@/lib/auth-context';
import { SocketProvider, useSocket } from '@/lib/socket-context';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';

import { NotificationBell } from './_components/notification-bell';
import { resolveMenu } from '@/lib/scope/ia-resolver';
import { scopeRegistry } from '@/lib/scope/registry';
import { useEnabledApps } from '@/lib/scope/use-enabled-apps';
import { FrozenRouteGuard } from '@/components/FrozenRouteGuard';
import { CskhRouteGuard } from '@/components/CskhRouteGuard';

const ROLE_LABELS: Record<string, string> = {
    super_admin: 'Super Admin',
    admin: 'Quản trị viên',
    supervisor: 'Giám sát',
    agent: 'Nhân viên',
    viewer: 'Chỉ xem',
};

function AppLayoutInner({ children }: { children: React.ReactNode }) {
    const { user, logout } = useAuth();
    const { socket } = useSocket();
    const pathname = usePathname();
    // Tập Trục_Ứng_Dụng khả dụng của tenant — lọc menu CSKH theo Cờ_Phạm_Vi (Req 5.2).
    const { enabledApps, loaded: appsLoaded } = useEnabledApps();
    const [notifCount, setNotifCount] = useState(0);
    const [notifItems, setNotifItems] = useState<{ convId: string; text: string; time: string; label: string; count: number }[]>([]);

    // Impersonation: tên tenant đang truy cập (nếu có phiên backup super-admin).
    const [impTenantName, setImpTenantName] = useState<string | null>(null);
    useEffect(() => {
        if (typeof window !== 'undefined' && localStorage.getItem('imp_sa_token')) {
            setImpTenantName(localStorage.getItem('imp_tenant_name') || 'tenant');
        }
    }, [pathname]);

    // Thoát impersonation: khôi phục phiên super-admin đã sao lưu rồi về /super-admin.
    const exitImpersonation = useCallback(() => {
        const saToken = localStorage.getItem('imp_sa_token');
        const saUser = localStorage.getItem('imp_sa_user');
        const saRefresh = localStorage.getItem('imp_sa_refresh');
        if (saToken) localStorage.setItem('zh_token', saToken);
        if (saUser) localStorage.setItem('zh_user', saUser);
        if (saRefresh) localStorage.setItem('zh_refresh_token', saRefresh);
        localStorage.removeItem('imp_sa_token');
        localStorage.removeItem('imp_sa_user');
        localStorage.removeItem('imp_sa_refresh');
        localStorage.removeItem('imp_tenant_name');
        window.location.href = '/super-admin';
    }, []);

    // Dynamic browser tab title based on current route
    useEffect(() => {
        const titleMap: Record<string, string> = {
            '/inbox': 'Inbox',
            '/customers': 'Khách hàng',
            '/dashboard': 'Dashboard',
            '/ai': 'AI & Kiến thức',
            '/test-chat': 'Test Chat',
            '/reports': 'Báo cáo',
            '/settings': 'Cài đặt',
            '/super-admin': 'Super Admin',
            '/profile': 'Hồ sơ',
        };
        const matchedKey = Object.keys(titleMap).find(key => pathname.startsWith(key));
        document.title = matchedKey ? titleMap[matchedKey] : 'ZeplaoPrint';
    }, [pathname]);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('zh_sidebar_collapsed') === 'true';
        }
        return false;
    });

    const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
        pricing: pathname.startsWith('/pricing')
    });

    const [sidebarWidth, setSidebarWidth] = useState(() => {
        if (typeof window !== 'undefined') {
            return Number(localStorage.getItem('zh_app_sidebar_width')) || 240;
        }
        return 240;
    });

    const [isResizing, setIsResizing] = useState(false);

    // Handle resizing logic
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = 'none'; // Prevent text selection during drag
        document.body.classList.add('resizing-sidebar');
    };

    const handleMouseMove = (e: MouseEvent) => {
        let newWidth = e.clientX;
        if (newWidth < 200) newWidth = 200;
        if (newWidth > 400) newWidth = 400;
        setSidebarWidth(newWidth);
    };

    const handleMouseUp = (e: MouseEvent) => {
        setIsResizing(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = '';
        document.body.classList.remove('resizing-sidebar');
        setSidebarWidth((width) => {
            localStorage.setItem('zh_app_sidebar_width', String(width));
            return width;
        });
    };

    const toggleMenu = (key: string) => {
        setExpandedMenus(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const toggleSidebar = () => {
        setSidebarCollapsed(prev => {
            const next = !prev;
            localStorage.setItem('zh_sidebar_collapsed', String(next));
            return next;
        });
    };

    const seenNotifIds = useRef(new Set<string>());

    useEffect(() => {
        if (!socket) return;
        const handleNewMsg = (data: { conversationId: string; message: { id?: string; senderType: string; content: string } }) => {
            if (data.message.senderType === 'customer') {
                const msgId = data.message.id || `${data.conversationId}_${Date.now()}`;
                if (seenNotifIds.current.has(msgId)) return;
                seenNotifIds.current.add(msgId);
                if (seenNotifIds.current.size > 200) {
                    seenNotifIds.current = new Set(Array.from(seenNotifIds.current).slice(-100));
                }

                // Skip notification if user is viewing this conversation
                if (pathname === '/inbox' && typeof window !== 'undefined') {
                    const params = new URLSearchParams(window.location.search);
                    if (params.get('conv') === data.conversationId) return;
                }

                setNotifCount(c => c + 1);

                // Group notifications by conversation
                setNotifItems(prev => {
                    const convId = data.conversationId;
                    const shortId = convId.substring(0, 8);
                    const preview = data.message.content.substring(0, 60) + (data.message.content.length > 60 ? '...' : '');
                    const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

                    // Check if conversation already has a notification
                    const existingIdx = prev.findIndex(n => n.convId === convId);
                    if (existingIdx >= 0) {
                        // Update existing notification
                        const updated = [...prev];
                        const existing = updated[existingIdx];
                        updated.splice(existingIdx, 1); // remove old position
                        updated.unshift({
                            ...existing,
                            text: preview,
                            time: timeStr,
                            count: (existing.count || 1) + 1,
                        });
                        return updated.slice(0, 10);
                    }

                    // New conversation notification
                    return [{
                        convId,
                        text: preview,
                        time: timeStr,
                        label: `💬 Khách (${shortId}...)`,
                        count: 1,
                    }, ...prev].slice(0, 10);
                });
            }
        };
        const handleNewConv = () => {
            setNotifCount(c => c + 1);
            setNotifItems(prev => [{
                convId: '',
                text: 'Hội thoại mới từ khách hàng',
                time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                label: '🆕 Hội thoại mới',
                count: 1,
            }, ...prev].slice(0, 10));
        };
        const handleProactiveFollowUp = (data: any) => {
            setNotifCount(c => c + 1);
            setNotifItems(prev => [{
                convId: data.conversationId,
                text: `[AI Follow-up] ${data.contactName}: ${data.message}`,
                time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                label: '🤖 AI Gợi ý',
                count: 1,
            }, ...prev].slice(0, 10));
        };

        const handleFollowUpDue = (data: any) => {
            setNotifCount(c => c + 1);
            setNotifItems(prev => [{
                convId: data.conversationId,
                text: `[Lịch nhắc] Đến hạn nhắc nhở khách hàng: ${data.message.substring(0, 50)}...`,
                time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                label: '⏰ Nhắc việc',
                count: 1,
            }, ...prev].slice(0, 10));
        };

        socket.on('new_message', handleNewMsg);
        socket.on('new_conversation', handleNewConv);
        socket.on('proactive_followup', handleProactiveFollowUp);
        socket.on('follow_up_due', handleFollowUpDue);

        return () => { 
            socket.off('new_message', handleNewMsg); 
            socket.off('new_conversation', handleNewConv); 
            socket.off('proactive_followup', handleProactiveFollowUp);
            socket.off('follow_up_due', handleFollowUpDue);
        };
    }, [socket, pathname]);

    if (!user) return null;

    const svgIcon = (d: string) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;

    // Siêu dữ liệu hiển thị (nhãn + icon) theo `navItem`. Đây là nguồn metadata
    // giữ nguyên giao diện; danh sách mục THẬT SỰ hiển thị được suy dẫn từ Scope
    // Registry qua `resolveMenu` (Req 4.1, 4.3, 4.5) — không hardcode để tránh lọt
    // tính năng đã đóng băng (vd. super-admin).
    const navMeta: Record<string, { label: string; icon: React.ReactNode }> = {
        inbox: { label: 'Inbox', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg> },
        contacts: { label: 'Danh bạ liên hệ', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
        customers: { label: 'Khách hàng', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
        dashboard: { label: 'Dashboard', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
        ai: { label: 'AI & Kiến thức', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v2a6 6 0 0 0 6 6h4a6 6 0 0 0 6-6v-2a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z"/><line x1="9" y1="12" x2="9" y2="12.01"/><line x1="15" y1="12" x2="15" y2="12.01"/><path d="M8 18s1.5 2 4 2 4-2 4-2"/></svg> },
        'test-chat': { label: 'Test Chat', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
        reports: { label: 'Báo cáo', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
        settings: { label: 'Cài đặt', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
        'super-admin': { label: 'Super Admin', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
    };

    // Menu chính suy dẫn từ Scope Registry: chỉ các Tính_Năng_Lõi của trục CSKH
    // (và shared) có `navItem`; mọi mục frozen/removed bị ẩn (Req 4.1, 4.3).
    // Lọc thêm theo Cờ_Phạm_Vi Trục: nếu tenant tắt CSKH → ẩn mục `axis==='cskh'`
    // (giữ `shared`/`baogia`). Fail-open khi chưa tải xong (Req 5.2, 5.3, 5.4).
    const navItems: { href: string; label: string; icon: React.ReactNode }[] = resolveMenu(scopeRegistry, 'cskh')
        .filter((item) => {
            if (appsLoaded && !enabledApps.includes('cskh') && item.axis === 'cskh') return false;
            return true;
        })
        .map((item) => {
            const meta = navMeta[item.navItem];
            return {
                href: item.href,
                label: meta?.label ?? item.navItem,
                icon: meta?.icon ?? null,
            };
        });

    return (
        <>
            <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`} style={{ '--sidebar-w': sidebarWidth + 'px' } as React.CSSProperties}>
                <div className="sidebar-logo">
                    🔵 <span>ZeplaoPrint</span>
                </div>
                <nav className="sidebar-nav">
                    {navItems.map((item) => (
                        <div key={item.href} className="relative group flex flex-col">
                            <Link
                                href={item.href}
                                prefetch={true}
                                className={pathname.startsWith(item.href) ? 'active' : ''}
                            >
                                <span className="icon">{item.icon}</span>
                                <span className="nav-label">{item.label}</span>
                            </Link>

                            {/* Tooltip khi COLLAPSED và HOVER */}
                            {sidebarCollapsed && (
                                <div className="absolute left-full top-0 hidden group-hover:flex z-[9999] whitespace-nowrap pl-0.5 pt-1 pointer-events-none">
                                    <div className="bg-[#0f172a] border border-[rgba(255,255,255,0.1)] rounded-md shadow-2xl py-1.5 px-3">
                                        <div className="text-[13px] font-bold text-white tracking-wide">{item.label}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </nav>
                <div className="sidebar-bottom relative group" style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <div className="sidebar-bottom-text" style={{ fontSize: 12, color: '#64748b' }}>Kênh kết nối</div>
                    <div style={{ fontSize: 13, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                        🟢 <span className="sidebar-bottom-text" style={{ color: '#cbd5e1' }}>Zalo OA</span>
                    </div>
                    {sidebarCollapsed && (
                        <div className="absolute left-full top-1/2 -translate-y-1/2 hidden group-hover:flex z-[9999] whitespace-nowrap pl-0.5 pointer-events-none">
                            <div className="bg-[#0f172a] border border-[rgba(255,255,255,0.1)] rounded-md shadow-2xl py-1.5 px-3">
                                <div className="text-[13px] font-bold text-white tracking-wide">🟢 Zalo OA</div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="sidebar-bottom relative group" style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <Link href="/pricing/customers" target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#93c5fd', textDecoration: 'none', padding: '6px 0' }}>
                        👥 <span className="sidebar-bottom-text">Khách hàng</span>
                    </Link>
                    {sidebarCollapsed && (
                        <div className="absolute left-full top-1/2 -translate-y-1/2 hidden group-hover:flex z-[9999] whitespace-nowrap pl-0.5 pointer-events-none">
                            <div className="bg-[#0f172a] border border-[rgba(255,255,255,0.1)] rounded-md shadow-2xl py-1.5 px-3">
                                <div className="text-[13px] font-bold text-white tracking-wide">Khách hàng</div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="sidebar-bottom relative group" style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <Link href="/pricing/quotes" target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#93c5fd', textDecoration: 'none', padding: '6px 0' }}>
                        🖨️ <span className="sidebar-bottom-text">Hệ thống Báo giá</span>
                    </Link>
                    {sidebarCollapsed && (
                        <div className="absolute left-full top-1/2 -translate-y-1/2 hidden group-hover:flex z-[9999] whitespace-nowrap pl-0.5 pointer-events-none">
                            <div className="bg-[#0f172a] border border-[rgba(255,255,255,0.1)] rounded-md shadow-2xl py-1.5 px-3">
                                <div className="text-[13px] font-bold text-white tracking-wide">Hệ thống Báo giá</div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="relative group" style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'space-between' }}>
                    <Link href="/profile" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minWidth: 0, textDecoration: 'none' }}>
                        <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: '#2563eb', fontSize: 14, flexShrink: 0 }}>
                            {user.fullName.charAt(0)}
                        </span>
                        {!sidebarCollapsed && (
                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                <span style={{ fontSize: 13, fontWeight: 500, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {user.fullName}
                                </span>
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>{ROLE_LABELS[user.role] ?? user.role}</span>
                            </div>
                        )}
                    </Link>
                    
                    {!sidebarCollapsed && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button onClick={logout} title="Đăng xuất" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center', color: '#94a3b8', transition: 'color 0.15s' }}
                                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                                </svg>
                            </button>
                        </div>
                    )}

                    {sidebarCollapsed && (
                        <div className="absolute left-full top-1/2 -translate-y-1/2 hidden group-hover:flex z-[9999] whitespace-nowrap pl-0.5 pointer-events-none">
                            <div className="bg-[#0f172a] border border-[rgba(255,255,255,0.1)] rounded-md shadow-2xl py-1.5 px-3">
                                <div className="text-[13px] font-bold text-white tracking-wide">Hồ sơ cá nhân</div>
                            </div>
                        </div>
                    )}
                </div>
                <button className="sidebar-toggle" onClick={toggleSidebar} title={sidebarCollapsed ? 'Mở rộng' : 'Thu gọn'}>
                    {sidebarCollapsed ? '»' : '«'}
                    {!sidebarCollapsed && <span style={{ fontSize: 12 }}>Thu gọn</span>}
                </button>
            </aside>

            {!sidebarCollapsed && (
                <div 
                    className="w-1 cursor-col-resize hover:bg-blue-500 hover:w-1.5 fixed z-[60] top-0 bottom-0 transition-colors"
                    style={{ left: sidebarWidth - 2 }}
                    onMouseDown={handleMouseDown}
                />
            )}

            <div className={`main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`} style={{ '--sidebar-w': sidebarWidth + 'px' } as React.CSSProperties}>
                {impTenantName && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '8px 16px', background: '#f59e0b', color: '#1f2937', fontSize: 13, fontWeight: 600 }}>
                        <span>👁️ Đang truy cập tenant: <strong>{impTenantName}</strong> (phiên tạm — quyền quản trị tenant)</span>
                        <button onClick={exitImpersonation} style={{ padding: '4px 14px', background: '#1f2937', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            ← Thoát về Super Admin
                        </button>
                    </div>
                )}
                <FrozenRouteGuard registry={scopeRegistry}>
                    <CskhRouteGuard registry={scopeRegistry} cskhEnabled={enabledApps.includes('cskh')} loaded={appsLoaded}>
                        {children}
                    </CskhRouteGuard>
                </FrozenRouteGuard>
            </div>
        </>
    );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const { user, isLoading, logout } = useAuth();
    const router = useRouter();
    const [loadingTimeout, setLoadingTimeout] = useState(false);

    // Redirect to login if not authenticated
    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/login');
        }
    }, [user, isLoading, router]);

    // Safety timeout: if loading takes > 5s, show fallback
    useEffect(() => {
        if (!isLoading) return;
        const timer = setTimeout(() => setLoadingTimeout(true), 5000);
        return () => clearTimeout(timer);
    }, [isLoading]);

    if (isLoading || !user) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16 }}>
                <div style={{ color: '#94a3b8' }}>Đang tải...</div>
                {loadingTimeout && (
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>
                            Tải quá lâu? Có thể phiên đăng nhập đã hết hạn.
                        </p>
                        <button
                            onClick={() => { logout(); router.push('/login'); }}
                            style={{
                                padding: '8px 20px', background: '#2563eb', color: '#fff',
                                border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14,
                            }}
                        >
                            Quay về Đăng nhập
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <SocketProvider>
            <AppLayoutInner>{children}</AppLayoutInner>
        </SocketProvider>
    );
}

