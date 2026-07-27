import { BaseEntity, decimalStringTransformer } from '@app/database';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Transaction } from './transaction.entity';

export enum LedgerEntryType {
  DEBIT = 'debit',
  CREDIT = 'credit',
}

@Entity({ name: 'ledger_entries' })
@Index('idx_ledger_entries_account_id', ['accountId'])
export class LedgerEntry extends BaseEntity {
  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId!: string;

  @ManyToOne(() => Transaction, (transaction) => transaction.ledgerEntries, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'transaction_id' })
  transaction!: Transaction;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @Column({
    name: 'entry_type',
    type: 'enum',
    enum: LedgerEntryType,
    enumName: 'ledger_entry_type_enum',
  })
  entryType!: LedgerEntryType;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    transformer: decimalStringTransformer,
  })
  amount!: string;

  @Column({
    name: 'balance_after',
    type: 'decimal',
    precision: 18,
    scale: 4,
    transformer: decimalStringTransformer,
  })
  balanceAfter!: string;
}
