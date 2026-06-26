import { AiSuggestion, ChatMsg } from '../types';
import { renderMarkdown, stripMarkdown } from '../utils/markdown';

interface AiSuggestionCardProps {
    suggestion: AiSuggestion;
    messages: ChatMsg[];
    sentReplies: Record<string, Set<number>>;
    sending: boolean;
    onAccept: (sugg: AiSuggestion, index: number) => void;
    onEdit: (text: string) => void;
}

export function AiSuggestionCard({
    suggestion: sugg, messages, sentReplies, sending, onAccept, onEdit,
}: AiSuggestionCardProps) {
    const formatTime = (d: string) => new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    // Find trigger message for context preview
    const triggerMsg = messages.find(m => m.id === sugg.triggerMessageId);
    const triggerPreview = triggerMsg
        ? triggerMsg.content.length > 60 ? triggerMsg.content.substring(0, 60) + '...' : triggerMsg.content
        : null;

    // Filter missing info that's already covered in replies
    const replyText = (sugg.replies || []).map(r => r.text).join(' ').toLowerCase();
    const filteredMissing = (sugg.missingInfo || []).filter(m => !replyText.includes(m.slot.toLowerCase()));

    // Sources with docName
    const validSources = (sugg.sources || []).filter(s => s.docName);

    return (
        <div className="mb-3.5 rounded-xl border border-slate-200 overflow-hidden">
            {/* Trigger message preview */}
            {triggerPreview && (
                <div className="px-3.5 py-1.5 bg-blue-50 border-b border-blue-100 text-[11px] text-blue-500 font-medium flex gap-1 items-center">
                    <span>💬</span>
                    <span className="text-slate-500">Trả lời:</span>
                    <span className="italic">&quot;{triggerPreview}&quot;</span>
                </div>
            )}

            {/* Header: intent, confidence, sentiment */}
            <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-50 flex justify-between items-center">
                <div className="flex gap-1.5 items-center">
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-100 text-blue-600 font-semibold">
                        {sugg.intent || 'general'}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold
                        ${(sugg.confidence || 0) > 0.7
                            ? 'bg-green-100 text-green-600'
                            : 'bg-amber-100 text-amber-600'
                        }`}>
                        {Math.round((sugg.confidence || 0) * 100)}%
                    </span>
                    {sugg.sentiment && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold
                            ${(sugg.sentiment || 3) <= 2 ? 'bg-red-50 text-red-600'
                                : (sugg.sentiment || 3) >= 4 ? 'bg-green-50 text-green-600'
                                    : 'bg-slate-50 text-slate-500'
                            }`}>
                            {(sugg.sentiment || 3) <= 2 ? '😡' : (sugg.sentiment || 3) >= 4 ? '😊' : '😐'} {sugg.sentiment}/5
                        </span>
                    )}
                </div>
                <span className="text-[10px] text-slate-400">
                    {sugg.model || '?'} · {formatTime(sugg.createdAt)}
                </span>
            </div>

            {/* Warnings */}
            {(sugg.warnings || []).length > 0 && (
                <div className="px-3.5 py-2 bg-red-50 border-b border-red-200">
                    {sugg.warnings.map((w, i) => (
                        <div key={i} className="text-[11px] text-red-600 font-semibold">{w}</div>
                    ))}
                </div>
            )}

            {/* Reply cards */}
            <div className="p-3.5 flex flex-col gap-2">
                {(sugg.replies || []).map((r, i) => {
                    const isSent = sentReplies[sugg.id]?.has(i);
                    return (
                        <div key={i} className={`
                            px-3.5 py-3 rounded-[10px] transition-all duration-200
                            ${isSent
                                ? 'bg-green-50 border border-green-200 opacity-70'
                                : 'bg-sky-50 border border-sky-200'
                            }
                        `}>
                            {r.label && (
                                <div className={`text-[10px] font-bold mb-1.5 uppercase tracking-wider
                                    ${isSent ? 'text-green-600' : 'text-blue-600'}`}>
                                    {isSent ? '✅' : '💬'} {r.label}
                                </div>
                            )}
                            <div
                                className="text-[12.5px] text-sky-900 leading-[1.7]"
                                dangerouslySetInnerHTML={{ __html: renderMarkdown(r.text) }}
                            />
                            {isSent ? (
                                <div className="text-[10px] text-green-600 mt-1.5 font-semibold">✓ Đã gửi</div>
                            ) : (
                                <div className="flex gap-1.5 mt-2">
                                    <button
                                        onClick={() => onAccept(sugg, i)}
                                        disabled={sending}
                                        className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold
                                            bg-indigo-600 text-white border-none cursor-pointer
                                            transition-all duration-150 hover:bg-indigo-700
                                            disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        ✨ Gửi
                                    </button>
                                    <button
                                        onClick={() => onEdit(stripMarkdown(r.text))}
                                        className="px-2.5 py-0.5 rounded-md text-[11px] font-medium
                                            bg-slate-100 text-slate-700 border border-slate-200
                                            cursor-pointer hover:bg-slate-200"
                                    >
                                        ✏️ Sửa
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Missing info */}
            {filteredMissing.length > 0 && (
                <div className="px-3.5 py-2.5 border-t border-slate-50 bg-amber-50">
                    <div className="text-[11px] font-semibold text-amber-800 mb-1.5">
                        ⚠️ Thông tin còn thiếu:
                    </div>
                    {filteredMissing.map((m, i) => (
                        <div key={i} className="text-[11px] text-amber-800 ml-3 mb-0.5">
                            • <strong>{m.slot}:</strong> {m.question}
                        </div>
                    ))}
                </div>
            )}

            {/* Citation sources */}
            {validSources.length > 0 && (
                <div className="px-3.5 py-2 border-t border-slate-50 bg-sky-50">
                    <details>
                        <summary className="text-[10px] font-semibold text-sky-700 cursor-pointer select-none list-none flex items-center gap-1">
                            📄 Nguồn tham khảo ({validSources.length})
                            <span className="text-[9px] text-slate-400">▶</span>
                        </summary>
                        <div className="flex flex-col gap-1 mt-1.5">
                            {validSources.map((s, i) => {
                                const isErp = (s.docName || '').includes('Pricing');
                                return (
                                    <div key={i} className={`text-[10px] px-2 py-1 rounded-md font-medium flex flex-col gap-0.5
                                        ${isErp ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                                        <span>{isErp ? '💰' : '📖'} {s.docName}{s.heading ? ` > ${s.heading}` : ''}</span>
                                        {isErp && s.excerpt && (
                                            <div className="text-[10px] opacity-85 flex flex-col gap-px">
                                                {s.excerpt.split('\n').map((line: string, j: number) => (
                                                    <span key={j}>{line}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </details>
                </div>
            )}
        </div>
    );
}
