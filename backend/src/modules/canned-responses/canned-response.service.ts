import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CannedResponse } from '../../entities/canned-response.entity';

@Injectable()
export class CannedResponseService {
    constructor(
        @InjectRepository(CannedResponse) private repo: Repository<CannedResponse>,
    ) { }

    async findAll(userId?: string) {
        const qb = this.repo.createQueryBuilder('cr')
            .leftJoinAndSelect('cr.createdBy', 'u')
            .orderBy('cr.useCount', 'DESC');

        // Show global + user's own
        if (userId) {
            qb.where('cr.isGlobal = :g OR cr.createdById = :uid', { g: true, uid: userId });
        }

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
        const all = await this.repo.find();

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
        const cr = this.repo.create(data);
        return this.repo.save(cr);
    }

    async update(id: string, data: Partial<CannedResponse>) {
        await this.repo.update(id, data);
        return this.repo.findOne({ where: { id } });
    }

    async incrementUse(id: string) {
        await this.repo.increment({ id }, 'useCount', 1);
    }

    async delete(id: string) {
        await this.repo.delete(id);
        return { deleted: true };
    }

    async search(query: string) {
        return this.repo.createQueryBuilder('cr')
            .where('LOWER(cr.title) LIKE :q OR LOWER(cr.content) LIKE :q OR cr.shortcut LIKE :q', {
                q: `%${query.toLowerCase()}%`,
            })
            .orderBy('cr.useCount', 'DESC')
            .limit(10)
            .getMany();
    }
}
