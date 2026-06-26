import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('canned_responses')
export class CannedResponse {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ length: 100 })
    title: string;

    @Column({ type: 'text' })
    content: string;

    @Column({ length: 50 })
    category: string;

    @Column({ length: 20, default: '/' })
    shortcut: string;

    @Column({ name: 'use_count', default: 0 })
    useCount: number;

    @Column({ name: 'is_global', default: true })
    isGlobal: boolean;

    @Column({ name: 'trigger_keywords', type: 'text', default: '' })
    triggerKeywords: string; // comma-separated: "xuất hóa đơn, VAT, hóa đơn đỏ"

    @Column({ name: 'auto_reply', default: false })
    autoReply: boolean; // true = AI auto-sends this, false = only suggests

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'created_by' })
    createdBy: User;

    @Column({ name: 'created_by', nullable: true })
    createdById: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
