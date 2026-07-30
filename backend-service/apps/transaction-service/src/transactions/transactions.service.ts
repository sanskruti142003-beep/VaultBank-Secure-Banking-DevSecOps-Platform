import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser, PaginatedResponse } from '@app/common';
import { EventBusService } from '@app/events';
import Decimal from 'decimal.js';
import { randomBytes } from 'node:crypto';
import {
  AccountHttpService,
  AccountValidation,
  BalanceOperation,
  ReverseTransactionBalanceRequest,
} from '../http/account-http.service';
import { InitiateTransferDto } from './dto/initiate-transfer.dto';
import { InitiateDepositDto } from './dto/initiate-deposit.dto';
import { InitiateWithdrawalDto } from './dto/initiate-withdrawal.dto';
import { AdminTransactionFilterDto } from './dto/admin-transaction-filter.dto';
import { TransactionFilterDto } from './dto/transaction-filter.dto';
import { Transaction } from './entities';
import { FeeService } from './fee.service';
import { LedgerService } from './ledger.service';
import { TransactionsRepository } from './transactions.repository';
import { TransactionStatus } from './enums/transaction-status.enum';
import { TransactionType } from './enums/transaction-type.enum';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private readonly repository: TransactionsRepository,
    private readonly accounts: AccountHttpService,
    private readonly fees: FeeService,
    private readonly ledger: LedgerService,
    private readonly events: EventBusService,
  ) {}

  async transfer(
    dto: InitiateTransferDto,
    actor: AuthenticatedUser,
  ): Promise<Transaction> {
    let transaction: Transaction | null = null;
    try {
      this.positiveAmount(dto.amount);
      if (dto.fromAccountId === dto.toAccountId) {
        throw new BadRequestException(
          'Source and destination accounts must differ',
        );
      }
      const [from, to] = await Promise.all([
        this.accounts.validateAccount(dto.fromAccountId),
        this.accounts.validateAccount(dto.toAccountId),
      ]);
      this.assertOwnership(from, actor);
      this.assertTransactable(from, true);
      this.assertTransactable(to, false);
      this.assertCurrency(dto.currency, from, to);
      const fee = this.fees.calculate(TransactionType.TRANSFER, dto.amount);
      await this.assertTransferLimits(dto.amount, fee, from, dto.fromAccountId);

      transaction = await this.createPending({
        fromAccountId: dto.fromAccountId,
        toAccountId: dto.toAccountId,
        amount: new Decimal(dto.amount).toFixed(4),
        currency: dto.currency,
        type: TransactionType.TRANSFER,
        description: dto.description ?? null,
        actor,
      });
      transaction.status = TransactionStatus.PROCESSING;
      await this.repository.save(transaction);
      this.publishInitiated(transaction);
      await this.ledger.createEntries(transaction, fee, {
        fromBalance: from.balance,
        toBalance: to.balance,
      });
      await Promise.all([
        this.accounts.updateBalance(
          dto.fromAccountId,
          BalanceOperation.DEBIT,
          new Decimal(dto.amount).plus(fee).toFixed(4),
        ),
        this.accounts.updateBalance(
          dto.toAccountId,
          BalanceOperation.CREDIT,
          new Decimal(dto.amount).toFixed(4),
        ),
      ]);
      transaction.status = TransactionStatus.COMPLETED;
      transaction.completedAt = new Date();
      const completed = await this.repository.save(transaction);
      this.publishCompleted(completed);
      return completed;
    } catch (error: unknown) {
      await this.failTransaction(transaction, error);
      this.rethrow(error, 'Transfer failed');
    }
  }

  async deposit(
    dto: InitiateDepositDto,
    actor: AuthenticatedUser,
  ): Promise<Transaction> {
    let transaction: Transaction | null = null;
    try {
      this.positiveAmount(dto.amount);
      const to = await this.accounts.validateAccount(dto.toAccountId);
      this.assertOwnership(to, actor);
      this.assertTransactable(to, false);
      this.assertCurrency(dto.currency, to);
      transaction = await this.createPending({
        fromAccountId: null,
        toAccountId: dto.toAccountId,
        amount: new Decimal(dto.amount).toFixed(4),
        currency: dto.currency,
        type: TransactionType.DEPOSIT,
        description: 'Account deposit',
        actor,
      });
      transaction.status = TransactionStatus.PROCESSING;
      await this.repository.save(transaction);
      this.publishInitiated(transaction);
      await this.ledger.createEntries(transaction, '0.0000', {
        toBalance: to.balance,
      });
      await this.accounts.updateBalance(
        dto.toAccountId,
        BalanceOperation.CREDIT,
        new Decimal(dto.amount).toFixed(4),
      );
      transaction.status = TransactionStatus.COMPLETED;
      transaction.completedAt = new Date();
      const completed = await this.repository.save(transaction);
      this.publishCompleted(completed);
      return completed;
    } catch (error: unknown) {
      await this.failTransaction(transaction, error);
      this.rethrow(error, 'Deposit failed');
    }
  }

  async withdrawal(
    dto: InitiateWithdrawalDto,
    actor: AuthenticatedUser,
  ): Promise<Transaction> {
    let transaction: Transaction | null = null;
    try {
      this.positiveAmount(dto.amount);
      const from = await this.accounts.validateAccount(dto.fromAccountId);
      this.assertOwnership(from, actor);
      this.assertTransactable(from, true);
      this.assertCurrency(dto.currency, from);
      const fee = this.fees.calculate(TransactionType.WITHDRAWAL, dto.amount);
      await this.assertTransferLimits(dto.amount, fee, from, dto.fromAccountId);
      transaction = await this.createPending({
        fromAccountId: dto.fromAccountId,
        toAccountId: null,
        amount: new Decimal(dto.amount).toFixed(4),
        currency: dto.currency,
        type: TransactionType.WITHDRAWAL,
        description: 'Account withdrawal',
        actor,
      });
      transaction.status = TransactionStatus.PROCESSING;
      await this.repository.save(transaction);
      this.publishInitiated(transaction);
      await this.ledger.createEntries(transaction, fee, {
        fromBalance: from.balance,
      });
      await this.accounts.updateBalance(
        dto.fromAccountId,
        BalanceOperation.DEBIT,
        new Decimal(dto.amount).plus(fee).toFixed(4),
      );
      transaction.status = TransactionStatus.COMPLETED;
      transaction.completedAt = new Date();
      const completed = await this.repository.save(transaction);
      this.publishCompleted(completed);
      return completed;
    } catch (error: unknown) {
      await this.failTransaction(transaction, error);
      this.rethrow(error, 'Withdrawal failed');
    }
  }

  async get(id: string): Promise<Transaction> {
    try {
      const transaction = await this.repository.findById(id);
      if (!transaction) {
        throw new NotFoundException('Transaction not found');
      }
      return transaction;
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to get transaction');
    }
  }

  async history(
    filter: TransactionFilterDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResponse<Transaction>> {
    try {
      const account = await this.accounts.validateAccount(filter.accountId);
      this.assertOwnership(account, actor);
      return await this.repository.history(filter);
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to get transaction history');
    }
  }

  async listAll(
    filter: AdminTransactionFilterDto,
  ): Promise<PaginatedResponse<Transaction>> {
    try {
      return await this.repository.listAll(filter);
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to list admin transactions');
    }
  }

  async reverse(
    id: string,
    reason: string,
    actor: AuthenticatedUser,
  ): Promise<Transaction> {
    try {
      const transaction = await this.get(id);
      if (transaction.status !== TransactionStatus.COMPLETED) {
        throw new BadRequestException(
          'Only completed transactions can be reversed',
        );
      }
      await this.applyBalanceReversal(transaction);
      const reversedAt = new Date().toISOString();
      transaction.status = TransactionStatus.REVERSED;
      transaction.metadata = {
        ...(transaction.metadata ?? {}),
        reversalReason: reason,
        reversedBy: actor.userId,
        reversedAt,
      };
      const saved = await this.repository.save(transaction);
      this.events.publish('transaction.reversed', {
        txnId: saved.id,
        reference: saved.reference,
        reversedBy: actor.userId,
        reason,
        reversedAt,
      });
      return saved;
    } catch (error: unknown) {
      this.rethrow(error, 'Transaction reversal failed');
    }
  }

  private async createPending(input: {
    fromAccountId: string | null;
    toAccountId: string | null;
    amount: string;
    currency: string;
    type: TransactionType;
    description: string | null;
    actor: AuthenticatedUser;
  }): Promise<Transaction> {
    return this.repository.create({
      reference: await this.uniqueReference(),
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amount: input.amount,
      currency: input.currency.toUpperCase(),
      type: input.type,
      status: TransactionStatus.PENDING,
      description: input.description,
      metadata: { initiatedBy: input.actor.userId },
      initiatedAt: new Date(),
      completedAt: null,
    });
  }

  private async assertTransferLimits(
    amountValue: string,
    feeValue: string,
    account: AccountValidation,
    accountId: string,
  ): Promise<void> {
    const amount = new Decimal(amountValue);
    const total = amount.plus(feeValue);
    if (new Decimal(account.balance).lessThan(total)) {
      throw new BadRequestException('Insufficient account balance');
    }
    if (amount.greaterThan(account.singleTxnLimit)) {
      throw new BadRequestException('Single transaction limit exceeded');
    }
    const daily = new Decimal(await this.repository.dailyOutgoing(accountId));
    if (daily.plus(amount).greaterThan(account.dailyLimit)) {
      throw new BadRequestException('Daily transfer limit exceeded');
    }
  }

  private assertTransactable(
    account: AccountValidation,
    requireKyc: boolean,
  ): void {
    if (!account.isActive) {
      throw new BadRequestException('Account is not active');
    }
    if (requireKyc && account.kycStatus !== 'approved') {
      throw new BadRequestException('Approved KYC is required');
    }
  }

  private assertCurrency(
    expected: string,
    ...accounts: AccountValidation[]
  ): void {
    if (
      accounts.some((account) => account.currency !== expected.toUpperCase())
    ) {
      throw new BadRequestException('Account currency mismatch');
    }
  }

  private assertOwnership(
    account: AccountValidation,
    actor: AuthenticatedUser,
  ): void {
    if (account.userId !== actor.userId && !actor.roles.includes('admin')) {
      throw new ForbiddenException('Account ownership validation failed');
    }
  }

  private positiveAmount(value: string): void {
    if (!new Decimal(value).greaterThan(0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }
  }

  private async applyBalanceReversal(transaction: Transaction): Promise<void> {
    const amount = new Decimal(transaction.amount).toFixed(4);
    const fee = this.feeTotal(transaction);
    const debitAmount = amount;
    const creditAmount = new Decimal(transaction.amount).plus(fee).toFixed(4);
    const request: ReverseTransactionBalanceRequest =
      transaction.type === TransactionType.DEPOSIT
        ? {
            debitAccountId: this.requiredAccountReference(
              transaction.toAccountId,
              'deposit account',
            ),
            debitAmount,
          }
        : transaction.type === TransactionType.WITHDRAWAL
          ? {
              creditAccountId: this.requiredAccountReference(
                transaction.fromAccountId,
                'withdrawal account',
              ),
              creditAmount,
            }
          : {
              creditAccountId: this.requiredAccountReference(
                transaction.fromAccountId,
                'source account',
              ),
              creditAmount,
              debitAccountId: this.requiredAccountReference(
                transaction.toAccountId,
                'destination account',
              ),
              debitAmount,
            };

    await this.accounts.reverseTransactionBalance(request);
  }

  private feeTotal(transaction: Transaction): Decimal {
    const savedFees = transaction.fees ?? [];
    if (savedFees.length > 0) {
      return savedFees.reduce(
        (total, fee) => total.plus(fee.amount),
        new Decimal(0),
      );
    }
    return new Decimal(
      this.fees.calculate(transaction.type, transaction.amount),
    );
  }

  private requiredAccountReference(
    accountId: string | null,
    label: string,
  ): string {
    if (!accountId) {
      throw new BadRequestException(`Missing ${label} for reversal`);
    }
    return accountId;
  }

  private async uniqueReference(): Promise<string> {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const random = [...randomBytes(6)]
        .map((byte) => alphabet[byte % alphabet.length])
        .join('');
      const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
      const reference = `TXN${date}${random}`;
      if (!(await this.repository.findByReference(reference))) {
        return reference;
      }
    }
    throw new InternalServerErrorException(
      'Unable to generate transaction reference',
    );
  }

  private publishInitiated(transaction: Transaction): void {
    this.events.publish('transaction.initiated', {
      txnId: transaction.id,
      reference: transaction.reference,
      fromAccountId: transaction.fromAccountId,
      toAccountId: transaction.toAccountId,
      amount: transaction.amount,
      currency: transaction.currency,
      type: transaction.type,
    });
  }

  private publishCompleted(transaction: Transaction): void {
    this.events.publish('transaction.completed', {
      txnId: transaction.id,
      reference: transaction.reference,
      amount: transaction.amount,
      currency: transaction.currency,
      completedAt:
        transaction.completedAt?.toISOString() ?? new Date().toISOString(),
    });
  }

  private async failTransaction(
    transaction: Transaction | null,
    error: unknown,
  ): Promise<void> {
    if (!transaction) {
      return;
    }
    transaction.status = TransactionStatus.FAILED;
    transaction.metadata = {
      ...(transaction.metadata ?? {}),
      failureReason: error instanceof Error ? error.message : String(error),
    };
    await this.repository.save(transaction);
    this.events.publish('transaction.failed', {
      txnId: transaction.id,
      reference: transaction.reference,
      reason: error instanceof Error ? error.message : 'Unknown failure',
      failedAt: new Date().toISOString(),
    });
  }

  private rethrow(error: unknown, message: string): never {
    this.logger.error(
      message,
      error instanceof Error ? error.stack : undefined,
    );
    if (error instanceof HttpException) {
      throw error;
    }
    throw new InternalServerErrorException(message);
  }
}
