import { HttpService } from '@nestjs/axios';
import {
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BaseHttpService } from '@app/common';

export interface AccountValidation {
  isActive: boolean;
  balance: string;
  currency: string;
  kycStatus: 'pending' | 'approved' | 'rejected';
  dailyLimit: string;
  singleTxnLimit: string;
  userId: string;
}

export enum BalanceOperation {
  CREDIT = 'credit',
  DEBIT = 'debit',
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface ReverseTransactionBalanceRequest {
  creditAccountId?: string | null;
  creditAmount?: string | null;
  debitAccountId?: string | null;
  debitAmount?: string | null;
}

@Injectable()
export class AccountHttpService extends BaseHttpService {
  private readonly serviceLogger = new Logger(AccountHttpService.name);

  constructor(http: HttpService) {
    super(
      http,
      process.env.ACCOUNT_SERVICE_URL ?? 'http://account-service:3002/v1',
    );
  }

  async validateAccount(accountId: string): Promise<AccountValidation> {
    try {
      const response = await this.get<ApiResponse<AccountValidation>>(
        `/internal/accounts/${accountId}/validate`,
      );
      return response.data;
    } catch (error: unknown) {
      this.serviceLogger.error(
        'Account validation request failed',
        error instanceof Error ? error.stack : undefined,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new ServiceUnavailableException('Account service is unavailable');
    }
  }

  async updateBalance(
    accountId: string,
    operation: BalanceOperation,
    amount: string,
  ): Promise<void> {
    try {
      await this.patch<ApiResponse<unknown>>(
        `/internal/accounts/${accountId}/balance`,
        { operation, amount },
      );
    } catch (error: unknown) {
      this.serviceLogger.error(
        'Account balance update request failed',
        error instanceof Error ? error.stack : undefined,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new ServiceUnavailableException('Account service is unavailable');
    }
  }

  async reverseTransactionBalance(
    request: ReverseTransactionBalanceRequest,
  ): Promise<void> {
    try {
      await this.post<ApiResponse<{ reversed: true }>>(
        '/internal/accounts/reverse-balance',
        request,
      );
    } catch (error: unknown) {
      this.serviceLogger.error(
        'Account balance reversal request failed',
        error instanceof Error ? error.stack : undefined,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new ServiceUnavailableException('Account service is unavailable');
    }
  }
}
