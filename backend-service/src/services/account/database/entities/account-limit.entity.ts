import {
  Check,
  Column,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Account } from './account.entity';

@Entity({ name: 'account_limits' })
@Check('chk_account_limits_daily_nonnegative', 'daily_transfer_limit >= 0')
@Check('chk_account_limits_single_nonnegative', 'single_txn_limit >= 0')
@Check(
  'chk_account_limits_single_lte_daily',
  'single_txn_limit <= daily_transfer_limit',
)
export class AccountLimit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

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
  })
  dailyTransferLimit!: string;

  @Column({
    name: 'single_txn_limit',
    type: 'decimal',
    precision: 18,
    scale: 4,
  })
  singleTxnLimit!: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt!: Date | null;
}
