import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
    OneToMany,
} from 'typeorm';
import { User } from './user.entity';
import { KbChunk } from './kb-chunk.entity';

export enum KbDocStatus {
    UPLOADING = 'uploading',
    PROCESSING = 'processing',
    INDEXED = 'indexed',
    ERROR = 'error',
    ARCHIVED = 'archived',
}

@Entity('kb_documents')
export class KbDocument {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    title: string;

    @Column({ name: 'file_url', type: 'text' })
    fileUrl: string;

    @Column({ name: 'file_type', length: 20 })
    fileType: string;

    @Column({ name: 'file_size', type: 'integer', nullable: true })
    fileSize: number;

    @Column({ type: 'simple-json', default: '[]' })
    tags: string[];

    @Column({ default: 1 })
    version: number;

    @Column({ name: 'parent_id', nullable: true })
    parentId: string;

    @Column({ type: 'varchar', default: KbDocStatus.PROCESSING })
    status: KbDocStatus;

    @Column({ name: 'chunk_count', default: 0 })
    chunkCount: number;

    @Column({ name: 'error_message', nullable: true })
    errorMessage: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'uploaded_by' })
    uploadedBy: User;

    @Column({ name: 'uploaded_by_id', nullable: true })
    uploadedById: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @OneToMany(() => KbChunk, (c) => c.document)
    chunks: KbChunk[];
}
