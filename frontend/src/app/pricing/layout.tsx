'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import PricingSidebar from './_components/PricingSidebar';
import { FrozenRouteGuard } from '@/components/FrozenRouteGuard';
import { MethodRouteGuard } from '@/components/MethodRouteGuard';
import { scopeRegistry } from '@/lib/scope/registry';
import { useEnabledMethods } from '@/lib/scope/use-enabled-methods';
import { ToastProvider } from '@/lib/ui/toast';

export default function PricingLayout({ children }: { children: React.ReactNode }) {
    const { user, isLoading } = useAuth();
    const router = useRouter();
    // Tập Phương_Pháp_Khả_Dụng của Đơn_Vị — nguồn để chặn route phương pháp không
    // khả dụng (MethodRouteGuard) và lọc menu trong sidebar (Req 2.2, 2.4).
    const { enabledMethods, loaded: methodsLoaded } = useEnabledMethods();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('zh_pricing_sidebar_collapsed') === 'true';
        }
        return false;
    });

    const [sidebarWidth, setSidebarWidth] = useState(() => {
        if (typeof window !== 'undefined') {
            return Number(localStorage.getItem('zh_pricing_sidebar_width')) || 240;
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
            localStorage.setItem('zh_pricing_sidebar_width', String(width));
            return width;
        });
    };

    // Redirect to login if not authenticated
    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/login');
        }
    }, [user, isLoading, router]);

    // Dynamic browser tab title for Pricing sub-pages
    const pathname = usePathname();
    useEffect(() => {
        const titleMap: Record<string, string> = {
            '/pricing/quotes': 'Báo giá',
            '/pricing/products': 'Sản phẩm',
            '/pricing/materials': 'Vật tư',
            '/pricing/customers': 'Khách hàng BG',
            '/pricing/settings': 'Cài đặt BG',
        };
        const matchedKey = Object.keys(titleMap).find(key => pathname.startsWith(key));
        document.title = matchedKey ? titleMap[matchedKey] : 'Hệ thống Báo giá';
    }, [pathname]);

    if (isLoading || !user) return null;

    const toggleSidebar = () => {
        setSidebarCollapsed(prev => {
            const next = !prev;
            localStorage.setItem('zh_pricing_sidebar_collapsed', String(next));
            return next;
        });
    };

    return (
        <ToastProvider>
            <div style={{ display: 'flex', minHeight: '100vh', position: 'relative', '--sidebar-w': sidebarWidth + 'px' } as React.CSSProperties}>
                <PricingSidebar
                    collapsed={sidebarCollapsed}
                    onToggle={toggleSidebar}
                    userName={user.fullName}
                />
                {!sidebarCollapsed && (
                    <div 
                        className="w-1 cursor-col-resize hover:bg-emerald-400 hover:w-1.5 fixed z-[60] top-0 bottom-0 transition-colors"
                        style={{ left: sidebarWidth - 2 }}
                        onMouseDown={handleMouseDown}
                    />
                )}
                <div 
                    className={`main-content flex-1 bg-slate-50 min-w-0 ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}
                >
                    <FrozenRouteGuard registry={scopeRegistry}>
                        <MethodRouteGuard
                            registry={scopeRegistry}
                            enabledMethods={enabledMethods}
                            loaded={methodsLoaded}
                            quoteEntryPoint="/pricing/quotes/start"
                        >
                            {children}
                        </MethodRouteGuard>
                    </FrozenRouteGuard>
                </div>
            </div>
        </ToastProvider>
    );
}
