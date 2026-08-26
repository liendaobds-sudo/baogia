import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, NotFoundException, Optional } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InternalNote, Conversation } from '../../entities';
import { TenantContextService } from '../../common/tenant/tenant-context.service';

@Controller('conversations/:convId/notes')
@UseGuards(AuthGuard('jwt'))
export class NotesController {
    constructor(
        @InjectRepository(InternalNote) private noteRepo: Repository<InternalNote>,
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
        @Optional() private readonly tenantCtx?: TenantContextService,
    ) { }

    /**
     * CÔ LẬP TENANT cho ghi chú nội bộ (audit 2026-07-25).
     *
     * `internal_notes` KHÔNG có cột tenant trong entity, nên tenant được suy từ hội thoại chứa
     * ghi chú (`internal_notes.conversation_id` → `conversations.tenant_id`).
     *
     * Trước đây:
     *   • `list()` gom mọi ghi chú `scope='global'` của TOÀN BỘ hệ thống ⇒ tenant A đọc được
     *     ghi chú nội bộ của tenant B.
     *   • `togglePin`/`delete` chỉ tra theo `noteId` ⇒ sửa/xoá được ghi chú tenant khác (IDOR).
     *
     * Quy ước giống `ConversationsService.applyTenantFilter`: chấp nhận `tenant_id IS NULL`
     * (dữ liệu di sản trước Pha A), không chặn khi ngoài tenant context hoặc đường bypass.
     */
    private currentTenantId(): number | null {
        const ctx = this.tenantCtx?.get?.();
        if (!ctx || ctx.bypass || ctx.tenantId == null) return null;
        return ctx.tenantId;
    }

    /** Trả hội thoại nếu thuộc tenant hiện hành, ngược lại null. */
    private async findConversationInTenant(convId: string): Promise<Conversation | null> {
        const conv = await this.convRepo.findOne({ where: { id: convId } });
        if (!conv) return null;
        const tid = this.currentTenantId();
        if (tid != null && conv.tenantId != null && conv.tenantId !== tid) return null;
        return conv;
    }

    @Get()
    async list(@Param('convId') convId: string) {
        const conv = await this.findConversationInTenant(convId);
        if (!conv) return [];

        const tid = this.currentTenantId();

        // Ghi chú của hội thoại này + ghi chú global + ghi chú theo khách — nhưng CHỈ trong
        // phạm vi tenant (join sang conversations để lấy tenant_id của ghi chú).
        const qb = this.noteRepo
            .createQueryBuilder('note')
            .innerJoin('note.conversation', 'conv')
            .leftJoinAndSelect('note.author', 'author')
            .where(
                conv.contactId
                    ? `(note.conversationId = :convId OR note.scope = 'global' OR (note.contactId = :contactId AND note.scope = 'customer'))`
                    : `(note.conversationId = :convId OR note.scope = 'global')`,
                { convId, contactId: conv.contactId },
            )
            .orderBy('note.createdAt', 'DESC');

        if (tid != null) {
            qb.andWhere('(conv.tenantId = :_tid OR conv.tenantId IS NULL)', { _tid: tid });
        }

        const notes = await qb.getMany();

        return notes.map(n => ({
            id: n.id,
            content: n.content,
            isPinned: n.isPinned,
            scope: n.scope,
            author: n.author ? { id: n.author.id, fullName: n.author.fullName } : null,
            createdAt: n.createdAt,
        }));
    }

    @Post()
    async create(
        @Param('convId') convId: string,
        @Body() body: { content: string, scope?: 'conversation' | 'customer' | 'global' },
        @Req() req: any,
    ) {
        const conv = await this.findConversationInTenant(convId);
        if (!conv) throw new NotFoundException(`Conversation not found: ${convId}`);

        const note = this.noteRepo.create({
            conversationId: convId, // Even global notes are technically tethered to the creating conversation physically
            authorId: req.user.id,
            content: body.content,
            scope: body.scope || 'conversation',
            contactId: body.scope === 'customer' && conv.contactId ? conv.contactId : undefined,
        });
        const saved = await this.noteRepo.save(note) as InternalNote;
        return {
            id: saved.id,
            content: saved.content,
            isPinned: saved.isPinned,
            scope: saved.scope,
            author: { id: req.user.id, fullName: req.user.fullName },
            createdAt: saved.createdAt,
        };
    }

    /** Tra ghi chú kèm chốt tenant (qua hội thoại của ghi chú). */
    private async findNoteInTenant(noteId: string): Promise<InternalNote | null> {
        const note = await this.noteRepo.findOne({ where: { id: noteId } });
        if (!note) return null;
        const conv = await this.findConversationInTenant(note.conversationId);
        return conv ? note : null;
    }

    @Patch(':noteId/pin')
    async togglePin(@Param('noteId') noteId: string) {
        const note = await this.findNoteInTenant(noteId);
        if (!note) throw new NotFoundException('Không tìm thấy ghi chú');
        note.isPinned = !note.isPinned;
        await this.noteRepo.save(note);
        return { id: note.id, isPinned: note.isPinned };
    }

    @Delete(':noteId')
    async delete(@Param('convId') _convId: string, @Param('noteId') noteId: string) {
        const note = await this.findNoteInTenant(noteId);
        if (!note) throw new NotFoundException('Không tìm thấy ghi chú');
        await this.noteRepo.delete({ id: note.id });
        return { success: true };
    }
}
