import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { WebhookSetting } from '../../entities/webhook-setting.entity';

@Injectable()
export class WebhookService {
    private readonly logger = new Logger(WebhookService.name);

    constructor(
        @InjectRepository(WebhookSetting)
        private readonly repo: Repository<WebhookSetting>,
    ) {}

    /**
     * Fire-and-forget webhook delivery to all active subscribers.
     * Signs payload with HMAC-SHA256 if webhook_secret is configured.
     * Inspired by ZaloCRM webhook-service.ts
     *
     * @param event - Event name like "message.received", "contact.created"
     * @param data - Payload data
     */
    async emit(event: string, data: any): Promise<void> {
        try {
            const settings = await this.repo.find({
                where: { isActive: true },
            });

            for (const setting of settings) {
                // Check event filter — "*" means all events
                if (!setting.events.includes('*') && !setting.events.includes(event)) {
                    continue;
                }

                // Skip if circuit breaker triggered (> 10 consecutive failures)
                if (setting.consecutiveFailures >= 10) {
                    continue;
                }

                this.deliverWebhook(setting, event, data);
            }
        } catch (err) {
            this.logger.error('Error emitting webhook:', err);
        }
    }

    /**
     * Deliver a single webhook — fire and forget.
     * Never throws or blocks the caller.
     */
    private async deliverWebhook(
        setting: WebhookSetting,
        event: string,
        data: any,
    ): Promise<void> {
        const payload = JSON.stringify({
            event,
            timestamp: new Date().toISOString(),
            data,
        });

        // HMAC-SHA256 signature
        const signature = setting.webhookSecret
            ? crypto.createHmac('sha256', setting.webhookSecret).update(payload).digest('hex')
            : '';

        try {
            const response = await fetch(setting.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Signature': signature,
                    'X-Webhook-Event': event,
                    'User-Agent': 'ZeplaoPrint-Webhook/1.0',
                },
                body: payload,
                signal: AbortSignal.timeout(10_000), // 10s timeout
            });

            if (response.ok) {
                // Reset failure counter on success
                if (setting.consecutiveFailures > 0) {
                    await this.repo.update(setting.id, { consecutiveFailures: 0 });
                }
            } else {
                this.logger.warn(
                    `Webhook delivery failed for ${setting.name}: HTTP ${response.status}`,
                );
                await this.recordFailure(setting);
            }
        } catch (err) {
            this.logger.warn(`Webhook delivery error for ${setting.name}:`, err);
            await this.recordFailure(setting);
        }
    }

    private async recordFailure(setting: WebhookSetting): Promise<void> {
        await this.repo.update(setting.id, {
            consecutiveFailures: setting.consecutiveFailures + 1,
            lastFailureAt: new Date(),
        });
    }

    // ═══ CRUD for webhook settings ═══

    async findAll(): Promise<WebhookSetting[]> {
        return this.repo.find({ order: { createdAt: 'DESC' } });
    }

    async create(dto: {
        name: string;
        webhookUrl: string;
        webhookSecret?: string;
        events?: string[];
    }): Promise<WebhookSetting> {
        return this.repo.save(
            this.repo.create({
                name: dto.name,
                webhookUrl: dto.webhookUrl,
                webhookSecret: dto.webhookSecret,
                events: dto.events || ['*'],
            }),
        );
    }

    async update(
        id: string,
        dto: Partial<{ name: string; webhookUrl: string; webhookSecret: string; events: string[]; isActive: boolean }>,
    ): Promise<WebhookSetting> {
        await this.repo.update(id, dto);
        return this.repo.findOneBy({ id }) as Promise<WebhookSetting>;
    }

    async remove(id: string): Promise<void> {
        await this.repo.delete(id);
    }

    /** Reset circuit breaker for a webhook */
    async resetFailures(id: string): Promise<void> {
        await this.repo.update(id, { consecutiveFailures: 0 });
    }

    /** Test a webhook by sending a test event */
    async test(id: string): Promise<{ success: boolean; error?: string }> {
        const setting = await this.repo.findOneBy({ id });
        if (!setting) return { success: false, error: 'Webhook not found' };

        try {
            await this.deliverWebhook(setting, 'webhook.test', {
                message: 'This is a test webhook from ZeplaoPrint',
                timestamp: new Date().toISOString(),
            });
            return { success: true };
        } catch (err) {
            return { success: false, error: String(err) };
        }
    }
}
