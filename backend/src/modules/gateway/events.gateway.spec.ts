import { EventsGateway } from './events.gateway';

/**
 * Task 9: socket.io phát theo room `tenant:<id>`.
 *
 * Xác minh hành vi GATED sau TENANT_RLS_ENABLED:
 * - Flag TẮT (mặc định) → emit nghiệp vụ phát TOÀN CỤC (this.server.emit) — byte-for-byte như cũ.
 * - Flag BẬT + có tenantId → emit phát tới room `tenant:<id>` (this.server.to('tenant:<id>').emit).
 *
 * _Requirements: 4.1_
 */
describe('EventsGateway — tenant room broadcasting', () => {
    let gateway: EventsGateway;
    let server: any;
    let roomEmit: jest.Mock;
    let toMock: jest.Mock;
    const ORIGINAL_FLAG = process.env.TENANT_RLS_ENABLED;

    beforeEach(() => {
        roomEmit = jest.fn();
        toMock = jest.fn().mockReturnValue({ emit: roomEmit });
        server = {
            emit: jest.fn(),
            to: toMock,
        };
        // Construct with no-op deps; we only exercise emit methods + server.
        gateway = new EventsGateway({} as any, {} as any, {} as any);
        (gateway as any).server = server;
    });

    afterEach(() => {
        if (ORIGINAL_FLAG === undefined) {
            delete process.env.TENANT_RLS_ENABLED;
        } else {
            process.env.TENANT_RLS_ENABLED = ORIGINAL_FLAG;
        }
    });

    describe('flag OFF (default) — global broadcast unchanged', () => {
        beforeEach(() => {
            delete process.env.TENANT_RLS_ENABLED;
        });

        it('emitConversationUpdated → global this.server.emit', () => {
            gateway.emitConversationUpdated({ id: 'c1' }, 5);
            expect(server.emit).toHaveBeenCalledWith('conversation_updated', { conversation: { id: 'c1' } });
            expect(toMock).not.toHaveBeenCalledWith('tenant:5');
        });

        it('emitNewConversation → global this.server.emit', () => {
            gateway.emitNewConversation({ id: 'c2' }, 5);
            expect(server.emit).toHaveBeenCalledWith('new_conversation', { conversation: { id: 'c2' } });
        });

        it('emitSlaWarning → global this.server.emit', () => {
            gateway.emitSlaWarning('c3', 5, 7);
            expect(server.emit).toHaveBeenCalledWith('sla_warning', { conversationId: 'c3', minutesLeft: 5 });
        });

        it('emitDashboardUpdate → global this.server.emit', () => {
            gateway.emitDashboardUpdate({ event: 'x' }, 7);
            expect(server.emit).toHaveBeenCalledWith('dashboard_update', { event: 'x' });
        });

        it('emitAutoReply → conversation room + GLOBAL conversation_updated', () => {
            gateway.emitAutoReply('c4', { text: 'hi' }, 7);
            expect(toMock).toHaveBeenCalledWith('conversation:c4');
            // conversation_updated falls back to global emit when flag OFF
            expect(server.emit).toHaveBeenCalledWith('conversation_updated', expect.objectContaining({
                conversation: expect.objectContaining({ id: 'c4' }),
            }));
        });
    });

    describe('flag ON + tenantId — target tenant room', () => {
        beforeEach(() => {
            process.env.TENANT_RLS_ENABLED = 'true';
        });

        it('emitConversationUpdated → tenant room', () => {
            gateway.emitConversationUpdated({ id: 'c1' }, 5);
            expect(toMock).toHaveBeenCalledWith('tenant:5');
            expect(roomEmit).toHaveBeenCalledWith('conversation_updated', { conversation: { id: 'c1' } });
            expect(server.emit).not.toHaveBeenCalled();
        });

        it('emitNewConversation → tenant room', () => {
            gateway.emitNewConversation({ id: 'c2' }, 5);
            expect(toMock).toHaveBeenCalledWith('tenant:5');
            expect(roomEmit).toHaveBeenCalledWith('new_conversation', { conversation: { id: 'c2' } });
            expect(server.emit).not.toHaveBeenCalled();
        });

        it('emitSlaWarning → tenant room', () => {
            gateway.emitSlaWarning('c3', 5, 7);
            expect(toMock).toHaveBeenCalledWith('tenant:7');
            expect(roomEmit).toHaveBeenCalledWith('sla_warning', { conversationId: 'c3', minutesLeft: 5 });
            expect(server.emit).not.toHaveBeenCalled();
        });

        it('emitDashboardUpdate → tenant room', () => {
            gateway.emitDashboardUpdate({ event: 'x' }, 7);
            expect(toMock).toHaveBeenCalledWith('tenant:7');
            expect(roomEmit).toHaveBeenCalledWith('dashboard_update', { event: 'x' });
            expect(server.emit).not.toHaveBeenCalled();
        });

        it('emitAutoReply → conversation room AND tenant room for conversation_updated', () => {
            gateway.emitAutoReply('c4', { text: 'hi' }, 7);
            expect(toMock).toHaveBeenCalledWith('conversation:c4');
            expect(toMock).toHaveBeenCalledWith('tenant:7');
            expect(server.emit).not.toHaveBeenCalled();
        });

        it('flag ON but tenantId undefined → falls back to global broadcast', () => {
            gateway.emitConversationUpdated({ id: 'c1' });
            expect(server.emit).toHaveBeenCalledWith('conversation_updated', { conversation: { id: 'c1' } });
            expect(toMock).not.toHaveBeenCalledWith('tenant:undefined');
        });
    });
});
