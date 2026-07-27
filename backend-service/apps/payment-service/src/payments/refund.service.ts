import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '@app/common';
import { EventBusService } from '@app/events';
import { PaymentOrder, Refund } from './entities';
import { PaymentStatus, RefundStatus } from './enums/payment-status.enum';
import { PaymentsRepository } from './payments.repository';

@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    private readonly repository: PaymentsRepository,
    private readonly events: EventBusService,
  ) {}

  async request(
    order: PaymentOrder,
    reason: string,
    actor: AuthenticatedUser,
  ): Promise<Refund> {
    try {
      if (order.userId !== actor.userId && !actor.roles.includes('admin')) {
        throw new ForbiddenException('Refund access denied');
      }
      if (order.status !== PaymentStatus.SUCCESS) {
        throw new BadRequestException(
          'Only successful payments can be refunded',
        );
      }
      const existing = await this.repository.findRefundByOrder(order.id);
      if (
        existing &&
        ![RefundStatus.REJECTED, RefundStatus.COMPLETED].includes(
          existing.status,
        )
      ) {
        throw new BadRequestException('A refund is already in progress');
      }
      return await this.repository.createRefund({
        paymentOrderId: order.id,
        amount: order.amount,
        reason,
        status: RefundStatus.PENDING,
        requestedAt: new Date(),
        resolvedAt: null,
      });
    } catch (error: unknown) {
      this.rethrow(error, 'Refund request failed');
    }
  }

  async status(orderId: string): Promise<Refund> {
    try {
      const refund = await this.repository.findRefundByOrder(orderId);
      if (!refund) {
        throw new NotFoundException('Refund not found');
      }
      return refund;
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to get refund');
    }
  }

  async approve(id: string, order: PaymentOrder): Promise<Refund> {
    try {
      const refund = await this.repository.findRefund(id);
      if (!refund || refund.paymentOrderId !== order.id) {
        throw new NotFoundException('Refund not found');
      }
      refund.status = RefundStatus.APPROVED;
      await this.repository.saveRefund(refund);
      await this.callGatewayRefund(order, refund);
      refund.status = RefundStatus.COMPLETED;
      refund.resolvedAt = new Date();
      order.status = PaymentStatus.REFUNDED;
      await this.repository.saveOrder(order);
      const saved = await this.repository.saveRefund(refund);
      this.events.publish('payment.refunded', {
        paymentId: order.id,
        amount: saved.amount,
        reason: saved.reason,
        refundedAt: saved.resolvedAt?.toISOString() ?? new Date().toISOString(),
      });
      return saved;
    } catch (error: unknown) {
      this.rethrow(error, 'Refund approval failed');
    }
  }

  private async callGatewayRefund(
    _order: PaymentOrder,
    _refund: Refund,
  ): Promise<void> {
    void _order;
    void _refund;
    await Promise.resolve();
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
