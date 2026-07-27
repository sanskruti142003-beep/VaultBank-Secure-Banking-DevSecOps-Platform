import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthenticatedRequest, RemoteAuthGuard, RolesGuard } from '@app/common';
import request from 'supertest';
import { PaymentsController } from '../apps/payment-service/src/payments/payments.controller';
import { PaymentsService } from '../apps/payment-service/src/payments/payments.service';
import { RefundService } from '../apps/payment-service/src/payments/refund.service';

describe('Payment HTTP flow', () => {
  let app: INestApplication;
  const paymentId = '4ea9f797-0c60-4768-98ee-c2b2692835b0';
  const refundId = '41e54112-a62e-4054-91e9-318682173cac';
  const order = {
    id: paymentId,
    userId: '51f33804-890b-4ba2-8d66-4ae1c1167e22',
    amount: '100.0000',
    currency: 'USD',
    status: 'processing',
  };
  const refund = {
    id: refundId,
    paymentOrderId: paymentId,
    amount: order.amount,
    reason: 'Duplicate payment',
    status: 'pending',
  };
  const payments = {
    initiate: jest.fn().mockResolvedValue(order),
    list: jest.fn().mockResolvedValue({
      data: [order],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    }),
    get: jest.fn().mockResolvedValue(order),
  };
  const refunds = {
    request: jest.fn().mockResolvedValue(refund),
    status: jest.fn().mockResolvedValue(refund),
    approve: jest.fn().mockResolvedValue({ ...refund, status: 'completed' }),
  };

  beforeAll(async () => {
    const authGuard = {
      canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
        req.user = {
          userId: order.userId,
          email: 'admin@example.com',
          roles: ['admin'],
        };
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: PaymentsService, useValue: payments },
        { provide: RefundService, useValue: refunds },
      ],
    })
      .overrideGuard(RemoteAuthGuard)
      .useValue(authGuard)
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => app.close());

  it('covers payment initiation, polling, and the refund lifecycle', async () => {
    const auth = { Authorization: 'Bearer access-token' };
    await request(app.getHttpServer())
      .post('/payments')
      .set(auth)
      .send({
        fromAccountId: '7d1bb7a0-62e5-4bcd-bf29-69b9cf146fa8',
        toAccountId: '9b1250eb-bb45-4904-8574-d82340a010d3',
        amount: '100.0000',
        currency: 'USD',
        gateway: 'stripe',
      })
      .expect(201);
    await request(app.getHttpServer())
      .get('/payments?page=1&limit=20')
      .set(auth)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/payments/${paymentId}`)
      .set(auth)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/payments/${paymentId}/refund`)
      .set(auth)
      .send({ reason: refund.reason })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/payments/${paymentId}/refund`)
      .set(auth)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/payments/${paymentId}/refund/${refundId}/approve`)
      .set(auth)
      .expect(200);
  });
});
