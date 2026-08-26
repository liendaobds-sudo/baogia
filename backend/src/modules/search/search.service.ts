import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact } from '../../entities/contact.entity';
import { Message } from '../../entities/message.entity';
import { Appointment } from '../../entities/appointment.entity';
import { TenantContextService } from '../../common/tenant/tenant-context.service';

export interface SearchResult {
    contacts: any[];
    messages: any[];
    appointments: any[];
}

@Injectable()
export class SearchService {
    constructor(
        @InjectRepository(Contact)
        private readonly contactRepo: Repository<Contact>,
        @InjectRepository(Message)
        private readonly messageRepo: Repository<Message>,
        @InjectRepository(Appointment)
        private readonly appointmentRepo: Repository<Appointment>,
        @Optional() private readonly tenantCtx?: TenantContextService,
    ) {}

    private tenantId(): number | null {
        const ctx = this.tenantCtx?.get?.();
        if (!ctx || ctx.bypass || ctx.tenantId == null) return null;
        return ctx.tenantId;
    }

    /**
     * Global search across contacts, messages, and appointments.
     * Requires minimum 2 characters to prevent expensive full-table scans.
     * Tenant-scoped when context present (defense-in-depth).
     */
    async search(query: string): Promise<SearchResult> {
        if (!query || query.trim().length < 2) {
            return { contacts: [], messages: [], appointments: [] };
        }

        const term = `%${query.trim()}%`;
        const tid = this.tenantId();

        const contactQb = this.contactRepo
            .createQueryBuilder('c')
            .select(['c.id', 'c.displayName', 'c.phone', 'c.email', 'c.pipelineStatus', 'c.source'])
            .where('(c.displayName LIKE :term OR c.phone LIKE :term OR c.email LIKE :term OR c.notes LIKE :term)', { term })
            .take(10);
        if (tid != null) {
            contactQb.andWhere('(c.tenantId = :tid OR c.tenantId IS NULL)', { tid });
        }

        const messageQb = this.messageRepo
            .createQueryBuilder('m')
            .select(['m.id', 'm.content', 'm.senderType', 'm.createdAt', 'm.conversationId'])
            .where('m.content LIKE :term', { term })
            .orderBy('m.createdAt', 'DESC')
            .take(10);
        if (tid != null) {
            messageQb.andWhere('(m.tenantId = :tid OR m.tenantId IS NULL)', { tid });
        }

        // Appointment has no tenant_id — scope via contact
        const apptQb = this.appointmentRepo
            .createQueryBuilder('a')
            .leftJoinAndSelect('a.contact', 'contact')
            .select(['a.id', 'a.appointmentDate', 'a.appointmentTime', 'a.notes', 'a.status', 'contact.displayName'])
            .where('(a.notes LIKE :term OR contact.displayName LIKE :term)', { term })
            .take(10);
        if (tid != null) {
            apptQb.andWhere('(contact.tenantId = :tid OR contact.tenantId IS NULL)', { tid });
        }

        const [contacts, messages, appointments] = await Promise.all([
            contactQb.getMany(),
            messageQb.getMany(),
            apptQb.getMany(),
        ]);

        return { contacts, messages, appointments };
    }
}
