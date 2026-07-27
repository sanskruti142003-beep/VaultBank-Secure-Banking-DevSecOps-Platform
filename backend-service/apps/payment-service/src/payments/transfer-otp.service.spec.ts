import { AuthenticatedUser } from '@app/common';
import { CacheService } from '@app/redis';
import { PaymentOtpEmailService } from './payment-otp-email.service';
import { TransferOtpService } from './transfer-otp.service';

describe('TransferOtpService', () => {
  let cache: jest.Mocked<Pick<CacheService, 'deleteOtp' | 'getOtp' | 'setOtp'>>;
  let emailOtp: jest.Mocked<Pick<PaymentOtpEmailService, 'sendTransferOtp'>>;
  let service: TransferOtpService;
  let storedOtp: string | null;

  const actor: AuthenticatedUser = {
    userId: '4fbf771c-2afd-47ff-832b-6db26dc3ee2d',
    email: 'payer@example.com',
    phone: '+919876543210',
    roles: ['customer'],
  };

  beforeEach(() => {
    storedOtp = null;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_PHONE_NUMBER;
    delete process.env.TWILIO_VERIFY_SERVICE_SID;
    delete process.env.PAYMENT_OTP_CHANNEL;
    delete process.env.PAYMENT_OTP_EMAIL_FALLBACK;

    cache = {
      setOtp: jest.fn(
        (
          _userId: string,
          _purpose: string,
          value: string,
          _ttlSeconds: number,
        ) => {
          storedOtp = value;
          return Promise.resolve();
        },
      ),
      getOtp: jest.fn((_userId: string, _purpose: string) =>
        Promise.resolve(storedOtp),
      ),
      deleteOtp: jest.fn((_userId: string, _purpose: string) => {
        storedOtp = null;
        return Promise.resolve();
      }),
    } as unknown as jest.Mocked<
      Pick<CacheService, 'deleteOtp' | 'getOtp' | 'setOtp'>
    >;
    emailOtp = {
      sendTransferOtp: jest.fn().mockResolvedValue(undefined),
    };
    service = new TransferOtpService(
      cache as unknown as CacheService,
      emailOtp as unknown as PaymentOtpEmailService,
    );
  });

  it('sends the transfer OTP to the registered email', async () => {
    const result = await service.send(actor, actor.email);

    expect(result.deliveryStatus).toBe('sent');
    expect(result.deliveryChannel).toBe('email');
    expect(result.email).toBe(actor.email);
    expect(emailOtp.sendTransferOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        to: actor.email,
        code: expect.stringMatching(/^\d{6}$/),
      }),
    );
    expect(storedOtp).not.toContain(
      emailOtp.sendTransferOtp.mock.calls[0][0].code,
    );
  });

  it('verifies the registered email OTP through the normal transfer check', async () => {
    await service.send(actor, actor.email);
    const code = emailOtp.sendTransferOtp.mock.calls[0][0].code;

    await expect(
      service.verify(actor, actor.email, code),
    ).resolves.toBeUndefined();
    expect(cache.deleteOtp).toHaveBeenCalledWith(
      actor.userId,
      'payment_transfer',
    );
  });
});
