import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Channel } from '../../entities';
import { TenantContextService } from '../../common/tenant/tenant-context.service';

@Injectable()
export class ChannelsService {
    constructor(
        @InjectRepository(Channel)
        private channelsRepo: Repository<Channel>,
        private readonly tenant: TenantContextService,
    ) { }

    /** Bỏ webhookSecret khỏi payload trả client; chỉ báo có/không (chống lộ secret). */
    private mask(ch: Channel) {
        const { webhookSecret, ...rest } = ch as any;
        return { ...rest, hasWebhookSecret: !!webhookSecret };
    }

    /** Lọc tenant tầng app (lưới an toàn khi RLS chưa flip): tenant hiện hành HOẶC NULL (shared);
     * ngoài context hoặc bypass (system) → không lọc. */
    private tenantWhere<T extends Record<string, any>>(extra: T = {} as T): T | T[] {
        const ctx = this.tenant.get();
        if (!ctx || ctx.bypass) return extra;
        return [{ ...extra, tenantId: ctx.tenantId }, { ...extra, tenantId: IsNull() }];
    }

    private writeTenantId(): number | null {
        const ctx = this.tenant.get();
        return ctx && !ctx.bypass ? ctx.tenantId : null;
    }

    async findAll() {
        const rows = await this.channelsRepo.find({ where: this.tenantWhere(), order: { createdAt: 'DESC' } });
        return { data: rows.map((c) => this.mask(c)) };
    }

    async findOne(id: string) {
        const channel = await this.channelsRepo.findOne({ where: { id } });
        if (!channel) throw new NotFoundException('Channel không tồn tại');
        return channel; // dùng nội bộ (update); KHÔNG trả thẳng ra controller
    }

    async create(data: Partial<Channel>) {
        const channel = this.channelsRepo.create({ ...data, tenantId: data.tenantId ?? this.writeTenantId() });
        const saved = await this.channelsRepo.save(channel);
        return this.mask(saved);
    }

    async update(id: string, data: Partial<Channel>) {
        const channel = await this.findOne(id);
        // KHÔNG ghi đè secret bằng giá trị rỗng/masked (client không nhận secret thật nữa).
        const patch: any = { ...data };
        if (!patch.webhookSecret) delete patch.webhookSecret;
        Object.assign(channel, patch);
        const saved = await this.channelsRepo.save(channel);
        return this.mask(saved);
    }
}
