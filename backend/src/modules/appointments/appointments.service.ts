import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Appointment, AppointmentStatus } from '../../entities/appointment.entity';
import { Contact } from '../../entities/contact.entity';

export interface CreateAppointmentDto {
    contactId: string;
    assignedUserId?: string;
    appointmentDate: string; // ISO date
    appointmentTime?: string; // HH:mm
    type?: string;
    notes?: string;
}

export interface UpdateAppointmentDto {
    appointmentDate?: string;
    appointmentTime?: string;
    type?: string;
    status?: AppointmentStatus;
    notes?: string;
    assignedUserId?: string;
}

@Injectable()
export class AppointmentsService {
    constructor(
        @InjectRepository(Appointment)
        private readonly repo: Repository<Appointment>,
        @InjectRepository(Contact)
        private readonly contactRepo: Repository<Contact>,
    ) {}

    async create(dto: CreateAppointmentDto): Promise<Appointment> {
        const appointment = this.repo.create({
            contactId: dto.contactId,
            assignedUserId: dto.assignedUserId,
            appointmentDate: new Date(dto.appointmentDate),
            appointmentTime: dto.appointmentTime,
            type: dto.type,
            notes: dto.notes,
        });
        const saved = await this.repo.save(appointment);

        // Denormalize: update contact.nextAppointment
        await this.syncNextAppointment(dto.contactId);

        return saved;
    }

    async findAll(filters?: {
        contactId?: string;
        status?: AppointmentStatus;
        dateFrom?: string;
        dateTo?: string;
        assignedUserId?: string;
    }): Promise<Appointment[]> {
        const where: any = {};
        if (filters?.contactId) where.contactId = filters.contactId;
        if (filters?.status) where.status = filters.status;
        if (filters?.assignedUserId) where.assignedUserId = filters.assignedUserId;
        if (filters?.dateFrom && filters?.dateTo) {
            where.appointmentDate = Between(new Date(filters.dateFrom), new Date(filters.dateTo));
        } else if (filters?.dateFrom) {
            where.appointmentDate = MoreThanOrEqual(new Date(filters.dateFrom));
        } else if (filters?.dateTo) {
            where.appointmentDate = LessThanOrEqual(new Date(filters.dateTo));
        }

        return this.repo.find({
            where,
            relations: ['contact', 'assignedUser'],
            order: { appointmentDate: 'ASC', appointmentTime: 'ASC' },
        });
    }

    async findOne(id: string): Promise<Appointment | null> {
        return this.repo.findOne({
            where: { id },
            relations: ['contact', 'assignedUser'],
        });
    }

    async update(id: string, dto: UpdateAppointmentDto): Promise<Appointment> {
        const update: any = {};
        if (dto.appointmentDate) update.appointmentDate = new Date(dto.appointmentDate);
        if (dto.appointmentTime !== undefined) update.appointmentTime = dto.appointmentTime;
        if (dto.type !== undefined) update.type = dto.type;
        if (dto.status) update.status = dto.status;
        if (dto.notes !== undefined) update.notes = dto.notes;
        if (dto.assignedUserId !== undefined) update.assignedUserId = dto.assignedUserId;

        await this.repo.update(id, update);
        const appointment = await this.findOne(id);

        // Sync denormalized field on contact
        if (appointment) {
            await this.syncNextAppointment(appointment.contactId);
        }

        return appointment!;
    }

    async remove(id: string): Promise<void> {
        const appointment = await this.findOne(id);
        await this.repo.delete(id);
        if (appointment) {
            await this.syncNextAppointment(appointment.contactId);
        }
    }

    /** Get today's appointments (for notifications) */
    async getTodayAppointments(): Promise<Appointment[]> {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);

        return this.repo.find({
            where: {
                appointmentDate: Between(todayStart, todayEnd),
                status: AppointmentStatus.SCHEDULED,
            },
            relations: ['contact'],
            order: { appointmentTime: 'ASC' },
        });
    }

    /** Get tomorrow's appointment count */
    async getTomorrowCount(): Promise<number> {
        const now = new Date();
        const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const tomorrowEnd = new Date(tomorrowStart);
        tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

        return this.repo.count({
            where: {
                appointmentDate: Between(tomorrowStart, tomorrowEnd),
                status: AppointmentStatus.SCHEDULED,
            },
        });
    }

    /** Sync contact.nextAppointment with the nearest future scheduled appointment */
    private async syncNextAppointment(contactId: string): Promise<void> {
        const nextApt = await this.repo.findOne({
            where: {
                contactId,
                status: AppointmentStatus.SCHEDULED,
                appointmentDate: MoreThanOrEqual(new Date()),
            },
            order: { appointmentDate: 'ASC' },
        });

        await this.contactRepo.update(contactId, {
            nextAppointment: nextApt?.appointmentDate ?? (null as any),
        });
    }
}
