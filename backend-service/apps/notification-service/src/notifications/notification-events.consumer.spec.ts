import { Nack } from '@golevelup/nestjs-rabbitmq';
import { NotificationEventsConsumer } from './notification-events.consumer';
import { NotificationEvent, NotificationService } from './notification.service';

describe('NotificationEventsConsumer', () => {
  let notificationHandle: jest.Mock;
  let consumer: NotificationEventsConsumer;

  const event = {
    id: 'event-0001',
    routingKey: 'user.registered',
    source: 'auth-service',
    occurredAt: '2026-07-30T12:00:00.000Z',
    correlationId: 'correlation-0001',
    payload: {
      userId: 'user-0001',
      email: 'customer@example.test',
      fullName: 'Test Customer',
    },
  } as NotificationEvent;

  beforeEach(() => {
    notificationHandle = jest.fn();

    consumer = new NotificationEventsConsumer({
      handle: notificationHandle,
    } as unknown as NotificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('acknowledges an event after successful notification handling', async () => {
    notificationHandle.mockResolvedValue(undefined);

    const result = await consumer.handle(event);

    expect(notificationHandle).toHaveBeenCalledTimes(1);
    expect(notificationHandle).toHaveBeenCalledWith(event);
    expect(result).toBeUndefined();
  });

  it('requests requeue when notification handling throws an Error', async () => {
    notificationHandle.mockRejectedValue(new Error('SMTP unavailable'));

    const result = await consumer.handle(event);

    expect(notificationHandle).toHaveBeenCalledWith(event);
    expect(result).toBeInstanceOf(Nack);
  });

  it('requests requeue when notification handling throws a non-Error value', async () => {
    notificationHandle.mockRejectedValue('unexpected failure');

    const result = await consumer.handle(event);

    expect(notificationHandle).toHaveBeenCalledWith(event);
    expect(result).toBeInstanceOf(Nack);
  });
});
