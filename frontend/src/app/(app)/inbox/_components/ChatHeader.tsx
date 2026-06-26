import { useState, useEffect } from 'react';
import type { Conversation } from '../types';
import { useToast } from '@/lib/ui/toast';

/* Safe Avatar for ChatHeader — state-based rendering avoids 404 console noise */
function HeaderAvatar({ url, name }: { url?: string | null; name: string }) {
    const [showImg, setShowImg] = useState(!!url);
    useEffect(() => { setShowImg(!!url); }, [url]);
    const initial = (name || '?').charAt(0).toUpperCase();
    
    if (url && showImg) {
        return (
            <img
                src={url}
                referrerPolicy="no-referrer"
                alt="Avatar"
                className="w-full h-full rounded-full object-cover"
                onError={() => setShowImg(false)}
            />
        );
    }
    return (
        <div
            className="w-full h-full rounded-full bg-gradient-to-br from-blue-100 to-indigo-200 flex items-center justify-center font-bold text-blue-800 text-base"
        >
            {initial}
        </div>
    );
}

interface ChatHeaderProps {
    selectedConversation: Conversation;
    rightSidebarVisible?: boolean;
    isSearchVisible: boolean;
    onToggleSearch: () => void;
    onToggleRightSidebar?: () => void;
}

export default function ChatHeader({
    selectedConversation,
    rightSidebarVisible,
    isSearchVisible,
    onToggleSearch,
    onToggleRightSidebar,
}: ChatHeaderProps) {
    const toast = useToast();
    const zaloCallHandler = (isVideo: boolean) => {
        const uid = selectedConversation?.contact?.externalUserId;
        if (uid && !uid.startsWith('g_')) {
            window.location.href = `zalo://chat?uid=${uid}`;
        } else {
            toast.show('info', isVideo
                ? 'Không thể gọi video nhóm. Vui lòng mở Zalo để thao tác.'
                : 'Không thể gọi nhóm. Vui lòng mở Zalo để thao tác.'
            );
        }
    };

    return (
        <div className="px-5 py-3 bg-white border-b border-gray-200 flex justify-between items-center shrink-0 h-[68px]">
            {/* Left: Avatar + Name + SLA */}
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 relative">
                    <HeaderAvatar url={selectedConversation.contact?.avatarUrl} name={selectedConversation.contact?.displayName || '?'} />
                    {selectedConversation.channel?.type === 'zalo_personal' && (
                        <div className="absolute -bottom-0.5 -right-1 bg-white rounded-full p-0.5">
                            <div className="bg-sky-500 text-white text-[8px] font-extrabold px-1 py-0.5 rounded-lg tracking-tighter">
                                ZALO
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-base text-gray-900">
                        {selectedConversation.contact?.displayName || 'Unknown'}
                    </span>
                    <SlaIndicator conversation={selectedConversation} />
                </div>
            </div>

            {/* Right: Action Buttons */}
            <div className="flex items-center gap-2">
                <HeaderIconButton
                    onClick={() => zaloCallHandler(false)}
                    title="Mở Zalo PC để gọi điện"
                    icon={
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                        </svg>
                    }
                />
                <HeaderIconButton
                    onClick={() => zaloCallHandler(true)}
                    title="Mở Zalo PC để gọi Video"
                    icon={
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="23 7 16 12 23 17 23 7" />
                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                        </svg>
                    }
                />
                <HeaderIconButton
                    onClick={onToggleSearch}
                    title="Tìm tin nhắn"
                    active={isSearchVisible}
                    icon={
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                    }
                />
                <HeaderIconButton
                    onClick={onToggleRightSidebar}
                    title={rightSidebarVisible ? "Ẩn thông tin hội thoại" : "Hiện thông tin hội thoại"}
                    active={rightSidebarVisible}
                    className="ml-2 !rounded-lg"
                    icon={
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <line x1="15" y1="3" x2="15" y2="21" />
                        </svg>
                    }
                />
            </div>
        </div>
    );
}

/* ===== Sub-components ===== */

function HeaderIconButton({ onClick, title, icon, active, className }: {
    onClick?: () => void;
    title: string;
    icon: React.ReactNode;
    active?: boolean;
    className?: string;
}) {
    return (
        <button
            onClick={onClick}
            className={`p-2 rounded-full flex items-center justify-center border-none cursor-pointer transition-colors duration-150
                ${active ? 'bg-slate-200 text-[#005ae0]' : 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-[#005ae0]'}
                ${className || ''}`}
            title={title}
            aria-label={title}
        >
            {icon}
        </button>
    );
}

function SlaIndicator({ conversation }: { conversation: Conversation }) {
    if (!conversation.slaDeadline) return null;
    
    const now = Date.now();
    const deadline = new Date(conversation.slaDeadline).getTime();
    const diffMs = deadline - now;
    const diffMin = Math.round(Math.abs(diffMs) / 60000);
    const isBreached = conversation.slaBreached || diffMs < 0;
    const isUrgent = !isBreached && diffMin <= 5;

    if (isBreached) {
        return (
            <span className="text-red-500 text-xs font-semibold flex items-center gap-1">
                <span>⏰</span> Trễ {diffMin > 60 ? `${Math.floor(diffMin / 60)}h${diffMin % 60 > 0 ? diffMin % 60 + 'p' : ''}` : `${diffMin} phút`}
            </span>
        );
    }
    if (isUrgent) {
        return (
            <span className="text-amber-500 text-xs font-semibold flex items-center gap-1">
                <span>⏳</span> Còn {diffMin} phút
            </span>
        );
    }
    return (
        <span className="text-slate-500 text-xs flex items-center gap-1">
            <span className="text-[10px]">🕐</span> Hạn trả lời: {new Date(conversation.slaDeadline).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
        </span>
    );
}
