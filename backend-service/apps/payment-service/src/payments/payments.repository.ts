import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResponse, PaginationDto } from '@app/common';
import { PaymentOrder, PaymentReceipt, Refund } from './entities';

@Injectable()
export class PaymentsRepository {
  constructor(
    @InjectRepository(PaymentOrder)
    private readonly orders: Repository<PaymentOrder>,
    @InjectRepository(PaymentReceipt)
    private readonly receipts: Repository<PaymentReceipt>,
    @InjectRepository(Refund) private readonly refunds: Repository<Refund>,
  ) {}

  createOrder(input: Partial<PaymentOrder>): Promise<PaymentOrder> {
    return this.orders.save(this.orders.create(input));
  }

  saveOrder(order: PaymentOrder): Promise<PaymentOrder> {
    return this.orders.save(order);
  }

  findOrder(id: string): Promise<PaymentOrder | null> {
    return this.orders.findOne({
      where: { id },
      relations: { receipt: true, refunds: true },
    });
  }

  findByTransaction(transactionId: string): Promise<PaymentOrder | null> {
    return this.orders.findOne({ where: { transactionId } });
  }

  findByGatewayReference(
    gatewayReference: string,
  ): Promise<PaymentOrder | null> {
    return this.orders.findOne({ where: { gatewayReference } });
  }

  async list(
    userId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponse<PaymentOrder>> {
    const [data, total] = await this.orders.findAndCount({
      where: { userId },
      relations: { receipt: true },
      order: { createdAt: 'DESC' },
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
    });
    return {
      data,
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  async listAll(
    pagination: PaginationDto,
  ): Promise<PaginatedResponse<PaymentOrder>> {
    const [data, total] = await this.orders.findAndCount({
      relations: { receipt: true, refunds: true },
      order: { createdAt: 'DESC' },
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
    });
    return {
      data,
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  createReceipt(input: Partial<PaymentReceipt>): Promise<PaymentReceipt> {
    return this.receipts.save(this.receipts.create(input));
  }

  findReceiptByNumber(receiptNumber: string): Promise<PaymentReceipt | null> {
    return this.receipts.findOne({ where: { receiptNumber } });
  }

  createRefund(input: Partial<Refund>): Promise<Refund> {
    return this.refunds.save(this.refunds.create(input));
  }

  saveRefund(refund: Refund): Promise<Refund> {
    return this.refunds.save(refund);
  }

  findRefundByOrder(paymentOrderId: string): Promise<Refund | null> {
    return this.refunds.findOne({
      where: { paymentOrderId },
      order: { requestedAt: 'DESC' },
    });
  }

  findRefund(id: string): Promise<Refund | null> {
    return this.refunds.findOne({ where: { id } });
  }
}
