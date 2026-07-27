import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { TransactionType } from './enums/transaction-type.enum';

@Injectable()
export class FeeService {
  private readonly logger = new Logger(FeeService.name);

  calculate(type: TransactionType, amount: string): string {
    try {
      const value = new Decimal(amount);
      if (type === TransactionType.DEPOSIT) {
        return '0.0000';
      }
      if (type === TransactionType.WITHDRAWAL) {
        return '1.5000';
      }
      return Decimal.min(
        new Decimal(25),
        Decimal.max(new Decimal('0.10'), value.mul('0.001')),
      ).toFixed(4);
    } catch (error: unknown) {
      this.logger.error('Fee calculation failed');
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Fee calculation failed');
    }
  }
}
