import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Contact } from '../../entities/contact.entity';
import { Message } from '../../entities/message.entity';
import { Appointment } from '../../entities/appointment.entity';

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
    ) {}

    /**
     * Global search across contacts, messages, and appointments.
     * Requires minimum 2 characters to prevent expensive full-table scans.
     * Inspired by ZaloCRM search-routes.ts
     */
    async search(query: string): Promise<SearchResult> {
        if (!query || query.trim().length < 2) {
            return { contacts: [], messages: [], appointments: [] };
        }

        const term = `%${query.trim()}%`;

        const [contacts, messages, appointments] = await Promise.all([
            // Search contacts by name, phone, email, notes
            this.contactRepo
                .createQueryBuilder('c')
                .select(['c.id', 'c.displayName', 'c.phone', 'c.email', 'c.pipelineStatus', 'c.source'])
                .where('c.displayName LIKE :term', { term })
                .orWhere('c.phone LIKE :term', { term })
                .orWhere('c.email LIKE :term', { term })
                .orWhere('c.notes LIKE :term', { term })
                .take(10)
                .getMany(),

            // Search messages by content
            this.messageRepo
                .createQueryBuilder('m')
                .select(['m.id', 'm.content', 'm.senderType', 'm.createdAt', 'm.conversationId'])
                .where('m.content LIKE :term', { term })
                .orderBy('m.createdAt', 'DESC')
                .take(10)
                .getMany(),

            // Search appointments by notes + contact name
            this.appointmentRepo
                .createQueryBuilder('a')
                .leftJoinAndSelect('a.contact', 'contact')
                .select(['a.id', 'a.appointmentDate', 'a.appointmentTime', 'a.notes', 'a.status', 'contact.displayName'])
                .where('a.notes LIKE :term', { term })
                .orWhere('contact.displayName LIKE :term', { term })
                .take(10)
                .getMany(),
        ]);

        return { contacts, messages, appointments };
    }
}
