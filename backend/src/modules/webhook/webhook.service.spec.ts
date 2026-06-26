import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WebhookService } from './webhook.service';
import { WebhookSetting } from '../../entities/webhook-setting.entity';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('WebhookService', () => {
    let service: WebhookService;
    let repo: any;

    const mockSetting: Partial<WebhookSetting> = {
        id: 'wh-1',
        name: 'Test Webhook',
        webhookUrl: 'https://example.com/webhook',
        webhookSecret: 'test-secret-key',
        events: ['*'],
        isActive: true,
        consecutiveFailures: 0,
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WebhookService,
                {
                    provide: getRepositoryToken(WebhookSetting),
                    useValue: {
                        find: jest.fn().mockResolvedValue([mockSetting]),
                        findOneBy: jest.fn().mockResolvedValue(mockSetting),
                        create: jest.fn((dto) => ({ id: 'wh-new', ...dto })),
                        save: jest.fn((entity) => Promise.resolve(entity)),
                        update: jest.fn(),
                        delete: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<WebhookService>(WebhookService);
        repo = module.get(getRepositoryToken(WebhookSetting));
        mockFetch.mockReset();
    });

    describe('emit', () => {
        it('should deliver webhook with HMAC signature', async () => {
            mockFetch.mockResolvedValue({ ok: true });

            await service.emit('message.received', { content: 'Hello' });

            // Wait for fire-and-forget delivery
            await new Promise((r) => setTimeout(r, 100));

            expect(mockFetch).toHaveBeenCalledWith(
                'https://example.com/webhook',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'X-Webhook-Event': 'message.received',
                        'X-Webhook-Signature': expect.any(String),
                    }),
                }),
            );
        });

        it('should filter events based on webhook settings', async () => {
            repo.find.mockResolvedValue([
                { ...mockSetting, events: ['contact.created'] },
            ]);

            await service.emit('message.received', { content: 'Hello' });
            await new Promise((r) => setTimeout(r, 100));

            // Should NOT deliver because event doesn't match filter
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should skip webhook with circuit breaker triggered', async () => {
            repo.find.mockResolvedValue([
                { ...mockSetting, consecutiveFailures: 10 },
            ]);

            await service.emit('message.received', { content: 'Hello' });
            await new Promise((r) => setTimeout(r, 100));

            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should increment failure count on delivery error', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));

            await service.emit('message.received', { content: 'Hello' });
            await new Promise((r) => setTimeout(r, 100));

            expect(repo.update).toHaveBeenCalledWith(
                'wh-1',
                expect.objectContaining({
                    consecutiveFailures: 1,
                }),
            );
        });
    });

    describe('CRUD', () => {
        it('should create a webhook setting', async () => {
            const dto = { name: 'New Hook', webhookUrl: 'https://test.com/hook' };
            await service.create(dto);
            expect(repo.create).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'New Hook', events: ['*'] }),
            );
        });

        it('should delete a webhook', async () => {
            await service.remove('wh-1');
            expect(repo.delete).toHaveBeenCalledWith('wh-1');
        });

        it('should reset circuit breaker', async () => {
            await service.resetFailures('wh-1');
            expect(repo.update).toHaveBeenCalledWith('wh-1', { consecutiveFailures: 0 });
        });
    });
});
