import { BaseEntity, decimalStringTransformer } from '@app/database';
import { Column, Entity, Index, OneToMany, OneToOne } from 'typeorm';
import { PaymentGateway } from '../enums/gateway.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentReceipt } from './payment-receipt.entity';
import { Refund } from './refund.entity';

@Entity({ name: 'payment_orders' })
@Index('idx_payment_orders_transaction_id', ['transactionId'])
@Index('idx_payment_orders_gateway_reference', ['gatewayReference'])
export class PaymentOrder extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'transaction_id', type: 'uuid', nullable: true })
  transactionId!: string | null;

  @Column({ name: 'from_account_id', type: 'uuid' })
  fromAccountId!: string;

  @Column({ name: 'to_account_id', type: 'uuid' })
  toAccountId!: string;

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

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    transformer: decimalStringTransformer,
  })
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

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @OneToOne(() => PaymentReceipt, (receipt) => receipt.paymentOrder)
  receipt!: PaymentReceipt | null;

  @OneToMany(() => Refund, (refund) => refund.paymentOrder)
  refunds!: Refund[];
}
