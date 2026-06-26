// ═══════════════════════════════════════
// Test Chat — Markdown Utilities
// ═══════════════════════════════════════

/** Convert markdown text to formatted HTML for rendering inside chat bubbles */
export function renderMarkdown(text: string): string {
    if (!text) return '';
    const html = text
        // Escape HTML
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        // Headings
        .replace(/^###\s+(.+)$/gm, '<div class="font-bold text-[13px] text-slate-800 my-2 border-b border-slate-200 pb-0.5">$1</div>')
        .replace(/^##\s+(.+)$/gm, '<div class="font-bold text-[13.5px] text-slate-900 my-2.5 border-b border-slate-200 pb-1">$1</div>')
        // Bold
        .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-slate-800">$1</strong>')
        // Italic
        .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

    // Process lines for lists and paragraphs
    const lines = html.split('\n');
    const processed: string[] = [];
    let inList = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (/^[-•]\s/.test(trimmed)) {
            if (!inList) { processed.push('<ul class="my-1 pl-4 list-none">'); inList = true; }
            const content = trimmed.replace(/^[-•]\s+/, '');
            processed.push(`<li class="my-0.5 text-xs leading-relaxed relative pl-3"><span class="absolute left-0 text-slate-400">•</span>${content}</li>`);
        } else if (/^\d+\.\s/.test(trimmed)) {
            if (!inList) { processed.push('<ol class="my-1 pl-5">'); inList = true; }
            const content = trimmed.replace(/^\d+\.\s+/, '');
            processed.push(`<li class="my-0.5 text-xs leading-relaxed">${content}</li>`);
        } else {
            if (inList) { processed.push(inList ? '</ul>' : '</ol>'); inList = false; }
            if (trimmed === '') {
                processed.push('<div class="h-1.5"></div>');
            } else if (!trimmed.startsWith('<div class="font-bold')) {
                processed.push(`<div class="my-0.5 leading-relaxed">${trimmed}</div>`);
            } else {
                processed.push(trimmed);
            }
        }
    }
    if (inList) processed.push('</ul>');

    return processed.join('');
}

/** Strip markdown → plain text for sending as message */
export function stripMarkdown(text: string): string {
    if (!text) return '';
    return text
        .replace(/^#{1,4}\s+(.+)$/gm, '📌 $1')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
        .replace(/^\s*[-•]\s+/gm, '  ✦ ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
