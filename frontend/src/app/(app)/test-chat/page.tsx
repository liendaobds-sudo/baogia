'use client';

import { useTestChat } from './hooks/useTestChat';
import { ChatMessage } from './_components/ChatMessage';
import { PresetBar } from './_components/PresetBar';
import { AiSuggestionCard } from './_components/AiSuggestionCard';
import { stripMarkdown } from './utils/markdown';

export default function TestChatPage() {
    const {
        messages, suggestions, input, setInput, sending,
        convId, sentReplies, mounted,
        confirmReset, setConfirmReset,
        messagesEndRef, inputRef,
        sendMessage, resetChat, handleAcceptSuggestion,
    } = useTestChat();

    if (!mounted) return null;

    return (
        <div className="flex h-screen bg-slate-50">
            {/* ═══ Chat Panel ═══ */}
            <div className="flex-1 flex flex-col border-r border-slate-200">
                {/* Header */}
                <div className="px-5 py-3.5 border-b border-slate-200 bg-white flex justify-between items-center">
                    <div>
                        <div className="text-[15px] font-bold text-slate-900 flex items-center gap-2">
                            🧪 Test Chat
                            <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-amber-100 text-amber-800">
                                DEV MODE
                            </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                            Giả lập tin nhắn khách hàng → test AI pipeline end-to-end
                        </div>
                    </div>
                    {confirmReset ? (
                        <div className="flex gap-1.5">
                            <button
                                onClick={resetChat}
                                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white border-none cursor-pointer"
                            >
                                ✓ Xác nhận reset
                            </button>
                            <button
                                onClick={() => setConfirmReset(false)}
                                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-500 cursor-pointer"
                            >
                                Hủy
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setConfirmReset(true)}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-red-50 border border-red-200 text-red-600 cursor-pointer hover:bg-red-100 transition-colors"
                        >
                            🗑️ Reset
                        </button>
                    )}
                </div>

                {/* Quick Messages */}
                <PresetBar onSend={sendMessage} disabled={sending} />

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-5 pt-5 pb-2.5">
                    {messages.length === 0 ? (
                        <div className="text-center py-16 px-5 text-slate-400">
                            <div className="text-5xl mb-3">💬</div>
                            <div className="text-[15px] font-semibold text-slate-500">Bắt đầu test</div>
                            <div className="text-[13px] mt-1">
                                Nhập tin nhắn hoặc bấm nút Quick ở trên để simulate khách hàng
                            </div>
                        </div>
                    ) : (
                        messages.map(msg => <ChatMessage key={msg.id} message={msg} />)
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="px-5 py-3 border-t border-slate-200 bg-white flex gap-2">
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                        placeholder="Nhập tin nhắn khách hàng để test..."
                        disabled={sending}
                        className="flex-1 px-3.5 py-2.5 rounded-[10px] text-[13px] border border-slate-200 outline-none
                            focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100
                            disabled:bg-slate-50 transition-all"
                    />
                    <button
                        onClick={() => sendMessage(input)}
                        disabled={sending || !input.trim()}
                        className="px-5 py-2.5 rounded-[10px] text-[13px] font-semibold text-white border-none
                            bg-indigo-600 hover:bg-indigo-700 transition-colors
                            disabled:bg-slate-300 disabled:cursor-not-allowed cursor-pointer"
                    >
                        {sending ? '⏳' : '📤'} Gửi
                    </button>
                </div>
            </div>

            {/* ═══ AI Suggestion Panel ═══ */}
            <div className="w-[360px] bg-white flex flex-col overflow-hidden">
                <div className="px-4.5 py-3.5 border-b border-slate-200 text-sm font-bold text-slate-900 flex items-center gap-2">
                    🤖 AI Suggestions
                    {suggestions.length > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-lg bg-green-100 text-green-600 font-semibold">
                            {suggestions.length}
                        </span>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-3.5">
                    {suggestions.length === 0 ? (
                        <div className="text-center py-10 px-4 text-slate-400">
                            <div className="text-4xl mb-2">🤖</div>
                            <div className="text-[13px] font-medium">Chờ AI phân tích...</div>
                            <div className="text-xs mt-1">
                                Gửi tin nhắn bên trái, AI sẽ tự động gợi ý phản hồi
                            </div>
                        </div>
                    ) : (
                        suggestions.map(sugg => (
                            <AiSuggestionCard
                                key={sugg.id}
                                suggestion={sugg}
                                messages={messages}
                                sentReplies={sentReplies}
                                sending={sending}
                                onAccept={handleAcceptSuggestion}
                                onEdit={setInput}
                            />
                        ))
                    )}
                </div>

                {/* Pipeline info */}
                <div className="px-4.5 py-2.5 border-t border-slate-200 text-[11px] text-slate-400 bg-slate-50">
                    <strong>Pipeline:</strong> Message → processInbound → DB → WebSocket → AI Suggest
                    {convId && (
                        <div className="mt-0.5">
                            Conv: <code className="text-[10px]">{convId.substring(0, 8)}...</code>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
