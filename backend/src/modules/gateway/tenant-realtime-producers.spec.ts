import { ConversationStatus } from '../../entities/conversation.entity';
import { FollowUpService } from '../conversations/follow-up.service';
import { AiSuggestService } from '../suggestions/ai-suggest.service';
import { ProactiveOutreachService } from '../suggestions/proactive-outreach.service';

describe('Realtime producers — tenant fail-closed', () => {
    const buildFollowUp = (tenantId: number | null) => {
        const followUpRepo = {
            count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0),
            create: jest.fn((data) => data),
            save: jest.fn((data) => Promise.resolve({ ...data, id: 'fu-1' })),
            manager: {},
        };
        const convRepo = {
            findOne: jest.fn().mockResolvedValue({ id: 'conv-1', tenantId }),
        };
        const suggestRepo = { findOne: jest.fn().mockResolvedValue(null) };
        const gateway = {
            server: { emit: jest.fn() },
            emitFollowUpScheduled: jest.fn(),
            emitFollowUpCancelled: jest.fn(),
            emitFollowUpDue: jest.fn(),
        };
        const service = new FollowUpService(
            followUpRepo as any,
            convRepo as any,
            suggestRepo as any,
            gateway as any,
        );
        return { service, gateway };
    };

    it('follow-up scheduled phát đúng tenant', async () => {
        const { service, gateway } = buildFollowUp(7);

        await service.scheduleFollowUp('conv-1');

        expect(gateway.emitFollowUpScheduled).toHaveBeenCalledWith(
            7,
            'conv-1',
            expect.objectContaining({ followUpId: 'fu-1', attempt: 1, context: 'general' }),
        );
        expect(gateway.server.emit).not.toHaveBeenCalled();
    });

    it('follow-up thiếu tenant không broadcast', async () => {
        const { service, gateway } = buildFollowUp(null);

        await service.scheduleFollowUp('conv-1');

        expect(gateway.emitFollowUpScheduled).not.toHaveBeenCalled();
        expect(gateway.server.emit).not.toHaveBeenCalled();
    });

    const buildProactive = (tenantId: number | null) => {
        const followUpRepo = {
            count: jest.fn().mockResolvedValue(0),
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn((data) => ({ ...data, id: 'fu-proactive' })),
            save: jest.fn((data) => Promise.resolve(data)),
        };
        const msgRepo = {
            find: jest.fn().mockResolvedValue([{
                senderType: 'customer',
                content: 'Tôi cần tư vấn',
                createdAt: new Date(),
            }]),
        };
        const gateway = {
            server: { emit: jest.fn() },
            emitProactiveFollowUp: jest.fn(),
        };
        const service = new ProactiveOutreachService(
            {} as any,
            msgRepo as any,
            {} as any,
            followUpRepo as any,
            {} as any,
            gateway as any,
        );
        (service as any).generateFollowUp = jest.fn().mockResolvedValue('Tin nhắn follow-up');
        const conversation = {
            id: 'conv-1',
            tenantId,
            status: ConversationStatus.IN_PROGRESS,
            contact: { displayName: 'Khách A' },
        };
        return { service, gateway, conversation };
    };

    it('proactive outreach phát đúng tenant', async () => {
        const { service, gateway, conversation } = buildProactive(8);

        await (service as any).processStaleConversation(conversation);

        expect(gateway.emitProactiveFollowUp).toHaveBeenCalledWith(8, expect.objectContaining({
            conversationId: 'conv-1',
            followUpId: 'fu-proactive',
        }));
        expect(gateway.server.emit).not.toHaveBeenCalled();
    });

    it('proactive outreach thiếu tenant không broadcast', async () => {
        const { service, gateway, conversation } = buildProactive(null);

        await (service as any).processStaleConversation(conversation);

        expect(gateway.emitProactiveFollowUp).not.toHaveBeenCalled();
        expect(gateway.server.emit).not.toHaveBeenCalled();
    });

    it('AI suggestion chỉ gọi gateway tenant-scoped khi có tenant', () => {
        const gateway = { emitSuggestionGenerated: jest.fn() };
        const service: any = Object.create(AiSuggestService.prototype);
        service.gateway = gateway;
        service.logger = { warn: jest.fn() };
        const suggestion = { id: 'suggestion-1' };

        service.emitSuggestionGenerated(9, 'conv-1', suggestion);
        service.emitSuggestionGenerated(null, 'conv-2', { id: 'suggestion-2' });

        expect(gateway.emitSuggestionGenerated).toHaveBeenCalledTimes(1);
        expect(gateway.emitSuggestionGenerated).toHaveBeenCalledWith(
            9,
            'conv-1',
            suggestion,
            'suggestion-1',
        );
    });
});
