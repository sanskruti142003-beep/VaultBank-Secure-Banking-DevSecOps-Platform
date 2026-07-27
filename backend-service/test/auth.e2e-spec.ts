import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthenticatedRequest, RolesGuard } from '@app/common';
import request from 'supertest';
import { AuthController } from '../apps/auth-service/src/auth/auth.controller';
import { AuthService } from '../apps/auth-service/src/auth/auth.service';
import { JwtAuthGuard } from '../apps/auth-service/src/auth/auth.guard';
import { UsersService } from '../apps/auth-service/src/users/users.service';

describe('Auth HTTP flow', () => {
  let app: INestApplication;
  const auth = {
    register: jest.fn().mockResolvedValue({ message: 'registered' }),
    verifyEmail: jest.fn().mockResolvedValue({ verified: true }),
    login: jest.fn().mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      user: { id: 'user-id' },
    }),
    refresh: jest.fn().mockResolvedValue({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
    }),
    forgotPassword: jest.fn(),
    sendEmailOtp: jest.fn().mockResolvedValue({ message: 'otp sent' }),
    resetPassword: jest.fn(),
  };
  const users = {
    listProfiles: jest.fn().mockResolvedValue([]),
    deleteAllUsers: jest.fn().mockResolvedValue(4),
  };

  beforeAll(async () => {
    const authGuard = {
      canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
        req.user = {
          userId: 'admin-id',
          email: 'admin@example.com',
          roles: ['admin'],
        };
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: UsersService, useValue: users },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(authGuard)
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterAll(async () => app.close());

  it('runs registration, verification, login, and refresh through HTTP', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username: 'bank.user',
        email: 'user@example.com',
        password: 'StrongPassword1',
        full_name: 'Bank User',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ email: 'user@example.com', otp: '123456' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'StrongPassword1' })
      .expect(201)
      .expect(({ body }: { body: { access_token: string } }) => {
        expect(body.access_token).toBe('access');
      });
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: 'a.b.c' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/send-otp')
      .send({ email: 'user@example.com' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/resend-otp')
      .send({ email: 'user@example.com' })
      .expect(201);
  });

  it('deletes all users from the admin endpoint', async () => {
    await request(app.getHttpServer())
      .delete('/auth/admin/users')
      .set({ Authorization: 'Bearer access-token' })
      .expect(200)
      .expect(({ body }: { body: { deleted: boolean; count: number } }) => {
        expect(body).toEqual({ deleted: true, count: 4 });
      });

    expect(users.deleteAllUsers).toHaveBeenCalled();
  });
});
