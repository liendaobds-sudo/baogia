'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useMemo, ReactNode } from 'react';
import { scopeRegistry } from '@/lib/scope/registry';
import {
  resolveMenu,
  isFrozenRoute,
  filterMenuByCapability,
  methodOfNavItem,
} from '@/lib/scope/ia-resolver';
import { useEnabledMethods } from '@/lib/scope/use-enabled-methods';
import type { MethodId } from '@/lib/scope/types';

interface NavChild {
  href: string;
  label: string;
  icon?: ReactNode;
  /**
   * Phương_Pháp_In mà mục con này gắn với, nếu có. Khi đặt, mục chỉ hiển thị nếu
   * phương pháp đó thuộc tập Phương_Pháp_Khả_Dụng của Đơn_Vị (Req 2.2).
   */
  method?: MethodId;
}

interface NavItem {
  href?: string;
  key?: string;
  label: string;
  icon: ReactNode;
  children?: NavChild[];
  /**
   * Các `navItem` trong Scope Registry mà nhóm điều hướng này đại diện (trục Báo giá).
   * Khi có giá trị, nhóm chỉ hiển thị nếu IA Resolver giữ ít nhất một trong các
   * navItem đó là Tính_Năng_Lõi (`resolveMenu(registry, 'baogia')`). Nếu tất cả bị
   * đóng băng/gỡ bỏ, nhóm sẽ tự ẩn. _Requirements: 4.2, 4.3_
   */
  scopeNavItems?: string[];
  /**
   * Phương_Pháp_In mà nhóm điều hướng này gắn với, nếu có (vd. `offset`). Khi đặt,
   * nhóm chỉ hiển thị nếu phương pháp đó thuộc tập Phương_Pháp_Khả_Dụng của Đơn_Vị;
   * nhóm không gắn `method` luôn giữ (Req 2.2). _Requirements: 2.2, 2.6_
   */
  method?: MethodId;
}

interface PricingSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  userName: string;
}

const navItems: NavItem[] = [
  { href: '/pricing', label: 'Dashboard', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  {
    key: 'pricing', label: 'Báo giá', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
    // Mục trục Báo giá: khung nhìn danh sách Báo giá (`quotes`, route /pricing/quotes)
    // cùng engine tạo báo giá (`pricing-create`). Hiển thị được suy dẫn từ registry.
    // Đơn hàng (`orders`) tách thành mục điều hướng riêng bên dưới. _Requirements: 4.7, 8.1_
    scopeNavItems: ['quotes', 'pricing-create'],
    children: [
      { href: '/pricing/quotes', label: 'Danh sách BG' },
      { href: '/pricing/quotes/new', label: 'BG Kỹ Thuật Số', method: 'digital' },
      { href: '/pricing/quotes/offset', label: 'BG Offset', method: 'offset' },
    ]
  },
  {
    // Mục trục Báo giá thứ hai: khung nhìn Đơn hàng (`orders`, route /pricing/orders),
    // tách riêng khỏi nhóm Báo giá để mỗi khung nhìn có mục điều hướng độc lập. Chỉ
    // hiển thị khi IA Resolver còn giữ navItem `orders` là Tính_Năng_Lõi của trục
    // `baogia`. _Requirements: 4.7, 8.1_
    href: '/pricing/orders', label: 'Đơn hàng', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
    scopeNavItems: ['orders'],
  },
  { href: '/pricing/products', label: 'Sản phẩm', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg> },
  { href: '/pricing/customers', label: 'Khách hàng', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>, scopeNavItems: ['customers'] },

  {
    key: 'master_data', label: 'Vật tư & Danh mục', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
    children: [
      { href: '/pricing/materials', label: 'Vật Tư' },
      { href: '/pricing/settings/paper-sizes', label: 'Khổ Giấy' },
      { href: '/pricing/settings/units', label: 'Đơn Vị Tính' },
      { href: '/pricing/settings/finishings', label: 'Danh Mục Gia Công' },
      { href: '/pricing/settings/print-types', label: 'Hệ Màu In' },
    ]
  },
  {
    key: 'settings_digital', label: 'Định mức In Nhanh', method: 'digital', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
    children: [
      { href: '/pricing/settings/pricing-tiers', label: 'Định Mức Khổ Nhỏ' },
      { href: '/pricing/settings/pricing-large-format', label: 'Định Mức Khổ Lớn' },
      { href: '/pricing/settings/waste-config', label: 'Bù Hao' },
      { href: '/pricing/settings/pricing-markup', label: 'Lợi Nhuận & Làm Tròn' },
    ]
  },
  {
    key: 'settings_offset', label: 'Định mức Offset', method: 'offset', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>,
    children: [
      { href: '/pricing/settings/offset-products', label: 'Cấu Hình Loại Offset' },
      { href: '/pricing/settings/offset-materials', label: 'Kẽm / Vật Tư / Ép Kim' },
      { href: '/pricing/settings/waste-stages', label: 'Bù Hao Theo Công Đoạn' },
      { href: '/pricing/settings/offset-fees', label: 'Phí & Chiết Khấu' },
    ]
  },
  { href: '/pricing/settings/company-info', label: 'Thông Tin Công Ty', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/></svg> },
  {
    key: 'admin', label: 'Quản trị', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    children: [
      { href: '/pricing/admin/users', label: 'Người Dùng' },
      { href: '/pricing/admin/roles', label: 'Vai Trò & Quyền' },
    ]
  },
];

/**
 * Một route có bị đóng băng/gỡ bỏ theo registry không (dùng để ẩn các mục dẫn tới
 * Tính_Năng_Phụ). An toàn với href rỗng/`#`. _Requirements: 4.3_
 */
function isHiddenRoute(href?: string): boolean {
  if (!href || href === '#') return false;
  return isFrozenRoute(scopeRegistry, href);
}

/**
 * Một mục (nhóm hoặc mục con) gắn Phương_Pháp_In có được phép hiển thị theo Cờ_Năng_Lực
 * không. Mục KHÔNG gắn `method` luôn giữ. Khi tập khả dụng CHƯA nạp xong (`!loaded`),
 * fail-open: không ẩn (tránh nhấp nháy menu trong lúc tải). _Requirements: 2.2, 2.6_
 */
function isMethodEnabled(
  item: { method?: MethodId },
  enabledMethods: MethodId[],
  loaded: boolean,
): boolean {
  if (!item.method) return true;
  if (!loaded) return true;
  return enabledMethods.includes(item.method);
}

/**
 * Quyết định một nhóm menu chính có hiển thị hay không, suy dẫn từ registry:
 * - Nhóm gắn `scopeNavItems` (Lõi Báo giá) chỉ hiển thị khi tập navItem khả dụng
 *   (đã lọc theo Cờ_Năng_Lực qua `filterMenuByCapability`) còn giữ ít nhất một mục.
 * - Nhóm chưa phân loại trong registry vẫn hiển thị, trừ khi route của nó trỏ tới
 *   một tính năng đang `frozen`/`removed`.
 * _Requirements: 4.2, 4.3, 4.5_
 */
function isNavItemVisible(
  item: NavItem,
  allowedBaogiaNavItems: Set<string>,
): boolean {
  if (item.scopeNavItems && item.scopeNavItems.length > 0) {
    return item.scopeNavItems.some((navItem) => allowedBaogiaNavItems.has(navItem));
  }
  return !isHiddenRoute(item.href);
}

export default function PricingSidebar({ collapsed, onToggle, userName }: PricingSidebarProps) {
  const pathname = usePathname();
  // Tập Phương_Pháp_Khả_Dụng của Đơn_Vị — nguồn để lọc menu theo Cờ_Năng_Lực (Req 2.1).
  const { enabledMethods, loaded: methodsLoaded } = useEnabledMethods();
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    pricing: true,
    pricing_tiers: false,
    settings: false,
    admin: false,
  });

  /**
   * Tập `navItem` Lõi của trục Báo giá SAU khi lọc theo Cờ_Năng_Lực: chạy
   * `filterMenuByCapability` ngay sau `resolveMenu()` (Design — IA capability
   * filtering). Mục không gắn Phương_Pháp_In luôn giữ; mục có method chỉ giữ khi
   * thuộc tập khả dụng. Trong lúc chưa nạp xong, fail-open (giữ nguyên menu).
   * _Requirements: 2.1, 2.2, 2.6_
   */
  const allowedBaogiaNavItems = useMemo(() => {
    const baseMenu = resolveMenu(scopeRegistry, 'baogia');
    const capableMenu = methodsLoaded
      ? filterMenuByCapability(baseMenu, enabledMethods, (navItem) =>
          methodOfNavItem(scopeRegistry, navItem),
        )
      : baseMenu;
    return new Set(capableMenu.map((item) => item.navItem));
  }, [enabledMethods, methodsLoaded]);

  /**
   * Menu hiển thị thực tế: lọc nhóm chính theo registry + Cờ_Năng_Lực, loại các mục
   * con trỏ tới tính năng đóng băng/gỡ bỏ hoặc Phương_Pháp_In không khả dụng; bỏ
   * nhóm rỗng sau khi lọc. _Requirements: 2.2, 2.6, 4.2, 4.3, 4.5_
   */
  const visibleNavItems = useMemo<NavItem[]>(
    () =>
      navItems
        .filter((item) => isNavItemVisible(item, allowedBaogiaNavItems))
        .filter((item) => isMethodEnabled(item, enabledMethods, methodsLoaded))
        .map((item) =>
          item.children
            ? {
                ...item,
                children: item.children.filter(
                  (child) =>
                    !isHiddenRoute(child.href) &&
                    isMethodEnabled(child, enabledMethods, methodsLoaded),
                ),
              }
            : item,
        )
        .filter((item) => !item.children || item.children.length > 0),
    [allowedBaogiaNavItems, enabledMethods, methodsLoaded],
  );

  const toggleMenu = (key: string) => {
    setExpandedMenus(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <aside 
      className={`sidebar ${collapsed ? 'collapsed' : ''}`} 
      style={{ backgroundColor: '#042412' }}
    >
      <div className="sidebar-logo">
        🖩 {!collapsed && <span>Báo Giá</span>}
      </div>
      <nav className="sidebar-nav">
        {visibleNavItems.map((item, idx) => {
          if (item.children) {
            const isExpanded = expandedMenus[item.key as string] && !collapsed;
            return (
              <div key={item.key || idx} className="menu-group relative group">
                <a
                  className="menu-group-header"
                  onClick={() => toggleMenu(item.key as string)}
                  // Xóa native title để dùng custom tooltip đẹp hơn
                  // title={collapsed ? item.label : undefined}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className="icon">{item.icon}</span>
                    <span className="nav-label">{item.label}</span>
                  </div>
                  {!collapsed && (
                    <svg className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} style={{ marginLeft: 'auto' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  )}
                </a>
                
                {/* Menu thả xuống khi KHÔNG collapsed */}
                {isExpanded && item.children.length > 0 && (
                  <div className="menu-group-children" style={{ marginBottom: 4 }}>
                    {item.children.map(child => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={pathname === child.href ? 'active' : ''}
                        style={{ paddingLeft: collapsed ? undefined : 44 }}
                      >
                        <span className="icon" style={{ opacity: 0.8 }}>{child.icon}</span>
                        <span className="nav-label">{child.label}</span>
                      </Link>
                    ))}
                  </div>
                )}

                {/* Flyout menu khi COLLAPSED và HOVER */}
                {collapsed && (
                  <div className="absolute left-full top-0 hidden group-hover:flex flex-col z-[9999] min-w-[200px] pl-0.5">
                    <div className="bg-[#042412] border border-[rgba(255,255,255,0.1)] rounded-md shadow-2xl py-1 flex flex-col">
                      <div className="px-4 py-2 text-[11px] uppercase tracking-wider font-bold text-[#6ee7b7] border-b border-[rgba(255,255,255,0.05)] whitespace-nowrap">
                        {item.label}
                      </div>
                      {item.children.map((child, childIdx) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`flex items-center !justify-start !gap-2 !px-4 !py-2 text-[13px] whitespace-nowrap transition-colors text-left ${
                            pathname === child.href 
                              ? 'text-[#6ee7b7] bg-[rgba(255,255,255,0.05)]' 
                              : 'text-gray-300 hover:text-white hover:bg-[rgba(255,255,255,0.05)]'
                          }`}
                        >
                          <span className="opacity-40 shrink-0 mt-[1px]">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                          </span>
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={item.href || idx} className="relative group flex flex-col">
              <Link
                href={item.href || '#'}
                className={pathname === item.href ? 'active' : ''}
                // Xóa native title
                // title={collapsed ? item.label : undefined}
              >
                <span className="icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </Link>

              {/* Tooltip khi COLLAPSED và HOVER */}
              {collapsed && (
                <div className="absolute left-full top-0 hidden group-hover:flex z-[9999] whitespace-nowrap pl-0.5 pt-1 pointer-events-none">
                  <div className="bg-[#042412] border border-[rgba(255,255,255,0.1)] rounded-md shadow-2xl py-1.5 px-3">
                    <div className="text-[13px] font-bold text-white tracking-wide">{item.label}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="sidebar-bottom relative group" style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <Link href="/inbox" target="_blank" rel="noopener noreferrer"
          // title={collapsed ? 'Inbox CSKH' : undefined}
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6ee7b7', textDecoration: 'none', padding: '6px 0' }}>
          💬 <span className="sidebar-bottom-text">Inbox CSKH</span>
        </Link>
        {collapsed && (
          <div className="absolute left-full top-1/2 -translate-y-1/2 hidden group-hover:flex z-[9999] whitespace-nowrap pl-0.5 pointer-events-none">
            <div className="bg-[#042412] border border-[rgba(255,255,255,0.1)] rounded-md shadow-2xl py-1.5 px-3">
              <div className="text-[13px] font-bold text-white tracking-wide">Inbox CSKH</div>
            </div>
          </div>
        )}
      </div>

      <div className="relative group" style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between' }}>
        <Link href="/profile" /* title="Hồ sơ cá nhân" */ style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minWidth: 0, textDecoration: 'none' }}>
          <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: '#fff', fontSize: 14, flexShrink: 0 }}>
            {userName.charAt(0)}
          </span>
          {!collapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {userName}
              </span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>Admin</span>
            </div>
          )}
        </Link>
        {collapsed && (
          <div className="absolute left-full top-1/2 -translate-y-1/2 hidden group-hover:flex z-[9999] whitespace-nowrap pl-0.5 pointer-events-none">
            <div className="bg-[#042412] border border-[rgba(255,255,255,0.1)] rounded-md shadow-2xl py-1.5 px-3">
              <div className="text-[13px] font-bold text-white tracking-wide">Hồ sơ cá nhân</div>
            </div>
          </div>
        )}
      </div>
      
      <button className="sidebar-toggle" onClick={onToggle} title={collapsed ? 'Mở rộng' : 'Thu gọn'}>
          {collapsed ? '»' : '«'}
          {!collapsed && <span style={{ fontSize: 12 }}>Thu gọn</span>}
      </button>
    </aside>
  );
}
