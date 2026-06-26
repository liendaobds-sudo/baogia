import { ZaloPoolService } from './zalo-pool.service';
import { ZaloRateLimiterService } from './zalo-rate-limiter.service';
import { ZaloAccountStatus } from '../../entities/zalo-account.entity';

// ══════════════════════ MOCK FACTORIES ══════════════════════

const createMockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
  save: jest.fn().mockResolvedValue({}),
});

const createMockModuleRef = (processor?: any) => ({
  get: jest.fn().mockReturnValue(processor || {
    processInbound: jest.fn().mockResolvedValue(true),
    processTypingEvent: jest.fn().mockResolvedValue(undefined),
    processUndoEvent: jest.fn().mockResolvedValue(undefined),
    processSeenEvent: jest.fn().mockResolvedValue(undefined),
    processReactionEvent: jest.fn().mockResolvedValue(undefined),
    processDeliveredEvent: jest.fn().mockResolvedValue(undefined),
    syncUnreadMarks: jest.fn().mockResolvedValue(undefined),
  }),
});

const createMockEventsGateway = () => ({
  server: {
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
  },
  emitConversationUpdated: jest.fn(),
});

const createMockApi = (overrides: any = {}) => ({
  getOwnId: jest.fn().mockResolvedValue('own-uid-123'),
  getUserInfo: jest.fn().mockResolvedValue({ changed_profiles: {} }),
  sendMessage: jest.fn().mockResolvedValue({ message: { error_data: { msg_id: 'sent-msg-1' } } }),
  getAllGroups: jest.fn().mockResolvedValue({ gridVerMap: {} }),
  getAllFriends: jest.fn().mockResolvedValue({ data: [] }),
  getGroupInfo: jest.fn().mockResolvedValue({ gridInfoMap: {} }),
  getGroupChatHistory: jest.fn().mockResolvedValue({ groupMsgs: [] }),
  getUnreadMark: jest.fn().mockResolvedValue({ data: { convsUser: [], convsGroup: [] } }),
  getStickersDetail: jest.fn().mockResolvedValue([]),
  addReaction: jest.fn().mockResolvedValue({}),
  undo: jest.fn().mockResolvedValue({}),
  listener: {
    on: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    emit: jest.fn(),
    removeListener: jest.fn(),
    requestOldMessages: jest.fn(),
  },
  ...overrides,
});

function createService(repoOverrides?: any, processorOverrides?: any) {
  const repo = { ...createMockRepo(), ...repoOverrides };
  const rateLimiter = new ZaloRateLimiterService();
  const moduleRef = createMockModuleRef(processorOverrides);
  const eventsGateway = createMockEventsGateway();

  const service = new ZaloPoolService(
    repo as any,
    rateLimiter,
    moduleRef as any,
    eventsGateway as any,
  );

  return { service, repo, rateLimiter, moduleRef, eventsGateway };
}

// Helper: inject a fake connected instance into the service's private map
function injectInstance(service: any, accountId: string, api?: any, status = 'connected') {
  const mockApi = api || createMockApi();
  (service as any).instances.set(accountId, {
    zalo: {},
    api: mockApi,
    status,
    displayName: 'Test User',
    zaloUid: 'own-uid-123',
    lastActivity: new Date(),
    recentEvents: [],
  });
  return mockApi;
}

// ══════════════════════ TESTS ══════════════════════

describe('ZaloPoolService', () => {
  // ── Basic State ──

  describe('isAvailable', () => {
    it('should return false when zca-js is not loaded', () => {
      const { service } = createService();
      expect(service.isAvailable()).toBe(false);
    });

    it('should return true when ZaloSDK is set', () => {
      const { service } = createService();
      (service as any).ZaloSDK = class FakeZalo {};
      expect(service.isAvailable()).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return disconnected for unknown account', () => {
      const { service } = createService();
      expect(service.getStatus('unknown-id')).toBe('disconnected');
    });

    it('should return connected for injected instance', () => {
      const { service } = createService();
      injectInstance(service, 'acc-1');
      expect(service.getStatus('acc-1')).toBe('connected');
    });
  });

  describe('getAllStatuses', () => {
    it('should return empty object with no instances', () => {
      const { service } = createService();
      expect(service.getAllStatuses()).toEqual({});
    });

    it('should return status for all instances', () => {
      const { service } = createService();
      injectInstance(service, 'acc-1');
      injectInstance(service, 'acc-2');
      const statuses = service.getAllStatuses();
      expect(Object.keys(statuses)).toHaveLength(2);
      expect(statuses['acc-1'].status).toBe('connected');
    });
  });

  describe('getApi', () => {
    it('should return null for disconnected account', () => {
      const { service } = createService();
      expect(service.getApi('acc-1')).toBeNull();
    });

    it('should return null for non-connected status', () => {
      const { service } = createService();
      injectInstance(service, 'acc-1', undefined, 'connecting');
      expect(service.getApi('acc-1')).toBeNull();
    });

    it('should return api for connected account', () => {
      const { service } = createService();
      const api = injectInstance(service, 'acc-1');
      expect(service.getApi('acc-1')).toBe(api);
    });
  });

  // ── Disconnect ──

  describe('disconnect', () => {
    it('should stop listener and remove instance', () => {
      const { service } = createService();
      const api = injectInstance(service, 'acc-1');
      service.disconnect('acc-1');
      expect(api.listener.stop).toHaveBeenCalled();
      expect(service.getStatus('acc-1')).toBe('disconnected');
    });

    it('should handle missing account gracefully', () => {
      const { service } = createService();
      expect(() => service.disconnect('nonexistent')).not.toThrow();
    });
  });

  // ── Send Message ──

  describe('sendMessage', () => {
    it('should return error when account not connected', async () => {
      const { service } = createService();
      const result = await service.sendMessage('acc-1', 'user-1', 'Hello');
      expect(result.success).toBe(false);
      expect(result.error).toContain('chưa kết nối');
    });

    it('should send message to user (threadType=0)', async () => {
      const { service, repo } = createService();
      const api = injectInstance(service, 'acc-1');
      repo.findOne.mockResolvedValue({ id: 'acc-1', channelId: 'ch-1' });

      const result = await service.sendMessage('acc-1', 'user-123', 'Xin chào');
      expect(result.success).toBe(true);
      expect(api.sendMessage).toHaveBeenCalledWith('Xin chào', 'user-123', 0);
    });

    it('should send message to group (g_ prefix → threadType=1)', async () => {
      const { service } = createService();
      const api = injectInstance(service, 'acc-1');

      await service.sendMessage('acc-1', 'g_group-456', 'Hello group');
      expect(api.sendMessage).toHaveBeenCalledWith('Hello group', 'group-456', 1);
    });

    it('should block when rate limit exceeded', async () => {
      const { service, rateLimiter } = createService();
      injectInstance(service, 'acc-1');

      // Exhaust rate limit
      for (let i = 0; i < 200; i++) rateLimiter.recordSend('acc-1');

      const result = await service.sendMessage('acc-1', 'user-1', 'blocked?');
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should fix quote uidFrom=0 to actual zaloUid', async () => {
      const { service } = createService();
      injectInstance(service, 'acc-1');

      const content = { msg: 'reply', quote: { uidFrom: '0', text: 'original' } };
      await service.sendMessage('acc-1', 'user-1', content);
      expect(content.quote.uidFrom).toBe('own-uid-123');
    });

    it('should return messageId from response', async () => {
      const { service } = createService();
      const api = injectInstance(service, 'acc-1');
      api.sendMessage.mockResolvedValue({ message: { error_data: { msg_id: 'msg-999' } } });

      const result = await service.sendMessage('acc-1', 'user-1', 'test');
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg-999');
    });
  });

  // ── Undo Message ──

  describe('undoMessage', () => {
    it('should return error when not connected', async () => {
      const { service } = createService();
      const result = await service.undoMessage('acc-1', 'thread-1', '123', '123');
      expect(result.success).toBe(false);
    });

    it('should call api.undo with correct params for user thread', async () => {
      const { service } = createService();
      const api = injectInstance(service, 'acc-1');

      await service.undoMessage('acc-1', 'user-123', '456', '789');
      expect(api.undo).toHaveBeenCalledWith(
        { msgId: 456, cliMsgId: 789 },
        'user-123',
        0, // User thread type
      );
    });

    it('should handle group thread (g_ prefix)', async () => {
      const { service } = createService();
      const api = injectInstance(service, 'acc-1');

      await service.undoMessage('acc-1', 'g_group-1', '100', '100');
      expect(api.undo).toHaveBeenCalledWith(
        expect.any(Object),
        'group-1',
        1, // Group thread type
      );
    });
  });

  // ── Send Reaction ──

  describe('sendReaction', () => {
    it('should throw for disconnected account', async () => {
      const { service } = createService();
      await expect(service.sendReaction('acc-1', 'thread-1', 'msg-1', '👍'))
        .rejects.toThrow('not connected');
    });

    it('should throw for unsupported emoji', async () => {
      const { service } = createService();
      injectInstance(service, 'acc-1');
      await expect(service.sendReaction('acc-1', 'thread-1', 'msg-1', '🦄'))
        .rejects.toThrow('Unsupported');
    });

    it('should map 👍 to /-strong and call addReaction', async () => {
      const { service } = createService();
      const api = injectInstance(service, 'acc-1');

      await service.sendReaction('acc-1', 'user-1', 'msg-1', '👍');
      expect(api.addReaction).toHaveBeenCalledWith('/-strong', expect.objectContaining({
        data: { msgId: 'msg-1', cliMsgId: 'msg-1' },
        threadId: 'user-1',
        type: 0,
      }));
    });

    it('should detect group thread from g_ prefix', async () => {
      const { service } = createService();
      const api = injectInstance(service, 'acc-1');

      await service.sendReaction('acc-1', 'g_group-1', 'msg-1', '❤️');
      expect(api.addReaction).toHaveBeenCalledWith('/-heart', expect.objectContaining({
        threadId: 'group-1',
        type: 1,
      }));
    });
  });

  // ── Circuit Breaker ──

  describe('handleDisconnect (circuit breaker)', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('should trigger circuit breaker after 5 disconnects in 5 min', () => {
      const { service, repo, eventsGateway } = createService();
      injectInstance(service, 'acc-1');

      for (let i = 0; i < 5; i++) {
        (service as any).handleDisconnect('acc-1');
      }

      expect(eventsGateway.server.emit).toHaveBeenCalledWith(
        'zalo:reconnect-failed',
        expect.objectContaining({ accountId: 'acc-1' }),
      );
      expect(repo.update).toHaveBeenCalledWith('acc-1', expect.objectContaining({
        status: ZaloAccountStatus.QR_PENDING,
      }));
    });

    it('should NOT trigger circuit breaker with < 5 disconnects', () => {
      const { service, eventsGateway } = createService();
      injectInstance(service, 'acc-1');

      for (let i = 0; i < 3; i++) {
        (service as any).handleDisconnect('acc-1');
      }

      const calls = eventsGateway.server.emit.mock.calls;
      const reconnectFailed = calls.filter((c: any) => c[0] === 'zalo:reconnect-failed');
      expect(reconnectFailed).toHaveLength(0);
    });
  });

  // ── CRM Features ──

  describe('CRM wrapper methods', () => {
    it('getAutoReplies should throw when not connected', async () => {
      const { service } = createService();
      await expect(service.getAutoReplies('acc-1')).rejects.toThrow('not connected');
    });

    it('findUserByPhone should call api.findUser', async () => {
      const { service } = createService();
      const api = injectInstance(service, 'acc-1');
      api.findUser = jest.fn().mockResolvedValue({ userId: '999' });

      await service.findUserByPhone('acc-1', '0909123456');
      expect(api.findUser).toHaveBeenCalledWith('0909123456');
    });

    it('sendLinkMsg should call api.sendLink with correct ThreadType', async () => {
      const { service } = createService();
      const api = injectInstance(service, 'acc-1');
      api.sendLink = jest.fn().mockResolvedValue({});

      await service.sendLinkMsg('acc-1', 'thread-1', 'https://example.com', 'Check this', true);
      expect(api.sendLink).toHaveBeenCalledWith(
        { link: 'https://example.com', msg: 'Check this' },
        'thread-1',
        1, // Group
      );
    });
  });

  // ── Sync Missed Messages ──

  describe('syncMissedMessages', () => {
    it('should return 0 when not connected and no api provided', async () => {
      const { service } = createService();
      const result = await service.syncMissedMessages('acc-1');
      expect(result).toEqual({ synced: 0, skipped: 0 });
    });

    it('should return 0 when account has no channelId', async () => {
      const { service, repo } = createService();
      const api = injectInstance(service, 'acc-1');
      repo.findOne.mockResolvedValue({ id: 'acc-1', channelId: null });

      const result = await service.syncMissedMessages('acc-1', api, 'own-uid-123');
      expect(result).toEqual({ synced: 0, skipped: 0 });
    });

    it('should process group messages via syncMissedMessages', async () => {
      const mockProcessor = {
        processInbound: jest.fn().mockResolvedValue(true),
        syncUnreadMarks: jest.fn(),
        convRepo: { find: jest.fn().mockResolvedValue([]) },
      };
      const { service, repo } = createService(undefined, mockProcessor);
      const api = createMockApi({
        getAllGroups: jest.fn().mockResolvedValue({ gridVerMap: { 'grp-1': 1 } }),
        getGroupChatHistory: jest.fn().mockResolvedValue({
          groupMsgs: [
            { data: { msgId: 'm1', uidFrom: 'user-1', content: 'Hello', ts: '1700000000000' } },
          ],
        }),
        getAllFriends: jest.fn().mockResolvedValue({ data: [] }),
        getUnreadMark: jest.fn().mockResolvedValue({ data: { convsUser: [], convsGroup: [] } }),
        // Prevent WS timeout: no requestOldMessages available → skips personal sync
        listener: { on: jest.fn() },
      });
      injectInstance(service, 'acc-1', api);
      repo.findOne.mockResolvedValue({ id: 'acc-1', channelId: 'ch-1' });

      const result = await service.syncMissedMessages('acc-1', api, 'own-uid-123');
      expect(result.synced).toBeGreaterThanOrEqual(1);
      expect(mockProcessor.processInbound).toHaveBeenCalled();
    }, 15000);
  });

  // ── getAllAccounts ──

  describe('getAllAccounts', () => {
    it('should call repo.find', async () => {
      const { service, repo } = createService();
      repo.find.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);

      const result = await service.getAllAccounts();
      expect(result).toHaveLength(2);
      expect(repo.find).toHaveBeenCalled();
    });
  });

  // ── Emit helpers ──

  describe('emit helpers', () => {
    it('emitBroadcast should call server.emit', () => {
      const { service, eventsGateway } = createService();
      (service as any).emitBroadcast('test-event', { foo: 'bar' });
      expect(eventsGateway.server.emit).toHaveBeenCalledWith('test-event', { foo: 'bar' });
    });

    it('emit should call server.to().emit()', () => {
      const { service, eventsGateway } = createService();
      (service as any).emit('room-1', 'test-event', { data: 1 });
      expect(eventsGateway.server.to).toHaveBeenCalledWith('room-1');
    });
  });

  // ── Reconnect (loginQR requires zca-js, tested indirectly) ──

  describe('reconnect', () => {
    it('should do nothing when ZaloSDK is not loaded', async () => {
      const { service, repo } = createService();
      await service.reconnect('acc-1', { cookie: 'x', imei: 'y', userAgent: 'z' });
      // Should not call repo.update since it returns early
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('loginQR', () => {
    it('should throw when ZaloSDK is not loaded', async () => {
      const { service } = createService();
      await expect(service.loginQR('acc-1')).rejects.toThrow('zca-js');
    });
  });
});
