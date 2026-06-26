import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { UnifiedProduct } from './unified-product.entity';

@Entity('product_ai_fields')
export class ProductAiField {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => UnifiedProduct, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'product_id' })
    product: UnifiedProduct;

    @Column({ name: 'product_id' })
    productId: number;

    @Column({ name: 'field_code', length: 50 })
    fieldCode: string; // 'material', 'size', 'quantity', 'print_side', 'lamination', 'binding'...

    @Column({ name: 'field_name', length: 100 })
    fieldName: string; // Display name: 'Chất liệu', 'Kích thước'...

    @Column({ name: 'field_type', length: 20, default: 'text' })
    fieldType: string; // 'text' | 'number' | 'select' | 'boolean' | 'material' | 'processing'

    @Column({ name: 'is_required', default: true })
    isRequired: boolean;

    @Column({ name: 'is_enabled', default: true })
    isEnabled: boolean;

    @Column({ name: 'default_value', type: 'text', nullable: true })
    defaultValue: string;

    @Column({ name: 'ai_question', type: 'text', nullable: true })
    aiQuestion: string; // e.g., "Chất liệu giấy: couche / ivory / bristol?"

    @Column({ name: 'ai_keywords', type: 'simple-json', nullable: true })
    aiKeywords: string[]; // Keywords AI uses to detect this field in customer message

    @Column({ name: 'answer_patterns', type: 'simple-json', nullable: true })
    answerPatterns: Record<string, string>; // yes/no patterns, value mappings

    @Column({ name: 'source_table', length: 50, nullable: true })
    sourceTable: string; // 'materials', 'paper_sizes' — dynamic lookup

    @Column({ name: 'source_filter', type: 'simple-json', nullable: true })
    sourceFilter: Record<string, unknown>; // filter for source_table query

    @Column({ name: 'sort_order', default: 0 })
    sortOrder: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
