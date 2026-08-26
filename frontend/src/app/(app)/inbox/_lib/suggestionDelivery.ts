/** Chỉ ghi nhận suggestion sau khi API gửi tin thực sự trả về payload thành công. */
export async function deliverSuggestionReply<T>(
    send: () => Promise<T | null>,
    markSent: () => Promise<void> | void,
): Promise<boolean> {
    const sent = await send();
    if (!sent) return false;
    await markSent();
    return true;
}
