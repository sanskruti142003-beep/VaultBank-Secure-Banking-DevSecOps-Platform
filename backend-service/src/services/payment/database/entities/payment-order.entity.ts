import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentReceipt } from './payment-receipt.entity';
import { Refund } from './refund.entity';

export enum PaymentGateway {
  STRIPE = 'stripe',
  PAYPAL = 'paypal',
  BANK_TRANSFER = 'bank_transfer',
}

export enum PaymentStatus {
  INITIATED = 'initiated',
  PROCESSING = 'processing',
  SUCCESS = 'success',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

@Entity({ name: 'payment_orders' })
@Index('idx_payment_orders_transaction_id', ['transactionId'])
@Index('idx_payment_orders_gateway_reference', ['gatewayReference'])
@Check('chk_payment_orders_amount_positive', 'amount > 0')
@Check('chk_payment_orders_currency', "currency ~ '^[A-Z]{3}$'")
export class PaymentOrder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // References transaction_db.transactions.id; no cross-database FK.
  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId!: string;

  @Column({
    type: 'enum',
    enum: PaymentGateway,
    enumName: 'payment_gateway_enum',
  })
  gateway!: PaymentGateway;

  @Column({
    name: 'gateway_reference',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  gatewayReference!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  amount!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payment_status_enum',
    default: PaymentStatus.INITIATED,
  })
  status!: PaymentStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToOne(() => PaymentReceipt, (receipt) => receipt.paymentOrder)
  receipt!: PaymentReceipt | null;

  @OneToMany(() => Refund, (refund) => refund.paymentOrder)
  refunds!: Refund[];
}
