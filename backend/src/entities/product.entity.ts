import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    OneToOne,
    JoinColumn,
} from 'typeorm';
import { ProductCategory } from './product-category.entity';
import { ProductQuoteConfig } from './product-quote-config.entity';

@Entity('products')
export class Product {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 50, unique: true })
    code: string; // 'NC-001', 'FR-001', 'BR-001'...

    @Column({ name: 'name_vi', length: 200 })
    nameVi: string;

    @Column({ name: 'name_en', length: 200, nullable: true })
    nameEn: string;

    @Column({ name: 'slug_vi', length: 200, nullable: true })
    slugVi: string;

    @Column({ name: 'slug_en', length: 200, nullable: true })
    slugEn: string;

    @ManyToOne(() => ProductCategory, { nullable: true })
    @JoinColumn({ name: 'category_id' })
    category: ProductCategory;

    @Column({ name: 'category_id', nullable: true })
    categoryId: number;

    @Column({ name: 'quote_type', length: 20, default: 'loose' })
    quoteType: string; // 'loose' | 'bound' | 'large_format'

    @Column({ name: 'description_vi', type: 'text', nullable: true })
    descriptionVi: string;

    @Column({ name: 'description_en', type: 'text', nullable: true })
    descriptionEn: string;

    @Column({ name: 'short_description_vi', length: 500, nullable: true })
    shortDescriptionVi: string;

    @Column({ name: 'short_description_en', length: 500, nullable: true })
    shortDescriptionEn: string;

    @Column({ type: 'simple-json', nullable: true })
    images: string[];

    @Column({ length: 50, default: 'fa-box' })
    icon: string;

    @Column({ name: 'base_price', type: 'float', default: 0 })
    basePrice: number;

    // Flags
    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @Column({ name: 'is_featured', default: false })
    isFeatured: boolean;

    @Column({ name: 'is_best_seller', default: false })
    isBestSeller: boolean;

    @Column({ name: 'has_auto_pricing', default: true })
    hasAutoPricing: boolean;

    @Column({ name: 'requires_rfq', default: false })
    requiresRfq: boolean;

    // AI
    @Column({ name: 'ai_keywords', type: 'simple-json', nullable: true })
    aiKeywords: string[];

    @Column({ name: 'ai_enabled', default: true })
    aiEnabled: boolean;

    @Column({ name: 'sort_order', default: 0 })
    sortOrder: number;

    // Relations
    @OneToOne(() => ProductQuoteConfig, (qc) => qc.product, { cascade: true })
    quoteConfig: ProductQuoteConfig;


    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
