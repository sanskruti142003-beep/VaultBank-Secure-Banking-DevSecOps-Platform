import { BaseEntity } from '@app/database';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { PaymentOrder } from './payment-order.entity';

@Entity({ name: 'payment_receipts' })
export class PaymentReceipt extends BaseEntity {
  @Column({ name: 'payment_order_id', type: 'uuid', unique: true })
  paymentOrderId!: string;

  @OneToOne(() => PaymentOrder, (order) => order.receipt, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'payment_order_id' })
  paymentOrder!: PaymentOrder;

  @Column({ name: 'receipt_number', type: 'varchar', length: 40, unique: true })
  receiptNumber!: string;

  @Column({
    name: 'issued_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  issuedAt!: Date;

  @Column({ name: 'pdf_url', type: 'text' })
  pdfUrl!: string;
}
