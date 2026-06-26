import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, Contact, AiSuggestion } from '../../entities';

@Injectable()
export class ProfileBuilderService {
    private readonly logger = new Logger(ProfileBuilderService.name);

    constructor(
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
        @InjectRepository(Contact) private contactRepo: Repository<Contact>,
        @InjectRepository(AiSuggestion) private suggestRepo: Repository<AiSuggestion>,
    ) { }

    async buildCustomerProfile(conversationId: string): Promise<string> {
        try {
            const conversation = await this.convRepo.findOne({ where: { id: conversationId } });
            if (!conversation?.contactId) return '';

            const contact = await this.contactRepo.findOne({ where: { id: conversation.contactId } });
            if (!contact) return '';

            const pastConvs = await this.convRepo.find({
                where: { contactId: contact.id },
                order: { createdAt: 'DESC' },
                take: 10,
                select: ['id', 'productType', 'status', 'createdAt'],
            });

            const pastConvIds = pastConvs.map(c => c.id);
            let pastProducts: string[] = [];
            if (pastConvIds.length > 0) {
                const pastSugs = await this.suggestRepo
                    .createQueryBuilder('s')
                    .select(['s.quoteResult', 's.intent'])
                    .where('s.conversationId IN (:...ids)', { ids: pastConvIds })
                    .andWhere('s.quoteResult IS NOT NULL')
                    .orderBy('s.createdAt', 'DESC')
                    .take(10)
                    .getMany();
                pastProducts = pastSugs
                    .filter(s => s.quoteResult?.productType)
                    .map(s => s.quoteResult!.productType!);
            }

            const uniqueProducts = [...new Set(pastProducts)];
            const totalConvs = pastConvs.length;
            const wonConvs = pastConvs.filter(c => c.status === 'won').length;
            const segment = totalConvs >= 10 ? 'VIP/Đại lý' : totalConvs >= 3 ? 'Khách quen' : 'Khách mới';

            // Memory facts (persistent cross-conversation knowledge)
            const memorySection = (contact.memoryFacts?.length > 0)
                ? `\n- Ghi nhớ về KH:\n${contact.memoryFacts.slice(-10).map((m: any) => `  • ${m.fact}`).join('\n')}\n`
                : '';

            // Structured customer profile (AI-extracted preferences)
            const profile = contact.customerProfile || {};
            let profileLines = '';
            if (profile.industry) profileLines += `- Ngành: ${profile.industry}\n`;
            if (profile.budgetRange) profileLines += `- Ngân sách: ${profile.budgetRange}\n`;
            if (profile.preferredMaterials?.length) profileLines += `- Chất liệu ưa dùng: ${profile.preferredMaterials.join(', ')}\n`;
            if (profile.orderFrequency) profileLines += `- Tần suất đặt: ${profile.orderFrequency}\n`;
            if (profile.communicationStyle) profileLines += `- Phong cách: ${profile.communicationStyle}\n`;
            if (profile.commonProducts?.length) profileLines += `- SP hay đặt: ${profile.commonProducts.join(', ')}\n`;
            if (profile.specialNeeds?.length) profileLines += `- Yêu cầu đặc biệt: ${profile.specialNeeds.join(', ')}\n`;

            return `\n##[Hồ sơ khách hàng]:\n`
                + `- Tên: ${contact.displayName || 'Chưa có'}\n`
                + `- Phân khúc: ${segment} (${totalConvs} cuộc hội thoại, ${wonConvs} đơn thành công)\n`
                + (uniqueProducts.length > 0 ? `- Sản phẩm đã hỏi / mua: ${uniqueProducts.join(', ')}\n` : '')
                + (contact.tags?.length ? `- Tags: ${contact.tags.join(', ')}\n` : '')
                + profileLines
                + memorySection
                + `\n→ Đối xử phù hợp với phân khúc ${segment}. ${segment === 'Khách mới' ? 'Gợi ý ưu đãi đơn đầu.' : 'Nhắc lại sản phẩm đã mua nếu liên quan.'}\n`;
        } catch (e: any) {
            this.logger.warn(`⚠️ Customer profile load failed: ${e.message}`);
            return '';
        }
    }
}
