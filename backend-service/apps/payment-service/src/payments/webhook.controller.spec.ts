import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  RawBodyRequest,
} from '@nestjs/common';
import { Request } from 'express';
import Stripe from 'stripe';
import { PaymentStatus } from './enums/payment-status.enum';
import { PaymentsService } from './payments.service';
import { WebhookController } from './webhook.controller';

describe('WebhookController Stripe webhook', () => {
  let controller: WebhookController;

  const applyGatewayStatus = jest.fn<
    Promise<void>,
    [string, PaymentStatus]
  >();

  const constructEvent = jest.fn<
    Stripe.Event,
    [Buffer, string, string]
  >();

  const originalStripeSecretKey =
    process.env.STRIPE_SECRET_KEY;

  const originalStripeWebhookSecret =
    process.env.STRIPE_WEBHOOK_SECRET;

  const createRequest = (): RawBodyRequest<Request> =>
    ({
      rawBody: Buffer.from('{}'),
    }) as unknown as RawBodyRequest<Request>;

  const createStripeEvent = (
    type: Stripe.Event['type'],
    id: string,
  ): Stripe.Event =>
    ({
      id: 'evt_unit_test',
      object: 'event',
      api_version: null,
      created: 0,
      data: {
        object: {
          id,
        },
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type,
    }) as unknown as Stripe.Event;

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY =
      'unit-test-stripe-key';

    process.env.STRIPE_WEBHOOK_SECRET =
      'unit-test-webhook-secret';

    applyGatewayStatus.mockReset();
    constructEvent.mockReset();

    const payments = {
      applyGatewayStatus,
    } as unknown as PaymentsService;

    const http = {
      axiosRef: {
        post: jest.fn(),
      },
    } as unknown as HttpService;

    controller = new WebhookController(
      payments,
      http,
    );

    Object.defineProperty(controller, 'stripe', {
      configurable: true,
      value: {
        webhooks: {
          constructEvent,
        },
      },
    });
  });

  afterAll(() => {
    if (originalStripeSecretKey === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY =
        originalStripeSecretKey;
    }

    if (originalStripeWebhookSecret === undefined) {
      delete process.env.STRIPE_WEBHOOK_SECRET;
    } else {
      process.env.STRIPE_WEBHOOK_SECRET =
        originalStripeWebhookSecret;
    }
  });

  it.each([
    [
      'payment_intent.succeeded',
      'pi_success',
      PaymentStatus.SUCCESS,
    ],
    [
      'payment_intent.payment_failed',
      'pi_failed',
      PaymentStatus.FAILED,
    ],
    [
      'charge.refunded',
      'ch_refunded',
      PaymentStatus.REFUNDED,
    ],
  ] as const)(
    'applies the correct status for %s',
    async (type, gatewayReference, expectedStatus) => {
      constructEvent.mockReturnValue(
        createStripeEvent(
          type,
          gatewayReference,
        ),
      );

      await expect(
        controller.stripeWebhook(
          createRequest(),
          'unit-test-signature',
        ),
      ).resolves.toEqual({
        received: true,
      });

      expect(constructEvent).toHaveBeenCalledWith(
        expect.any(Buffer),
        'unit-test-signature',
        'unit-test-webhook-secret',
      );

      expect(
        applyGatewayStatus,
      ).toHaveBeenCalledTimes(1);

      expect(
        applyGatewayStatus,
      ).toHaveBeenCalledWith(
        gatewayReference,
        expectedStatus,
      );
    },
  );

  it('acknowledges an unsupported Stripe event without changing payment status', async () => {
    constructEvent.mockReturnValue(
      createStripeEvent(
        'customer.created',
        'cus_test',
      ),
    );

    await expect(
      controller.stripeWebhook(
        createRequest(),
        'unit-test-signature',
      ),
    ).resolves.toEqual({
      received: true,
    });

    expect(
      applyGatewayStatus,
    ).not.toHaveBeenCalled();
  });

  it('rejects a request without a Stripe signature', async () => {
    await expect(
      controller.stripeWebhook(
        createRequest(),
        undefined,
      ),
    ).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(
      constructEvent,
    ).not.toHaveBeenCalled();

    expect(
      applyGatewayStatus,
    ).not.toHaveBeenCalled();
  });

  it('rejects a request without a raw request body', async () => {
    const requestWithoutRawBody =
      {} as RawBodyRequest<Request>;

    await expect(
      controller.stripeWebhook(
        requestWithoutRawBody,
        'unit-test-signature',
      ),
    ).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(
      constructEvent,
    ).not.toHaveBeenCalled();
  });
});
