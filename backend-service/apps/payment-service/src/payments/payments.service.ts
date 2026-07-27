import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuthenticatedUser,
  PaginatedResponse,
  PaginationDto,
} from '@app/common';
import { EventBusService } from '@app/events';
import Decimal from 'decimal.js';
import { TransactionHttpService } from '../http/transaction-http.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentOrder } from './entities';
import { PaymentStatus } from './enums/payment-status.enum';
import { PaymentsRepository } from './payments.repository';
import { ReceiptService } from './receipt.service';
import { TransferOtpService } from './transfer-otp.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly repository: PaymentsRepository,
    private readonly transactions: TransactionHttpService,
    private readonly receipts: ReceiptService,
    private readonly events: EventBusService,
    private readonly transferOtp: TransferOtpService,
  ) {}

  async initiate(
    dto: CreatePaymentDto,
    actor: AuthenticatedUser,
    bearerToken: string,
  ): Promise<PaymentOrder> {
    let order: PaymentOrder | null = null;
    try {
      if (!new Decimal(dto.amount).greaterThan(0)) {
        throw new BadRequestException('Amount must be greater than zero');
      }
      order = await this.repository.createOrder({
        userId: actor.userId,
        transactionId: null,
        fromAccountId: dto.fromAccountId,
        toAccountId: dto.toAccountId,
        gateway: dto.gateway,
        gatewayReference: null,
        amount: new Decimal(dto.amount).toFixed(4),
        currency: dto.currency.toUpperCase(),
        status: PaymentStatus.INITIATED,
        description: dto.description ?? null,
      });
      await this.transferOtp.verify(actor, dto.email, dto.otp);
      const transaction = await this.transactions.initiateTransfer(
        dto,
        bearerToken,
      );
      order.transactionId = transaction.id;
      order.status = this.statusFromTransaction(transaction.status);
      const saved = await this.repository.saveOrder(order);
      if (saved.status === PaymentStatus.SUCCESS) {
        await this.publishSuccessfulPayment(saved, transaction.id).catch(
          (error: unknown) => {
            this.logger.error(
              'Payment success side effects failed',
              error instanceof Error ? error.stack : undefined,
            );
          },
        );
      }
      return saved;
    } catch (error: unknown) {
      if (order) {
        order.status = PaymentStatus.FAILED;
        await this.repository.saveOrder(order);
      }
      this.rethrow(error, 'Payment initiation failed');
    }
  }

  async get(id: string, actor: AuthenticatedUser): Promise<PaymentOrder> {
    try {
      const order = await this.requiredOrder(id);
      this.assertOwnerOrAdmin(order, actor);
      return await this.syncOrderWithTransaction(order);
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to get payment');
    }
  }

  async list(
    userId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponse<PaymentOrder>> {
    try {
      const result = await this.repository.list(userId, pagination);
      return {
        ...result,
        data: await this.syncOrdersWithTransactions(result.data),
      };
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to list payments');
    }
  }

  async listAll(
    pagination: PaginationDto,
  ): Promise<PaginatedResponse<PaymentOrder>> {
    try {
      const result = await this.repository.listAll(pagination);
      return {
        ...result,
        data: await this.syncOrdersWithTransactions(result.data),
      };
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to list admin payments');
    }
  }

  async handleTransactionCompleted(
    transactionId: string,
  ): Promise<PaymentOrder> {
    try {
      const order = await this.requiredByTransaction(transactionId);
      if (order.status === PaymentStatus.SUCCESS) {
        return order;
      }
      order.status = PaymentStatus.SUCCESS;
      const saved = await this.repository.saveOrder(order);
      await this.publishSuccessfulPayment(saved, transactionId);
      return saved;
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to process completed transaction');
    }
  }

  async handleTransactionFailed(
    transactionId: string,
    reason: string,
  ): Promise<PaymentOrder> {
    try {
      const order = await this.requiredByTransaction(transactionId);
      order.status = PaymentStatus.FAILED;
      const saved = await this.repository.saveOrder(order);
      this.events.publish('payment.failed', {
        paymentId: saved.id,
        txnId: transactionId,
        reason,
        userId: saved.userId,
      });
      return saved;
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to process failed transaction');
    }
  }

  async applyGatewayStatus(
    gatewayReference: string,
    status: PaymentStatus,
  ): Promise<PaymentOrder> {
    try {
      const order =
        await this.repository.findByGatewayReference(gatewayReference);
      if (!order) {
        throw new NotFoundException('Payment gateway reference not found');
      }
      order.status = status;
      return await this.repository.saveOrder(order);
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to apply gateway status');
    }
  }

  private async requiredOrder(id: string): Promise<PaymentOrder> {
    const order = await this.repository.findOrder(id);
    if (!order) {
      throw new NotFoundException('Payment order not found');
    }
    return order;
  }

  private async requiredByTransaction(
    transactionId: string,
  ): Promise<PaymentOrder> {
    const order = await this.repository.findByTransaction(transactionId);
    if (!order) {
      throw new NotFoundException(
        'Payment order for transaction was not found',
      );
    }
    return order;
  }

  private assertOwnerOrAdmin(
    order: PaymentOrder,
    actor: AuthenticatedUser,
  ): void {
    if (order.userId !== actor.userId && !actor.roles.includes('admin')) {
      throw new ForbiddenException('Payment access denied');
    }
  }

  private statusFromTransaction(status: string): PaymentStatus {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'success':
        return PaymentStatus.SUCCESS;
      case 'failed':
      case 'reversed':
        return PaymentStatus.FAILED;
      default:
        return PaymentStatus.PROCESSING;
    }
  }

  private async syncOrdersWithTransactions(
    orders: PaymentOrder[],
  ): Promise<PaymentOrder[]> {
    return Promise.all(
      orders.map((order) => this.syncOrderWithTransaction(order)),
    );
  }

  private async syncOrderWithTransaction(
    order: PaymentOrder,
  ): Promise<PaymentOrder> {
    if (
      !order.transactionId ||
      ![PaymentStatus.INITIATED, PaymentStatus.PROCESSING].includes(
        order.status,
      )
    ) {
      return order;
    }

    try {
      const transactionId = order.transactionId;
      const transaction = await this.transactions.getTransaction(transactionId);
      const syncedStatus = this.statusFromTransaction(transaction.status);
      if (syncedStatus === order.status) {
        return order;
      }

      order.status = syncedStatus;
      const saved = await this.repository.saveOrder(order);
      if (saved.status === PaymentStatus.SUCCESS) {
        await this.publishSuccessfulPayment(saved, transactionId).catch(
          (error: unknown) => {
            this.logger.error(
              'Payment success side effects failed',
              error instanceof Error ? error.stack : undefined,
            );
          },
        );
      }
      return saved;
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Payment ${order.id} status could not be refreshed from its transaction: ${reason}`,
      );
      return order;
    }
  }

  private async publishSuccessfulPayment(
    order: PaymentOrder,
    transactionId: string,
  ): Promise<void> {
    const receipt = await this.receipts.generate(order);
    this.events.publish('payment.success', {
      paymentId: order.id,
      txnId: transactionId,
      amount: order.amount,
      currency: order.currency,
      userId: order.userId,
      receiptId: receipt.id,
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
