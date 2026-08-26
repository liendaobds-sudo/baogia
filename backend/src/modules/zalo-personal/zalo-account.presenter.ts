import { ZaloAccount } from '../../entities/zalo-account.entity';

/** Response allowlist: tuyệt đối không spread entity chứa session/cookie/IMEI. */
export function presentZaloAccount(
    account: ZaloAccount,
    runtime?: { liveStatus?: unknown; dailyQuota?: unknown },
) {
    const channel = account.channel
        ? {
            id: account.channel.id,
            type: account.channel.type,
            name: account.channel.name,
            isActive: account.channel.isActive,
            tenantId: account.channel.tenantId,
        }
        : undefined;

    return {
        id: account.id,
        ownerUserId: account.ownerUserId,
        zaloUid: account.zaloUid,
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
        phone: account.phone,
        status: account.status,
        lastConnectedAt: account.lastConnectedAt,
        dailySendCount: account.dailySendCount,
        dailySendDate: account.dailySendDate,
        channelId: account.channelId,
        createdAt: account.createdAt,
        channel,
        ...(runtime?.liveStatus !== undefined ? { liveStatus: runtime.liveStatus } : {}),
        ...(runtime?.dailyQuota !== undefined ? { dailyQuota: runtime.dailyQuota } : {}),
    };
}
