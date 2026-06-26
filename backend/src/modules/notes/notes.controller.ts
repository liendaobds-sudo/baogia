import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InternalNote, User, Conversation } from '../../entities';

@Controller('conversations/:convId/notes')
@UseGuards(AuthGuard('jwt'))
export class NotesController {
    constructor(
        @InjectRepository(InternalNote) private noteRepo: Repository<InternalNote>,
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
    ) { }

    @Get()
    async list(@Param('convId') convId: string) {
        const conv = await this.convRepo.findOne({ where: { id: convId } });
        if (!conv) return [];

        // Always fetch global notes and conversation-specific notes!
        const whereConditions: any[] = [
            { conversationId: convId },
            { scope: 'global' }
        ];

        // Also fetch customer-wide notes if we know the contact
        if (conv.contactId) {
            whereConditions.push({ contactId: conv.contactId, scope: 'customer' });
        }

        const notes = await this.noteRepo.find({
            where: whereConditions,
            relations: ['author'],
            order: { createdAt: 'DESC' },
        });

        // Deduplicate in case a note matches both conditions
        const uniqueNotes = Array.from(new Map(notes.map(n => [n.id, n])).values());
        uniqueNotes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        return uniqueNotes.map(n => ({
            id: n.id,
            content: n.content,
            isPinned: n.isPinned,
            scope: n.scope,
            author: { id: n.author.id, fullName: n.author.fullName },
            createdAt: n.createdAt,
        }));
    }

    @Post()
    async create(
        @Param('convId') convId: string,
        @Body() body: { content: string, scope?: 'conversation' | 'customer' | 'global' },
        @Req() req: any,
    ) {
        const conv = await this.convRepo.findOne({ where: { id: convId } });
        
        const note = this.noteRepo.create({
            conversationId: convId, // Even global notes are technically tethered to the creating conversation physically
            authorId: req.user.id,
            content: body.content,
            scope: body.scope || 'conversation',
            contactId: body.scope === 'customer' && conv?.contactId ? conv.contactId : undefined,
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

    @Patch(':noteId/pin')
    async togglePin(@Param('noteId') noteId: string) {
        const note = await this.noteRepo.findOne({ where: { id: noteId } });
        if (!note) return { error: 'Not found' };
        note.isPinned = !note.isPinned;
        await this.noteRepo.save(note);
        return { id: note.id, isPinned: note.isPinned };
    }

    @Delete(':noteId')
    async delete(@Param('convId') convId: string, @Param('noteId') noteId: string) {
        await this.noteRepo.delete({ id: noteId });
        return { success: true };
    }
}
