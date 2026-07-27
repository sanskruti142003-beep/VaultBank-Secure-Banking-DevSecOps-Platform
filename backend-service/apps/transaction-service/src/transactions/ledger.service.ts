import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import Decimal from 'decimal.js';
import {
  LedgerEntry,
  LedgerEntryType,
  Transaction,
  TransactionFee,
} from './entities';
import { TransactionType } from './enums/transaction-type.enum';

export interface LedgerBalances {
  fromBalance?: string;
  toBalance?: string;
}

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly dataSource: DataSource) {}

  async createEntries(
    transaction: Transaction,
    fee: string,
    balances: LedgerBalances,
  ): Promise<LedgerEntry[]> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const entries = this.buildEntries(transaction, fee, balances);
      this.assertBalanced(entries);
      const saved = await runner.manager.save(LedgerEntry, entries);
      if (new Decimal(fee).greaterThan(0)) {
        await runner.manager.save(
          TransactionFee,
          runner.manager.create(TransactionFee, {
            transactionId: transaction.id,
            feeType: `${transaction.type}_fee`,
            amount: new Decimal(fee).toFixed(4),
            currency: transaction.currency,
          }),
        );
      }
      await runner.commitTransaction();
      return saved;
    } catch (error: unknown) {
      await runner.rollbackTransaction();
      this.logger.error('Ledger transaction rolled back');
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Ledger write failed');
    } finally {
      await runner.release();
    }
  }

  private buildEntries(
    transaction: Transaction,
    feeValue: string,
    balances: LedgerBalances,
  ): LedgerEntry[] {
    const amount = new Decimal(transaction.amount);
    const fee = new Decimal(feeValue);
    const total = amount.plus(fee);
    const clearing =
      process.env.CLEARING_ACCOUNT_ID ?? '00000000-0000-4000-8000-000000000001';
    const feeAccount =
      process.env.FEE_ACCOUNT_ID ?? '00000000-0000-4000-8000-000000000002';
    const values: Array<Partial<LedgerEntry>> = [];

    if (transaction.type === TransactionType.DEPOSIT) {
      values.push(
        {
          accountId: clearing,
          entryType: LedgerEntryType.DEBIT,
          amount: amount.toFixed(4),
          balanceAfter: '0.0000',
        },
        {
          accountId: this.requiredAccount(transaction.toAccountId),
          entryType: LedgerEntryType.CREDIT,
          amount: amount.toFixed(4),
          balanceAfter: new Decimal(balances.toBalance ?? 0)
            .plus(amount)
            .toFixed(4),
        },
      );
    } else {
      values.push({
        accountId: this.requiredAccount(transaction.fromAccountId),
        entryType: LedgerEntryType.DEBIT,
        amount: total.toFixed(4),
        balanceAfter: new Decimal(balances.fromBalance ?? 0)
          .minus(total)
          .toFixed(4),
      });
      if (transaction.type === TransactionType.TRANSFER) {
        values.push({
          accountId: this.requiredAccount(transaction.toAccountId),
          entryType: LedgerEntryType.CREDIT,
          amount: amount.toFixed(4),
          balanceAfter: new Decimal(balances.toBalance ?? 0)
            .plus(amount)
            .toFixed(4),
        });
      } else {
        values.push({
          accountId: clearing,
          entryType: LedgerEntryType.CREDIT,
          amount: amount.toFixed(4),
          balanceAfter: '0.0000',
        });
      }
      if (fee.greaterThan(0)) {
        values.push({
          accountId: feeAccount,
          entryType: LedgerEntryType.CREDIT,
          amount: fee.toFixed(4),
          balanceAfter: fee.toFixed(4),
        });
      }
    }

    return values.map((value) => runnerEntity(transaction.id, value));
  }

  private assertBalanced(entries: LedgerEntry[]): void {
    const debit = entries
      .filter((entry) => entry.entryType === LedgerEntryType.DEBIT)
      .reduce((total, entry) => total.plus(entry.amount), new Decimal(0));
    const credit = entries
      .filter((entry) => entry.entryType === LedgerEntryType.CREDIT)
      .reduce((total, entry) => total.plus(entry.amount), new Decimal(0));
    if (!debit.equals(credit)) {
      throw new BadRequestException('Ledger entries are not balanced');
    }
  }

  private requiredAccount(value: string | null): string {
    if (!value) {
      throw new BadRequestException('Required account reference is missing');
    }
    return value;
  }
}

function runnerEntity(
  transactionId: string,
  value: Partial<LedgerEntry>,
): LedgerEntry {
  return Object.assign(new LedgerEntry(), value, { transactionId });
}
