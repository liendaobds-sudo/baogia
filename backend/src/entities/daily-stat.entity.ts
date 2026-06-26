import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Unique,
    Index,
} from 'typeorm';

@Entity('daily_stats')
@Unique(['userId', 'channelId', 'statDate'])
export class DailyStat {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Index()
    @Column({ name: 'user_id', nullable: true })
    userId: string;

    @Index()
    @Column({ name: 'channel_id', nullable: true })
    channelId: string;

    @Index()
    @Column({ name: 'stat_date', length: 10 })
    statDate: string; // YYYY-MM-DD

    @Column({ name: 'messages_sent', default: 0 })
    messagesSent: number;

    @Column({ name: 'messages_received', default: 0 })
    messagesReceived: number;

    @Column({ name: 'messages_unread', default: 0 })
    messagesUnread: number;

    @Column({ name: 'messages_unreplied', default: 0 })
    messagesUnreplied: number;

    @Column({ name: 'new_contacts', default: 0 })
    newContacts: number;

    @Column({ name: 'appointments_created', default: 0 })
    appointmentsCreated: number;

    /** Average response time in seconds */
    @Column({ name: 'avg_response_time_seconds', nullable: true })
    avgResponseTimeSeconds: number;
}
