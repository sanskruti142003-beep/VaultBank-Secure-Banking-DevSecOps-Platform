import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AccountLimit } from './account-limit.entity';
import { Beneficiary } from './beneficiary.entity';

export enum AccountType {
  SAVINGS = 'savings',
  CURRENT = 'current',
  FIXED = 'fixed',
}

export enum AccountCurrency {
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
}

export enum AccountStatus {
  ACTIVE = 'active',
  FROZEN = 'frozen',
  CLOSED = 'closed',
}

export enum KycStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity({ name: 'accounts' })
@Index('idx_accounts_user_id', ['userId'])
@Index('idx_accounts_account_number', ['accountNumber'])
@Index('idx_accounts_status', ['status'])
@Check('chk_accounts_balance_scale', 'balance = round(balance, 4)')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Reference to user_db.users.id. Deliberately no cross-database FK.
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({
    name: 'account_number',
    type: 'varchar',
    length: 32,
    unique: true,
    default: () =>
      "'ACC' || lpad(nextval('account_number_seq')::text, 12, '0')",
  })
  accountNumber!: string;

  @Column({
    type: 'enum',
    enum: AccountType,
    enumName: 'account_type_enum',
  })
  type!: AccountType;

  @Column({
    type: 'enum',
    enum: AccountCurrency,
    enumName: 'account_currency_enum',
  })
  currency!: AccountCurrency;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  balance!: string;

  @Column({
    type: 'enum',
    enum: AccountStatus,
    enumName: 'account_status_enum',
    default: AccountStatus.ACTIVE,
  })
  status!: AccountStatus;

  @Column({
    name: 'kyc_status',
    type: 'enum',
    enum: KycStatus,
    enumName: 'kyc_status_enum',
    default: KycStatus.PENDING,
  })
  kycStatus!: KycStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt!: Date | null;

  @OneToOne(() => AccountLimit, (accountLimit) => accountLimit.account)
  limits!: AccountLimit | null;

  @OneToMany(() => Beneficiary, (beneficiary) => beneficiary.account)
  beneficiaries!: Beneficiary[];
}
