import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('unified_products')
export class UnifiedProduct {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 50, unique: true })
    code: string;

    @Column({ name: 'name_vi', length: 200 })
    nameVi: string;

    @Column({ name: 'name_en', length: 200, nullable: true })
    nameEn: string;

    @Column({ name: 'quote_type', type: 'varchar', default: 'loose' })
    quoteType: string;

    @Column({ length: 20, nullable: true })
    unit: string;

    @Column({ name: 'parent_category_code', length: 50, nullable: true })
    parentCategoryCode: string;

    @Column({ name: 'ai_keywords', type: 'simple-json', nullable: true })
    aiKeywords: string[];

    @Column({ name: 'default_materials', type: 'text', nullable: true })
    defaultMaterials: string;

    @Column({ name: 'default_finishing', type: 'text', nullable: true })
    defaultFinishing: string;

    @Column({ name: 'form_config', type: 'text', nullable: true })
    formConfig: string;

    @Column({ length: 50, default: 'fa-box' })
    icon: string;

    @Column({ name: 'description_vi', type: 'text', nullable: true })
    descriptionVi: string;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @Column({ name: 'has_auto_pricing', default: true })
    hasAutoPricing: boolean;

    @Column({ name: 'mini_quote_fields', type: 'simple-json', nullable: true })
    miniQuoteFields: string[] | null; // ['quantity', 'kich_thuoc', 'material', 'can_mang'] — null = use defaults

    @Column({ name: 'allowed_materials', type: 'simple-json', nullable: true })
    allowedMaterials: string[] | null;

    @Column({ name: 'allowed_paper_sizes', type: 'simple-json', nullable: true })
    allowedPaperSizes: string[] | null;

    @Column({ name: 'allowed_processing', type: 'simple-json', nullable: true })
    allowedProcessing: string[] | null;

    @Column({ name: 'allowed_accessories', type: 'simple-json', nullable: true })
    allowedAccessories: string[] | null;

    @Column({ name: 'sort_order', default: 0 })
    sortOrder: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
