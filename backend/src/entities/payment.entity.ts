import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

export enum PaymentStatus {
    PENDING = 'pending',
    PAID = 'paid',
    FAILED = 'failed',
    REFUNDED = 'refunded',
}

@Entity('payments')
export class Payment {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'tenant_id', type: 'int' })
    tenantId: number;

    @Column({ name: 'plan_id', type: 'int', nullable: true })
    planId: number;

    @Column({ type: 'decimal', precision: 12, scale: 0 })
    amount: number;

    @Column({ name: 'payment_method', type: 'varchar', length: 50, default: 'bank_transfer' })
    paymentMethod: string;

    @Column({ type: 'varchar', length: 20, default: PaymentStatus.PENDING })
    status: PaymentStatus;

    @Column({ name: 'billing_period', type: 'varchar', length: 20, default: 'monthly' })
    billingPeriod: string;

    @Column({ name: 'period_start', type: 'timestamp', nullable: true })
    periodStart: Date;

    @Column({ name: 'period_end', type: 'timestamp', nullable: true })
    periodEnd: Date;

    @Column({ name: 'invoice_number', type: 'varchar', length: 50, nullable: true })
    invoiceNumber: string;

    @Column({ type: 'text', nullable: true })
    notes: string;

    @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
    paidAt: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
