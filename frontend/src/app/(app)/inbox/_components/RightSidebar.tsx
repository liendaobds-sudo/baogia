import { useState, useEffect } from 'react';
import type { Conversation, Suggestion, Note, Participant, User, ChatMessage } from '../types';
import MiniQuotePanel from '../MiniQuotePanel';
import { AiSuggestPanel } from './AiSuggestPanel';
import { MediaPanel } from './MediaPanel';
import { NotesPanel } from './NotesPanel';
import { TransferPanel } from './TransferPanel';
import { CustomerCard } from './CustomerCard';
import { Lightbox } from './Lightbox';
import { Bot, BadgeDollarSign, Paperclip, NotebookText, ArrowRightLeft, UserCircle } from 'lucide-react';

interface RightSidebarProps {
    token: string;
    selectedConversation: Conversation | null;
    suggestions: Suggestion[];
    sentReplies: Record<string, Set<number>>;
    notes: Note[];
    participants: Participant[];
    agents: User[];
    messages: ChatMessage[];
    onAcceptSuggestion: (suggestion: Suggestion, replyIndex: number) => void;
    onEditSuggestion: (suggestion: Suggestion, replyIndex: number) => void;
    onAddNote: (content: string, scope: 'conversation' | 'customer' | 'global') => void;
    onTogglePinNote: (noteId: string) => void;
    onDeleteNote?: (noteId: string) => void;
    onRemoveCollaborator: (userId: string) => void;
    onToggleCollaboratorAccess?: (userId: string, canView: boolean) => void;
    onAddCollaborator?: (userId: string) => void;
    onTransferConversation: (agentId: string) => void;
    onInjectText: (text: string) => void;
}

export default function RightSidebar({
    token, selectedConversation, suggestions, sentReplies, notes, participants, agents, messages,
    onAcceptSuggestion, onEditSuggestion, onAddNote, onTogglePinNote, onDeleteNote,
    onRemoveCollaborator, onTransferConversation, onAddCollaborator, onInjectText
}: RightSidebarProps) {
    const [rightTab, setRightTab] = useState<'ai' | 'notes' | 'quote' | 'transfer' | 'media' | 'customer'>('ai');
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    // External listener to switch to notes tab
    useEffect(() => {
        const handler = () => setRightTab('notes');
        window.addEventListener('show-notes-tab', handler);
        return () => window.removeEventListener('show-notes-tab', handler);
    }, []);

    // ESC to close lightbox
    useEffect(() => {
        if (!previewImage) return;
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreviewImage(null); };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [previewImage]);

    if (!selectedConversation) return null;

    const latestSuggestion = suggestions.find(s => s.status === 'generated') || null;

    return (
        <div className="right-sidebar-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <style>{`
                .right-sidebar-container { container-type: inline-size; }
                .tab-text { display: inline; margin-left: 6px; font-weight: 600; }
                @container (max-width: 340px) {
                    .tab-text { display: none; }
                }
                .tabs-scroll::-webkit-scrollbar { display: none; }
                .tabs-scroll { -ms-overflow-style: none; scrollbar-width: none; padding: 0 4px; }
            `}</style>

            {/* Tab Bar */}
            <div className="tabs-scroll" style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 2, padding: '4px' }}>
                {(['ai', 'customer', 'quote', 'media', 'notes', 'transfer'] as const).map(key => {
                    const iconProps = { size: 15, strokeWidth: 2.2 };
                    const icons = {
                        ai: <Bot {...iconProps} />,
                        customer: <UserCircle {...iconProps} />,
                        quote: <BadgeDollarSign {...iconProps} />,
                        media: <Paperclip {...iconProps} />,
                        notes: <NotebookText {...iconProps} />,
                        transfer: <ArrowRightLeft {...iconProps} />,
                    };
                    const labels = { ai: 'AI Assist', customer: 'Khách hàng', quote: 'Báo giá', media: 'Tài liệu', notes: 'Ghi chú', transfer: 'Chuyển' };
                    return (
                        <button key={key} onClick={() => setRightTab(key)} title={labels[key]}
                            style={{
                                flex: '1 1 auto', padding: '8px 6px', fontSize: 12, border: 'none', cursor: 'pointer',
                                background: rightTab === key ? '#fff' : 'transparent',
                                color: rightTab === key ? '#2563eb' : '#64748b',
                                borderBottom: rightTab === key ? '2px solid #2563eb' : '2px solid transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'color 0.2s, background 0.2s', gap: '4px',
                                borderRadius: '4px 4px 0 0'
                            }}>
                            <span style={{ display: 'flex', alignItems: 'center' }}>{icons[key]}</span>
                            <span className="tab-text" style={{ whiteSpace: 'nowrap' }}>{labels[key]}</span>
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {rightTab === 'ai' && (
                    <AiSuggestPanel
                        latestSuggestion={latestSuggestion}
                        sentReplies={sentReplies}
                        onAcceptSuggestion={onAcceptSuggestion}
                        onEditSuggestion={onEditSuggestion}
                        onInjectText={onInjectText}
                    />
                )}

                {rightTab === 'customer' && (
                    <CustomerCard
                        token={token}
                        phone={selectedConversation?.metadata?.phone || selectedConversation?.externalId?.replace(/[^0-9]/g, '') || ''}
                    />
                )}

                <div style={{ display: rightTab === 'quote' ? 'block' : 'none' }}>
                    <MiniQuotePanel token={token} messages={messages} onInsertText={onInjectText} />
                </div>

                {rightTab === 'media' && (
                    <MediaPanel messages={messages} onPreviewImage={setPreviewImage} />
                )}

                {rightTab === 'notes' && (
                    <NotesPanel
                        token={token}
                        selectedConversation={selectedConversation}
                        notes={notes}
                        onAddNote={onAddNote}
                        onTogglePinNote={onTogglePinNote}
                        onDeleteNote={onDeleteNote}
                        onInjectText={onInjectText}
                    />
                )}

                {rightTab === 'transfer' && (
                    <TransferPanel
                        selectedConversation={selectedConversation}
                        participants={participants}
                        agents={agents}
                        onRemoveCollaborator={onRemoveCollaborator}
                        onTransferConversation={onTransferConversation}
                        onAddCollaborator={onAddCollaborator}
                    />
                )}
            </div>

            {/* Lightbox */}
            {previewImage && <Lightbox url={previewImage} onClose={() => setPreviewImage(null)} />}
        </div>
    );
}
