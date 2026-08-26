import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CannedResponse } from '../../entities/canned-response.entity';
import { TenantContextService } from '../../common/tenant/tenant-context.service';

@Injectable()
export class CannedResponseService {
    constructor(
        @InjectRepository(CannedResponse) private repo: Repository<CannedResponse>,
        private readonly tenant: TenantContextService,
    ) { }

    /**
     * tenantId concrete để GHI: chỉ khi đang trong một tenant thật (non-bypass).
     * Ngoài scope hoặc bypass (system/cron) → null = mẫu dùng chung.
     */
    private writeTenantId(): number | null {
        const ctx = this.tenant.get();
        return ctx && !ctx.bypass ? ctx.tenantId : null;
    }

    /**
     * Lưới an toàn tầng ứng dụng khi RLS chưa flip (miror KnowledgeBaseService):
     * trong tenant thật → chỉ mẫu của tenant đó HOẶC mẫu dùng chung (tenant_id NULL);
     * ngoài context / bypass → không lọc (job nền, seed hoạt động như cũ).
     */
    private applyTenantScope(qb: import('typeorm').SelectQueryBuilder<CannedResponse>, alias = 'cr') {
        const ctx = this.tenant.get();
        if (!ctx || ctx.bypass) return qb;
        return qb.andWhere(`(${alias}.tenant_id = :tid OR ${alias}.tenant_id IS NULL)`, { tid: ctx.tenantId });
    }

    async findAll(userId?: string) {
        let qb = this.repo.createQueryBuilder('cr')
            .leftJoinAndSelect('cr.createdBy', 'u')
            .orderBy('cr.useCount', 'DESC');

        // Show global + user's own
        if (userId) {
            qb.where('cr.isGlobal = :g OR cr.createdById = :uid', { g: true, uid: userId });
        }
        qb = this.applyTenantScope(qb);

        const items = await qb.getMany();
        return items.map(cr => ({
            id: cr.id,
            title: cr.title,
            content: cr.content,
            category: cr.category,
            shortcut: cr.shortcut,
            useCount: cr.useCount,
            isGlobal: cr.isGlobal,
            triggerKeywords: cr.triggerKeywords || '',
            autoReply: cr.autoReply || false,
            createdBy: cr.createdBy ? { id: cr.createdBy.id, fullName: cr.createdBy.fullName } : null,
            createdAt: cr.createdAt,
        }));
    }

    /**
     * Find canned responses whose trigger keywords match the customer message.
     * Returns matched responses sorted by relevance (most keyword matches first).
     */
    async findByKeywords(customerMessage: string): Promise<CannedResponse[]> {
        const msgLower = customerMessage.toLowerCase();
        // Lọc tenant ngay ở query (trước đây repo.find() quét toàn bộ mẫu mọi tenant).
        const qb = this.applyTenantScope(this.repo.createQueryBuilder('cr'));
        const all = await qb.getMany();

        const scored = all
            .filter(cr => cr.triggerKeywords && cr.triggerKeywords.trim() !== '')
            .map(cr => {
                const keywords = cr.triggerKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
                const matchCount = keywords.filter(kw => msgLower.includes(kw)).length;
                return { cr, matchCount, total: keywords.length };
            })
            .filter(s => s.matchCount > 0)
            .sort((a, b) => b.matchCount - a.matchCount);

        return scored.map(s => s.cr);
    }

    async create(data: Partial<CannedResponse>) {
        // Gán tenant hiện hành khi tạo (null = mẫu dùng chung nếu ngoài context/bypass).
        const cr = this.repo.create({ ...data, tenantId: this.writeTenantId() });
        return this.repo.save(cr);
    }

    async update(id: string, data: Partial<CannedResponse>) {
        // Chống IDOR: chỉ sửa được mẫu thuộc tenant hiện hành (hoặc dùng chung).
        await this.requireOwned(id);
        await this.repo.update(id, data);
        return this.repo.findOne({ where: { id } });
    }

    async incrementUse(id: string) {
        await this.repo.increment({ id }, 'useCount', 1);
    }

    async delete(id: string) {
        await this.requireOwned(id);
        const res = await this.repo.delete(id);
        if (!res.affected) throw new NotFoundException('Mẫu trả lời không tồn tại');
        return { deleted: true };
    }

    /**
     * Đảm bảo bản ghi thuộc tenant hiện hành (hoặc dùng chung / bypass) trước khi ghi.
     * Ném NotFoundException nếu không tồn tại hoặc thuộc tenant khác (không lộ tồn tại chéo tenant).
     */
    private async requireOwned(id: string): Promise<void> {
        const qb = this.applyTenantScope(
            this.repo.createQueryBuilder('cr').where('cr.id = :id', { id }),
        );
        const found = await qb.getOne();
        if (!found) throw new NotFoundException('Mẫu trả lời không tồn tại');
    }

    async search(query: string) {
        const qb = this.repo.createQueryBuilder('cr')
            .where('(LOWER(cr.title) LIKE :q OR LOWER(cr.content) LIKE :q OR cr.shortcut LIKE :q)', {
                q: `%${query.toLowerCase()}%`,
            })
            .orderBy('cr.useCount', 'DESC')
            .limit(10);
        return this.applyTenantScope(qb).getMany();
    }
}
