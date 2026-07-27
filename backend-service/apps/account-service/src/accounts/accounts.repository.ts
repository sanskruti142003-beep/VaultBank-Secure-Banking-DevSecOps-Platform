import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { EntityManager, Repository } from 'typeorm';
import { Account, AccountLimit, Beneficiary } from './entities';

@Injectable()
export class AccountsRepository {
  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectRepository(AccountLimit)
    private readonly limits: Repository<AccountLimit>,
    @InjectRepository(Beneficiary)
    private readonly beneficiaries: Repository<Beneficiary>,
  ) {}

  createAccount(input: Partial<Account>): Promise<Account> {
    return this.accounts.save(this.accounts.create(input));
  }

  saveAccount(account: Account): Promise<Account> {
    return this.accounts.save(account);
  }

  async applyBalanceAdjustment(input: {
    creditAccountId?: string | null;
    creditAmount?: string | null;
    debitAccountId?: string | null;
    debitAmount?: string | null;
  }): Promise<void> {
    await this.accounts.manager.transaction(async (manager) => {
      if (input.debitAccountId && input.debitAmount) {
        const account = await this.lockAccount(manager, input.debitAccountId);
        const amount = new Decimal(input.debitAmount);
        const balance = new Decimal(account.balance);
        if (balance.lessThan(amount)) {
          throw new BadRequestException(
            'Insufficient account balance to reverse transaction',
          );
        }
        account.balance = balance.minus(amount).toFixed(4);
        await manager.save(Account, account);
      }

      if (input.creditAccountId && input.creditAmount) {
        const account = await this.lockAccount(manager, input.creditAccountId);
        account.balance = new Decimal(account.balance)
          .plus(input.creditAmount)
          .toFixed(4);
        await manager.save(Account, account);
      }
    });
  }

  findById(id: string): Promise<Account | null> {
    return this.accounts.findOne({
      where: { id },
      relations: { limits: true, beneficiaries: true },
    });
  }

  findByNumber(accountNumber: string): Promise<Account | null> {
    return this.accounts.findOne({ where: { accountNumber } });
  }

  findByUser(userId: string): Promise<Account[]> {
    return this.accounts.find({
      where: { userId },
      relations: { limits: true },
      order: { createdAt: 'DESC' },
    });
  }

  findAll(): Promise<Account[]> {
    return this.accounts.find({
      relations: { limits: true },
      order: { createdAt: 'DESC' },
    });
  }

  async saveLimits(
    accountId: string,
    dailyTransferLimit: string,
    singleTxnLimit: string,
  ): Promise<AccountLimit> {
    const existing = await this.limits.findOne({ where: { accountId } });
    return this.limits.save(
      this.limits.create({
        ...existing,
        accountId,
        dailyTransferLimit,
        singleTxnLimit,
      }),
    );
  }

  addBeneficiary(
    input: Pick<
      Beneficiary,
      'accountId' | 'name' | 'bankCode' | 'beneficiaryAccountNumber'
    >,
  ): Promise<Beneficiary> {
    return this.beneficiaries.save(
      this.beneficiaries.create({ ...input, isVerified: false }),
    );
  }

  findBeneficiaries(accountId: string): Promise<Beneficiary[]> {
    return this.beneficiaries.find({
      where: { accountId },
      order: { createdAt: 'DESC' },
    });
  }

  findAllBeneficiaries(): Promise<Beneficiary[]> {
    return this.beneficiaries.find({
      relations: { account: true },
      order: { createdAt: 'DESC' },
    });
  }

  findBeneficiary(id: string): Promise<Beneficiary | null> {
    return this.beneficiaries.findOne({ where: { id } });
  }

  async removeBeneficiary(id: string): Promise<void> {
    await this.beneficiaries.softDelete(id);
  }

  async deleteAccount(id: string): Promise<void> {
    await this.accounts.softDelete(id);
  }

  private async lockAccount(
    manager: EntityManager,
    id: string,
  ): Promise<Account> {
    const account = await manager.findOne(Account, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    return account;
  }
}
