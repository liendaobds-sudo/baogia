import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { KbDocument } from './kb-document.entity';

@Entity('kb_chunks')
export class KbChunk {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => KbDocument, (d) => d.chunks, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'document_id' })
    document: KbDocument;

    @Column({ name: 'document_id' })
    documentId: string;

    @Column({ name: 'chunk_index' })
    chunkIndex: number;

    @Column({ type: 'text' })
    content: string;

    @Column({ name: 'token_count', nullable: true })
    tokenCount: number;

    // Vector embedding stored as JSON for SQLite, VECTOR(1536) for Postgres
    @Column({ type: 'simple-json', nullable: true })
    embedding: number[];

    @Column({ type: 'simple-json', default: '[]' })
    tags: string[];

    @Column({ type: 'simple-json', default: '{}' })
    metadata: Record<string, any>;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    // Cô lập theo tenant (kế thừa từ document). NULL = bản dùng chung/nền tảng.
    // Cột do migration Pha A thêm; ánh xạ để lọc tenant ở tầng ứng dụng.
    @Column({ name: 'tenant_id', type: 'int', nullable: true })
    tenantId: number | null;

    // Smart chunking: content type classification
    @Column({ name: 'chunk_type', nullable: true, default: null })
    chunkType: string; // 'heading' | 'paragraph' | 'list' | 'table' | 'mixed'

    // Smart chunking: parent-child relationship for context retrieval
    @Column({ name: 'parent_chunk_id', nullable: true, default: null })
    parentChunkId: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
