import { Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message, SenderType } from '../../entities/message.entity';
import { SystemSetting } from '../../entities/system-setting.entity';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { forEachTenant } from '../../common/tenant/tenant-background';

/** HTTP status that will never succeed later (CDN expired / revoked). */
const PERMANENT_HTTP = new Set([400, 401, 403, 404, 410, 451]);

@Injectable()
export class ZaloMediaArchiverService implements OnApplicationBootstrap {
    private readonly logger = new Logger(ZaloMediaArchiverService.name);
    private isRunning = false;

    constructor(
        @InjectRepository(Message)
        private messageRepo: Repository<Message>,
        @InjectRepository(SystemSetting)
        private settingRepo: Repository<SystemSetting>,
        @Optional() private tenantCtx?: TenantContextService,
    ) {}

    onApplicationBootstrap() {
        this.logger.log('Zalo Media Archiver initialized. Will check for missing files shortly.');
        setTimeout(() => this.processPendingMedia(), 15000);
    }

    // Every 2 minutes (was every 2 min — keep; permanent-fail marks stop the 404 spam)
    @Cron('0 */2 * * * *')
    async handleCron() {
        await this.processPendingMedia();
    }

    /**
     * Khi RLS bật: lặp từng tenant. Khi tắt: chạy thẳng.
     * Guard `isRunning` → 1 lượt tại một thời điểm.
     */
    async processPendingMedia() {
        if (this.isRunning) return;
        this.isRunning = true;
        try {
            await forEachTenant(this.tenantCtx, this.messageRepo.manager, () => this.processPendingMediaCore());
        } finally {
            this.isRunning = false;
        }
    }

    private async processPendingMediaCore() {
        try {
            const messages = await this.messageRepo
                .createQueryBuilder('msg')
                .where('msg.is_media_backed_up = :backedUp', { backedUp: false })
                .andWhere("msg.attachments IS NOT NULL AND msg.attachments != '[]'")
                .andWhere('msg.sender_type = :senderType', { senderType: SenderType.CUSTOMER })
                .orderBy('msg.created_at', 'ASC')
                .take(5)
                .getMany();

            if (messages.length === 0) return;

            const setting = await this.settingRepo.findOne({ where: { key: 'zalo_media_storage_path' } });
            const storageRoot = setting?.value
                ? setting.value
                : path.join(process.cwd(), 'uploads', 'zalo_backups');

            this.logger.debug(`Archiver: ${messages.length} message(s) pending. Root: ${storageRoot}`);

            for (const msg of messages) {
                try {
                    await this.archiveOneMessage(msg, storageRoot);
                } catch (e) {
                    this.logger.error(`Error processing msg ${msg.id}: ${e}`);
                }
            }
        } catch (error) {
            this.logger.error('Error in Zalo Media Archiver sequence', error);
        }
    }

    private async archiveOneMessage(msg: Message, storageRoot: string): Promise<void> {
        const datePath = new Date(msg.createdAt).toISOString().slice(0, 10).replace(/-/g, '/');
        // Phân vùng theo tenant NGAY KHI biết tenant, không chờ cờ RLS (audit 2026-08-29):
        // `MediaController.assertTenantOwnsPath` cưỡng chế quyền đọc dựa trên tiền tố này,
        // nên file mới phải luôn nằm trong `t<tenantId>/` để không đọc chéo tenant được.
        // Ưu tiên tenant của chính tin nhắn; fallback tenant context của job.
        const tenantId = msg.tenantId ?? this.tenantCtx?.currentTenantId() ?? null;
        const relDir = tenantId != null ? `t${tenantId}/${datePath}` : datePath;
        const uploadDir = path.join(storageRoot, relDir);

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const parsedAttachments = Array.isArray(msg.attachments)
            ? msg.attachments
            : typeof msg.attachments === 'string'
              ? JSON.parse(msg.attachments)
              : [];

        if (parsedAttachments.length === 0) {
            msg.isMediaBackedUp = true;
            await this.messageRepo.save(msg);
            return;
        }

        let changed = false;
        let hasTransientFail = false;

        for (const attachment of parsedAttachments) {
            if (attachment.localUrl) continue;
            // Permanent failure already recorded — never re-download
            if (attachment.archiveFailed) continue;
            if (!attachment.url || !String(attachment.url).startsWith('http')) {
                attachment.archiveFailed = true;
                attachment.archiveFailReason = 'missing_or_invalid_url';
                changed = true;
                continue;
            }

            try {
                const originalFileName = this.safeBaseName(attachment.name || `file_${Date.now()}.bin`);
                const safeFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${originalFileName}`;
                const destPath = path.join(uploadDir, safeFileName);

                const response = await axios.get(attachment.url, {
                    responseType: 'stream',
                    timeout: 30000,
                    // Don't throw on 4xx/5xx so we can classify status
                    validateStatus: () => true,
                    maxRedirects: 5,
                    headers: {
                        // Some Zalo CDN hosts reject bare clients
                        'User-Agent': 'ZeplaoPrint-MediaArchiver/1.0',
                        Accept: '*/*',
                    },
                });

                if (response.status >= 200 && response.status < 300) {
                    await pipeline(response.data, fs.createWriteStream(destPath));
                    attachment.localUrl = `/${relDir}/${safeFileName}`.replace(/\\/g, '/');
                    delete attachment.archiveFailed;
                    delete attachment.archiveFailReason;
                    changed = true;
                    this.logger.log(`Archived media for msg ${msg.id}: ${safeFileName}`);
                } else {
                    // Drain stream if any to free socket
                    try {
                        response.data?.destroy?.();
                    } catch { /* ignore */ }

                    if (PERMANENT_HTTP.has(response.status)) {
                        attachment.archiveFailed = true;
                        attachment.archiveFailReason = `http_${response.status}`;
                        attachment.archiveFailedAt = new Date().toISOString();
                        changed = true;
                        this.logger.warn(
                            `Permanent archive skip msg=${msg.id} status=${response.status} (CDN expired/missing) — will not retry`,
                        );
                    } else {
                        hasTransientFail = true;
                        this.logger.warn(
                            `Transient archive fail msg=${msg.id} status=${response.status} — will retry later`,
                        );
                    }
                }
            } catch (err: any) {
                const status = err?.response?.status;
                if (status && PERMANENT_HTTP.has(status)) {
                    attachment.archiveFailed = true;
                    attachment.archiveFailReason = `http_${status}`;
                    attachment.archiveFailedAt = new Date().toISOString();
                    changed = true;
                    this.logger.warn(
                        `Permanent archive skip msg=${msg.id} status=${status} — will not retry`,
                    );
                } else {
                    hasTransientFail = true;
                    this.logger.warn(
                        `Transient archive fail msg=${msg.id}: ${err?.message || err}`,
                    );
                }
            }
        }

        // Done when every attachment is either local or permanently failed
        const allResolved = parsedAttachments.every(
            (a: any) => a.localUrl || a.archiveFailed || !a.url || !String(a.url).startsWith('http'),
        );

        if (changed || allResolved) {
            msg.attachments = parsedAttachments;
            // Only clear the pending flag when nothing left to retry
            if (allResolved && !hasTransientFail) {
                msg.isMediaBackedUp = true;
            }
            await this.messageRepo.save(msg);
            if (msg.isMediaBackedUp) {
                this.logger.debug(`Message ${msg.id} archive queue complete (success and/or permanent skips)`);
            }
        }
    }

    private safeBaseName(name: string): string {
        return String(name)
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
            .slice(0, 120) || 'file.bin';
    }
}
