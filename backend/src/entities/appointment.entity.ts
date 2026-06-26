import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm';
import { Contact } from './contact.entity';
import { User } from './user.entity';

export enum AppointmentStatus {
    SCHEDULED = 'scheduled',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled',
    NO_SHOW = 'no_show',
}

@Entity('appointments')
export class Appointment {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Contact, (c) => c.appointments, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'contact_id' })
    contact: Contact;

    @Index()
    @Column({ name: 'contact_id' })
    contactId: string;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'assigned_user_id' })
    assignedUser: User;

    @Column({ name: 'assigned_user_id', nullable: true })
    assignedUserId: string;

    @Index()
    @Column({ name: 'appointment_date' })
    appointmentDate: Date;

    /** Time as string e.g. "14:30" — separate from date for flexible sorting */
    @Column({ name: 'appointment_time', nullable: true, length: 10 })
    appointmentTime: string;

    /** Type of appointment: consultation, revisit, delivery, etc. */
    @Column({ nullable: true, length: 50 })
    type: string;

    @Column({ type: 'varchar', default: AppointmentStatus.SCHEDULED })
    status: AppointmentStatus;

    @Column({ type: 'text', nullable: true })
    notes: string;

    /** Whether a reminder was already sent (to avoid duplicate reminders) */
    @Column({ name: 'reminder_sent', default: false })
    reminderSent: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
