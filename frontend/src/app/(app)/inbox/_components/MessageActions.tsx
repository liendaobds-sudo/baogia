import React, { useState } from 'react';
import { ChatMessage } from '../types';
import { MoreHorizontal, Forward, Quote, ThumbsUp, X } from 'lucide-react';
import ReactionIcon from './ReactionIcon';

interface MessageActionsProps {
    message: ChatMessage;
    isMine: boolean;
    onReact: (msgId: string, icon: string) => void;
    onRecall?: (msgId: string) => void;
    onPin?: (msgId: string) => void;
    onStar?: (msgId: string) => void;
    onLocalDelete?: (msgId: string) => void;
    onMultiSelect?: () => void;
    onViewDetails?: () => void;
    onQuote?: (msgId: string) => void;
    onForward?: (msgId: string) => void;
    isHovered?: boolean;
    onOpenContext?: (x: number, y: number) => void;
}

export default function MessageActions({ message, isMine, onReact, onQuote, onForward, isHovered = false, onOpenContext }: MessageActionsProps) {
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const isVisible = isHovered || showReactionPicker;

    if (message.status === 'recalled') return null;

    return (
        <div
            className={`absolute top-1/2 -translate-y-1/2 z-40 transition-opacity duration-150 ${isVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            style={{
                ...(isMine ? { right: '100%', paddingRight: '6px' } : { left: '100%', paddingLeft: '6px' }),
            }}
        >
            {/* Unified action bar — like Zalo */}
            <div
                className={`relative flex items-center bg-white rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.1)] border border-slate-100 ${isMine ? 'flex-row' : 'flex-row-reverse'}`}
                onMouseLeave={() => setShowReactionPicker(false)}
            >
                {/* Main action buttons */}
                <div className="flex items-center px-0.5 py-0.5 gap-px">
                    {/* Quick Like */}
                    <ActionBtn
                        title="Thích"
                        onMouseEnter={() => setShowReactionPicker(true)}
                        onClick={(e) => { e.stopPropagation(); onReact(message.id, '👍'); setShowReactionPicker(false); }}
                    >
                        <ThumbsUp size={13} strokeWidth={1.8} />
                    </ActionBtn>

                    {/* Quote/Reply */}
                    <ActionBtn
                        title="Trả lời"
                        onClick={(e) => { e.stopPropagation(); if (onQuote) onQuote(message.id); }}
                    >
                        <Quote size={13} strokeWidth={1.8} />
                    </ActionBtn>

                    {/* Forward */}
                    <ActionBtn
                        title="Chuyển tiếp"
                        onClick={(e) => { e.stopPropagation(); if (onForward) onForward(message.id); }}
                    >
                        <Forward size={13} strokeWidth={1.8} />
                    </ActionBtn>

                    {/* More */}
                    <ActionBtn
                        title="Thêm"
                        onClick={(e) => { e.stopPropagation(); if (onOpenContext) onOpenContext(e.clientX, e.clientY); }}
                    >
                        <MoreHorizontal size={13} strokeWidth={1.8} />
                    </ActionBtn>
                </div>

                {/* Reaction picker — expands on hover like Zalo */}
                {showReactionPicker && (
                    <div
                        className="absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 z-50"
                        style={{ paddingBottom: 4 }}
                    >
                        <div className="flex items-center bg-white rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.12)] border border-slate-100 px-1.5 py-1 gap-0.5">
                            {['👍', '❤️', '😆', '😮', '😢', '😡'].map(icon => (
                                <button
                                    key={icon}
                                    className="w-[30px] h-[30px] flex items-center justify-center rounded-full transition-transform duration-150 hover:scale-[1.35] hover:-translate-y-1 active:scale-110"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onReact(message.id, icon);
                                        setShowReactionPicker(false);
                                    }}
                                >
                                    <ReactionIcon type={icon} size={22} />
                                </button>
                            ))}
                            {/* Divider + Remove */}
                            <div className="w-px h-5 bg-slate-200 mx-0.5" />
                            <button
                                className="w-[28px] h-[28px] flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all duration-150"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onReact(message.id, 'remove');
                                    setShowReactionPicker(false);
                                }}
                                title="Gỡ cảm xúc"
                            >
                                <X size={16} strokeWidth={2} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/** Compact circular action button */
function ActionBtn({ children, title, onClick, onMouseEnter }: {
    children: React.ReactNode;
    title: string;
    onClick?: (e: React.MouseEvent) => void;
    onMouseEnter?: () => void;
}) {
    return (
        <button
            className="w-[24px] h-[24px] flex items-center justify-center rounded-full text-slate-500 hover:text-[#005ae0] hover:bg-[#005ae0]/8 transition-all duration-150 cursor-pointer"
            onClick={onClick}
            onMouseEnter={onMouseEnter}
            title={title}
        >
            {children}
        </button>
    );
}
