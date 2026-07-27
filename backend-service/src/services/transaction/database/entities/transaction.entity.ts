import {
  Check,
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LedgerEntry } from './ledger-entry.entity';
import { TransactionFee } from './transaction-fee.entity';

export enum TransactionType {
  TRANSFER = 'transfer',
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
}

export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REVERSED = 'reversed',
}

@Entity({ name: 'transactions' })
@Index('idx_transactions_from_account_id', ['fromAccountId'])
@Index('idx_transactions_to_account_id', ['toAccountId'])
@Index('idx_transactions_status', ['status'])
@Index('idx_transactions_initiated_at', ['initiatedAt'])
@Check('chk_transactions_amount_positive', 'amount > 0')
@Check('chk_transactions_currency', "currency ~ '^[A-Z]{3}$'")
@Check(
  'chk_transactions_accounts_for_type',
  `(type = 'transfer' AND from_account_id IS NOT NULL AND to_account_id IS NOT NULL AND from_account_id <> to_account_id)
   OR (type = 'deposit' AND to_account_id IS NOT NULL)
   OR (type = 'withdrawal' AND from_account_id IS NOT NULL)`,
)
@Check(
  'chk_transactions_completion_time',
  'completed_at IS NULL OR completed_at >= initiated_at',
)
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'varchar',
    length: 40,
    unique: true,
    default: () =>
      "'TXN' || to_char(CURRENT_DATE, 'YYYYMMDD') || lpad(nextval('transaction_reference_seq')::text, 12, '0')",
  })
  reference!: string;

  // References account_db.accounts.id; deliberately no cross-database FK.
  @Column({ name: 'from_account_id', type: 'uuid', nullable: true })
  fromAccountId!: string | null;

  // References account_db.accounts.id; deliberately no cross-database FK.
  @Column({ name: 'to_account_id', type: 'uuid', nullable: true })
  toAccountId!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  amount!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({
    type: 'enum',
    enum: TransactionType,
    enumName: 'transaction_type_enum',
  })
  type!: TransactionType;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    enumName: 'transaction_status_enum',
    default: TransactionStatus.PENDING,
  })
  status!: TransactionStatus;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({
    name: 'initiated_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  initiatedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @OneToMany(() => LedgerEntry, (entry) => entry.transaction)
  ledgerEntries!: LedgerEntry[];

  @OneToMany(() => TransactionFee, (fee) => fee.transaction)
  fees!: TransactionFee[];
}
