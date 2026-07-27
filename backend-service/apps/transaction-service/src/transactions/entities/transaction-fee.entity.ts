import { BaseEntity, decimalStringTransformer } from '@app/database';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Transaction } from './transaction.entity';

@Entity({ name: 'transaction_fees' })
export class TransactionFee extends BaseEntity {
  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId!: string;

  @ManyToOne(() => Transaction, (transaction) => transaction.fees, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'transaction_id' })
  transaction!: Transaction;

  @Column({ name: 'fee_type', type: 'varchar', length: 64 })
  feeType!: string;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    transformer: decimalStringTransformer,
  })
  amount!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;
}
