import type { ChatMessage } from '../types';

interface ChatSearchBarProps {
    visible: boolean;
    query: string;
    onQueryChange: (q: string) => void;
    onClose: () => void;
}

export function ChatSearchBar({ visible, query, onQueryChange, onClose }: ChatSearchBarProps) {
    if (!visible) return null;
    return (
        <div className="px-5 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
            <div className="flex-1 relative">
                <svg className="absolute left-3 top-2.5 text-slate-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                    type="text"
                    placeholder="Nhập từ khóa tìm kiếm..."
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    className="w-full py-2 px-3 pl-9 rounded-full border border-slate-300 text-[13px] outline-none focus:border-blue-400"
                    autoFocus
                />
                {query && (
                    <button
                        onClick={() => onQueryChange('')}
                        className="absolute right-3 top-2.5 bg-transparent border-none cursor-pointer text-slate-400"
                    >✕</button>
                )}
            </div>
            <button
                onClick={onClose}
                className="bg-transparent border-none text-[#005ae0] text-[13px] font-medium cursor-pointer"
            >Đóng</button>
        </div>
    );
}

interface PinnedBannerProps {
    messages: ChatMessage[];
    onUnpin?: (msgId: string) => void;
}

export function PinnedBanner({ messages, onUnpin }: PinnedBannerProps) {
    const pinnedMsgs = messages.filter(m => m.isPinned);
    if (pinnedMsgs.length === 0) return null;
    const latest = pinnedMsgs[pinnedMsgs.length - 1];

    return (
        <div className="px-5 py-2.5 bg-white border-b border-slate-200 flex items-center gap-3 shadow-[0_2px_4px_rgba(0,0,0,0.02)] z-20">
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[#005ae0]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="17" x2="12" y2="22"></line>
                    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.68V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3v4.68a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                </svg>
            </div>
            <div className="flex-1 flex flex-col">
                <span className="text-[13px] font-semibold text-[#005ae0]">Tin nhắn ghim</span>
                <span className="text-[13px] text-slate-600 whitespace-nowrap overflow-hidden text-ellipsis max-w-[400px]">
                    {latest.content || 'Đính kèm'}
                </span>
            </div>
            <button
                onClick={() => onUnpin?.(latest.id)}
                className="bg-transparent border-none cursor-pointer text-slate-400 p-1"
                title="Bỏ ghim trực tiếp"
            >✕</button>
        </div>
    );
}
