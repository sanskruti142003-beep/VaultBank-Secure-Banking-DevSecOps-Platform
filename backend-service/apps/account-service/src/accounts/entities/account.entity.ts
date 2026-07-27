import { BaseEntity, decimalStringTransformer } from '@app/database';
import { Column, Entity, Index, OneToMany, OneToOne } from 'typeorm';
import { AccountStatus } from '../enums/account-status.enum';
import { AccountType } from '../enums/account-type.enum';
import { KycStatus } from '../enums/kyc-status.enum';
import { AccountLimit } from './account-limit.entity';
import { Beneficiary } from './beneficiary.entity';

export enum AccountCurrency {
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
}

@Entity({ name: 'accounts' })
@Index('idx_accounts_user_id', ['userId'])
@Index('idx_accounts_status', ['status'])
export class Account extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'account_number', type: 'varchar', length: 32, unique: true })
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

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    default: '0.0000',
    transformer: decimalStringTransformer,
  })
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

  @OneToOne(() => AccountLimit, (limits) => limits.account)
  limits!: AccountLimit | null;

  @OneToMany(() => Beneficiary, (beneficiary) => beneficiary.account)
  beneficiaries!: Beneficiary[];
}
