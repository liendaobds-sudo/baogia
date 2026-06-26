import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm';
import { User } from './user.entity';
import { Channel } from './channel.entity';

export enum ZaloAccountStatus {
    CONNECTED = 'connected',
    DISCONNECTED = 'disconnected',
    QR_PENDING = 'qr_pending',
    CONNECTING = 'connecting',
}

@Entity('zalo_accounts')
export class ZaloAccount {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    /** The system user who owns/added this Zalo account */
    @ManyToOne(() => User, { nullable: false })
    @JoinColumn({ name: 'owner_user_id' })
    owner: User;

    @Column({ name: 'owner_user_id' })
    ownerUserId: string;

    /** Zalo's own user ID — unique per Zalo account */
    @Index({ unique: true })
    @Column({ name: 'zalo_uid', nullable: true })
    zaloUid: string;

    @Column({ name: 'display_name', nullable: true })
    displayName: string;

    @Column({ name: 'avatar_url', nullable: true })
    avatarUrl: string;

    @Column({ nullable: true, length: 20 })
    phone: string;

    @Column({ type: 'varchar', default: ZaloAccountStatus.DISCONNECTED })
    status: ZaloAccountStatus;

    /**
     * Encrypted session data for auto-reconnect (cookie, imei, userAgent).
     * Stored as JSON. NEVER expose this via API responses.
     */
    @Column({ name: 'session_data', type: 'simple-json', nullable: true })
    sessionData: Record<string, any>;

    @Column({ name: 'last_connected_at', nullable: true })
    lastConnectedAt: Date;

    /** Daily message send count — reset each day by health check */
    @Column({ name: 'daily_send_count', default: 0 })
    dailySendCount: number;

    @Column({ name: 'daily_send_date', nullable: true, length: 10 })
    dailySendDate: string;

    /** Cầu nối sang bằng Channels để tích hợp InBox & AI */
    @Column({ name: 'channel_id', nullable: true })
    channelId: string;

    @ManyToOne(() => Channel, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'channel_id' })
    channel: Channel;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
