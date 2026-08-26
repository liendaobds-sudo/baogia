import { BadRequestException, Controller, Get, Param, Query, Put, Body, UseGuards, Res, Optional } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CskhScopeGuard } from '../../common/app-scope/cskh-scope.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Contact, Conversation, Message } from '../../entities';
import { Response } from 'express';
import { TenantContextService } from '../../common/tenant/tenant-context.service';

// Trần xuất CSV (Req 8.5, chốt 2026-07-25): CSV build trong RAM — vượt ngưỡng thì
// từ chối kèm hướng dẫn thu hẹp bộ lọc, KHÔNG trả tệp một phần.
const CSV_EXPORT_MAX_ROWS = 50_000;

@Controller('contacts')
@UseGuards(AuthGuard('jwt'), CskhScopeGuard)
export class ContactsController {
    constructor(
        @InjectRepository(Contact) private contactRepo: Repository<Contact>,
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
        @InjectRepository(Message) private msgRepo: Repository<Message>,
        @Optional() private readonly tenantCtx?: TenantContextService,
    ) { }

    /** App-level tenant filter (defense-in-depth khi RLS chưa flip) — cùng pattern conversations. */
    private applyTenantFilter(qb: any, alias = 'c'): void {
        const ctx = this.tenantCtx?.get?.();
        if (ctx && !ctx.bypass && ctx.tenantId != null) {
            qb.andWhere(`(${alias}.tenant_id = :_tid OR ${alias}.tenant_id IS NULL)`, { _tid: ctx.tenantId });
        }
    }

    /** Chốt IDOR: contact thuộc tenant khác → coi như không tồn tại. */
    private inTenant(contact: { tenantId?: number | null } | null): boolean {
        if (!contact) return false;
        const ctx = this.tenantCtx?.get?.();
        if (ctx && !ctx.bypass && ctx.tenantId != null
            && contact.tenantId != null && contact.tenantId !== ctx.tenantId) {
            return false;
        }
        return true;
    }

    @Get()
    async findAll(
        @Query('page') page = 1,
        @Query('limit') limit = 20,
        @Query('search') search?: string,
        @Query('pipeline') pipeline?: string,
    ) {
        const qb = this.contactRepo.createQueryBuilder('c')
            .leftJoinAndSelect('c.channel', 'ch')
            .loadRelationCountAndMap('c.conversationCount', 'c.conversations');

        if (search) {
            qb.where('(LOWER(c.displayName) LIKE :s OR LOWER(c.phone) LIKE :s OR LOWER(c.email) LIKE :s)', {
                s: `%${search.toLowerCase()}%`,
            });
        }
        if (pipeline) {
            qb.andWhere('c.pipeline_status = :pipeline', { pipeline });
        }
        this.applyTenantFilter(qb, 'c');

        qb.orderBy('c.lastContactAt', 'DESC', 'NULLS LAST')
            .skip((+page - 1) * +limit)
            .take(+limit);

        const [data, total] = await qb.getManyAndCount();
        return {
            data: data.map((c: any) => ({
                id: c.id,
                displayName: c.displayName,
                avatarUrl: c.avatarUrl,
                phone: c.phone,
                email: c.email,
                tags: c.tags,
                channel: c.channel ? { id: c.channel.id, name: c.channel.name, type: c.channel.type } : null,
                conversationCount: c.conversationCount || 0,
                pipelineStatus: (c as any).pipelineStatus || 'new',
                firstContactAt: c.firstContactAt,
                lastContactAt: c.lastContactAt,
                createdAt: c.createdAt,
            })),
            total,
            page: +page,
            totalPages: Math.ceil(total / +limit),
        };
    }

    @Get('export/csv')
    async exportCSV(@Res() res: Response) {
        // Task 23 (tenant-data-isolation): TRƯỚC ĐÂY full-table không lọc tenant,
        // không giới hạn hàng — một tenant xuất được danh bạ của MỌI tenant và có thể
        // OOM server. Nay: lọc tenant + trần 50.000 hàng (vượt → từ chối, Req 8.5).
        const qb = this.contactRepo.createQueryBuilder('c')
            .leftJoinAndSelect('c.channel', 'ch')
            .orderBy('c.lastContactAt', 'DESC');
        this.applyTenantFilter(qb, 'c');

        // LIMIT+1 để phát hiện vượt ngưỡng mà không cần COUNT riêng.
        const contacts = await qb.take(CSV_EXPORT_MAX_ROWS + 1).getMany();
        if (contacts.length > CSV_EXPORT_MAX_ROWS) {
            throw new BadRequestException(
                `Danh bạ vượt ${CSV_EXPORT_MAX_ROWS.toLocaleString('vi-VN')} liên hệ — không thể xuất một lần. Vui lòng thu hẹp bộ lọc rồi xuất lại.`,
            );
        }

        const header = 'Tên,Điện thoại,Email,Kênh,Tags,Liên hệ đầu,Liên hệ cuối\n';
        const rows = contacts.map(c =>
            [
                c.displayName || '',
                c.phone || '',
                c.email || '',
                c.channel?.name || '',
                (c.tags || []).join('; '),
                c.firstContactAt ? new Date(c.firstContactAt).toLocaleDateString('vi-VN') : '',
                c.lastContactAt ? new Date(c.lastContactAt).toLocaleDateString('vi-VN') : '',
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
        ).join('\n');

        const bom = '\uFEFF';
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');
        res.send(bom + header + rows);
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        const contact = await this.contactRepo.findOne({
            where: { id },
            relations: ['channel'],
        });
        if (!this.inTenant(contact)) return { error: 'Not found' };

        const conversations = await this.convRepo.find({
            where: { contactId: id },
            order: { updatedAt: 'DESC' },
            take: 20,
            relations: ['assignee'],
        });

        const totalMessages = await this.msgRepo.count({
            where: { conversation: { contactId: id } },
        });

        return {
            ...contact,
            conversations: conversations.map(c => ({
                id: c.id,
                status: c.status,
                priority: c.priority,
                subject: c.subject,
                assignee: c.assignee ? { id: c.assignee.id, fullName: c.assignee.fullName } : null,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt,
            })),
            totalMessages,
        };
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: Partial<Contact>) {
        // Kiểm tenant TRƯỚC khi ghi — không cho sửa contact của tenant khác qua IDOR.
        const existing = await this.contactRepo.findOne({ where: { id } });
        if (!this.inTenant(existing)) return { error: 'Not found' };

        const allowed = ['displayName', 'phone', 'email', 'tags', 'metadata', 'pipelineStatus', 'notes', 'source'];
        const update: any = {};
        for (const key of allowed) {
            if (body[key] !== undefined) update[key] = body[key];
        }
        await this.contactRepo.update(id, update);
        return this.contactRepo.findOne({ where: { id } });
    }
}
