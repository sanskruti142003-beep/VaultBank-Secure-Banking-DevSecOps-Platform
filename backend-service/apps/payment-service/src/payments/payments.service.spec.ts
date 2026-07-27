import { AuthenticatedUser } from '@app/common';
import { BankingEventEnvelope, EventBusService } from '@app/events';
import { Nack } from '@golevelup/nestjs-rabbitmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransactionEventsConsumer } from '../consumers/transaction-events.consumer';
import {
  TransactionHttpService,
  TransactionResponse,
} from '../http/transaction-http.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentOrder, PaymentReceipt } from './entities';
import { PaymentGateway } from './enums/gateway.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';
import { ReceiptService } from './receipt.service';
import { TransferOtpService } from './transfer-otp.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let repository: jest.Mocked<PaymentsRepository>;
  let transactions: jest.Mocked<TransactionHttpService>;
  let receipts: jest.Mocked<ReceiptService>;
  let events: jest.Mocked<EventBusService>;
  let transferOtp: jest.Mocked<TransferOtpService>;
  let order: PaymentOrder;

  const actor: AuthenticatedUser = {
    userId: '4fbf771c-2afd-47ff-832b-6db26dc3ee2d',
    email: 'payer@example.com',
    phone: '+919876543210',
    roles: ['customer'],
  };
  const dto: CreatePaymentDto = {
    fromAccountId: 'b2a29ac4-42e3-4513-bab7-b36a2c47413c',
    toAccountId: 'c429f588-7b88-4e02-a722-6ee4dc40cfe7',
    amount: '125.0000',
    currency: 'usd',
    gateway: PaymentGateway.STRIPE,
    description: 'Invoice 1001',
    email: actor.email,
    otp: '123456',
  };

  beforeEach(() => {
    order = {
      id: 'd88838de-3588-4bdb-95d2-623dfef0b24f',
      userId: actor.userId,
      transactionId: null,
      fromAccountId: dto.fromAccountId,
      toAccountId: dto.toAccountId,
      gateway: dto.gateway,
      gatewayReference: null,
      amount: dto.amount,
      currency: 'USD',
      status: PaymentStatus.INITIATED,
      description: dto.description ?? null,
      receipt: null,
      refunds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    repository = {
      createOrder: jest.fn().mockResolvedValue(order),
      saveOrder: jest
        .fn()
        .mockImplementation((value: PaymentOrder) => Promise.resolve(value)),
      findByTransaction: jest.fn(),
    } as unknown as jest.Mocked<PaymentsRepository>;
    transactions = {
      initiateTransfer: jest.fn().mockResolvedValue({
        id: 'cbdc69f6-8643-4d4d-8ca5-7e16ced53c8e',
        reference: 'TXN20260621ABC123',
        status: 'completed',
      } satisfies TransactionResponse),
      getTransaction: jest.fn(),
    } as unknown as jest.Mocked<TransactionHttpService>;
    receipts = {
      generate: jest.fn().mockResolvedValue({
        id: 'af34de08-b9dc-438f-bfb0-3b9e30d88b10',
      } as PaymentReceipt),
    } as unknown as jest.Mocked<ReceiptService>;
    events = {
      publish: jest.fn(),
    } as unknown as jest.Mocked<EventBusService>;
    transferOtp = {
      verify: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TransferOtpService>;
    service = new PaymentsService(
      repository,
      transactions,
      receipts,
      events,
      transferOtp,
    );
  });

  it('creates an order, triggers a transfer, and marks it successful when the transfer completes immediately', async () => {
    const result = await service.initiate(dto, actor, 'Bearer access-token');

    expect(transferOtp.verify).toHaveBeenCalledWith(
      actor,
      dto.email,
      dto.otp,
    );
    expect(repository.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: actor.userId,
        amount: '125.0000',
        currency: 'USD',
        status: PaymentStatus.INITIATED,
      }),
    );
    expect(transactions.initiateTransfer).toHaveBeenCalledWith(
      dto,
      'Bearer access-token',
    );
    expect(result.transactionId).toBe('cbdc69f6-8643-4d4d-8ca5-7e16ced53c8e');
    expect(result.status).toBe(PaymentStatus.SUCCESS);
    expect(receipts.generate).toHaveBeenCalledWith(
      expect.objectContaining({ status: PaymentStatus.SUCCESS }),
    );
    expect(events.publish).toHaveBeenCalledWith(
      'payment.success',
      expect.objectContaining({
        paymentId: order.id,
        txnId: result.transactionId,
      }),
    );
  });

  it('keeps the order processing when the transaction is still in flight', async () => {
    transactions.initiateTransfer.mockResolvedValue({
      id: 'cbdc69f6-8643-4d4d-8ca5-7e16ced53c8e',
      reference: 'TXN20260621ABC123',
      status: 'processing',
    } satisfies TransactionResponse);

    const result = await service.initiate(dto, actor, 'Bearer access-token');

    expect(result.transactionId).toBe('cbdc69f6-8643-4d4d-8ca5-7e16ced53c8e');
    expect(result.status).toBe(PaymentStatus.PROCESSING);
    expect(receipts.generate).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('refreshes a stuck processing payment when its transaction has completed', async () => {
    order.transactionId = 'cbdc69f6-8643-4d4d-8ca5-7e16ced53c8e';
    order.status = PaymentStatus.PROCESSING;
    repository.list = jest.fn().mockResolvedValue({
      data: [order],
      total: 1,
      page: 1,
      limit: 5,
      totalPages: 1,
    });
    transactions.getTransaction.mockResolvedValue({
      id: order.transactionId,
      reference: 'TXN20260621ABC123',
      status: 'completed',
    } satisfies TransactionResponse);

    const result = await service.list(actor.userId, { page: 1, limit: 5 });

    expect(result.data[0].status).toBe(PaymentStatus.SUCCESS);
    expect(repository.saveOrder).toHaveBeenCalledWith(
      expect.objectContaining({ status: PaymentStatus.SUCCESS }),
    );
    expect(receipts.generate).toHaveBeenCalledWith(
      expect.objectContaining({ status: PaymentStatus.SUCCESS }),
    );
  });

  it('marks the order failed when transaction initiation fails', async () => {
    transactions.initiateTransfer.mockRejectedValue(
      new Error('Transaction service unavailable'),
    );

    await expect(
      service.initiate(dto, actor, 'Bearer access-token'),
    ).rejects.toThrow('Payment initiation failed');
    expect(repository.saveOrder).toHaveBeenCalledWith(
      expect.objectContaining({ status: PaymentStatus.FAILED }),
    );
  });

  it('creates a failed payment order when OTP verification fails', async () => {
    transferOtp.verify.mockRejectedValueOnce(
      new BadRequestException('OTP is invalid or expired.'),
    );

    await expect(
      service.initiate(dto, actor, 'Bearer access-token'),
    ).rejects.toThrow('OTP is invalid or expired.');
    expect(repository.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: actor.userId,
        amount: '125.0000',
        status: PaymentStatus.INITIATED,
      }),
    );
    expect(repository.saveOrder).toHaveBeenCalledWith(
      expect.objectContaining({ status: PaymentStatus.FAILED }),
    );
    expect(transactions.initiateTransfer).not.toHaveBeenCalled();
  });

  it('completes a payment, generates a receipt, and publishes success', async () => {
    order.transactionId = 'cbdc69f6-8643-4d4d-8ca5-7e16ced53c8e';
    order.status = PaymentStatus.PROCESSING;
    repository.findByTransaction.mockResolvedValue(order);
    await service.handleTransactionCompleted(order.transactionId);

    expect(receipts.generate).toHaveBeenCalledWith(
      expect.objectContaining({ status: PaymentStatus.SUCCESS }),
    );
    expect(events.publish).toHaveBeenCalledWith(
      'payment.success',
      expect.objectContaining({
        paymentId: order.id,
        txnId: order.transactionId,
      }),
    );
  });
});

describe('TransactionEventsConsumer', () => {
  let payments: jest.Mocked<PaymentsService>;
  let consumer: TransactionEventsConsumer;

  beforeEach(() => {
    payments = {
      handleTransactionCompleted: jest.fn(),
      handleTransactionFailed: jest.fn(),
    } as unknown as jest.Mocked<PaymentsService>;
    consumer = new TransactionEventsConsumer(payments);
  });

  it('acknowledges a completed transaction after updating its payment', async () => {
    const event: BankingEventEnvelope<'transaction.completed'> = {
      id: '2d376596-b4fb-40de-99e1-b0eeccce438a',
      routingKey: 'transaction.completed',
      source: 'transaction-service',
      occurredAt: new Date().toISOString(),
      correlationId: '78317848-4993-472c-ad78-835bc7b74177',
      payload: {
        txnId: '10aa0aa0-a902-484b-bb5d-fb08a50e42bc',
        reference: 'TXN20260621ABC123',
        amount: '125.0000',
        currency: 'USD',
        completedAt: new Date().toISOString(),
      },
    };

    await expect(consumer.handle(event)).resolves.toBeUndefined();
    expect(payments.handleTransactionCompleted).toHaveBeenCalledWith(
      event.payload.txnId,
    );
  });

  it('dead-letters permanent not-found errors', async () => {
    payments.handleTransactionCompleted.mockRejectedValue(
      new NotFoundException('Payment order not found'),
    );
    const event: BankingEventEnvelope<'transaction.completed'> = {
      id: '2d376596-b4fb-40de-99e1-b0eeccce438a',
      routingKey: 'transaction.completed',
      source: 'transaction-service',
      occurredAt: new Date().toISOString(),
      correlationId: '78317848-4993-472c-ad78-835bc7b74177',
      payload: {
        txnId: '10aa0aa0-a902-484b-bb5d-fb08a50e42bc',
        reference: 'TXN20260621ABC123',
        amount: '125.0000',
        currency: 'USD',
        completedAt: new Date().toISOString(),
      },
    };

    await expect(consumer.handle(event)).resolves.toBeInstanceOf(Nack);
  });
});
