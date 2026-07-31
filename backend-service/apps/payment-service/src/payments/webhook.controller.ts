import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpException,
  InternalServerErrorException,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Request } from 'express';
import Stripe from 'stripe';
import { PaypalWebhookDto } from './dto/paypal-webhook.dto';
import { PaymentStatus } from './enums/payment-status.enum';
import { PaymentsService } from './payments.service';

interface PaypalTokenResponse {
  access_token: string;
}

interface PaypalVerificationResponse {
  verification_status: 'SUCCESS' | 'FAILURE';
}

@Controller('payments/webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly payments: PaymentsService,
    private readonly http: HttpService,
  ) {
    this.stripe = new Stripe(this.required('STRIPE_SECRET_KEY'));
  }

  @Post('stripe')
  async stripeWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    try {
      if (!request.rawBody || !signature) {
        throw new BadRequestException(
          'Stripe signature and raw body are required',
        );
      }
      const event = this.stripe.webhooks.constructEvent(
        request.rawBody,
        signature,
        this.required('STRIPE_WEBHOOK_SECRET'),
      );
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.payments.applyGatewayStatus(
            event.data.object.id,
            PaymentStatus.SUCCESS,
          );
          break;

        case 'payment_intent.payment_failed':
          await this.payments.applyGatewayStatus(
            event.data.object.id,
            PaymentStatus.FAILED,
          );
          break;

        case 'charge.refunded':
          await this.payments.applyGatewayStatus(
            event.data.object.id,
            PaymentStatus.REFUNDED,
          );
          break;
      }
      return { received: true };
    } catch (error: unknown) {
      this.rethrow(error, 'Stripe webhook verification failed');
    }
  }

  @Post('paypal')
  async paypalWebhook(
    @Body() event: PaypalWebhookDto,
    @Headers() headers: Record<string, string | undefined>,
  ): Promise<{ received: true }> {
    try {
      await this.verifyPaypal(event, headers);
      const statuses: Record<string, PaymentStatus> = {
        'PAYMENT.CAPTURE.COMPLETED': PaymentStatus.SUCCESS,
        'PAYMENT.CAPTURE.DENIED': PaymentStatus.FAILED,
        'PAYMENT.CAPTURE.REFUNDED': PaymentStatus.REFUNDED,
      };
      const status = statuses[event.event_type];
      const resourceId = event.resource.id;
      const reference = typeof resourceId === 'string' ? resourceId : '';
      if (status && reference) {
        await this.payments.applyGatewayStatus(reference, status);
      }
      return { received: true };
    } catch (error: unknown) {
      this.rethrow(error, 'PayPal webhook verification failed');
    }
  }

  private async verifyPaypal(
    event: PaypalWebhookDto,
    headers: Record<string, string | undefined>,
  ): Promise<void> {
    const requiredHeaders = {
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
    };
    if (Object.values(requiredHeaders).some((value) => !value)) {
      throw new BadRequestException(
        'Required PayPal verification headers are missing',
      );
    }
    const baseUrl =
      process.env.PAYPAL_API_URL ?? 'https://api-m.sandbox.paypal.com';
    const token = await this.http.axiosRef.post<PaypalTokenResponse>(
      `${baseUrl}/v1/oauth2/token`,
      'grant_type=client_credentials',
      {
        auth: {
          username: this.required('PAYPAL_CLIENT_ID'),
          password: this.required('PAYPAL_CLIENT_SECRET'),
        },
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      },
    );
    const verification =
      await this.http.axiosRef.post<PaypalVerificationResponse>(
        `${baseUrl}/v1/notifications/verify-webhook-signature`,
        {
          ...requiredHeaders,
          webhook_id: this.required('PAYPAL_WEBHOOK_ID'),
          webhook_event: event,
        },
        {
          headers: {
            authorization: `Bearer ${token.data.access_token}`,
            'content-type': 'application/json',
          },
        },
      );
    if (verification.data.verification_status !== 'SUCCESS') {
      throw new BadRequestException('Invalid PayPal webhook signature');
    }
  }

  private required(name: string): string {
    const value = process.env[name];
    if (!value) {
      throw new InternalServerErrorException(`${name} is not configured`);
    }
    return value;
  }

  private rethrow(error: unknown, message: string): never {
    this.logger.error(
      message,
      error instanceof Error ? error.stack : undefined,
    );
    if (error instanceof HttpException) {
      throw error;
    }
    throw new BadRequestException(message);
  }
}
