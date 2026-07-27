import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Transaction } from './transaction.entity';

export enum LedgerEntryType {
  DEBIT = 'debit',
  CREDIT = 'credit',
}

@Entity({ name: 'ledger_entries' })
@Index('idx_ledger_entries_account_id', ['accountId'])
@Check('chk_ledger_entries_amount_positive', 'amount > 0')
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId!: string;

  @ManyToOne(() => Transaction, (transaction) => transaction.ledgerEntries, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'transaction_id' })
  transaction!: Transaction;

  // References account_db.accounts.id; deliberately no cross-database FK.
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @Column({
    name: 'entry_type',
    type: 'enum',
    enum: LedgerEntryType,
    enumName: 'ledger_entry_type_enum',
  })
  entryType!: LedgerEntryType;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  amount!: string;

  @Column({
    name: 'balance_after',
    type: 'decimal',
    precision: 18,
    scale: 4,
  })
  balanceAfter!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
