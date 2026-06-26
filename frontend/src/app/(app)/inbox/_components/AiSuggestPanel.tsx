'use client';

import { useState } from 'react';
import type { Suggestion } from '../types';
import { renderSafeBold, stripMarkdown } from '../_lib/sanitizeMarkdown';

interface AiSuggestPanelProps {
    latestSuggestion: Suggestion | null;
    sentReplies: Record<string, Set<number>>;
    onAcceptSuggestion: (suggestion: Suggestion, replyIndex: number) => void;
    onEditSuggestion: (suggestion: Suggestion, replyIndex: number) => void;
    onInjectText: (text: string) => void;
}

export function AiSuggestPanel({ latestSuggestion, sentReplies, onAcceptSuggestion, onEditSuggestion, onInjectText }: AiSuggestPanelProps) {
    // Khóa pending theo reply đang gửi: `${suggestionId}:${index}` (Req 8).
    const [pendingReplyKey, setPendingReplyKey] = useState<string | null>(null);

    const handleAccept = async (suggestion: Suggestion, i: number) => {
        const key = `${suggestion.id}:${i}`;
        if (pendingReplyKey) return; // chặn kích hoạt lại khi đang gửi
        setPendingReplyKey(key);
        try {
            await Promise.resolve(onAcceptSuggestion(suggestion, i));
        } finally {
            setPendingReplyKey(null);
        }
    };

    if (!latestSuggestion) {
        return (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
                <div style={{ fontSize: 13 }}>Chưa có gợi ý AI</div>
            </div>
        );
    }

    return (
        <div style={{ padding: 16 }}>
            {/* Badges */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                <span className="badge badge-info" style={{ fontSize: 11 }}>{latestSuggestion.intent}</span>
                <span className="badge" style={{ fontSize: 11, background: `hsl(${Math.max(0, latestSuggestion.confidence * 120)}, 70%, 90%)`, color: `hsl(${Math.max(0, latestSuggestion.confidence * 120)}, 70%, 30%)` }}>
                    {Math.round(latestSuggestion.confidence * 100)}% tin cậy
                </span>
                {latestSuggestion.sentiment != null && (
                    <span className="badge" style={{
                        fontSize: 11, background: latestSuggestion.sentiment <= 2 ? '#fef2f2' : latestSuggestion.sentiment >= 4 ? '#f0fdf4' : '#f8fafc',
                        color: latestSuggestion.sentiment <= 2 ? '#dc2626' : latestSuggestion.sentiment >= 4 ? '#16a34a' : '#64748b'
                    }}>
                        {latestSuggestion.sentiment <= 2 ? '😡' : latestSuggestion.sentiment >= 4 ? '😊' : '😐'} {latestSuggestion.sentiment}/5
                    </span>
                )}
            </div>

            {/* Missing Info */}
            {latestSuggestion.missingInfo?.length > 0 && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>
                    <div style={{ fontWeight: 600, color: '#c2410c', marginBottom: 6 }}>⚠ Thiếu thông tin:</div>
                    {latestSuggestion.missingInfo.map((mi, i) => (
                        <div key={i} style={{ color: '#9a3412', marginBottom: 4 }}>• <strong>{mi.slot}</strong>: {mi.question}</div>
                    ))}
                </div>
            )}

            {/* Sources */}
            {(latestSuggestion.sources || []).filter(s => s.docName).length > 0 && (
                <div style={{ padding: '10px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, marginBottom: 12 }}>
                    <details>
                        <summary style={{ fontSize: 12, fontWeight: 600, color: '#0369a1', cursor: 'pointer', listStyle: 'none' }}>
                            📄 Nguồn tham khảo ({(latestSuggestion.sources || []).filter(s => s.docName).length}) ▾
                        </summary>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                            {(latestSuggestion.sources || []).filter(s => s.docName).map((s, i) => {
                                const isErp = (s.docName || '').includes('Pricing');
                                return (
                                    <div key={i} style={{ fontSize: 11, padding: '6px 10px', borderRadius: 6, background: isErp ? '#dcfce7' : '#dbeafe', color: isErp ? '#166534' : '#1e40af', fontWeight: 500 }}>
                                        <div style={{ marginBottom: 4 }}>{isErp ? '💰' : '📖'} {s.docName}{s.heading ? ` > ${s.heading}` : ''}</div>
                                        {isErp && s.excerpt && (
                                            <div style={{ fontSize: 11, opacity: 0.85, whiteSpace: 'pre-wrap' }}>{s.excerpt}</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </details>
                </div>
            )}

            {/* Warnings */}
            {(latestSuggestion.warnings || []).length > 0 && (
                <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 12 }}>
                    {latestSuggestion.warnings!.map((w, i) => (
                        <div key={i} style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>⚠ {w}</div>
                    ))}
                </div>
            )}

            {/* Reply Cards */}
            {latestSuggestion.replies.map((reply, i) => {
                const isSent = sentReplies[latestSuggestion.id]?.has(i);
                const replyKey = `${latestSuggestion.id}:${i}`;
                const isPending = pendingReplyKey === replyKey;
                const anyPending = pendingReplyKey !== null;
                return (
                    <div key={i} style={{ background: isSent ? '#f0fdf4' : '#fff', border: `1px solid ${isSent ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 12, padding: 14, marginBottom: 10, opacity: isSent ? 0.7 : 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: isSent ? '#16a34a' : '#6366f1', marginBottom: 6 }}>{isSent ? '✅' : '💬'} {reply.label || `Phản hồi ${i + 1}`}</div>
                        <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: renderSafeBold(reply.text) }} />
                        {!isSent && (
                            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                                <button
                                    className="btn btn-primary"
                                    style={{ fontSize: 12, padding: '4px 12px' }}
                                    disabled={anyPending}
                                    aria-busy={isPending}
                                    aria-label={`Gửi phản hồi ${i + 1}`}
                                    onClick={() => handleAccept(latestSuggestion, i)}
                                >
                                    {isPending ? '⏳ Đang gửi…' : '✨ Gửi'}
                                </button>
                                <button
                                    className="btn"
                                    style={{ fontSize: 12, padding: '4px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0' }}
                                    disabled={anyPending}
                                    aria-label={`Sửa và gửi phản hồi ${i + 1}`}
                                    onClick={() => {
                                        onEditSuggestion(latestSuggestion, i);
                                        onInjectText(stripMarkdown(reply.text));
                                    }}
                                >
                                    ✏️ Sửa & Gửi
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
