import { BaseEntity, decimalStringTransformer } from '@app/database';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { RefundStatus } from '../enums/payment-status.enum';
import { PaymentOrder } from './payment-order.entity';

@Entity({ name: 'refunds' })
export class Refund extends BaseEntity {
  @Column({ name: 'payment_order_id', type: 'uuid' })
  paymentOrderId!: string;

  @ManyToOne(() => PaymentOrder, (order) => order.refunds, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'payment_order_id' })
  paymentOrder!: PaymentOrder;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    transformer: decimalStringTransformer,
  })
  amount!: string;

  @Column({ type: 'text' })
  reason!: string;

  @Column({
    type: 'enum',
    enum: RefundStatus,
    enumName: 'refund_status_enum',
    default: RefundStatus.PENDING,
  })
  status!: RefundStatus;

  @Column({
    name: 'requested_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  requestedAt!: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;
}
