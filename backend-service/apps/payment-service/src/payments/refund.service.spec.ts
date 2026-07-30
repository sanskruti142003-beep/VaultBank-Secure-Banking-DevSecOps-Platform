import { AuthenticatedUser } from '@app/common';
import { EventBusService } from '@app/events';
import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PaymentOrder, Refund } from './entities';
import { PaymentStatus, RefundStatus } from './enums/payment-status.enum';
import { PaymentsRepository } from './payments.repository';
import { RefundService } from './refund.service';

type RepositoryMock = jest.Mocked<
  Pick<
    PaymentsRepository,
    | 'createRefund'
    | 'findRefund'
    | 'findRefundByOrder'
    | 'saveOrder'
    | 'saveRefund'
  >
>;

type EventsMock = jest.Mocked<Pick<EventBusService, 'publish'>>;

describe('RefundService', () => {
  const customer: AuthenticatedUser = {
    userId: '8e6472d6-08a7-44e7-a267-13912e0bda50',
    email: 'customer@example.test',
    roles: ['customer'],
  };

  const administrator: AuthenticatedUser = {
    userId: '58d67d53-a426-4367-997e-b5bcadad088e',
    email: 'admin@example.test',
    roles: ['admin'],
  };

  let repository: RepositoryMock;
  let events: EventsMock;
  let service: RefundService;
  let loggerErrorSpy: jest.SpyInstance;

  function buildOrder(overrides: Partial<PaymentOrder> = {}): PaymentOrder {
    return {
      id: 'b254a049-f850-48e8-b834-32ce377ebc25',
      userId: customer.userId,
      amount: '125.0000',
      currency: 'INR',
      status: PaymentStatus.SUCCESS,
      ...overrides,
    } as PaymentOrder;
  }

  function buildRefund(
    order: PaymentOrder,
    overrides: Partial<Refund> = {},
  ): Refund {
    return {
      id: '890e99a5-8f04-440e-9da2-f3255ecea76e',
      paymentOrderId: order.id,
      paymentOrder: order,
      amount: order.amount,
      reason: 'Duplicate payment',
      status: RefundStatus.PENDING,
      requestedAt: new Date('2026-07-30T10:00:00.000Z'),
      resolvedAt: null,
      ...overrides,
    } as Refund;
  }

  beforeEach(() => {
    repository = {
      createRefund: jest.fn(),
      findRefund: jest.fn(),
      findRefundByOrder: jest.fn(),
      saveOrder: jest.fn(),
      saveRefund: jest.fn(),
    } as unknown as RepositoryMock;

    events = {
      publish: jest.fn(),
    } as unknown as EventsMock;

    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    service = new RefundService(
      repository as unknown as PaymentsRepository,
      events as unknown as EventBusService,
    );
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('creates a pending refund for the payment owner', async () => {
    const order = buildOrder();
    const created = buildRefund(order);

    repository.findRefundByOrder.mockResolvedValue(null);
    repository.createRefund.mockResolvedValue(created);

    const result = await service.request(order, 'Duplicate payment', customer);

    expect(repository.createRefund).toHaveBeenCalledWith({
      paymentOrderId: order.id,
      amount: order.amount,
      reason: 'Duplicate payment',
      status: RefundStatus.PENDING,
      requestedAt: expect.any(Date),
      resolvedAt: null,
    });

    expect(result).toBe(created);
  });

  it('allows an administrator to request another customer refund', async () => {
    const order = buildOrder({
      userId: '6ead1714-67d1-4b21-b914-b2f0488ecba7',
    });

    const created = buildRefund(order);

    repository.findRefundByOrder.mockResolvedValue(null);
    repository.createRefund.mockResolvedValue(created);

    await expect(
      service.request(order, 'Approved admin request', administrator),
    ).resolves.toBe(created);
  });

  it('denies a different non-administrator customer', async () => {
    const order = buildOrder({
      userId: '6ead1714-67d1-4b21-b914-b2f0488ecba7',
    });

    await expect(
      service.request(order, 'Unauthorized request', customer),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repository.findRefundByOrder).not.toHaveBeenCalled();
    expect(repository.createRefund).not.toHaveBeenCalled();
  });

  it('rejects a refund for a payment that was not successful', async () => {
    const order = buildOrder({
      status: PaymentStatus.FAILED,
    });

    await expect(
      service.request(order, 'Failed payment', customer),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.createRefund).not.toHaveBeenCalled();
  });

  it('rejects a second refund while one is in progress', async () => {
    const order = buildOrder();

    repository.findRefundByOrder.mockResolvedValue(
      buildRefund(order, {
        status: RefundStatus.APPROVED,
      }),
    );

    await expect(
      service.request(order, 'Second refund', customer),
    ).rejects.toThrow('A refund is already in progress');

    expect(repository.createRefund).not.toHaveBeenCalled();
  });

  it('allows a new request after an earlier refund was completed', async () => {
    const order = buildOrder();
    const completed = buildRefund(order, {
      status: RefundStatus.COMPLETED,
    });
    const created = buildRefund(order);

    repository.findRefundByOrder.mockResolvedValue(completed);
    repository.createRefund.mockResolvedValue(created);

    await expect(
      service.request(order, 'New valid refund', customer),
    ).resolves.toBe(created);
  });

  it('converts an unexpected request failure into an internal error', async () => {
    const order = buildOrder();

    repository.findRefundByOrder.mockRejectedValue(
      'unexpected repository failure',
    );

    await expect(
      service.request(order, 'Repository failure', customer),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('returns the latest refund status', async () => {
    const order = buildOrder();
    const refund = buildRefund(order);

    repository.findRefundByOrder.mockResolvedValue(refund);

    await expect(service.status(order.id)).resolves.toBe(refund);
  });

  it('returns not found when no refund exists', async () => {
    repository.findRefundByOrder.mockResolvedValue(null);

    await expect(service.status('missing-order-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('converts an unexpected status lookup error into an internal error', async () => {
    repository.findRefundByOrder.mockRejectedValue(
      new Error('Database unavailable'),
    );

    await expect(service.status('payment-order-id')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('approves and completes a valid refund', async () => {
    const order = buildOrder();
    const refund = buildRefund(order);

    repository.findRefund.mockResolvedValue(refund);

    repository.saveRefund.mockImplementation((value: Refund) =>
      Promise.resolve(value),
    );

    repository.saveOrder.mockImplementation((value: PaymentOrder) =>
      Promise.resolve(value),
    );

    const result = await service.approve(refund.id, order);

    expect(result.status).toBe(RefundStatus.COMPLETED);
    expect(result.resolvedAt).toBeInstanceOf(Date);
    expect(order.status).toBe(PaymentStatus.REFUNDED);

    expect(repository.saveRefund).toHaveBeenCalledTimes(2);
    expect(repository.saveOrder).toHaveBeenCalledWith(order);

    expect(events.publish).toHaveBeenCalledWith('payment.refunded', {
      paymentId: order.id,
      amount: refund.amount,
      reason: refund.reason,
      refundedAt: expect.any(String),
    });
  });

  it('returns not found when the refund does not exist', async () => {
    const order = buildOrder();

    repository.findRefund.mockResolvedValue(null);

    await expect(
      service.approve('missing-refund-id', order),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns not found when the refund belongs to another order', async () => {
    const order = buildOrder();

    const refund = buildRefund(order, {
      paymentOrderId: 'different-payment-order-id',
    });

    repository.findRefund.mockResolvedValue(refund);

    await expect(service.approve(refund.id, order)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('converts an unexpected approval failure into an internal error', async () => {
    const order = buildOrder();

    repository.findRefund.mockRejectedValue(
      new Error('Repository unavailable'),
    );

    await expect(service.approve('refund-id', order)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
