import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Transaction } from './transaction.entity';

@Entity({ name: 'transaction_fees' })
@Check('chk_transaction_fees_amount_nonnegative', 'amount >= 0')
@Check('chk_transaction_fees_currency', "currency ~ '^[A-Z]{3}$'")
export class TransactionFee {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId!: string;

  @ManyToOne(() => Transaction, (transaction) => transaction.fees, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'transaction_id' })
  transaction!: Transaction;

  @Column({ name: 'fee_type', type: 'varchar', length: 64 })
  feeType!: string;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  amount!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;
}
