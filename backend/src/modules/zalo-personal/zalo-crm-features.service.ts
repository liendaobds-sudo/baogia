import { Logger } from '@nestjs/common';

/**
 * ZaloCrmFeatures — CRM wrapper methods for Zalo API.
 * Handles: Auto-Reply, Labels, Quick Messages, Contact Lookup, Friend Requests.
 * Extracted from ZaloPoolService to reduce file size.
 */
export class ZaloCrmFeatures {
    private readonly logger = new Logger('ZaloCrmFeatures');

    /** Get API with error check */
    private requireApi(api: any, accountId: string): any {
        if (!api) throw new Error(`Account ${accountId} not connected`);
        return api;
    }

    // ── Auto-Reply ──

    async getAutoReplies(api: any, accountId: string): Promise<any> {
        return this.requireApi(api, accountId).getAutoReplyList();
    }

    async createAutoReply(api: any, accountId: string, payload: {
        content: string; isEnable?: boolean;
        startTime?: number; endTime?: number;
        scope?: number; uids?: string[];
    }): Promise<any> {
        return this.requireApi(api, accountId).createAutoReply({
            content: payload.content,
            isEnable: payload.isEnable ?? true,
            startTime: payload.startTime || 0,
            endTime: payload.endTime || 0,
            scope: payload.scope ?? 0,
            uids: payload.uids,
        });
    }

    async updateAutoReply(api: any, accountId: string, payload: {
        id: number; content?: string; isEnable?: boolean;
        startTime?: number; endTime?: number;
        scope?: number; uids?: string[];
    }): Promise<any> {
        return this.requireApi(api, accountId).updateAutoReply(payload);
    }

    async deleteAutoReply(api: any, accountId: string, replyId: number): Promise<any> {
        return this.requireApi(api, accountId).deleteAutoReply(replyId);
    }

    // ── Labels ──

    async getLabels(api: any, accountId: string): Promise<any> {
        return this.requireApi(api, accountId).getLabels();
    }

    async updateLabels(api: any, accountId: string, labelData: any[]): Promise<any> {
        return this.requireApi(api, accountId).updateLabels(labelData);
    }

    // ── Quick Messages ──

    async getQuickMessages(api: any, accountId: string): Promise<any> {
        return this.requireApi(api, accountId).getQuickMessageList();
    }

    async addQuickMessage(api: any, accountId: string, payload: { keyword: string; title: string }): Promise<any> {
        return this.requireApi(api, accountId).addQuickMessage({ keyword: payload.keyword, title: payload.title });
    }

    async updateQuickMessage(api: any, accountId: string, payload: { id: string; keyword: string; title: string }): Promise<any> {
        return this.requireApi(api, accountId).updateQuickMessage(payload);
    }

    async removeQuickMessage(api: any, accountId: string, messageId: string): Promise<any> {
        return this.requireApi(api, accountId).removeQuickMessage(messageId);
    }

    // ── Contact Lookup ──

    async findUserByPhone(api: any, accountId: string, phone: string): Promise<any> {
        return this.requireApi(api, accountId).findUser(phone);
    }

    // ── Friend Request Management ──

    async acceptFriendRequest(api: any, accountId: string, userId: string): Promise<any> {
        return this.requireApi(api, accountId).acceptFriendRequest(userId);
    }

    async sendFriendRequest(api: any, accountId: string, userId: string, message?: string): Promise<any> {
        return this.requireApi(api, accountId).sendFriendRequest(userId, message || 'Xin chào, mình kết bạn nhé!');
    }
}
