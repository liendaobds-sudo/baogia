import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToOne,
    JoinColumn,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('product_quote_configs')
export class ProductQuoteConfig {
    @PrimaryGeneratedColumn()
    id: number;

    @OneToOne(() => Product, (p) => p.quoteConfig, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'product_id' })
    product: Product;

    @Column({ name: 'product_id', unique: true })
    productId: number;

    // Allowed items (JSON arrays of IDs)
    @Column({ name: 'allowed_materials', type: 'simple-json', nullable: true })
    allowedMaterials: number[];

    @Column({ name: 'allowed_paper_sizes', type: 'simple-json', nullable: true })
    allowedPaperSizes: number[];

    @Column({ name: 'allowed_processing', type: 'simple-json', nullable: true })
    allowedProcessing: number[];

    @Column({ name: 'allowed_accessories', type: 'simple-json', nullable: true })
    allowedAccessories: number[];

    // Defaults
    @Column({ name: 'default_material_id', nullable: true })
    defaultMaterialId: number;

    @Column({ name: 'default_paper_size_id', nullable: true })
    defaultPaperSizeId: number;

    @Column({ name: 'default_print_side', length: 10, default: 'double' })
    defaultPrintSide: string;

    @Column({ name: 'default_print_type', length: 10, default: '4c' })
    defaultPrintType: string;

    @Column({ name: 'default_quantity', default: 500 })
    defaultQuantity: number;

    // Locks
    @Column({ name: 'lock_print_side', default: false })
    lockPrintSide: boolean;

    @Column({ name: 'lock_print_type', default: false })
    lockPrintType: boolean;

    // Quantity limits
    @Column({ name: 'min_quantity', default: 1 })
    minQuantity: number;

    @Column({ name: 'max_quantity', default: 999999 })
    maxQuantity: number;

    // Default dimensions
    @Column({ name: 'default_width', nullable: true })
    defaultWidth: number;

    @Column({ name: 'default_height', nullable: true })
    defaultHeight: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
