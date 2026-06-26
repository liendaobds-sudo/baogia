import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

/**
 * QuickPrice — simplified pricing entry
 * Combines product info + tier pricing in one record.
 * Example: "Decal PP khổ 33x35" with tiers [1-50: 5000đ, 51-100: 4000đ]
 */
@Entity('quick_prices')
export class QuickPrice {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    /** Tên sản phẩm đầy đủ, VD: "Decal PP khổ 33x35" */
    @Column({ length: 200 })
    name: string;

    /** Từ khóa NLP để match tự động, VD: ["decal pp", "decal 33x35"] */
    @Column({ type: 'simple-json', default: '[]' })
    keywords: string[];

    /** Đơn vị tính: tờ, cái, cuốn, m², bộ */
    @Column({ length: 20, default: 'tờ' })
    unit: string;

    /** 
     * Bảng giá theo số lượng
     * [{ from: 1, to: 50, price: 5000 }, { from: 51, to: 100, price: 4000 }, ...]
     */
    @Column({ type: 'simple-json', default: '[]' })
    tiers: { from: number; to: number | null; price: number }[];

    /** Ghi chú thêm (VD: "giá đã bao gồm cán mờ 1 mặt") */
    @Column({ type: 'text', nullable: true })
    notes: string;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
