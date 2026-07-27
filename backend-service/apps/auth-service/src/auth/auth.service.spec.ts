import { JwtService } from '@nestjs/jwt';
import { CacheService } from '@app/redis';
import { EventBusService } from '@app/events';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { OtpEmailService } from './otp-email.service';
import { UsersRepository } from '../users/users.repository';
import { UsersService } from '../users/users.service';
import { RefreshToken, RoleName, User } from '../users/entities';

describe('AuthService', () => {
  let service: AuthService;
  let repository: jest.Mocked<UsersRepository>;
  let users: jest.Mocked<UsersService>;
  let jwt: jest.Mocked<JwtService>;
  let cache: jest.Mocked<CacheService>;
  let events: jest.Mocked<EventBusService>;
  let otpEmail: jest.Mocked<OtpEmailService>;
  let user: User;

  beforeEach(() => {
    process.env.JWT_SECRET = 'unit-access-secret';
    process.env.JWT_REFRESH_SECRET = 'unit-refresh-secret';
    user = {
      id: 'd72aa25c-fb9f-4078-9345-e9a9fbd755d5',
      username: 'bank.user',
      email: 'user@example.com',
      passwordHash: '',
      phone: null,
      fullName: 'Bank User',
      isVerified: true,
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      userRoles: [
        {
          role: { name: RoleName.CUSTOMER },
        },
      ],
      refreshTokens: [],
      otpCodes: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as unknown as User;

    repository = {
      findByEmail: jest.fn(),
      findByUsername: jest.fn(),
      findByPhone: jest.fn(),
      findByLoginIdentifier: jest.fn(),
      createUser: jest.fn(),
      createOtp: jest.fn(),
      saveUser: jest.fn(),
      revokeAllRefreshTokens: jest.fn(),
      createRefreshToken: jest.fn(),
      findRefreshToken: jest.fn(),
      revokeRefreshToken: jest.fn(),
      findActiveOtp: jest.fn(),
      markOtpUsed: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    users = {
      roles: jest.fn().mockReturnValue([RoleName.CUSTOMER]),
      profile: jest.fn().mockReturnValue({ id: user.id }),
      getById: jest.fn().mockResolvedValue(user),
    } as unknown as jest.Mocked<UsersService>;
    jwt = {
      signAsync: jest
        .fn()
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token'),
      verifyAsync: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;
    cache = {
      setOtp: jest.fn(),
      getRateLimit: jest.fn().mockResolvedValue(0),
      incrementRateLimit: jest.fn(),
      deleteRateLimit: jest.fn(),
      deleteSession: jest.fn(),
      getSession: jest.fn().mockResolvedValue(null),
      setSession: jest.fn(),
      setCache: jest.fn(),
      getCache: jest.fn(),
      invalidateCache: jest.fn(),
      getOtp: jest.fn(),
      deleteOtp: jest.fn(),
    } as unknown as jest.Mocked<CacheService>;
    events = {
      publish: jest.fn(),
    } as unknown as jest.Mocked<EventBusService>;
    otpEmail = {
      sendOtp: jest.fn(),
    } as unknown as jest.Mocked<OtpEmailService>;

    service = new AuthService(repository, users, jwt, cache, events, otpEmail);
  });

  it('registers a user, issues an OTP, and publishes user.registered', async () => {
    repository.findByEmail.mockResolvedValue(null);
    repository.findByUsername.mockResolvedValue(null);
    repository.createUser.mockResolvedValue(user);

    const result = await service.register({
      username: user.username,
      email: user.email,
      password: 'StrongPassword1',
      full_name: user.fullName,
    });

    expect(repository.createUser).toHaveBeenCalled();
    expect(repository.createOtp).toHaveBeenCalled();
    expect(cache.setOtp).toHaveBeenCalledWith(
      user.id,
      'verify_email',
      expect.any(String),
      120,
    );
    expect(otpEmail.sendOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user.email,
        purpose: 'verify_email',
        code: expect.stringMatching(/^\d{6}$/),
      }),
    );
    expect(events.publish).toHaveBeenCalledWith('user.registered', {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
    });
    expect(result.user).toEqual({ id: user.id });
  });

  it('rejects registration when the phone number is already registered', async () => {
    repository.findByEmail.mockResolvedValue(null);
    repository.findByUsername.mockResolvedValue(null);
    repository.findByPhone.mockResolvedValue(user);

    await expect(
      service.register({
        username: 'new.user',
        email: 'new@example.com',
        password: 'StrongPassword1',
        phone: '+919876543210',
        full_name: 'New User',
      }),
    ).rejects.toThrow('Phone number is already registered');

    expect(repository.createUser).not.toHaveBeenCalled();
  });

  it('normalizes a formatted phone number before checking and saving', async () => {
    repository.findByEmail.mockResolvedValue(null);
    repository.findByUsername.mockResolvedValue(null);
    repository.findByPhone.mockResolvedValue(null);
    repository.createUser.mockResolvedValue({
      ...user,
      phone: '+918180936651',
    });

    await service.register({
      username: 'new.user',
      email: 'new@example.com',
      password: 'StrongPassword1',
      phone: '+91 81809 36651',
      full_name: 'New User',
    });

    expect(repository.findByPhone).toHaveBeenCalledWith('+918180936651');
    expect(repository.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '+918180936651',
      }),
    );
  });

  it('maps database phone uniqueness errors to a conflict response', async () => {
    repository.findByEmail.mockResolvedValue(null);
    repository.findByUsername.mockResolvedValue(null);
    repository.findByPhone.mockResolvedValue(null);
    repository.createUser.mockRejectedValue({
      code: '23505',
      constraint: 'uq_users_phone_active',
      detail: 'Key (phone)=(+919876543210) already exists.',
      message:
        'duplicate key value violates unique constraint "uq_users_phone_active"',
    });

    await expect(
      service.register({
        username: 'new.user',
        email: 'new@example.com',
        password: 'StrongPassword1',
        phone: '+91 98765 43210',
        full_name: 'New User',
      }),
    ).rejects.toThrow('Phone number is already registered');

    expect(repository.createOtp).not.toHaveBeenCalled();
  });

  it('checks whether a phone number is available', async () => {
    repository.findByPhone.mockResolvedValueOnce(null).mockResolvedValueOnce(user);

    await expect(service.checkPhone('+91 98765 43210')).resolves.toEqual({
      available: true,
    });
    await expect(service.checkPhone('+919876543210')).resolves.toEqual({
      available: false,
    });
    expect(repository.findByPhone).toHaveBeenNthCalledWith(1, '+919876543210');
    expect(repository.findByPhone).toHaveBeenNthCalledWith(2, '+919876543210');
  });

  it('checks whether a username is available', async () => {
    repository.findByUsername
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(user);

    await expect(service.checkUsername('new.user')).resolves.toEqual({
      available: true,
    });
    await expect(service.checkUsername('bank.user')).resolves.toEqual({
      available: false,
    });
  });

  it('sends a verification OTP to an unverified email', async () => {
    user.isVerified = false;
    repository.findByEmail.mockResolvedValue(user);

    await expect(service.sendEmailOtp(user.email)).resolves.toEqual({
      message:
        'If the email exists and needs verification, an OTP has been sent.',
    });

    expect(repository.createOtp).toHaveBeenCalled();
    expect(cache.setOtp).toHaveBeenCalledWith(
      user.id,
      'verify_email',
      expect.any(String),
      120,
    );
    expect(otpEmail.sendOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user.email,
        purpose: 'verify_email',
        code: expect.stringMatching(/^\d{6}$/),
      }),
    );
    expect(events.publish).toHaveBeenCalledWith(
      'user.otp_issued',
      expect.objectContaining({
        userId: user.id,
        email: user.email,
        purpose: 'verify_email',
      }),
    );
  });

  it('sends an account deletion OTP to the signed-in user', async () => {
    users.getById.mockResolvedValue(user);

    await expect(service.sendAccountDeletionOtp(user.id)).resolves.toEqual({
      email: user.email,
      message: 'Account deletion OTP has been sent to your email.',
    });

    expect(repository.createOtp).toHaveBeenCalled();
    expect(cache.setOtp).toHaveBeenCalledWith(
      user.id,
      'account_delete',
      expect.any(String),
      120,
    );
    expect(otpEmail.sendOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user.email,
        purpose: 'account_delete',
        code: expect.stringMatching(/^\d{6}$/),
      }),
    );
  });

  it('logs in with valid credentials and persists the refresh session', async () => {
    user.passwordHash = await bcrypt.hash('StrongPassword1', 4);
    repository.findByLoginIdentifier.mockResolvedValue(user);

    const result = await service.login(
      { username: user.username, password: 'StrongPassword1' },
      '127.0.0.1',
      'jest',
    );

    expect('access_token' in result).toBe(true);
    if (!('access_token' in result)) {
      throw new Error('Expected login tokens');
    }
    expect(result.access_token).toBe('access-token');
    expect(result.refresh_token).toBe('refresh-token');
    expect(repository.createRefreshToken).toHaveBeenCalled();
    expect(cache.setSession).toHaveBeenCalled();
    expect(cache.deleteRateLimit).toHaveBeenCalledWith('127.0.0.1', 'auth:login');
    expect(events.publish).toHaveBeenCalledWith(
      'user.login',
      expect.objectContaining({ userId: user.id }),
    );
  });

  it('does not allow an admin account to use customer login', async () => {
    user.passwordHash = await bcrypt.hash('StrongPassword1', 4);
    repository.findByLoginIdentifier.mockResolvedValue(user);
    users.roles.mockReturnValue([RoleName.ADMIN]);

    await expect(
      service.login(
        {
          username: user.username,
          password: 'StrongPassword1',
          role: RoleName.CUSTOMER,
        },
        '127.0.0.1',
        'jest',
      ),
    ).rejects.toThrow('Admin accounts must use the admin portal');

    expect(repository.createRefreshToken).not.toHaveBeenCalled();
  });

  it('does not allow an admin account to use legacy login without a role', async () => {
    user.passwordHash = await bcrypt.hash('StrongPassword1', 4);
    repository.findByLoginIdentifier.mockResolvedValue(user);
    users.roles.mockReturnValue([RoleName.ADMIN]);

    await expect(
      service.login(
        {
          username: user.username,
          password: 'StrongPassword1',
        },
        '127.0.0.1',
        'jest',
      ),
    ).rejects.toThrow('Admin accounts must use the admin portal');

    expect(repository.createRefreshToken).not.toHaveBeenCalled();
  });

  it('allows a valid login to clear an existing IP rate limit', async () => {
    cache.getRateLimit.mockResolvedValue(5);
    user.passwordHash = await bcrypt.hash('StrongPassword1', 4);
    repository.findByLoginIdentifier.mockResolvedValue(user);

    const result = await service.login(
      { username: user.username, password: 'StrongPassword1' },
      '127.0.0.1',
      'jest',
    );

    expect('access_token' in result).toBe(true);
    expect(cache.deleteRateLimit).toHaveBeenCalledWith('127.0.0.1', 'auth:login');
  });

  it('keeps blocking incorrect passwords after the IP rate limit is reached', async () => {
    cache.getRateLimit.mockResolvedValue(5);
    user.passwordHash = await bcrypt.hash('StrongPassword1', 4);
    repository.findByLoginIdentifier.mockResolvedValue(user);

    await expect(
      service.login(
        { username: user.username, password: 'WrongPassword1' },
        '127.0.0.1',
        'jest',
      ),
    ).rejects.toThrow('Too many failed login attempts');

    expect(repository.createRefreshToken).not.toHaveBeenCalled();
  });

  it('requires email OTP before issuing tokens for admin login', async () => {
    user.passwordHash = await bcrypt.hash('StrongPassword1', 4);
    repository.findByLoginIdentifier.mockResolvedValue(user);
    users.roles.mockReturnValue([RoleName.ADMIN]);

    const result = await service.login(
      {
        username: user.username,
        password: 'StrongPassword1',
        role: RoleName.ADMIN,
      },
      '127.0.0.1',
      'jest',
    );

    expect(result).toEqual(
      expect.objectContaining({
        requires_2fa: true,
        email: user.email,
        expires_in_seconds: 120,
      }),
    );
    expect(cache.setCache).toHaveBeenCalledWith(
      expect.stringMatching(/^admin-login:/),
      expect.objectContaining({ userId: user.id }),
      120,
    );
    expect(cache.setOtp).toHaveBeenCalledWith(
      user.id,
      'admin_login',
      expect.any(String),
      120,
    );
    expect(repository.createRefreshToken).not.toHaveBeenCalled();
  });

  it('locks the account for 24 hours on the third bad password', async () => {
    user.failedLoginAttempts = 2;
    user.passwordHash = await bcrypt.hash('StrongPassword1', 4);
    repository.findByLoginIdentifier.mockResolvedValue(user);

    await expect(
      service.login(
        { username: user.username, password: 'WrongPassword1' },
        '127.0.0.1',
        'jest',
      ),
    ).rejects.toThrow('Account is locked for 24 hours');

    expect(user.failedLoginAttempts).toBe(3);
    expect(user.lockedUntil).toBeInstanceOf(Date);
    expect(user.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(repository.saveUser).toHaveBeenCalledWith(user);
    expect(repository.createRefreshToken).not.toHaveBeenCalled();
  });

  it('blocks login while the 24-hour lock is active', async () => {
    user.lockedUntil = new Date(Date.now() + 60_000);
    user.passwordHash = await bcrypt.hash('StrongPassword1', 4);
    repository.findByLoginIdentifier.mockResolvedValue(user);

    await expect(
      service.login(
        { username: user.username, password: 'StrongPassword1' },
        '127.0.0.1',
        'jest',
      ),
    ).rejects.toThrow('Account is locked for 24 hours');

    expect(repository.createRefreshToken).not.toHaveBeenCalled();
  });

  it('allows login after an expired account lock and clears failed attempts', async () => {
    user.failedLoginAttempts = 3;
    user.lockedUntil = new Date(Date.now() - 60_000);
    user.passwordHash = await bcrypt.hash('StrongPassword1', 4);
    repository.findByLoginIdentifier.mockResolvedValue(user);

    const result = await service.login(
      { username: user.username, password: 'StrongPassword1' },
      '127.0.0.1',
      'jest',
    );

    expect('access_token' in result).toBe(true);
    if (!('access_token' in result)) {
      throw new Error('Expected login tokens');
    }
    expect(result.access_token).toBe('access-token');
    expect(user.failedLoginAttempts).toBe(0);
    expect(user.lockedUntil).toBeNull();
    expect(repository.saveUser).toHaveBeenCalledWith(user);
  });

  it('sends a verification OTP when a valid login is unverified', async () => {
    user.isVerified = false;
    user.passwordHash = await bcrypt.hash('StrongPassword1', 4);
    repository.findByLoginIdentifier.mockResolvedValue(user);

    await expect(
      service.login(
        { username: user.username, password: 'StrongPassword1' },
        '127.0.0.1',
        'jest',
      ),
    ).rejects.toThrow('Email verification is required');

    expect(repository.createOtp).toHaveBeenCalled();
    expect(cache.setOtp).toHaveBeenCalledWith(
      user.id,
      'verify_email',
      expect.any(String),
      120,
    );
    expect(otpEmail.sendOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user.email,
        purpose: 'verify_email',
        code: expect.stringMatching(/^\d{6}$/),
      }),
    );
  });

  it('rotates a valid refresh token and revokes the old record', async () => {
    const hash = await bcrypt.hash('old-refresh-token', 4);
    jwt.verifyAsync.mockResolvedValue({
      sub: user.id,
      email: user.email,
      roles: [RoleName.CUSTOMER],
      type: 'refresh',
      jti: 'bb75cc32-3335-46f4-ad19-1a2ae3c57dc9',
    });
    repository.findRefreshToken.mockResolvedValue({
      id: 'bb75cc32-3335-46f4-ad19-1a2ae3c57dc9',
      userId: user.id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 60_000),
      revoked: false,
    } as RefreshToken);

    const result = await service.refresh('old-refresh-token');

    expect(repository.revokeRefreshToken).toHaveBeenCalledWith(
      'bb75cc32-3335-46f4-ad19-1a2ae3c57dc9',
    );
    expect(result.refresh_token).toBe('refresh-token');
  });

  it('logs out by revoking tokens and deleting the Redis session', async () => {
    await expect(service.logout(user.id)).resolves.toEqual({ loggedOut: true });
    expect(repository.revokeAllRefreshTokens).toHaveBeenCalledWith(user.id);
    expect(cache.deleteSession).toHaveBeenCalledWith(user.id);
    expect(events.publish).toHaveBeenCalledWith(
      'user.logout',
      expect.objectContaining({ userId: user.id }),
    );
  });
});
