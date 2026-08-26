import { EventsGateway } from './events.gateway';

/** Dữ liệu tổ chức luôn phát theo tenant, độc lập cờ RLS; thiếu tenant phải drop. */
describe('EventsGateway — tenant room broadcasting', () => {
    let gateway: EventsGateway;
    let server: any;
    let roomEmit: jest.Mock;
    let toMock: jest.Mock;
    beforeEach(() => {
        roomEmit = jest.fn();
        toMock = jest.fn().mockReturnValue({ emit: roomEmit });
        server = {
            emit: jest.fn(),
            to: toMock,
        };
        // Construct with no-op deps; we only exercise emit methods + server.
        gateway = new EventsGateway(
            {} as any,
            {} as any,
            {} as any,
            { query: jest.fn() } as any,
            {} as any,
        );
        (gateway as any).server = server;
    });

    it('phát event nghiệp vụ vào room tenant ngay cả khi cờ RLS tắt', () => {
        delete process.env.TENANT_RLS_ENABLED;

        expect(gateway.emitConversationUpdated({ id: 'c1' }, 5)).toBe(true);

        expect(toMock).toHaveBeenCalledWith('tenant:5');
        expect(roomEmit).toHaveBeenCalledWith('conversation_updated', {
            conversation: { id: 'c1' },
        });
        expect(server.emit).not.toHaveBeenCalled();
    });

    it('thiếu tenantId → drop fail-closed, không server.emit và không room tenant giả', () => {
        expect(gateway.emitConversationUpdated({ id: 'c1' })).toBe(false);
        expect(gateway.emitNewMessage('c1', { id: 'm1' })).toBe(false);
        expect(gateway.emitMessageStatus('c1', 'm1', 'sent')).toBe(false);

        expect(server.emit).not.toHaveBeenCalled();
        expect(toMock).not.toHaveBeenCalled();
    });

    it('emitAutoReply có tenant → conversation room + tenant room, không global', () => {
        expect(gateway.emitAutoReply('c4', { text: 'hi' }, 7)).toBe(true);

        expect(toMock).toHaveBeenCalledWith('tenant:7:conversation:c4');
        expect(toMock).toHaveBeenCalledWith('tenant:7');
        expect(server.emit).not.toHaveBeenCalled();
    });

    it('emitAutoReply thiếu tenant → không phát cả conversation room', () => {
        expect(gateway.emitAutoReply('c4', { text: 'hi' })).toBe(false);
        expect(toMock).not.toHaveBeenCalled();
        expect(server.emit).not.toHaveBeenCalled();
    });

    it('typed follow-up/proactive/agent emit đúng room tenant', () => {
        gateway.emitFollowUpDue(11, {
            followUpId: 'fu1', conversationId: 'c1', message: 'M', attempt: 1, context: 'general',
        });
        gateway.emitProactiveFollowUp(11, {
            conversationId: 'c1', contactName: 'A', message: 'M', status: 'open', followUpId: 'fu2',
        });
        gateway.emitAgentThought(11, {
            conversationId: 'c1', status: 'thinking', tool: 'search_kb', message: 'Đang tìm',
        });

        expect(toMock).toHaveBeenCalledWith('tenant:11');
        expect(roomEmit).toHaveBeenCalledWith('follow_up_due', expect.objectContaining({ followUpId: 'fu1' }));
        expect(roomEmit).toHaveBeenCalledWith('proactive_followup', expect.objectContaining({ followUpId: 'fu2' }));
        expect(roomEmit).toHaveBeenCalledWith('agent_thought', expect.objectContaining({ tool: 'search_kb' }));
        expect(server.emit).not.toHaveBeenCalled();
    });

    it('typed suggestion emit vào conversation + tenant; tenant sai thì drop toàn bộ', () => {
        expect(gateway.emitSuggestionGenerated(13, 'c9', { id: 's1' }, 's1')).toBe(true);
        expect(toMock).toHaveBeenCalledWith('tenant:13:conversation:c9');
        expect(toMock).toHaveBeenCalledWith('tenant:13');
        expect(roomEmit).toHaveBeenCalledWith('suggestion_available', {
            conversationId: 'c9', suggestionId: 's1',
        });

        jest.clearAllMocks();
        expect(gateway.emitSuggestionGenerated(undefined as any, 'c9', { id: 's2' }, 's2')).toBe(false);
        expect(toMock).not.toHaveBeenCalled();
        expect(server.emit).not.toHaveBeenCalled();
    });
});

describe('EventsGateway — session revocation fan-out', () => {
    it('ngắt toàn bộ socket trong room session khi nhận JTI revoke', () => {
        let revokeHandler: ((revocation: { jti?: string; sessionId?: string }) => void) | undefined;
        const removeListener = jest.fn();
        const redis = {
            onSessionRevoked: jest.fn((handler: (revocation: { jti?: string; sessionId?: string }) => void) => {
                revokeHandler = handler;
                return removeListener;
            }),
        };
        const gateway = new EventsGateway(
            {} as any,
            {} as any,
            redis as any,
            { query: jest.fn() } as any,
            {} as any,
        );
        const disconnectSockets = jest.fn();
        const server = {
            in: jest.fn().mockReturnValue({ disconnectSockets }),
        } as any;

        gateway.afterInit(server);
        revokeHandler?.({ jti: 'jti-7', sessionId: 'session-7' });

        expect(server.in).toHaveBeenCalledWith('session:jti-7');
        expect(server.in).toHaveBeenCalledWith('auth-session:session-7');
        expect(disconnectSockets).toHaveBeenCalledTimes(2);
        expect(disconnectSockets).toHaveBeenCalledWith(true);
        gateway.onModuleDestroy();
        expect(removeListener).toHaveBeenCalledTimes(1);
    });
});

/**
 * Audit 2026-07-25: `join_conversation` / `join_account` trước đây join thẳng room theo id do
 * client gửi, không kiểm tenant ⇒ bất kỳ JWT hợp lệ nào biết UUID hội thoại đều nhận được
 * tin nhắn realtime của hội thoại đó (kể cả tenant khác). Các test dưới khoá hành vi mới.
 */
describe('EventsGateway — kiểm quyền join room theo tenant', () => {
    const makeGateway = (queryImpl: jest.Mock) =>
        new EventsGateway(
            {} as any,
            {} as any,
            {} as any,
            { query: queryImpl } as any,
            {} as any,
        );

    const makeClient = (tenantId: number | null | undefined) => ({
        join: jest.fn(),
        tenantId,
        userId: 'u1',
    });

    it('cho join khi hội thoại thuộc cùng tenant', async () => {
        const query = jest.fn().mockResolvedValue([{ exists: 1 }]);
        const gateway = makeGateway(query);
        const client = makeClient(5);

        const res = await gateway.handleJoinConversation(client as any, { conversationId: 'c1' });

        expect(client.join).toHaveBeenCalledWith('tenant:5:conversation:c1');
        expect(res).toEqual({ event: 'joined', data: { conversationId: 'c1' } });
    });

    it('TỪ CHỐI khi hội thoại thuộc tenant khác', async () => {
        // SQL đã buộc tenant_id = tenant hiện hành, nên row tenant khác không xuất hiện.
        const query = jest.fn().mockResolvedValue([]);
        const gateway = makeGateway(query);
        const client = makeClient(5);

        const res = await gateway.handleJoinConversation(client as any, { conversationId: 'c1' });

        expect(client.join).not.toHaveBeenCalled();
        expect(res).toEqual({ event: 'join_denied', data: { conversationId: 'c1' } });
    });

    it('TỪ CHỐI khi hội thoại không tồn tại', async () => {
        const gateway = makeGateway(jest.fn().mockResolvedValue([]));
        const client = makeClient(5);

        const res = await gateway.handleJoinConversation(client as any, { conversationId: 'nope' });

        expect(client.join).not.toHaveBeenCalled();
        expect(res.event).toBe('join_denied');
    });

    it('TỪ CHỐI dữ liệu di sản tenant_id NULL', async () => {
        const gateway = makeGateway(jest.fn().mockResolvedValue([]));
        const client = makeClient(5);

        const res = await gateway.handleJoinConversation(client as any, { conversationId: 'c-legacy' });

        expect(client.join).not.toHaveBeenCalled();
        expect(res.event).toBe('join_denied');
    });

    it('socket không có tenantId → từ chối trước query', async () => {
        const query = jest.fn();
        const gateway = makeGateway(query);
        const client = makeClient(null);

        const res = await gateway.handleJoinConversation(client as any, { conversationId: 'c2' });

        expect(client.join).not.toHaveBeenCalled();
        expect(query).not.toHaveBeenCalled();
        expect(res.event).toBe('join_denied');
    });

    it('lỗi truy vấn → fail-closed (từ chối)', async () => {
        const gateway = makeGateway(jest.fn().mockRejectedValue(new Error('db down')));
        const client = makeClient(5);

        const res = await gateway.handleJoinConversation(client as any, { conversationId: 'c3' });

        expect(client.join).not.toHaveBeenCalled();
        expect(res.event).toBe('join_denied');
    });

    it('join_account cũng chốt theo tenant của zalo_accounts', async () => {
        const gateway = makeGateway(jest.fn().mockResolvedValue([]));
        const client = makeClient(5);

        const res = await gateway.handleJoinAccount(client as any, { accountId: 'a1' });

        expect(client.join).not.toHaveBeenCalled();
        expect(res).toEqual({ event: 'join_denied', data: { accountId: 'a1' } });
    });

    it('RLS bật → SET LOCAL tenant trước query ownership', async () => {
        const originalFlag = process.env.TENANT_RLS_ENABLED;
        process.env.TENANT_RLS_ENABLED = 'true';
        try {
            const manager = {
                query: jest.fn()
                    .mockResolvedValueOnce([])
                    .mockResolvedValueOnce([{ exists: 1 }]),
            };
            const dataSource = {
                query: jest.fn(),
                transaction: jest.fn(async (fn: (manager: any) => Promise<any>) => fn(manager)),
            };
            const gateway = new EventsGateway(
                {} as any,
                {} as any,
                {} as any,
                dataSource as any,
                {} as any,
            );
            const client = makeClient(5);

            const res = await gateway.handleJoinConversation(client as any, { conversationId: 'c1' });

            expect(manager.query).toHaveBeenNthCalledWith(
                1,
                `SELECT set_config('app.current_tenant', $1, true)`,
                ['5'],
            );
            expect(manager.query).toHaveBeenNthCalledWith(
                2,
                expect.stringContaining('tenant_id = $2'),
                ['c1', 5],
            );
            expect(dataSource.query).not.toHaveBeenCalled();
            expect(res.event).toBe('joined');
        } finally {
            if (originalFlag === undefined) delete process.env.TENANT_RLS_ENABLED;
            else process.env.TENANT_RLS_ENABLED = originalFlag;
        }
    });
});

describe('EventsGateway — handshake dùng trạng thái auth hiện hành', () => {
    const makeGateway = (overrides?: {
        payload?: any;
        revoked?: boolean;
        redisError?: Error;
        user?: any;
        userError?: Error;
    }) => {
        const jwtService = {
            verify: jest.fn().mockReturnValue(overrides?.payload ?? {
                sub: 'user-1',
                jti: 'session-1',
                role: 'admin',
                tenantId: 99,
            }),
        };
        const configService = {
            get: jest.fn((key: string) => {
                if (key === 'JWT_SECRET') return 'test-jwt-secret';
                if (key === 'NODE_ENV') return 'test';
                return undefined;
            }),
        };
        const existsStrict = overrides?.redisError
            ? jest.fn().mockRejectedValue(overrides.redisError)
            : jest.fn().mockResolvedValue(overrides?.revoked ?? false);
        const redis = {
            existsStrict,
            sadd: jest.fn().mockResolvedValue(undefined),
        };
        const validateUser = overrides?.userError
            ? jest.fn().mockRejectedValue(overrides.userError)
            : jest.fn().mockResolvedValue(overrides?.user ?? {
                id: 'user-1',
                role: 'agent',
                tenantId: 7,
                isActive: true,
            });
        const authService = { validateUser };
        const gateway = new EventsGateway(
            jwtService as any,
            configService as any,
            redis as any,
            { query: jest.fn() } as any,
            authService as any,
        );
        const client = {
            id: 'socket-1',
            handshake: { auth: { token: 'access-token' }, query: {} },
            join: jest.fn(),
            disconnect: jest.fn(),
        };
        return { gateway, client, jwtService, redis, authService };
    };

    it('lấy role/tenant hiện tại từ DB, không tin claim cũ trong JWT', async () => {
        const { gateway, client, redis, authService } = makeGateway();

        await gateway.handleConnection(client as any);

        expect(redis.existsStrict).toHaveBeenCalledWith('blacklist:session-1');
        expect(authService.validateUser).toHaveBeenCalledWith('user-1');
        expect((client as any).userRole).toBe('agent');
        expect((client as any).tenantId).toBe(7);
        expect(client.join).toHaveBeenCalledWith('user:user-1');
        expect(client.join).toHaveBeenCalledWith('session:session-1');
        expect(client.join).toHaveBeenCalledWith('tenant:7');
        expect(client.join).not.toHaveBeenCalledWith('tenant:99');
        expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('JWT thiếu JTI bị từ chối trước Redis/DB', async () => {
        const { gateway, client, redis, authService } = makeGateway({
            payload: { sub: 'user-1', role: 'agent', tenantId: 7 },
        });

        await gateway.handleConnection(client as any);

        expect(client.disconnect).toHaveBeenCalled();
        expect(redis.existsStrict).not.toHaveBeenCalled();
        expect(authService.validateUser).not.toHaveBeenCalled();
        expect(client.join).not.toHaveBeenCalled();
    });

    it('không nhận access token từ query string', async () => {
        const { gateway, client, jwtService } = makeGateway();
        client.handshake = { auth: {}, query: { token: 'leaky-query-token' } } as any;

        await gateway.handleConnection(client as any);

        expect(client.disconnect).toHaveBeenCalled();
        expect(jwtService.verify).not.toHaveBeenCalled();
    });

    it('JTI đã revoke bị từ chối', async () => {
        const { gateway, client, authService } = makeGateway({ revoked: true });

        await gateway.handleConnection(client as any);

        expect(client.disconnect).toHaveBeenCalled();
        expect(authService.validateUser).not.toHaveBeenCalled();
        expect(client.join).not.toHaveBeenCalled();
    });

    it('Redis lỗi khi kiểm blacklist → fail-closed', async () => {
        const { gateway, client, authService } = makeGateway({
            redisError: new Error('redis down'),
        });

        await gateway.handleConnection(client as any);

        expect(client.disconnect).toHaveBeenCalled();
        expect(authService.validateUser).not.toHaveBeenCalled();
        expect(client.join).not.toHaveBeenCalled();
    });

    it('user đã inactive/không tồn tại bị từ chối', async () => {
        const { gateway, client } = makeGateway({ userError: new Error('inactive') });

        await gateway.handleConnection(client as any);

        expect(client.disconnect).toHaveBeenCalled();
        expect(client.join).not.toHaveBeenCalled();
    });

    it('hai socket khác tenant chỉ nhận broadcast của tenant mình', async () => {
        const jwtService = {
            verify: jest.fn((token: string) => token === 'token-a'
                ? { sub: 'user-a', jti: 'session-a' }
                : { sub: 'user-b', jti: 'session-b' }),
        };
        const configService = {
            get: jest.fn((key: string) => key === 'JWT_SECRET' ? 'test-jwt-secret' : 'test'),
        };
        const redis = {
            existsStrict: jest.fn().mockResolvedValue(false),
            sadd: jest.fn().mockResolvedValue(undefined),
        };
        const authService = {
            validateUser: jest.fn((userId: string) => Promise.resolve({
                id: userId,
                role: 'agent',
                tenantId: userId === 'user-a' ? 7 : 8,
                isActive: true,
            })),
        };
        const gateway = new EventsGateway(
            jwtService as any,
            configService as any,
            redis as any,
            { query: jest.fn() } as any,
            authService as any,
        );
        const rooms = new Map<string, Set<string>>();
        const deliveries: Array<{ clientId: string; event: string }> = [];
        const makeClient = (id: string, token: string) => ({
            id,
            handshake: { auth: { token }, query: {} },
            disconnect: jest.fn(),
            join: jest.fn((room: string) => {
                const members = rooms.get(room) ?? new Set<string>();
                members.add(id);
                rooms.set(room, members);
            }),
        });
        (gateway as any).server = {
            emit: jest.fn(),
            to: (room: string) => ({
                emit: (event: string) => {
                    for (const clientId of rooms.get(room) ?? []) deliveries.push({ clientId, event });
                },
            }),
        };
        const clientA = makeClient('socket-a', 'token-a');
        const clientB = makeClient('socket-b', 'token-b');

        await gateway.handleConnection(clientA as any);
        await gateway.handleConnection(clientB as any);
        gateway.emitConversationUpdated({ id: 'c-a' }, 7);

        expect(deliveries).toEqual([{ clientId: 'socket-a', event: 'conversation_updated' }]);
        expect(clientA.disconnect).not.toHaveBeenCalled();
        expect(clientB.disconnect).not.toHaveBeenCalled();
    });
});
