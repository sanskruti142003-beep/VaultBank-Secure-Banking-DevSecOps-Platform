import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PaymentOrder } from './payment-order.entity';

export enum RefundStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
}

@Entity({ name: 'refunds' })
@Check('chk_refunds_amount_positive', 'amount > 0')
@Check(
  'chk_refunds_resolution_time',
  'resolved_at IS NULL OR resolved_at >= requested_at',
)
export class Refund {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'payment_order_id', type: 'uuid' })
  paymentOrderId!: string;

  @ManyToOne(() => PaymentOrder, (paymentOrder) => paymentOrder.refunds, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'payment_order_id' })
  paymentOrder!: PaymentOrder;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
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
