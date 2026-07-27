import { BaseEntity, decimalStringTransformer } from '@app/database';
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { TransactionStatus } from '../enums/transaction-status.enum';
import { TransactionType } from '../enums/transaction-type.enum';
import { LedgerEntry } from './ledger-entry.entity';
import { TransactionFee } from './transaction-fee.entity';

@Entity({ name: 'transactions' })
@Index('idx_transactions_from_account_id', ['fromAccountId'])
@Index('idx_transactions_to_account_id', ['toAccountId'])
@Index('idx_transactions_status', ['status'])
@Index('idx_transactions_initiated_at', ['initiatedAt'])
export class Transaction extends BaseEntity {
  @Column({ type: 'varchar', length: 40, unique: true })
  reference!: string;

  @Column({ name: 'from_account_id', type: 'uuid', nullable: true })
  fromAccountId!: string | null;

  @Column({ name: 'to_account_id', type: 'uuid', nullable: true })
  toAccountId!: string | null;

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
