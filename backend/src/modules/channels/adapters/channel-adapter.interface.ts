/**
 * Channel Adapter Interface — Abstract interface for all channel integrations
 * Zalo OA, Facebook Messenger, etc. all implement this interface
 */

export interface ParsedMessage {
    externalMessageId: string;
    externalUserId: string;
    senderName: string;
    contactName?: string;
    senderAvatar?: string;
    text?: string;
    attachments?: ParsedAttachment[];
    timestamp: Date;
    rawPayload: any;
    isSelf?: boolean;
    /**
     * true = tin được ĐỒNG BỘ LẠI từ lịch sử (backfill), KHÔNG phải tin đến trực tiếp.
     * Khi true: chỉ lưu + chống trùng, KHÔNG bắn sự kiện socket live, KHÔNG kích hoạt AI,
     * KHÔNG hẹn cảnh báo SLA — tránh flood frontend và auto-reply nhầm vào tin cũ.
     */
    isBackfill?: boolean;
}

export interface ParsedAttachment {
    type: 'image' | 'file' | 'audio' | 'video' | 'sticker' | 'link';
    url: string;
    name?: string;
    size?: number;
    thumbnailUrl?: string;
}

export interface QuickReplyButton {
    title: string;
    payload: string;
}

export interface MessageContent {
    text?: string;
    attachmentUrl?: string;
    attachmentType?: string;
    buttons?: QuickReplyButton[];
    replyToId?: string;
}

export interface SendResult {
    success: boolean;
    externalMessageId?: string;
    externalCliMsgId?: string;
    error?: string;
}

export interface TokenResult {
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
}

export interface IChannelAdapter {
    /**
     * Verify webhook signature (HMAC, etc.)
     * `body` nên là RAW BODY (Buffer/string) khi có — HMAC tính trên bytes gốc;
     * object đã parse chỉ là fallback (stringify có thể lệch byte với bản gốc).
     */
    verifyWebhook(body: any, signature: string, secret: string): boolean;

    /**
     * Parse inbound webhook payload into standardized message
     */
    parseInboundMessage(body: any): ParsedMessage | null;

    /**
     * Parse TOÀN BỘ event trong một lần gọi webhook (provider có thể batch nhiều
     * entry/messaging — Facebook chắc chắn có). Adapter nào không hỗ trợ thì
     * controller rơi về parseInboundMessage đơn lẻ.
     */
    parseInboundMessages?(body: any): ParsedMessage[];

    /**
     * Send outbound message to channel
     */
    sendMessage(
        accessToken: string,
        recipientId: string,
        content: MessageContent,
    ): Promise<SendResult>;

    /**
     * Refresh channel access token
     */
    refreshToken(
        appId: string,
        appSecret: string,
        currentRefreshToken: string,
    ): Promise<TokenResult>;
}
