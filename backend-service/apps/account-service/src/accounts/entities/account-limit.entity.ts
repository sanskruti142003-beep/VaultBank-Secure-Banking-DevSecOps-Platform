import { BaseEntity, decimalStringTransformer } from '@app/database';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { Account } from './account.entity';

@Entity({ name: 'account_limits' })
export class AccountLimit extends BaseEntity {
  @Column({ name: 'account_id', type: 'uuid', unique: true })
  accountId!: string;

  @OneToOne(() => Account, (account) => account.limits, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'account_id' })
  account!: Account;

  @Column({
    name: 'daily_transfer_limit',
    type: 'decimal',
    precision: 18,
    scale: 4,
    transformer: decimalStringTransformer,
  })
  dailyTransferLimit!: string;

  @Column({
    name: 'single_txn_limit',
    type: 'decimal',
    precision: 18,
    scale: 4,
    transformer: decimalStringTransformer,
  })
  singleTxnLimit!: string;
}
