import { useState, useEffect } from 'react';
import type { Conversation } from '../types';
import { useToast } from '@/lib/ui/toast';
import { matchesSearch } from '../_lib/conversationSearch';

const STATUS_LABELS: Record<string, string> = {
    new: 'Mới', in_progress: 'Đang xử lý', waiting_customer: 'Chờ khách',
    waiting_file: 'Chờ file', quoted: 'Đã báo giá', won: 'Chốt đơn',
    lost: 'Mất đơn', closed: 'Đã đóng',
};
const STATUS_COLORS: Record<string, string> = {
    new: '#22c55e', in_progress: '#3b82f6', waiting_customer: '#f59e0b',
    waiting_file: '#eab308', quoted: '#8b5cf6', won: '#10b981',
    lost: '#ef4444', closed: '#94a3b8',
};
/** Màu mặc định an toàn cho trạng thái không có trong bảng màu. */
const STATUS_COLOR_FALLBACK = '#94a3b8';
const statusColor = (status: string) => STATUS_COLORS[status] ?? STATUS_COLOR_FALLBACK;
const PRIORITY_ICONS: Record<string, string> = { urgent: '🔴', high: '🟠', normal: '🔵', low: '⚪' };
const PRIORITY_LABELS: Record<string, string> = { urgent: 'Khẩn cấp', high: 'Cao', normal: 'Bình thường', low: 'Thấp' };

/* Safe Avatar — uses React state to avoid 404 console noise from broken Zalo CDN URLs */
function SafeAvatar({ url, name, size = 46 }: { url?: string | null; name: string; size?: number }) {
    const [showImg, setShowImg] = useState(!!url);
    
    useEffect(() => { setShowImg(!!url); }, [url]);
    
    const initial = (name || '?').charAt(0).toUpperCase();
    
    if (url && showImg) {
        return (
            <img 
                src={url} 
                alt="Avatar"
                referrerPolicy="no-referrer" 
                style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '1px solid #e2e8f0' }}
                onError={() => setShowImg(false)}
            />
        );
    }
    
    return (
        <div style={{ 
            width: size, height: size, borderRadius: '50%', 
            background: 'linear-gradient(135deg, #dbeafe, #c7d2fe)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            fontWeight: 700, color: '#1e40af', fontSize: Math.round(size * 0.35) 
        }}>
            {initial}
        </div>
    );
}

interface ConversationListProps {
    conversations: Conversation[];
    loading: boolean;
    selectedId: string | null;
    slaWarnings: Set<string>;
    tagFilter: string;
    availableTags: { tag: string; count: number }[];
    onSelect: (id: string) => void;
    onSetTagFilter: (tag: string) => void;
    onDeleteConversation?: (id: string) => void;
    onMarkAsUnread?: (id: string) => void;
    onTogglePin?: (id: string, currentPinned: boolean) => void;
    onToggleTag?: (id: string, tag: string, isAdding: boolean) => void;
    onMarkAllRead?: () => void;
    onSyncZalo?: () => Promise<void>;
}

const MenuItem = ({ label, danger, hasSub, hasDot, onClick, openSubmenu }: any) => {
    return (
        <div 
            style={{
                padding: '8px 16px',
                fontSize: '14px',
                color: danger ? '#dc2626' : '#1e293b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'background 0.1s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            onMouseDown={onClick} // Use onMouseDown to prevent overlay from stealing the click
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {label}
                {hasDot && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#dc2626' }}></div>}
            </div>
            {hasSub && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#94a3b8', transform: openSubmenu ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
            )}
        </div>
    );
};

const MenuDivider = () => <div style={{ height: '1px', background: '#f1f5f9', margin: '4px 0' }} />;

const CRM_TAGS: Record<string, { label: string, color: string }> = {
    'báo_giá': { label: 'Báo giá', color: '#0ea5e9' },      // Blue
    'tư_vấn': { label: 'Tư vấn', color: '#d946ef' },       // Magenta
    'chốt_đơn': { label: 'Chốt đơn', color: '#22c55e' },     // Green
    'chờ_file': { label: 'Chờ file', color: '#eab308' },     // Yellow
    'giao_hàng': { label: 'Giao hàng', color: '#f97316' },    // Orange
    'khiếu_nại': { label: 'Khiếu nại', color: '#dc2626' },    // Red
};

export default function ConversationList({
    conversations, loading, selectedId, slaWarnings,
    tagFilter, availableTags, onSelect, onSetTagFilter,
    onDeleteConversation, onMarkAsUnread, onTogglePin, onToggleTag, onMarkAllRead, onSyncZalo
}: ConversationListProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [menuState, setMenuState] = useState<{ id: string, conv: Conversation, x: number, y: number } | null>(null);
    const [openSubmenu, setOpenSubmenu] = useState<boolean>(false);
    const [openFilterMenu, setOpenFilterMenu] = useState<boolean>(false);
    const toast = useToast();

    const formatTime = (d: string) => d ? new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';

    const visibleConversations = conversations.filter(conv => {
        if (activeTab === 'unread' && (!conv.unreadCount || conv.unreadCount === 0)) return false;
        return matchesSearch(conv, searchQuery);
    });

    return (
        <>
            <div style={{ padding: '16px 16px 0 16px', borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
                {/* Search Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ 
                        flex: 1, height: 32, background: '#eaedf0', borderRadius: 6,
                        display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8
                    }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#606d7b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Tìm kiếm"
                            style={{ 
                                border: 'none', background: 'transparent', outline: 'none', 
                                fontSize: 13, color: '#111', width: '100%',
                            }}
                        />
                    </div>
                </div>

                {/* Tabs Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                    <div style={{ display: 'flex', gap: 16 }}>
                        <div 
                            role="tab"
                            tabIndex={0}
                            aria-selected={activeTab === 'all'}
                            onClick={() => setActiveTab('all')}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTab('all'); } }}
                            style={{ 
                                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                color: activeTab === 'all' ? '#005ae0' : '#606d7b',
                                borderBottom: activeTab === 'all' ? '2px solid #005ae0' : '2px solid transparent',
                                paddingBottom: 8
                            }}>
                            Tất cả
                        </div>
                        <div 
                            role="tab"
                            tabIndex={0}
                            aria-selected={activeTab === 'unread'}
                            onClick={() => setActiveTab('unread')}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTab('unread'); } }}
                            style={{ 
                                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                color: activeTab === 'unread' ? '#005ae0' : '#606d7b',
                                borderBottom: activeTab === 'unread' ? '2px solid #005ae0' : '2px solid transparent',
                                paddingBottom: 8
                            }}>
                            Chưa đọc
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingBottom: 8 }}>
                        {/* Custom Zalo-like Combo Box for Filters */}
                        <div style={{ position: 'relative' }}>
                            <div 
                                role="button"
                                tabIndex={0}
                                aria-label="Lọc theo thẻ phân loại"
                                aria-expanded={openFilterMenu}
                                onClick={() => setOpenFilterMenu(!openFilterMenu)}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenFilterMenu(v => !v); } }}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: '4px 6px', borderRadius: 6, background: openFilterMenu ? '#f1f5f9' : 'transparent' }}
                            >
                                <span style={{ fontSize: 13, fontWeight: 500, color: tagFilter ? '#005ae0' : '#606d7b' }}>
                                    Phân loại {tagFilter ? '(1)' : ''}
                                </span>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={tagFilter ? '#005ae0' : "#606d7b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: openFilterMenu ? 'rotate(180deg)' : 'none', transition: '0.2s' }}>
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                                {tagFilter && (
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', marginLeft: -2, marginTop: -8 }}></div>
                                )}
                            </div>

                            {openFilterMenu && (
                                <>
                                    <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setOpenFilterMenu(false)}></div>
                                    <div style={{
                                        position: 'absolute', top: '100%', right: 0, marginTop: 4,
                                        background: '#fff', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                                        border: '1px solid #e2e8f0', width: 220, zIndex: 40, padding: '8px 0',
                                        display: 'flex', flexDirection: 'column'
                                    }}>
                                        <div style={{ padding: '4px 16px', fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 4 }}>
                                            Theo thẻ phân loại
                                        </div>
                                        
                                        {(() => {
                                            const knownTags = Object.keys(CRM_TAGS);
                                            const allTags = [...new Set([...knownTags, ...availableTags.map(t => t.tag)])];
                                            
                                            return allTags.map(tag => {
                                                const isSelected = tagFilter === tag;
                                                const color = CRM_TAGS[tag]?.color || '#94a3b8';
                                                const label = CRM_TAGS[tag]?.label || (tag.charAt(0).toUpperCase() + tag.slice(1).replace(/_/g, ' '));
                                                
                                                return (
                                                    <div key={tag} 
                                                            style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
                                                            onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                            onClick={() => {
                                                                onSetTagFilter(isSelected ? '' : tag);
                                                                setOpenFilterMenu(false);
                                                            }}>
                                                        
                                                        {/* Checkbox Native Style */}
                                                        <div style={{ 
                                                            width: 16, height: 16, border: '1px solid #cbd5e1', borderRadius: 3, 
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            background: isSelected ? '#2563eb' : '#fff',
                                                            borderColor: isSelected ? '#2563eb' : '#cbd5e1'
                                                        }}>
                                                            {isSelected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                                        </div>

                                                        {/* Zalo Tag Shape Icon */}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                                                            <div style={{ width: 12, height: 12, background: color, borderTopLeftRadius: 3, borderBottomLeftRadius: 3 }}></div>
                                                            <div style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: `6px solid ${color}` }}></div>
                                                        </div>
                                                        
                                                        <span style={{ fontSize: 14, color: '#0f172a' }}>{label}</span>
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Sync Zalo Button */}
                        <div 
                            role="button"
                            tabIndex={0}
                            aria-label="Đồng bộ tin nhắn Zalo bị lỡ"
                            onClick={async () => {
                                if (!onSyncZalo) { toast.show('info', 'Chức năng đồng bộ chưa sẵn sàng'); return; }
                                const btn = document.getElementById('sync-zalo-btn');
                                if (btn?.getAttribute('data-syncing')) return;
                                if (btn) { btn.style.animation = 'spin 1s linear infinite'; btn.setAttribute('data-syncing', 'true'); }
                                try { await onSyncZalo(); }
                                finally { if (btn) { btn.style.animation = 'none'; btn.removeAttribute('data-syncing'); } }
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLDivElement).click(); } }}
                            title="Đồng bộ tin nhắn Zalo bị lỡ"
                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 6px', borderRadius: 6 }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <svg id="sync-zalo-btn" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#606d7b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="23 4 23 10 17 10"></polyline>
                                <polyline points="1 20 1 14 7 14"></polyline>
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                            </svg>
                        </div>

                        <div 
                            role="button"
                            tabIndex={0}
                            aria-label="Đánh dấu đã đọc tất cả"
                            onClick={() => onMarkAllRead && onMarkAllRead()}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMarkAllRead && onMarkAllRead(); } }}
                            title="Đánh dấu đã đọc tất cả"
                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 6px', borderRadius: 6 }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#606d7b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            {loading && <div style={{ padding: 20, color: '#94a3b8', textAlign: 'center' }}>Đang tải...</div>}
            {!loading && visibleConversations.length === 0 && (
                <div style={{ padding: 20, color: '#94a3b8', textAlign: 'center', fontSize: 13 }}>
                    Chưa có hội thoại phù hợp.
                </div>
            )}

            {menuState && (
                <div 
                    style={{ position: 'fixed', inset: 0, zIndex: 99998 }} 
                    onClick={(e) => { e.stopPropagation(); setMenuState(null); setOpenSubmenu(false); }} 
                    onContextMenu={(e) => { e.preventDefault(); setMenuState(null); setOpenSubmenu(false); }}
                />
            )}

            {visibleConversations.map((conv, index) => {
                const isHovered = hoveredId === conv.id;
                const isMenuOpen = menuState?.id === conv.id;

                return (
                    <div key={conv.id} onClick={() => onSelect(conv.id)}
                        onMouseEnter={() => setHoveredId(conv.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        style={{
                            padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                            background: selectedId === conv.id ? '#eef2ff' : undefined,
                            borderLeft: selectedId === conv.id ? '3px solid #4f46e5' : '3px solid transparent',
                            boxShadow: selectedId === conv.id ? 'inset 0 1px 3px rgba(0,0,0,0.03)' : 'none',
                            display: 'flex', gap: '12px', alignItems: 'center',
                            transition: 'all 0.15s ease',
                            position: 'relative',
                        }}>
                        
                        {/* Avatar Left */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                        <SafeAvatar url={conv.contact?.avatarUrl} name={conv.contact?.displayName || '?'} />
                        {conv.channel?.type === 'zalo_personal' && (
                            <div style={{ position: 'absolute', bottom: -2, right: -4, background: '#fff', borderRadius: '50%', padding: 2 }}>
                                <div style={{ background: '#0ea5e9', color: '#fff', fontSize: 8, fontWeight: 800, padding: '2px 4px', borderRadius: 8, letterSpacing: -0.5 }}>ZALO</div>
                            </div>
                        )}
                        {(conv.unreadCount ?? 0) > 0 && (
                            <span style={{ position: 'absolute', top: -2, right: -2, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 10, border: '2px solid #fff' }}>
                                {(conv.unreadCount ?? 0) > 9 ? '9+' : conv.unreadCount}
                            </span>
                        )}
                    </div>

                    {/* Content Right */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {/* Row 1: Name and Time / Actions */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ fontWeight: 600, fontSize: 15, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
                                {conv.isPinned && <span title="Đã ghim" aria-label="Đã ghim" style={{ fontSize: 14 }}>📌</span>}
                                {PRIORITY_ICONS[conv.priority] && <span title={`Ưu tiên: ${PRIORITY_LABELS[conv.priority] || conv.priority}`} aria-label={`Ưu tiên: ${PRIORITY_LABELS[conv.priority] || conv.priority}`} style={{fontSize: 12}}>{PRIORITY_ICONS[conv.priority]}</span>}
                                {conv.contact?.displayName || 'Unknown'}
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', height: '24px' }}>
                                {(isHovered || menuState?.id === conv.id) ? (
                                    <div style={{ position: 'relative' }}>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (menuState?.id === conv.id) {
                                                    setMenuState(null);
                                                    setOpenSubmenu(false);
                                                } else {
                                                    // Vị trí cố định (position fixed) để vượt ra ngoài container bị overflow
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    setMenuState({ 
                                                        id: conv.id, conv, 
                                                        x: rect.left, 
                                                        y: rect.bottom 
                                                    });
                                                }
                                            }}
                                            style={{
                                                background: '#dbeafe',
                                                color: '#2563eb',
                                                border: 'none',
                                                borderRadius: '6px',
                                                width: '32px',
                                                height: '24px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                fontSize: '18px',
                                                lineHeight: '1',
                                                paddingBottom: '8px'
                                            }}
                                            title="Thêm tùy chọn"
                                            aria-label="Thêm tùy chọn cho hội thoại"
                                        >
                                            ...
                                        </button>
                                    </div>
                                ) : (
                                    <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500, flexShrink: 0, marginTop: 2 }}>{formatTime(conv.lastMessageAt)}</span>
                                )}
                            </div>
                        </div>

                        {/* Row 2: Message/Status snippet and Tags */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0, fontSize: 13, color: '#64748b' }}>
                                {conv.slaBreached && <span style={{ fontSize: 12, flexShrink: 0 }} title="Trả lời trễ" aria-label="Trả lời trễ">⏰</span>}
                                {!conv.slaBreached && slaWarnings.has(conv.id) && <span style={{ fontSize: 12, flexShrink: 0 }} title="Sắp hết hạn" aria-label="Sắp hết hạn SLA">⏳</span>}
                                <span style={{ color: statusColor(conv.status), fontWeight: 500, fontSize: 12, flexShrink: 0 }}>
                                    {STATUS_LABELS[conv.status] || conv.status}
                                </span>
                                {conv.lastMessage && (
                                    <>
                                        <span style={{ opacity: 0.5 }}>•</span>
                                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {conv.lastMessage}
                                        </span>
                                    </>
                                )}
                            </div>
                            
                            {/* Badges/Tags compacted */}
                            {conv.tags && conv.tags.length > 0 && (
                                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                                    {conv.tags.filter(t => !t.startsWith('sp:')).slice(0, 1).map(tag => {
                                        const label = CRM_TAGS[tag]?.label || tag.replace(/_/g, ' ');
                                        const color = CRM_TAGS[tag]?.color || '#94a3b8';
                                        
                                        return (
                                            <span key={tag} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: `${color}15`, color: color, fontWeight: 600 }}>
                                                {label}
                                            </span>
                                        );
                                    })}
                                    {conv.tags.filter(t => !t.startsWith('sp:')).length > 1 && (
                                        <span style={{ fontSize: 10, padding: '1px 4px', borderRadius: 4, background: '#f1f5f9', color: '#64748b', fontWeight: 600 }}>
                                            +{conv.tags.filter(t => !t.startsWith('sp:')).length - 1}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                );
            })}

            {/* GLOBAL FIXED POSITION MULTI-LEVEL MENU */}
            {menuState && (
                <div style={{
                    position: 'fixed',
                    top: Math.min(menuState.y + 4, window.innerHeight - 200), // Auto-adjust if near bottom
                    left: Math.max(8, menuState.x - 240 + 32), // Align right to the button
                    background: '#fff',
                    borderRadius: '8px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                    border: '1px solid #e2e8f0',
                    width: '240px',
                    zIndex: 99999, // Ensure it's definitely highest global
                    padding: '8px 0',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <MenuItem label={menuState.conv.isPinned ? "Bỏ ghim hội thoại" : "Ghim hội thoại"} onClick={(e: any) => { 
                        e.stopPropagation(); e.preventDefault(); 
                        if (onTogglePin) onTogglePin(menuState.id, !!menuState.conv.isPinned);
                        setMenuState(null); setOpenSubmenu(false);
                    }} />
                    <MenuDivider />
                    
                    {/* Phân loại Submenu (Flyout Right) */}
                    <div style={{ position: 'relative' }} 
                        onMouseEnter={() => setOpenSubmenu(true)} 
                        onMouseLeave={() => setOpenSubmenu(false)}>
                        
                        <MenuItem label="Phân loại" hasSub openSubmenu={false} onClick={(e: any) => { 
                            e.stopPropagation(); e.preventDefault(); 
                        }} />
                        
                        {openSubmenu && (
                            <div style={{
                                position: 'absolute',
                                top: -8, // Align nicely horizontally
                                left: '100%',
                                marginLeft: '2px', // tiny gap
                                background: '#fff',
                                borderRadius: '8px',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                                border: '1px solid #e2e8f0',
                                width: '220px',
                                padding: '8px 0',
                            }}>
                                {(() => {
                                    const knownTags = Object.keys(CRM_TAGS);
                                    
                                    // Use real-time conv from the main array so UI updates instantly when state changes
                                    const activeConv = conversations.find(c => c.id === menuState.id) || menuState.conv;
                                    const currentTags = activeConv.tags || [];
                                    const allTags = [...new Set([...knownTags, ...currentTags])];
                                    
                                    return (
                                        <>
                                            {allTags.map(tag => {
                                                const isSelected = currentTags.includes(tag);
                                                const color = CRM_TAGS[tag]?.color || '#94a3b8';
                                                const label = CRM_TAGS[tag]?.label || (tag.charAt(0).toUpperCase() + tag.slice(1).replace(/_/g, ' '));
                                                
                                                return (
                                                    <div key={tag} 
                                                            style={{ padding: '8px 16px', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                                            onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                            onMouseDown={(e: any) => {
                                                                e.stopPropagation(); e.preventDefault();
                                                                if (onToggleTag) onToggleTag(menuState.id, tag, !isSelected);
                                                            }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                            {/* Zalo Tag Shape Icon */}
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                                                                <div style={{ width: 12, height: 12, background: color, borderTopLeftRadius: 3, borderBottomLeftRadius: 3 }}></div>
                                                                <div style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: `6px solid ${color}` }}></div>
                                                            </div>
                                                            <span style={{ color: '#0f172a' }}>{label}</span>
                                                        </div>
                                                        {isSelected && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                                    </div>
                                                );
                                            })}
                                        </>
                                    )
                                })()}
                            </div>
                        )}
                    </div>

                    <MenuItem label="Đánh dấu chưa đọc" onClick={(e: React.MouseEvent) => {
                        e.stopPropagation(); e.preventDefault();
                        if (onMarkAsUnread) onMarkAsUnread(menuState.id);
                        setMenuState(null); setOpenSubmenu(false);
                    }} />
                    
                    <MenuDivider />
                    <MenuItem label="Xóa hội thoại" danger onClick={(e: React.MouseEvent) => {
                        e.stopPropagation(); e.preventDefault();
                        if (onDeleteConversation) onDeleteConversation(menuState.id);
                        setMenuState(null); setOpenSubmenu(false);
                    }} />
                </div>
            )}
        </>
    );
}

