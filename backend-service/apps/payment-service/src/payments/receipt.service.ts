import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PaymentOrder, PaymentReceipt } from './entities';
import { PaymentsRepository } from './payments.repository';

@Injectable()
export class ReceiptService {
  private readonly logger = new Logger(ReceiptService.name);

  constructor(private readonly repository: PaymentsRepository) {}

  async generate(order: PaymentOrder): Promise<PaymentReceipt> {
    try {
      return await this.repository.createReceipt({
        paymentOrderId: order.id,
        receiptNumber: await this.uniqueNumber(),
        issuedAt: new Date(),
        pdfUrl: `${process.env.RECEIPT_BASE_URL ?? 'https://receipts.local'}/${order.id}.pdf`,
      });
    } catch (error: unknown) {
      this.logger.error('Receipt generation failed');
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Receipt generation failed');
    }
  }

  private async uniqueNumber(): Promise<string> {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const random = [...randomBytes(8)]
        .map((byte) => alphabet[byte % alphabet.length])
        .join('');
      const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
      const value = `RCP${date}${random}`;
      if (!(await this.repository.findReceiptByNumber(value))) {
        return value;
      }
    }
    throw new InternalServerErrorException('Unable to generate receipt number');
  }
}
