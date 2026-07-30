import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventBusService } from '@app/events';
import Decimal from 'decimal.js';
import { randomInt } from 'node:crypto';
import { AuthenticatedUser } from '@app/common';
import { AccountsRepository } from './accounts.repository';
import { Account, AccountLimit, Beneficiary } from './entities';
import { AccountStatus } from './enums/account-status.enum';
import { KycStatus } from './enums/kyc-status.enum';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateKycDto } from './dto/update-kyc.dto';
import { UpdateLimitsDto } from './dto/update-limits.dto';
import { AddBeneficiaryDto } from './dto/add-beneficiary.dto';
import { BalanceOperation, UpdateBalanceDto } from './dto/update-balance.dto';
import { ReverseTransactionBalanceDto } from './dto/reverse-transaction-balance.dto';
import { AuthHttpService } from '../http/auth-http.service';

export interface AccountValidation {
  isActive: boolean;
  balance: string;
  currency: string;
  kycStatus: KycStatus;
  dailyLimit: string;
  singleTxnLimit: string;
  userId: string;
}

export type AccountLookup = Pick<
  Account,
  | 'id'
  | 'userId'
  | 'accountNumber'
  | 'type'
  | 'currency'
  | 'status'
  | 'kycStatus'
> & {
  ownerName?: string;
};

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    private readonly repository: AccountsRepository,
    private readonly events: EventBusService,
    private readonly auth: AuthHttpService,
  ) {}

  async open(userId: string, dto: CreateAccountDto): Promise<Account> {
    return this.openWithKycStatus(userId, dto, KycStatus.PENDING);
  }

  async openApproved(userId: string, dto: CreateAccountDto): Promise<Account> {
    return this.openWithKycStatus(userId, dto, KycStatus.APPROVED);
  }

  private async openWithKycStatus(
    userId: string,
    dto: CreateAccountDto,
    kycStatus: KycStatus,
  ): Promise<Account> {
    try {
      const openingDeposit = new Decimal(dto.openingDeposit ?? '0');
      if (openingDeposit.isNegative()) {
        throw new BadRequestException('Opening deposit cannot be negative');
      }
      const account = await this.repository.createAccount({
        userId,
        accountNumber: await this.uniqueAccountNumber(),
        type: dto.type,
        currency: dto.currency,
        balance: openingDeposit.toFixed(4),
        status: AccountStatus.ACTIVE,
        kycStatus,
      });
      account.limits = await this.repository.saveLimits(
        account.id,
        '10000.0000',
        '5000.0000',
      );
      this.events.publish('account.created', {
        accountId: account.id,
        userId,
        type: account.type,
        currency: account.currency,
      });
      return account;
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to open account');
    }
  }

  async list(userId: string): Promise<Account[]> {
    try {
      return await this.repository.findByUser(userId);
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to list accounts');
    }
  }

  async listAll(): Promise<Account[]> {
    try {
      return await this.repository.findAll();
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to list all accounts');
    }
  }

  async get(id: string, actor: AuthenticatedUser): Promise<Account> {
    try {
      const account = await this.requiredAccount(id);
      this.assertOwnerOrAdmin(account, actor);
      return account;
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to get account');
    }
  }

  async getByAccountNumber(accountNumber: string): Promise<AccountLookup> {
    try {
      const normalized = accountNumber.replace(/\D/g, '');
      if (!normalized) {
        throw new BadRequestException('Account number is required');
      }
      const account = await this.repository.findByNumber(normalized);
      if (!account) {
        throw new NotFoundException('Account not found');
      }
      const ownerProfile = await this.auth.getUserProfile(account.userId);
      return {
        id: account.id,
        userId: account.userId,
        accountNumber: account.accountNumber,
        type: account.type,
        currency: account.currency,
        status: account.status,
        kycStatus: account.kycStatus,
        ownerName: ownerProfile?.fullName,
      };
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to find account');
    }
  }

  async freeze(id: string, reason: string): Promise<Account> {
    try {
      const account = await this.requiredAccount(id);
      account.status = AccountStatus.FROZEN;
      const saved = await this.repository.saveAccount(account);
      this.events.publish('account.frozen', {
        accountId: saved.id,
        userId: saved.userId,
        reason,
      });
      return saved;
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to freeze account');
    }
  }

  async unfreeze(id: string): Promise<Account> {
    try {
      const account = await this.requiredAccount(id);
      account.status = AccountStatus.ACTIVE;
      return await this.repository.saveAccount(account);
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to unfreeze account');
    }
  }

  async close(id: string): Promise<Account> {
    try {
      const account = await this.requiredAccount(id);
      account.status = AccountStatus.CLOSED;
      const saved = await this.repository.saveAccount(account);
      this.events.publish('account.closed', {
        accountId: saved.id,
        userId: saved.userId,
      });
      return saved;
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to close account');
    }
  }

  async deleteWithOtp(
    id: string,
    otp: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    try {
      const account = await this.requiredAccount(id);
      this.assertOwnerOrAdmin(account, actor);
      if (!actor.roles.includes('admin')) {
        await this.auth.verifyAccountDeletionOtp(actor.userId, otp);
      }
      account.status = AccountStatus.CLOSED;
      const saved = await this.repository.saveAccount(account);
      await this.repository.deleteAccount(saved.id);
      this.events.publish('account.closed', {
        accountId: saved.id,
        userId: saved.userId,
      });
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to delete account');
    }
  }

  async updateKyc(id: string, dto: UpdateKycDto): Promise<Account> {
    try {
      const account = await this.requiredAccount(id);
      const oldStatus = account.kycStatus;
      account.kycStatus = dto.status;
      const saved = await this.repository.saveAccount(account);
      this.events.publish('kyc.updated', {
        accountId: saved.id,
        userId: saved.userId,
        oldStatus,
        newStatus: dto.status,
      });
      return saved;
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to update KYC');
    }
  }

  async updateLimits(
    id: string,
    dto: UpdateLimitsDto,
    actor: AuthenticatedUser,
  ): Promise<AccountLimit> {
    try {
      const account = await this.requiredAccount(id);
      this.assertOwnerOrAdmin(account, actor);
      const daily = new Decimal(dto.dailyTransferLimit);
      const single = new Decimal(dto.singleTxnLimit);
      if (
        daily.isNegative() ||
        single.isNegative() ||
        single.greaterThan(daily)
      ) {
        throw new BadRequestException(
          'Limits must be non-negative and single limit cannot exceed daily limit',
        );
      }
      return await this.repository.saveLimits(
        id,
        daily.toFixed(4),
        single.toFixed(4),
      );
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to update account limits');
    }
  }

  async addBeneficiary(
    id: string,
    dto: AddBeneficiaryDto,
    actor: AuthenticatedUser,
  ): Promise<Beneficiary> {
    try {
      const account = await this.requiredAccount(id);
      this.assertOwnerOrAdmin(account, actor);
      return await this.repository.addBeneficiary({
        accountId: id,
        name: dto.name,
        bankCode: dto.bankCode,
        beneficiaryAccountNumber: dto.beneficiaryAccountNumber,
      });
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to add beneficiary');
    }
  }

  async beneficiaries(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<Beneficiary[]> {
    try {
      const account = await this.requiredAccount(id);
      this.assertOwnerOrAdmin(account, actor);
      return await this.repository.findBeneficiaries(id);
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to list beneficiaries');
    }
  }

  async listAllBeneficiaries(): Promise<Beneficiary[]> {
    try {
      return await this.repository.findAllBeneficiaries();
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to list all beneficiaries');
    }
  }

  async removeBeneficiary(
    accountId: string,
    beneficiaryId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    try {
      const account = await this.requiredAccount(accountId);
      this.assertOwnerOrAdmin(account, actor);
      const beneficiary = await this.repository.findBeneficiary(beneficiaryId);
      if (!beneficiary || beneficiary.accountId !== accountId) {
        throw new NotFoundException('Beneficiary not found');
      }
      await this.repository.removeBeneficiary(beneficiaryId);
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to remove beneficiary');
    }
  }

  async validate(id: string): Promise<AccountValidation> {
    try {
      const account = await this.requiredAccount(id);
      return {
        isActive: account.status === AccountStatus.ACTIVE,
        balance: account.balance,
        currency: account.currency,
        kycStatus: account.kycStatus,
        dailyLimit: account.limits?.dailyTransferLimit ?? '0.0000',
        singleTxnLimit: account.limits?.singleTxnLimit ?? '0.0000',
        userId: account.userId,
      };
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to validate account');
    }
  }

  async updateBalance(id: string, dto: UpdateBalanceDto): Promise<Account> {
    try {
      const account = await this.requiredAccount(id);
      const amount = new Decimal(dto.amount);
      if (!amount.greaterThan(0)) {
        throw new BadRequestException('Amount must be greater than zero');
      }
      const current = new Decimal(account.balance);
      if (
        dto.operation === BalanceOperation.DEBIT &&
        current.lessThan(amount)
      ) {
        throw new BadRequestException('Insufficient account balance');
      }
      account.balance =
        dto.operation === BalanceOperation.CREDIT
          ? current.plus(amount).toFixed(4)
          : current.minus(amount).toFixed(4);
      return await this.repository.saveAccount(account);
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to update account balance');
    }
  }

  async reverseTransactionBalance(
    dto: ReverseTransactionBalanceDto,
  ): Promise<{ reversed: true }> {
    try {
      const debitAmount = this.validOptionalBalanceAmount(
        dto.debitAccountId,
        dto.debitAmount,
        'debit',
      );
      const creditAmount = this.validOptionalBalanceAmount(
        dto.creditAccountId,
        dto.creditAmount,
        'credit',
      );

      if (!debitAmount && !creditAmount) {
        throw new BadRequestException('No balance reversal was provided');
      }
      if (
        dto.debitAccountId &&
        dto.creditAccountId &&
        dto.debitAccountId === dto.creditAccountId
      ) {
        throw new BadRequestException('Debit and credit accounts must differ');
      }

      await this.repository.applyBalanceAdjustment({
        creditAccountId: dto.creditAccountId,
        creditAmount,
        debitAccountId: dto.debitAccountId,
        debitAmount,
      });
      return { reversed: true };
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to reverse account balances');
    }
  }

  private async requiredAccount(id: string): Promise<Account> {
    const account = await this.repository.findById(id);
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    return account;
  }

  private assertOwnerOrAdmin(account: Account, actor: AuthenticatedUser): void {
    if (account.userId !== actor.userId && !actor.roles.includes('admin')) {
      throw new ForbiddenException('Account access denied');
    }
  }

  private validOptionalBalanceAmount(
    accountId: string | null | undefined,
    amountValue: string | null | undefined,
    label: string,
  ): string | undefined {
    if (!accountId && !amountValue) {
      return undefined;
    }
    if (!accountId || !amountValue) {
      throw new BadRequestException(
        `${label} account and amount must both be provided`,
      );
    }
    const amount = new Decimal(amountValue);
    if (!amount.greaterThan(0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    return amount.toFixed(4);
  }

  private async uniqueAccountNumber(): Promise<string> {
    const bankCode = process.env.BANK_CODE ?? '10';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const timestamp = Date.now().toString().slice(-6);
      const random = randomInt(0, 100).toString().padStart(2, '0');
      const value = `${bankCode}${timestamp}${random}`.slice(-10);
      if (!(await this.repository.findByNumber(value))) {
        return value;
      }
    }
    throw new InternalServerErrorException(
      'Unable to generate unique account number',
    );
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
