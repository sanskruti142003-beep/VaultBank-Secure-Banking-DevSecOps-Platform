import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuthenticatedUser } from '@app/common';
import { CacheService } from '@app/redis';
import axios, { AxiosError, isAxiosError } from 'axios';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { PaymentOtpEmailService } from './payment-otp-email.service';

type OtpDeliveryChannel = 'sms' | 'email';

interface StoredTransferOtp {
  codeHash?: string;
  createdAt: string;
  email?: string;
  phone?: string;
  provider: 'email' | 'message' | 'verify';
}

interface SendTransferOtpResult {
  deliveryChannel: OtpDeliveryChannel;
  deliveryStatus: 'sent' | 'blocked';
  email?: string;
  expiresInSeconds: number;
  message: string;
  phone?: string;
}

const OTP_PURPOSE = 'payment_transfer';
const OTP_TTL_SECONDS = 120;
const PHONE_MESSAGE =
  'A valid registered mobile number with country code is required.';
const TWILIO_TRIAL_UNVERIFIED_MESSAGE =
  'Twilio trial account cannot send OTP to this mobile number yet. Verify this receiver number in Twilio Console, then try again.';

@Injectable()
export class TransferOtpService {
  private readonly logger = new Logger(TransferOtpService.name);

  constructor(
    private readonly cache: CacheService,
    private readonly emailOtp: PaymentOtpEmailService,
  ) {}

  async send(
    actor: AuthenticatedUser,
    email: string,
  ): Promise<SendTransferOtpResult> {
    const registeredEmail = this.registeredEmail(actor, email);
    return this.sendRegisteredEmailOtp(
      actor,
      registeredEmail,
      'OTP sent to your registered email address.',
    );
  }

  async verify(
    actor: AuthenticatedUser,
    email: string,
    otp: string,
  ): Promise<void> {
    const registeredEmail = this.registeredEmail(actor, email);
    if (!/^\d{6}$/.test(otp)) {
      throw new BadRequestException('Enter the 6 digit OTP.');
    }

    const stored = await this.cache.getOtp(actor.userId, OTP_PURPOSE);
    if (!stored) {
      throw new BadRequestException('OTP is invalid or expired.');
    }

    let payload: StoredTransferOtp;
    try {
      payload = JSON.parse(stored) as StoredTransferOtp;
    } catch {
      await this.cache.deleteOtp(actor.userId, OTP_PURPOSE);
      throw new BadRequestException('OTP is invalid or expired.');
    }

    if (payload.email !== registeredEmail) {
      throw new BadRequestException('OTP is invalid or expired.');
    }

    if (payload.provider === 'verify') {
      throw new BadRequestException('OTP is invalid or expired.');
    }

    if (
      !payload.codeHash ||
      !this.hashesMatch(payload.codeHash, this.hash(otp))
    ) {
      throw new BadRequestException('OTP is invalid or expired.');
    }
    await this.cache.deleteOtp(actor.userId, OTP_PURPOSE);
  }

  private async sendRegisteredEmailOtp(
    actor: AuthenticatedUser,
    email: string,
    message: string,
  ): Promise<SendTransferOtpResult> {
    const code = this.generateOtp();
    await this.emailOtp.sendTransferOtp({
      to: email,
      code,
      expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
    });
    await this.cache.setOtp(
      actor.userId,
      OTP_PURPOSE,
      JSON.stringify({
        codeHash: this.hash(code),
        provider: 'email',
        email,
        createdAt: new Date().toISOString(),
      } satisfies StoredTransferOtp),
      OTP_TTL_SECONDS,
    );
    return {
      message,
      email,
      expiresInSeconds: OTP_TTL_SECONDS,
      deliveryStatus: 'sent',
      deliveryChannel: 'email',
    };
  }

  private async sendTwilioVerifyOtp(
    actor: AuthenticatedUser,
    normalizedPhone: string,
    verifyServiceSid: string,
  ): Promise<SendTransferOtpResult> {
    const deliveryStatus = await this.sendVerifyOtp(
      normalizedPhone,
      verifyServiceSid,
    );
    if (deliveryStatus === 'blocked') {
      return this.emailFallbackOrBlocked(
        actor,
        normalizedPhone,
        TWILIO_TRIAL_UNVERIFIED_MESSAGE,
      );
    }

    await this.cache.setOtp(
      actor.userId,
      OTP_PURPOSE,
      JSON.stringify({
        provider: 'verify',
        phone: normalizedPhone,
        createdAt: new Date().toISOString(),
      } satisfies StoredTransferOtp),
      OTP_TTL_SECONDS,
    );
    return {
      message: 'OTP sent to registered mobile number.',
      phone: normalizedPhone,
      expiresInSeconds: OTP_TTL_SECONDS,
      deliveryStatus: 'sent',
      deliveryChannel: 'sms',
    };
  }

  private async sendTwilioMessageOtp(
    actor: AuthenticatedUser,
    normalizedPhone: string,
  ): Promise<SendTransferOtpResult> {
    const code = this.generateOtp();
    const deliveryStatus = await this.sendSms(
      normalizedPhone,
      `Your VaultBank transfer OTP is ${code}. It expires in 2 minutes. Do not share this code.`,
    );
    if (deliveryStatus === 'blocked') {
      return this.emailFallbackOrBlocked(
        actor,
        normalizedPhone,
        TWILIO_TRIAL_UNVERIFIED_MESSAGE,
      );
    }

    await this.cache.setOtp(
      actor.userId,
      OTP_PURPOSE,
      JSON.stringify({
        codeHash: this.hash(code),
        provider: 'message',
        phone: normalizedPhone,
        createdAt: new Date().toISOString(),
      } satisfies StoredTransferOtp),
      OTP_TTL_SECONDS,
    );
    return {
      message: 'OTP sent to registered mobile number.',
      phone: normalizedPhone,
      expiresInSeconds: OTP_TTL_SECONDS,
      deliveryStatus: 'sent',
      deliveryChannel: 'sms',
    };
  }

  private async emailFallbackOrBlocked(
    actor: AuthenticatedUser,
    normalizedPhone: string,
    blockedMessage: string,
  ): Promise<SendTransferOtpResult> {
    if (!this.emailFallbackEnabled()) {
      return {
        message: blockedMessage,
        phone: normalizedPhone,
        expiresInSeconds: 0,
        deliveryStatus: 'blocked',
        deliveryChannel: 'sms',
      };
    }

    return this.sendEmailOtp(
      actor,
      normalizedPhone,
      'SMS OTP is blocked for this local/trial setup, so OTP was sent to your registered email address.',
    );
  }

  private async sendEmailOtp(
    actor: AuthenticatedUser,
    normalizedPhone: string,
    message: string,
  ): Promise<SendTransferOtpResult> {
    const email = actor.email?.trim();
    if (!email) {
      throw new ServiceUnavailableException(
        'SMS OTP is unavailable and this profile has no registered email address.',
      );
    }

    const code = this.generateOtp();
    await this.emailOtp.sendTransferOtp({
      to: email,
      code,
      expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
    });
    await this.cache.setOtp(
      actor.userId,
      OTP_PURPOSE,
      JSON.stringify({
        codeHash: this.hash(code),
        provider: 'email',
        phone: normalizedPhone,
        email,
        createdAt: new Date().toISOString(),
      } satisfies StoredTransferOtp),
      OTP_TTL_SECONDS,
    );
    return {
      message,
      email,
      phone: normalizedPhone,
      expiresInSeconds: OTP_TTL_SECONDS,
      deliveryStatus: 'sent',
      deliveryChannel: 'email',
    };
  }

  private registeredEmail(actor: AuthenticatedUser, email: string): string {
    const normalizedEmail = email.trim().toLowerCase();
    const actorEmail = actor.email?.trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new BadRequestException(
        'A valid registered email address is required.',
      );
    }
    if (!actorEmail || actorEmail !== normalizedEmail) {
      throw new BadRequestException(
        'OTP can only be sent to the registered email address.',
      );
    }
    return normalizedEmail;
  }

  private preferredOtpChannel(): OtpDeliveryChannel {
    return process.env.PAYMENT_OTP_CHANNEL?.trim().toLowerCase() === 'email'
      ? 'email'
      : 'sms';
  }

  private emailFallbackEnabled(): boolean {
    return (
      process.env.PAYMENT_OTP_EMAIL_FALLBACK?.trim().toLowerCase() !== 'false'
    );
  }

  private registeredPhone(actor: AuthenticatedUser, phone: string): string {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || !/^\+\d{8,15}$/.test(normalizedPhone)) {
      throw new BadRequestException(PHONE_MESSAGE);
    }

    const registered = normalizePhone(actor.phone);
    if (registered && registered !== normalizedPhone) {
      throw new BadRequestException(
        'OTP can only be sent to the registered mobile number.',
      );
    }
    return normalizedPhone;
  }

  private async sendSms(
    to: string,
    body: string,
  ): Promise<'sent' | 'blocked'> {
    const config = this.twilioConfig();
    const params = new URLSearchParams({
      To: to,
      Body: body,
    });
    if (config.messagingServiceSid) {
      params.set('MessagingServiceSid', config.messagingServiceSid);
    } else {
      params.set('From', config.from);
    }

    try {
      await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
        params,
        {
          auth: {
            username: config.username,
            password: config.password,
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 10000,
        },
      );
      this.logger.log(`Transfer OTP SMS sent to ${maskPhone(to)}`);
      return 'sent';
    } catch (error: unknown) {
      const details = twilioErrorMessage(error);
      this.logger.error(
        `Twilio SMS send failed for ${maskPhone(to)}: ${details}`,
        error instanceof Error ? error.stack : undefined,
      );
      if (twilioErrorCode(error) === 21608) {
        return 'blocked';
      }
      throw new ServiceUnavailableException(
        [
          'Could not send OTP by Twilio.',
          details,
          'Use a Twilio-owned SMS sender in TWILIO_FROM_PHONE_NUMBER, or set TWILIO_VERIFY_SERVICE_SID for Twilio Verify.',
          'If this is a Twilio trial account, verify the customer phone number in Twilio first.',
        ].join(' '),
      );
    }
  }

  private async sendVerifyOtp(
    to: string,
    serviceSid: string,
  ): Promise<'sent' | 'blocked'> {
    const config = this.twilioConfig({ allowMissingSender: true });
    const params = new URLSearchParams({
      To: to,
      Channel: 'sms',
    });
    try {
      await axios.post(
        `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`,
        params,
        this.twilioRequestConfig(config),
      );
      this.logger.log(`Transfer OTP verification sent to ${maskPhone(to)}`);
      return 'sent';
    } catch (error: unknown) {
      const details = twilioErrorMessage(error);
      this.logger.error(
        `Twilio Verify send failed for ${maskPhone(to)}: ${details}`,
        error instanceof Error ? error.stack : undefined,
      );
      if (twilioErrorCode(error) === 21608) {
        return 'blocked';
      }
      throw new ServiceUnavailableException(
        `Could not send OTP by Twilio Verify. ${details}`,
      );
    }
  }

  private async checkVerifyOtp(to: string, otp: string): Promise<void> {
    const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();
    if (!serviceSid) {
      throw new ServiceUnavailableException(
        'Twilio Verify service is not configured.',
      );
    }
    const config = this.twilioConfig({ allowMissingSender: true });
    const params = new URLSearchParams({
      To: to,
      Code: otp,
    });
    try {
      const response = await axios.post<{ status?: string }>(
        `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`,
        params,
        this.twilioRequestConfig(config),
      );
      if (response.data.status !== 'approved') {
        throw new BadRequestException('OTP is invalid or expired.');
      }
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      const details = twilioErrorMessage(error);
      this.logger.error(
        `Twilio Verify check failed for ${maskPhone(to)}: ${details}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadRequestException('OTP is invalid or expired.');
    }
  }

  private twilioConfig(options?: { allowMissingSender?: boolean }): {
    accountSid: string;
    username: string;
    password: string;
    from: string;
    messagingServiceSid: string;
  } {
    const accountSid = requiredTwilioEnv('TWILIO_ACCOUNT_SID');
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    const apiKey =
      process.env.TWILIO_API_KEY_SID?.trim() ||
      process.env.TWILIO_API_KEY?.trim();
    const apiSecret = process.env.TWILIO_API_SECRET?.trim();
    const messagingServiceSid =
      process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || '';
    const from =
      process.env.TWILIO_FROM_PHONE_NUMBER?.trim() ||
      process.env.TWILIO_PHONE_NUMBER?.trim() ||
      '';

    if (!authToken && (!apiKey || !apiSecret)) {
      throw new ServiceUnavailableException(
        'Twilio credentials are not configured. Set TWILIO_AUTH_TOKEN or TWILIO_API_KEY_SID and TWILIO_API_SECRET.',
      );
    }
    if (!options?.allowMissingSender && !messagingServiceSid && !from) {
      throw new ServiceUnavailableException(
        'Twilio sender is not configured. Set TWILIO_FROM_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID.',
      );
    }

    return {
      accountSid,
      username: authToken ? accountSid : apiKey ?? '',
      password: authToken ?? apiSecret ?? '',
      from,
      messagingServiceSid,
    };
  }

  private twilioRequestConfig(config: {
    username: string;
    password: string;
  }) {
    return {
      auth: {
        username: config.username,
        password: config.password,
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 10000,
    };
  }

  private generateOtp(): string {
    return String(randomInt(100000, 1000000));
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private hashesMatch(expected: string, actual: string): boolean {
    const expectedBuffer = Buffer.from(expected, 'hex');
    const actualBuffer = Buffer.from(actual, 'hex');
    return (
      expectedBuffer.length === actualBuffer.length &&
      timingSafeEqual(expectedBuffer, actualBuffer)
    );
  }
}

function normalizePhone(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().replace(/[^\d+]/g, '');
  return normalized || null;
}

function requiredTwilioEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ServiceUnavailableException(`${name} is not configured.`);
  }
  return value;
}

function maskPhone(phone: string): string {
  if (phone.length <= 6) {
    return 'registered mobile';
  }
  return `${phone.slice(0, 3)} *****${phone.slice(-4)}`;
}

function twilioErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const axiosError = error as AxiosError<{
      code?: number;
      message?: string;
      more_info?: string;
      status?: number;
    }>;
    const body = axiosError.response?.data;
    if (body?.message) {
      return body.code
        ? `Twilio error ${body.code}: ${body.message}`
        : body.message;
    }
    if (axiosError.response?.status) {
      return `Twilio returned HTTP ${axiosError.response.status}.`;
    }
  }
  return error instanceof Error ? error.message : 'Twilio request failed.';
}

function twilioErrorCode(error: unknown): number | undefined {
  if (isAxiosError(error)) {
    const axiosError = error as AxiosError<{
      code?: number;
    }>;
    return axiosError.response?.data?.code;
  }
  return undefined;
}
