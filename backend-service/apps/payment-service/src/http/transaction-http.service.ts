import { HttpService } from '@nestjs/axios';
import {
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BaseHttpService } from '@app/common';
import { CreatePaymentDto } from '../payments/dto/create-payment.dto';

export interface TransactionResponse {
  id: string;
  reference: string;
  status: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

@Injectable()
export class TransactionHttpService extends BaseHttpService {
  private readonly serviceLogger = new Logger(TransactionHttpService.name);

  constructor(http: HttpService) {
    super(
      http,
      process.env.TRANSACTION_SERVICE_URL ??
        'http://transaction-service:3003/v1',
    );
  }

  async initiateTransfer(
    dto: CreatePaymentDto,
    bearerToken: string,
  ): Promise<TransactionResponse> {
    try {
      const response = await this.post<ApiResponse<TransactionResponse>>(
        '/transactions/transfer',
        {
          fromAccountId: dto.fromAccountId,
          toAccountId: dto.toAccountId,
          amount: dto.amount,
          currency: dto.currency,
          description: dto.description,
        },
        { headers: { authorization: bearerToken } },
      );
      return response.data;
    } catch (error: unknown) {
      this.rethrow(error, 'Transaction initiation request failed');
    }
  }

  async getTransaction(id: string): Promise<TransactionResponse> {
    try {
      const response = await this.get<ApiResponse<TransactionResponse>>(
        `/internal/transactions/${id}`,
      );
      return response.data;
    } catch (error: unknown) {
      this.rethrow(error, 'Transaction lookup request failed');
    }
  }

  private rethrow(error: unknown, message: string): never {
    this.serviceLogger.error(
      message,
      error instanceof Error ? error.stack : undefined,
    );
    if (error instanceof HttpException) {
      throw error;
    }
    throw new ServiceUnavailableException('Transaction service is unavailable');
  }
}
