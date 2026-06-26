import {
    Controller,
    Get,
    Post,
    Delete,
    Patch,
    Body,
    Param,
    Query,
    UseGuards,
    HttpCode,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ZaloAccount, ZaloAccountStatus } from '../../entities/zalo-account.entity';
import { Channel, ChannelType } from '../../entities/channel.entity';
import { ZaloPoolService } from './zalo-pool.service';
import { ZaloRateLimiterService } from './zalo-rate-limiter.service';

@Controller('zalo-personal')
@UseGuards(AuthGuard('jwt'))
export class ZaloPersonalController {
    private readonly logger = new Logger(ZaloPersonalController.name);
    constructor(
        @InjectRepository(ZaloAccount)
        private readonly repo: Repository<ZaloAccount>,
        @InjectRepository(Channel)
        private readonly channelRepo: Repository<Channel>,
        private readonly pool: ZaloPoolService,
        private readonly rateLimiter: ZaloRateLimiterService,
    ) {}

    /** GET /zalo-personal/status — Check if zca-js is available */
    @Get('status')
    getStatus() {
        return {
            available: this.pool.isAvailable(),
            accounts: this.pool.getAllStatuses(),
            rateLimits: this.rateLimiter.getAllStats(),
        };
    }

    @Get('accounts')
    async listAccounts() {
        const query = this.repo.createQueryBuilder('zalo')
            .leftJoinAndSelect('zalo.channel', 'channel')
            .where('channel.isActive = :active', { active: true })
            .orderBy('zalo.createdAt', 'DESC');

        const accounts = await query.getMany();

        return accounts.map((acc) => ({
            ...acc,
            liveStatus: this.pool.getStatus(acc.id),
            dailyQuota: this.rateLimiter.getRemainingQuota(acc.id),
        }));
    }

    /** POST /zalo-personal/accounts — Register a new Zalo account (returns ID for QR) */
    @Post('accounts')
    async createAccount(
        @Body() dto: { ownerUserId: string; phone?: string; displayName?: string },
    ) {
        const channel = this.channelRepo.create({
            type: ChannelType.ZALO_PERSONAL,
            name: dto.displayName || 'Zalo cá nhân',
            externalId: `zalo_personal_${Date.now()}`,
            isActive: true,
            config: { ownerUserId: dto.ownerUserId }
        });
        const savedChannel = await this.channelRepo.save(channel);

        const account = this.repo.create({
            ownerUserId: dto.ownerUserId,
            phone: dto.phone,
            displayName: dto.displayName || 'Zalo mới',
            channelId: savedChannel.id,
        });
        const savedAccount = await this.repo.save(account);

        savedChannel.externalId = savedAccount.id;
        savedChannel.accessTokenEnc = savedAccount.id;
        await this.channelRepo.save(savedChannel);

        return savedAccount;
    }

    /** POST /zalo-personal/accounts/:id/qr — Start QR login flow */
    @Post('accounts/:id/qr')
    async startQRLogin(@Param('id') id: string) {
        if (!this.pool.isAvailable()) {
            return { success: false, error: 'zca-js chưa được cài đặt. Chạy: npm i zca-js' };
        }
        try {
            await this.pool.loginQR(id);
            return { success: true };
        } catch (err) {
            return { success: false, error: String(err) };
        }
    }

    /** POST /zalo-personal/accounts/:id/reconnect — Manual reconnect */
    @Post('accounts/:id/reconnect')
    async reconnect(@Param('id') id: string) {
        const account = await this.repo.findOne({ where: { id }, select: ['id', 'sessionData'] });
        if (!account?.sessionData) {
            return { success: false, error: 'Không có session. Cần quét QR mới.' };
        }
        try {
            await this.pool.reconnect(id, account.sessionData);
            return { success: true };
        } catch (err) {
            return { success: false, error: String(err) };
        }
    }

    /** POST /zalo-personal/accounts/:id/sync — Sync missed messages for one account */
    @Post('accounts/:id/sync')
    async syncMessages(@Param('id') id: string) {
        try {
            const result = await this.pool.syncMissedMessages(id, undefined, undefined, true);
            return { success: true, data: result };
        } catch (err) {
            return { success: false, error: String(err) };
        }
    }

    /** POST /zalo-personal/sync-all — Sync missed messages for ALL accounts (auto-reconnect if needed) */
    @Post('sync-all')
    async syncAll() {
        // Get all accounts from DB
        const accounts = await this.pool.getAllAccounts();
        if (!accounts || accounts.length === 0) {
            return { success: false, error: 'Không có tài khoản Zalo nào.' };
        }

        const results: Record<string, any> = {};

        for (const account of accounts) {
            const accountId = account.id;
            const statuses = this.pool.getAllStatuses();
            const instanceStatus = statuses[accountId]?.status;

            // Auto-reconnect if not connected
            if (instanceStatus !== 'connected') {
                this.logger.log(`[sync-all] Account ${accountId} is ${instanceStatus || 'not in memory'}, attempting reconnect...`);
                try {
                    await this.pool.reconnect(accountId, account.sessionData);
                    // Wait for connection to establish (max 15 seconds)
                    let connected = false;
                    for (let i = 0; i < 15; i++) {
                        await new Promise(r => setTimeout(r, 1000));
                        const s = this.pool.getAllStatuses();
                        if (s[accountId]?.status === 'connected') {
                            connected = true;
                            break;
                        }
                    }
                    if (!connected) {
                        results[accountId] = { error: 'Không thể kết nối lại Zalo. Có thể cần quét QR lại.', synced: 0, skipped: 0 };
                        continue;
                    }
                    this.logger.log(`[sync-all] Account ${accountId} reconnected successfully`);
                } catch (err) {
                    results[accountId] = { error: `Reconnect failed: ${String(err)}`, synced: 0, skipped: 0 };
                    continue;
                }
            }

            // Now sync
            try {
                results[accountId] = await this.pool.syncMissedMessages(accountId, undefined, undefined, true);
            } catch (err) {
                results[accountId] = { error: String(err), synced: 0, skipped: 0 };
            }
        }
        return { success: true, data: results };
    }

    /** POST /zalo-personal/accounts/:id/send — Send a message */
    @Post('accounts/:id/send')
    async sendMessage(
        @Param('id') id: string,
        @Body() dto: { recipientUid: string; content: string },
    ) {
        return this.pool.sendMessage(id, dto.recipientUid, dto.content);
    }

    /** DELETE /zalo-personal/accounts/:id — Disconnect and remove */
    @Delete('accounts/:id')
    async removeAccount(@Param('id') id: string) {
        const account = await this.repo.findOne({ where: { id } });
        if (!account) throw new BadRequestException('Account not found');

        if (account.channelId) {
            await this.channelRepo.update(account.channelId, { isActive: false, accessTokenEnc: '' });
        }
        await this.repo.update(id, { status: ZaloAccountStatus.DISCONNECTED });
        this.pool.disconnect(id);
        return { success: true };
    }

    /** GET /zalo-personal/accounts/:id/quota — Get rate limit info */
    @Get('accounts/:id/quota')
    getQuota(@Param('id') id: string) {
        return {
            dailyCount: this.rateLimiter.getDailyCount(id),
            remaining: this.rateLimiter.getRemainingQuota(id),
            limits: this.rateLimiter.checkLimits(id),
        };
    }

    // ═══════════════════════ CRM FEATURES ═══════════════════════

    // ── Auto-Reply ──

    @Get('accounts/:id/auto-reply')
    async getAutoReplies(@Param('id') id: string) {
        try {
            return { success: true, data: await this.pool.getAutoReplies(id) };
        } catch (e: any) { return { success: false, error: e.message }; }
    }

    @Post('accounts/:id/auto-reply')
    async createAutoReply(
        @Param('id') id: string,
        @Body() dto: { content: string; isEnable?: boolean; startTime?: number; endTime?: number; scope?: number; uids?: string[] },
    ) {
        try {
            return { success: true, data: await this.pool.createAutoReply(id, dto) };
        } catch (e: any) { return { success: false, error: e.message }; }
    }

    @Patch('accounts/:id/auto-reply')
    async updateAutoReply(
        @Param('id') id: string,
        @Body() dto: { id: number; content?: string; isEnable?: boolean; startTime?: number; endTime?: number; scope?: number },
    ) {
        try {
            return { success: true, data: await this.pool.updateAutoReply(id, dto) };
        } catch (e: any) { return { success: false, error: e.message }; }
    }

    @Delete('accounts/:id/auto-reply/:replyId')
    async deleteAutoReply(@Param('id') id: string, @Param('replyId') replyId: string) {
        try {
            return { success: true, data: await this.pool.deleteAutoReply(id, parseInt(replyId)) };
        } catch (e: any) { return { success: false, error: e.message }; }
    }

    // ── Labels ──

    @Get('accounts/:id/labels')
    async getLabels(@Param('id') id: string) {
        try {
            return { success: true, data: await this.pool.getLabels(id) };
        } catch (e: any) { return { success: false, error: e.message }; }
    }

    @Patch('accounts/:id/labels')
    async updateLabels(@Param('id') id: string, @Body() dto: { labels: any[] }) {
        try {
            return { success: true, data: await this.pool.updateLabels(id, dto.labels) };
        } catch (e: any) { return { success: false, error: e.message }; }
    }

    // ── Quick Messages ──

    @Get('accounts/:id/quick-messages')
    async getQuickMessages(@Param('id') id: string) {
        try {
            return { success: true, data: await this.pool.getQuickMessages(id) };
        } catch (e: any) { return { success: false, error: e.message }; }
    }

    @Post('accounts/:id/quick-messages')
    async addQuickMessage(@Param('id') id: string, @Body() dto: { keyword: string; title: string }) {
        try {
            return { success: true, data: await this.pool.addQuickMessage(id, dto) };
        } catch (e: any) { return { success: false, error: e.message }; }
    }

    @Patch('accounts/:id/quick-messages/:msgId')
    async updateQuickMessage(
        @Param('id') id: string, @Param('msgId') msgId: string,
        @Body() dto: { keyword: string; title: string },
    ) {
        try {
            return { success: true, data: await this.pool.updateQuickMessage(id, { id: msgId, ...dto }) };
        } catch (e: any) { return { success: false, error: e.message }; }
    }

    @Delete('accounts/:id/quick-messages/:msgId')
    async removeQuickMessage(@Param('id') id: string, @Param('msgId') msgId: string) {
        try {
            return { success: true, data: await this.pool.removeQuickMessage(id, msgId) };
        } catch (e: any) { return { success: false, error: e.message }; }
    }

    // ── Rich Message Sending ──

    @Post('accounts/:id/send-link')
    async sendLink(
        @Param('id') id: string,
        @Body() dto: { threadId: string; link: string; msg?: string; isGroup?: boolean },
    ) {
        try {
            return { success: true, data: await this.pool.sendLinkMsg(id, dto.threadId, dto.link, dto.msg, dto.isGroup) };
        } catch (e: any) { return { success: false, error: e.message }; }
    }

    @Post('accounts/:id/send-bank-card')
    async sendBankCard(
        @Param('id') id: string,
        @Body() dto: { threadId: string; binBank: string; numAccBank: string; nameAccBank?: string; isGroup?: boolean },
    ) {
        try {
            const { threadId, isGroup, ...bankInfo } = dto;
            return { success: true, data: await this.pool.sendBankCard(id, threadId, bankInfo as any, isGroup) };
        } catch (e: any) { return { success: false, error: e.message }; }
    }

    @Post('accounts/:id/send-contact-card')
    async sendContactCard(
        @Param('id') id: string,
        @Body() dto: { threadId: string; contactUserId: string; isGroup?: boolean },
    ) {
        try {
            return { success: true, data: await this.pool.sendContactCard(id, dto.threadId, dto.contactUserId, dto.isGroup) };
        } catch (e: any) { return { success: false, error: e.message }; }
    }

    // ── Contact Lookup ──

    @Get('accounts/:id/find-user')
    async findUser(@Param('id') id: string, @Query('phone') phone: string) {
        if (!phone) throw new BadRequestException('phone query parameter is required');
        try {
            return { success: true, data: await this.pool.findUserByPhone(id, phone) };
        } catch (e: any) { return { success: false, error: e.message }; }
    }

    // ── Friend Request Management ──

    @Post('accounts/:id/accept-friend')
    async acceptFriend(@Param('id') id: string, @Body() dto: { userId: string }) {
        try {
            return { success: true, data: await this.pool.acceptFriendRequest(id, dto.userId) };
        } catch (e: any) { return { success: false, error: e.message }; }
    }

    @Post('accounts/:id/send-friend-request')
    async sendFriendRequest(
        @Param('id') id: string,
        @Body() dto: { userId: string; message?: string },
    ) {
        try {
            return { success: true, data: await this.pool.sendFriendRequest(id, dto.userId, dto.message) };
        } catch (e: any) { return { success: false, error: e.message }; }
    }
}
