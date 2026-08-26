import { presentZaloAccount } from './zalo-account.presenter';

describe('presentZaloAccount', () => {
    it('không làm lộ sessionData hoặc secret của channel', () => {
        const account: any = {
            id: 'acc-1', ownerUserId: 'u-1', zaloUid: 'z-1', displayName: 'Shop',
            avatarUrl: null, phone: '0900000000', status: 'connected',
            sessionData: { cookie: 'SECRET_COOKIE', imei: 'SECRET_IMEI' },
            channelId: 'ch-1', createdAt: new Date('2026-01-01T00:00:00Z'),
            channel: {
                id: 'ch-1', type: 'zalo_personal', name: 'Zalo', isActive: true,
                tenantId: 7, accessTokenEnc: 'SECRET_TOKEN', webhookSecret: 'SECRET_WEBHOOK',
            },
        };

        const result = presentZaloAccount(account, { liveStatus: 'connected', dailyQuota: 12 });
        const serialized = JSON.stringify(result);

        expect(serialized).not.toContain('SECRET_COOKIE');
        expect(serialized).not.toContain('SECRET_IMEI');
        expect(serialized).not.toContain('SECRET_TOKEN');
        expect(serialized).not.toContain('SECRET_WEBHOOK');
        expect(result).toMatchObject({ id: 'acc-1', channel: { id: 'ch-1', tenantId: 7 } });
    });
});
