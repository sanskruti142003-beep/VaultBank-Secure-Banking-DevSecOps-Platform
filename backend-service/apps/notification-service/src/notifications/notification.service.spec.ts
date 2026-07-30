import { NotificationMailerService } from './notification-mailer.service';
import { NotificationEvent, NotificationService } from './notification.service';

describe('NotificationService', () => {
  let send: jest.Mock;
  let service: NotificationService;
  let stdoutSpy: jest.SpyInstance;

  const baseEvent = {
    id: 'event-0001',
    source: 'jest',
    occurredAt: '2026-07-30T12:00:00.000Z',
    correlationId: 'correlation-0001',
  };

  beforeEach(() => {
    send = jest.fn().mockResolvedValue(undefined);

    service = new NotificationService({
      send,
    } as unknown as NotificationMailerService);

    stdoutSpy = jest.spyOn(process.stdout, 'write');
    stdoutSpy.mockImplementation((..._args: unknown[]) => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    jest.clearAllMocks();
  });

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function lastStructuredLog(): Record<string, unknown> {
    const calls = stdoutSpy.mock.calls as unknown[][];

    for (let index = calls.length - 1; index >= 0; index -= 1) {
      const writtenChunk = calls[index]?.[0];

      if (typeof writtenChunk !== 'string') {
        continue;
      }

      const line = writtenChunk.trim();

      if (!line.startsWith('{')) {
        continue;
      }

      try {
        const parsed = JSON.parse(line) as unknown;

        if (isRecord(parsed) && parsed.event === 'notification.delivery') {
          return parsed;
        }
      } catch {
        // Ignore non-JSON output produced by the NestJS logger.
      }
    }

    throw new Error('Expected a structured notification.delivery log');
  }

  it('sends a welcome email and escapes untrusted HTML', async () => {
    const event = {
      ...baseEvent,
      routingKey: 'user.registered',
      payload: {
        userId: 'user-0001',
        email: 'customer@example.test',
        fullName: 'A&B <Admin> "Ops" \'Lead\'',
      },
    } as NotificationEvent;

    await service.handle(event);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      to: 'customer@example.test',
      subject: 'Welcome to VaultBank',
      text: [
        'Hello A&B <Admin> "Ops" \'Lead\',',
        '',
        'Your VaultBank account was created successfully.',
      ].join('\n'),
      html: [
        '<p>Hello A&amp;B &lt;Admin&gt; &quot;Ops&quot; &#39;Lead&#39;,</p>',
        '<p>Your VaultBank account was created successfully.</p>',
      ].join(''),
    });

    expect(lastStructuredLog()).toMatchObject({
      event: 'notification.delivery',
      level: 'info',
      routingKey: 'user.registered',
      eventId: 'event-0001',
      correlationId: 'correlation-0001',
      status: 'sent',
      recipientEmail: 'customer@example.test',
    });
  });

  it('skips a transaction notification when recipient email is absent', async () => {
    const event = {
      ...baseEvent,
      routingKey: 'transaction.completed',
      payload: {
        txnId: 'transaction-0001',
        reference: 'TXN-0001',
        amount: '125.50',
        currency: 'INR',
        completedAt: '2026-07-30T12:00:00.000Z',
      },
    } as NotificationEvent;

    await service.handle(event);

    expect(send).not.toHaveBeenCalled();
    expect(lastStructuredLog()).toMatchObject({
      routingKey: 'transaction.completed',
      status: 'skipped',
      level: 'warn',
      reason: 'recipient_email_missing',
    });
  });

  it('skips a successful payment notification without a recipient email', async () => {
    const event = {
      ...baseEvent,
      routingKey: 'payment.success',
      payload: {
        paymentId: 'payment-0001',
        txnId: 'transaction-0001',
        amount: '125.50',
        currency: 'INR',
        userId: 'user-0001',
        receiptId: 'receipt-0001',
      },
    } as NotificationEvent;

    await service.handle(event);

    expect(send).not.toHaveBeenCalled();
    expect(lastStructuredLog()).toMatchObject({
      routingKey: 'payment.success',
      status: 'skipped',
      reason: 'recipient_email_missing',
    });
  });

  it('skips a failed payment notification without a recipient email', async () => {
    const event = {
      ...baseEvent,
      routingKey: 'payment.failed',
      payload: {
        paymentId: 'payment-0001',
        txnId: 'transaction-0001',
        reason: 'Gateway timeout',
        userId: 'user-0001',
      },
    } as NotificationEvent;

    await service.handle(event);

    expect(send).not.toHaveBeenCalled();
    expect(lastStructuredLog()).toMatchObject({
      routingKey: 'payment.failed',
      status: 'skipped',
      reason: 'recipient_email_missing',
    });
  });
});
