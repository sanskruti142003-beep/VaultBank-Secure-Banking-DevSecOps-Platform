import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthenticatedRequest, RemoteAuthGuard, RolesGuard } from '@app/common';
import request from 'supertest';
import {
  InternalTransactionsController,
  TransactionsController,
} from '../apps/transaction-service/src/transactions/transactions.controller';
import { TransactionsService } from '../apps/transaction-service/src/transactions/transactions.service';

describe('Transaction HTTP flow', () => {
  let app: INestApplication;
  const transactionId = 'a493ce8a-8d53-439f-8493-665603296cef';
  const fromAccountId = '7d1bb7a0-62e5-4bcd-bf29-69b9cf146fa8';
  const toAccountId = '9b1250eb-bb45-4904-8574-d82340a010d3';
  const transaction = {
    id: transactionId,
    reference: 'TXN20260621ABC123',
    amount: '100.0000',
    currency: 'USD',
    status: 'completed',
  };
  const transactions = {
    transfer: jest.fn().mockResolvedValue(transaction),
    deposit: jest.fn().mockResolvedValue(transaction),
    withdrawal: jest.fn().mockResolvedValue(transaction),
    history: jest.fn().mockResolvedValue({
      data: [transaction],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    }),
    get: jest.fn().mockResolvedValue(transaction),
    reverse: jest
      .fn()
      .mockResolvedValue({ ...transaction, status: 'reversed' }),
  };

  beforeAll(async () => {
    const authGuard = {
      canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
        req.user = {
          userId: '51f33804-890b-4ba2-8d66-4ae1c1167e22',
          email: 'admin@example.com',
          roles: ['admin'],
        };
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [TransactionsController, InternalTransactionsController],
      providers: [{ provide: TransactionsService, useValue: transactions }],
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

  it('covers transfers, cash operations, history, lookup, and reversal', async () => {
    const auth = { Authorization: 'Bearer access-token' };
    await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set(auth)
      .send({
        fromAccountId,
        toAccountId,
        amount: '100.0000',
        currency: 'USD',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/transactions/deposit')
      .set(auth)
      .send({ toAccountId, amount: '100.0000', currency: 'USD' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/transactions/withdrawal')
      .set(auth)
      .send({ fromAccountId, amount: '50.0000', currency: 'USD' })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/transactions?accountId=${fromAccountId}&page=1&limit=20`)
      .set(auth)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/transactions/${transactionId}`)
      .set(auth)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/transactions/${transactionId}/reverse`)
      .set(auth)
      .send({ reason: 'Duplicate transfer' })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/internal/transactions/${transactionId}`)
      .expect(200);
  });
});
