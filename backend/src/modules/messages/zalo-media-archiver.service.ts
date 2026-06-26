import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message, MessageStatus } from '../../entities/message.entity';
import { SystemSetting } from '../../entities/system-setting.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';

@Injectable()
export class ZaloMediaArchiverService implements OnApplicationBootstrap {
    private readonly logger = new Logger(ZaloMediaArchiverService.name);
    private isRunning = false;

    constructor(
        @InjectRepository(Message)
        private messageRepo: Repository<Message>,
        @InjectRepository(SystemSetting)
        private settingRepo: Repository<SystemSetting>
    ) {}

    onApplicationBootstrap() {
        this.logger.log('Zalo Media Archiver initialized. Will check for missing files shortly.');
        // Run immediately after 10s
        setTimeout(() => this.processPendingMedia(), 10000);
    }

    // Run every 2 minutes
    @Cron('0 */2 * * * *')
    async handleCron() {
        await this.processPendingMedia();
    }

    async processPendingMedia() {
        if (this.isRunning) return;
        this.isRunning = true;

        try {
            // Find 5 messages that haven't been backed up, but have attachments
            const messages = await this.messageRepo
                .createQueryBuilder('msg')
                .where('msg.is_media_backed_up = :backedUp', { backedUp: false })
                .andWhere("msg.attachments IS NOT NULL AND msg.attachments != '[]'")
                // Only download received messages (from Zalo) as sent ones are already local
                .andWhere("msg.status = :msgStatus", { msgStatus: MessageStatus.RECEIVED })
                .orderBy('msg.created_at', 'ASC')
                .take(5)
                .getMany();

            if (messages.length === 0) {
                this.isRunning = false;
                return;
            }

            // Get storage root
            const setting = await this.settingRepo.findOne({ where: { key: 'zalo_media_storage_path' } });
            const storageRoot = setting?.value ? setting.value : path.join(process.cwd(), 'uploads', 'zalo_backups');
            
            this.logger.log(`Found ${messages.length} messages to archive. Storage Root: ${storageRoot}`);

            for (const msg of messages) {
                try {
                    let updated = false;
                    let hasFailed = false;
                    const datePath = new Date(msg.createdAt).toISOString().slice(0, 10).replace(/-/g, '/'); // 2026/04/14
                    const uploadDir = path.join(storageRoot, datePath);

                    if (!fs.existsSync(uploadDir)) {
                        fs.mkdirSync(uploadDir, { recursive: true });
                    }

                    const parsedAttachments = Array.isArray(msg.attachments) ? msg.attachments : typeof msg.attachments === 'string' ? JSON.parse(msg.attachments) : [];

                    for (const attachment of parsedAttachments) {
                        if (attachment.localUrl) continue; // already downloaded
                        if (!attachment.url || !attachment.url.startsWith('http')) continue;

                        try {
                            const originalFileName = attachment.name || `file_${Date.now()}.bin`;
                            // Generate safe filename preventing collision
                            const safeFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${originalFileName}`;
                            const destPath = path.join(uploadDir, safeFileName);

                            this.logger.log(`Downloading ${attachment.url} to ${destPath}`);

                            const response = await axios.get(attachment.url, { responseType: 'stream', timeout: 30000 });
                            
                            // Save to disk using streams for low memory usage
                            await pipeline(response.data, fs.createWriteStream(destPath));

                            // Save relative path for controller resolution
                            attachment.localUrl = `/${datePath}/${safeFileName}`;
                            updated = true;
                        } catch (err: any) {
                            this.logger.error(`Failed to download ${attachment.url}: ${err.message}`);
                            hasFailed = true;
                        }
                    }

                    if (updated || parsedAttachments.length === 0) {
                        msg.attachments = parsedAttachments;
                        // If one attachment failed, don't mark as fully backed up, it will retry
                        if (!hasFailed) {
                            msg.isMediaBackedUp = true;
                        }
                        await this.messageRepo.save(msg);
                        this.logger.log(`Archived message ${msg.id}`);
                    }
                } catch(e) {
                    this.logger.error(`Error processing msg ${msg.id}: ${e}`);
                }
            }
        } catch (error) {
            this.logger.error('Error in Zalo Media Archiver sequence', error);
        } finally {
            this.isRunning = false;
        }
    }
}
