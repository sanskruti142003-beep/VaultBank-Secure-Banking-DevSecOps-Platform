import { BaseEntity } from '@app/database';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Account } from './account.entity';

@Entity({ name: 'beneficiaries' })
export class Beneficiary extends BaseEntity {
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => Account, (account) => account.beneficiaries, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'account_id' })
  account!: Account;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ name: 'bank_code', type: 'varchar', length: 32 })
  bankCode!: string;

  @Column({
    name: 'beneficiary_account_number',
    type: 'varchar',
    length: 64,
  })
  beneficiaryAccountNumber!: string;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified!: boolean;
}
