import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('notifications')
export class Notification {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => User, (u) => u.notifications)
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ name: 'user_id' })
    userId: string;

    @Column({ length: 50 })
    type: string;

    @Column()
    title: string;

    @Column({ type: 'text', nullable: true })
    body: string;

    @Column({ nullable: true })
    link: string;

    @Column({ name: 'is_read', default: false })
    isRead: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
