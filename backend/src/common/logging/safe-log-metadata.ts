/**
 * Metadata an toàn cho log ở trust-boundary AI/provider.
 * Không bao giờ trả lại `error.message`, prompt, response body hoặc giá trị người dùng nhập.
 */
export function safeErrorMetadata(error: unknown): string {
    const value = error as any;
    const rawName = typeof value?.name === 'string' ? value.name : 'Error';
    const name = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(rawName) ? rawName : 'Error';

    const directStatus = [value?.status, value?.statusCode, value?.response?.status]
        .map(Number)
        .find((status) => Number.isInteger(status) && status >= 100 && status <= 599);
    const message = typeof value?.message === 'string' ? value.message : '';
    const statusFromMessage = message.match(
        /\b(?:HTTP|API|Gemini|status(?:\s+code)?)\D{0,16}(\d{3})\b/i,
    )?.[1];
    const status = directStatus ?? (statusFromMessage ? Number(statusFromMessage) : undefined);

    const rawCode = typeof value?.code === 'string' ? value.code : '';
    const code = /^[A-Za-z0-9_-]{1,32}$/.test(rawCode) ? rawCode : '';

    return [
        `type=${name}`,
        status ? `status=${status}` : '',
        code ? `code=${code}` : '',
    ].filter(Boolean).join(' ');
}

/** Chỉ log độ dài; label được giới hạn để không trở thành log-injection. */
export function sensitiveTextMetadata(label: string, value: unknown): string {
    const safeLabel = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(label) ? label : 'text';
    const chars = typeof value === 'string' ? value.length : 0;
    return `${safeLabel}Chars=${chars}`;
}
