import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PaymentOrder } from './payment-order.entity';

@Entity({ name: 'payment_receipts' })
export class PaymentReceipt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'payment_order_id', type: 'uuid', unique: true })
  paymentOrderId!: string;

  @OneToOne(() => PaymentOrder, (paymentOrder) => paymentOrder.receipt, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'payment_order_id' })
  paymentOrder!: PaymentOrder;

  @Column({
    name: 'receipt_number',
    type: 'varchar',
    length: 40,
    unique: true,
    default: () =>
      "'RCP' || to_char(CURRENT_DATE, 'YYYYMMDD') || lpad(nextval('receipt_number_seq')::text, 12, '0')",
  })
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
