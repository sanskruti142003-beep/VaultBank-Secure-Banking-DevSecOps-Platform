import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthenticatedRequest, RemoteAuthGuard, RolesGuard } from '@app/common';
import request from 'supertest';
import {
  AccountsController,
  InternalAccountsController,
} from '../apps/account-service/src/accounts/accounts.controller';
import { AccountsService } from '../apps/account-service/src/accounts/accounts.service';

describe('Account HTTP flow', () => {
  let app: INestApplication;
  const accountId = '7d1bb7a0-62e5-4bcd-bf29-69b9cf146fa8';
  const beneficiaryId = '9b1250eb-bb45-4904-8574-d82340a010d3';
  const account = {
    id: accountId,
    userId: '51f33804-890b-4ba2-8d66-4ae1c1167e22',
    balance: '1000.0000',
    currency: 'USD',
    status: 'active',
  };
  const accounts = {
    open: jest.fn().mockResolvedValue(account),
    list: jest.fn().mockResolvedValue([account]),
    get: jest.fn().mockResolvedValue(account),
    freeze: jest.fn().mockResolvedValue({ ...account, status: 'frozen' }),
    unfreeze: jest.fn().mockResolvedValue(account),
    close: jest.fn().mockResolvedValue({ ...account, status: 'closed' }),
    updateKyc: jest
      .fn()
      .mockResolvedValue({ ...account, kycStatus: 'approved' }),
    updateLimits: jest.fn().mockResolvedValue({
      dailyTransferLimit: '5000.0000',
      singleTxnLimit: '1000.0000',
    }),
    addBeneficiary: jest.fn().mockResolvedValue({ id: beneficiaryId }),
    beneficiaries: jest.fn().mockResolvedValue([{ id: beneficiaryId }]),
    removeBeneficiary: jest.fn().mockResolvedValue(undefined),
    validate: jest.fn().mockResolvedValue({
      isActive: true,
      balance: account.balance,
      currency: account.currency,
      kycStatus: 'approved',
      dailyLimit: '5000.0000',
      singleTxnLimit: '1000.0000',
      userId: account.userId,
    }),
  };

  beforeAll(async () => {
    const authGuard = {
      canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
        req.user = {
          userId: account.userId,
          email: 'admin@example.com',
          roles: ['admin'],
        };
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [AccountsController, InternalAccountsController],
      providers: [{ provide: AccountsService, useValue: accounts }],
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

  it('covers account lifecycle, limits, beneficiaries, and validation', async () => {
    const auth = { Authorization: 'Bearer access-token' };
    await request(app.getHttpServer())
      .post('/accounts')
      .set(auth)
      .send({ type: 'current', currency: 'USD' })
      .expect(201);
    await request(app.getHttpServer()).get('/accounts').set(auth).expect(200);
    await request(app.getHttpServer())
      .get(`/accounts/${accountId}`)
      .set(auth)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/accounts/${accountId}/freeze`)
      .set(auth)
      .send({ reason: 'Compliance review' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/accounts/${accountId}/unfreeze`)
      .set(auth)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/accounts/${accountId}/kyc`)
      .set(auth)
      .send({ status: 'approved' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/accounts/${accountId}/limits`)
      .set(auth)
      .send({
        dailyTransferLimit: '5000.0000',
        singleTxnLimit: '1000.0000',
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/accounts/${accountId}/beneficiaries`)
      .set(auth)
      .send({
        name: 'Savings',
        bankCode: 'BANK01',
        beneficiaryAccountNumber: '1234567890',
      })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/accounts/${accountId}/beneficiaries`)
      .set(auth)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/accounts/${accountId}/beneficiaries/${beneficiaryId}`)
      .set(auth)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/internal/accounts/${accountId}/validate`)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/accounts/${accountId}`)
      .set(auth)
      .expect(200);
  });
});
