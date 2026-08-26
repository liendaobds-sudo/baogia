import { ChannelType } from '../../../entities/channel.entity';
import { IChannelAdapter } from './channel-adapter.interface';
import { ZaloOaAdapter } from './zalo-oa.adapter';
import { FacebookAdapter } from './facebook.adapter';

const adapters: Record<string, IChannelAdapter> = {
    [ChannelType.ZALO_OA]: new ZaloOaAdapter(),
    [ChannelType.FACEBOOK_PAGE]: new FacebookAdapter(),
};

/**
 * Factory to get the correct channel adapter by channel type
 */
export function getChannelAdapter(channelType: string): IChannelAdapter {
    const adapter = adapters[channelType];
    if (!adapter) {
        throw new Error(`No adapter registered for channel type: ${channelType}`);
    }
    return adapter;
}
