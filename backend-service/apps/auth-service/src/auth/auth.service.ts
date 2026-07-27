import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CacheService } from '@app/redis';
import { EventBusService } from '@app/events';
import * as bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'node:crypto';
import { UsersRepository } from '../users/users.repository';
import { OtpPurpose, RefreshToken, RoleName, User } from '../users/entities';
import { RegisterDto } from '../users/dto/register.dto';
import { LoginDto } from '../users/dto/login.dto';
import { UsersService } from '../users/users.service';
import { JwtPayload, SessionState } from './auth.types';
import { OtpEmailService } from './otp-email.service';
import { normalizePhone } from '../users/phone.util';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export interface LoginResult extends AuthTokens {
  user: Record<string, unknown>;
}

export interface AdminLoginChallengeResult {
  requires_2fa: true;
  challenge_id: string;
  email: string;
  message: string;
  expires_in_seconds: number;
}

interface AdminLoginChallengeState {
  userId: string;
  ip: string;
  userAgent: string;
}

interface DatabaseErrorShape {
  code?: unknown;
  message?: unknown;
  detail?: unknown;
  constraint?: unknown;
  driverError?: {
    code?: unknown;
    message?: unknown;
    detail?: unknown;
    constraint?: unknown;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly saltRounds = 12;
  private readonly otpTtlSeconds = 120;
  private readonly maxFailedLoginAttempts = 3;
  private readonly accountLockMs = 24 * 60 * 60 * 1000;

  constructor(
    private readonly repository: UsersRepository,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly cache: CacheService,
    private readonly events: EventBusService,
    private readonly otpEmail: OtpEmailService,
  ) {}

  async register(dto: RegisterDto): Promise<Record<string, unknown>> {
    try {
      const phone = normalizePhone(dto.phone);
      if (await this.repository.findByEmail(dto.email)) {
        throw new ConflictException('Email is already registered');
      }
      if (await this.repository.findByUsername(dto.username)) {
        throw new ConflictException('Username is already taken');
      }
      if (phone && (await this.repository.findByPhone(phone))) {
        throw new ConflictException('Phone number is already registered');
      }
      const user = await this.repository.createUser({
        username: dto.username,
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, this.saltRounds),
        phone,
        fullName: dto.full_name,
      });
      await this.issueOtp(user, OtpPurpose.VERIFY_EMAIL);
      this.events.publish('user.registered', {
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
      });
      return {
        message: 'Registration successful. Verify your email with the OTP.',
        user: this.users.profile(user),
      };
    } catch (error: unknown) {
      this.rethrow(error, 'Registration failed');
    }
  }

  async verifyEmail(email: string, otp: string): Promise<{ verified: true }> {
    try {
      const user = await this.userByEmail(email);
      await this.verifyOtp(user, OtpPurpose.VERIFY_EMAIL, otp);
      user.isVerified = true;
      await this.repository.saveUser(user);
      return { verified: true };
    } catch (error: unknown) {
      this.rethrow(error, 'Email verification failed');
    }
  }

  async login(
    dto: LoginDto,
    ip: string,
    userAgent: string,
  ): Promise<LoginResult | AdminLoginChallengeResult> {
    try {
      const attempts = await this.cache.getRateLimit(ip, 'auth:login');
      const rateLimited = attempts >= 5;
      const identifier = dto.username ?? dto.email;
      if (!identifier) {
        throw new BadRequestException('Username is required');
      }
      const user = await this.repository.findByLoginIdentifier(identifier);
      if (user) {
        await this.clearExpiredLoginLock(user);
        this.assertLoginNotLocked(user);
      }
      const valid =
        user && (await bcrypt.compare(dto.password, user.passwordHash));
      if (!user || !valid) {
        if (rateLimited) {
          throw new HttpException(
            'Too many failed login attempts. Try again later.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        await this.cache.incrementRateLimit(ip, 'auth:login', 900);
        if (user) {
          await this.recordFailedLogin(user);
        }
        throw new UnauthorizedException('Invalid username or password');
      }
      if (!user.isActive) {
        throw new ForbiddenException('User account is inactive');
      }
      await this.clearFailedLoginState(user);
      await this.cache.deleteRateLimit(ip, 'auth:login');
      const roles = this.users.roles(user);
      if (roles.includes(RoleName.ADMIN) && dto.role !== RoleName.ADMIN) {
        throw new ForbiddenException('Admin accounts must use the admin portal.');
      }
      if (dto.role) {
        this.assertRequestedRole(user, dto.role);
      }
      if (!user.isVerified) {
        await this.issueOtp(user, OtpPurpose.VERIFY_EMAIL);
        throw new ForbiddenException({
          message:
            'Email verification is required. A verification OTP has been sent.',
          email: user.email,
        });
      }
      if (dto.role === RoleName.ADMIN) {
        return await this.createAdminLoginChallenge(user, ip, userAgent);
      }
      const tokens = await this.createTokenPair(user);
      this.events.publish('user.login', {
        userId: user.id,
        email: user.email,
        ip,
        userAgent,
        timestamp: new Date().toISOString(),
      });
      return { ...tokens, user: this.users.profile(user) };
    } catch (error: unknown) {
      this.rethrow(error, 'Login failed');
    }
  }

  async verifyAdminLoginOtp(
    challengeId: string,
    email: string,
    otp: string,
    fallbackIp: string,
    fallbackUserAgent: string,
  ): Promise<LoginResult> {
    try {
      const state = await this.cache.getCache<AdminLoginChallengeState>(
        this.adminLoginChallengeKey(challengeId),
      );
      if (!state) {
        throw new BadRequestException('Admin verification code is invalid or expired');
      }
      const user = await this.userByEmail(email);
      if (user.id !== state.userId) {
        throw new BadRequestException('Admin verification code is invalid or expired');
      }
      await this.clearExpiredLoginLock(user);
      this.assertLoginNotLocked(user);
      this.assertRequestedRole(user, RoleName.ADMIN);
      if (!user.isActive) {
        throw new ForbiddenException('User account is inactive');
      }
      await this.verifyOtp(user, OtpPurpose.ADMIN_LOGIN, otp);
      await this.cache.invalidateCache(this.adminLoginChallengeKey(challengeId));
      const tokens = await this.createTokenPair(user);
      this.events.publish('user.login', {
        userId: user.id,
        email: user.email,
        ip: state.ip || fallbackIp,
        userAgent: state.userAgent || fallbackUserAgent,
        timestamp: new Date().toISOString(),
      });
      return { ...tokens, user: this.users.profile(user) };
    } catch (error: unknown) {
      this.rethrow(error, 'Admin 2FA verification failed');
    }
  }

  async refresh(rawToken: string): Promise<AuthTokens> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(rawToken, {
        secret: this.required('JWT_REFRESH_SECRET'),
      });
      if (payload.type !== 'refresh' || !payload.jti) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      const stored = await this.repository.findRefreshToken(payload.jti);
      await this.assertRefreshToken(stored, rawToken, payload.sub);
      await this.repository.revokeRefreshToken(payload.jti);
      await this.removeSessionToken(payload.sub, payload.jti);
      return await this.createTokenPair(await this.users.getById(payload.sub));
    } catch (error: unknown) {
      this.rethrow(error, 'Refresh token rotation failed');
    }
  }

  async logout(userId: string): Promise<{ loggedOut: true }> {
    try {
      await this.repository.revokeAllRefreshTokens(userId);
      await this.cache.deleteSession(userId);
      this.events.publish('user.logout', {
        userId,
        timestamp: new Date().toISOString(),
      });
      return { loggedOut: true };
    } catch (error: unknown) {
      this.rethrow(error, 'Logout failed');
    }
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    try {
      const user = await this.repository.findByEmail(email);
      if (user) {
        await this.issueOtp(user, OtpPurpose.RESET_PASSWORD);
      }
      return {
        message: 'If the email exists, a password reset OTP has been sent.',
      };
    } catch (error: unknown) {
      this.rethrow(error, 'Forgot password request failed');
    }
  }

  async sendEmailOtp(email: string): Promise<{ message: string }> {
    try {
      const user = await this.repository.findByEmail(email);
      if (user && user.isActive && !user.isVerified) {
        await this.issueOtp(user, OtpPurpose.VERIFY_EMAIL);
      }
      return {
        message:
          'If the email exists and needs verification, an OTP has been sent.',
      };
    } catch (error: unknown) {
      this.rethrow(error, 'OTP request failed');
    }
  }

  async sendAccountDeletionOtp(
    userId: string,
  ): Promise<{ email: string; message: string }> {
    try {
      const user = await this.users.getById(userId);
      if (!user.isActive) {
        throw new ForbiddenException('User account is inactive');
      }
      await this.issueOtp(user, OtpPurpose.ACCOUNT_DELETE);
      return {
        email: user.email,
        message: 'Account deletion OTP has been sent to your email.',
      };
    } catch (error: unknown) {
      this.rethrow(error, 'Account deletion OTP request failed');
    }
  }

  async verifyAccountDeletionOtp(
    userId: string,
    otp: string,
  ): Promise<{ verified: true }> {
    try {
      const user = await this.users.getById(userId);
      await this.verifyOtp(user, OtpPurpose.ACCOUNT_DELETE, otp);
      return { verified: true };
    } catch (error: unknown) {
      this.rethrow(error, 'Account deletion OTP verification failed');
    }
  }

  async checkEmail(email: string): Promise<{ available: boolean }> {
    try {
      const user = await this.repository.findByEmail(email);
      return { available: !user };
    } catch (error: unknown) {
      this.rethrow(error, 'Email availability check failed');
    }
  }

  async checkUsername(username: string): Promise<{ available: boolean }> {
    try {
      const user = await this.repository.findByUsername(username);
      return { available: !user };
    } catch (error: unknown) {
      this.rethrow(error, 'Username availability check failed');
    }
  }

  async checkPhone(phone: string): Promise<{ available: boolean }> {
    try {
      const normalizedPhone = normalizePhone(phone);
      const user = normalizedPhone
        ? await this.repository.findByPhone(normalizedPhone)
        : null;
      return { available: !user };
    } catch (error: unknown) {
      this.rethrow(error, 'Phone availability check failed');
    }
  }

  async resetPassword(
    email: string,
    otp: string,
    password: string,
  ): Promise<{ reset: true }> {
    try {
      const user = await this.userByEmail(email);
      await this.verifyOtp(user, OtpPurpose.RESET_PASSWORD, otp);
      user.passwordHash = await bcrypt.hash(password, this.saltRounds);
      await this.repository.saveUser(user);
      await this.repository.revokeAllRefreshTokens(user.id);
      await this.cache.deleteSession(user.id);
      this.events.publish('user.password_reset', {
        userId: user.id,
        timestamp: new Date().toISOString(),
      });
      return { reset: true };
    } catch (error: unknown) {
      this.rethrow(error, 'Password reset failed');
    }
  }

  async validateUser(userId: string): Promise<Record<string, unknown>> {
    try {
      const user = await this.users.getById(userId);
      return {
        userId: user.id,
        email: user.email,
        phone: user.phone,
        roles: this.users.roles(user),
      };
    } catch (error: unknown) {
      this.rethrow(error, 'Token validation failed');
    }
  }

  private async createTokenPair(user: User): Promise<AuthTokens> {
    const roles = this.users.roles(user);
    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles,
      type: 'access',
    };
    const tokenId = randomUUID();
    const refreshPayload: JwtPayload = {
      ...accessPayload,
      type: 'refresh',
      jti: tokenId,
    };
    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.required('JWT_SECRET'),
      expiresIn: '15m',
    });
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.required('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });
    const hash = await bcrypt.hash(refreshToken, this.saltRounds);

    if (process.env.ALLOW_MULTI_SESSION !== 'true') {
      await this.repository.revokeAllRefreshTokens(user.id);
      await this.cache.deleteSession(user.id);
    }
    await this.repository.createRefreshToken(
      tokenId,
      user.id,
      hash,
      new Date(Date.now() + 604_800_000),
    );
    const current = (await this.cache.getSession<SessionState>(user.id)) ?? {
      tokens: [],
    };
    current.tokens.push({ id: tokenId, hash });
    await this.cache.setSession(user.id, current, 604_800);
    return { access_token: accessToken, refresh_token: refreshToken };
  }

  private async createAdminLoginChallenge(
    user: User,
    ip: string,
    userAgent: string,
  ): Promise<AdminLoginChallengeResult> {
    const challengeId = randomUUID();
    await this.cache.setCache<AdminLoginChallengeState>(
      this.adminLoginChallengeKey(challengeId),
      { userId: user.id, ip, userAgent },
      this.otpTtlSeconds,
    );
    await this.issueOtp(user, OtpPurpose.ADMIN_LOGIN);
    return {
      requires_2fa: true,
      challenge_id: challengeId,
      email: user.email,
      message: 'Admin verification OTP has been sent to your email.',
      expires_in_seconds: this.otpTtlSeconds,
    };
  }

  private adminLoginChallengeKey(challengeId: string): string {
    return `admin-login:${challengeId}`;
  }

  private async issueOtp(user: User, purpose: OtpPurpose): Promise<void> {
    const code = randomInt(100_000, 1_000_000).toString();
    const hash = await bcrypt.hash(code, this.saltRounds);
    const expiresAt = new Date(Date.now() + this.otpTtlSeconds * 1000);
    await this.repository.createOtp(user.id, purpose, hash, expiresAt);
    await this.cache.setOtp(user.id, purpose, hash, this.otpTtlSeconds);
    await this.otpEmail.sendOtp({
      to: user.email,
      code,
      purpose,
      expiresAt,
    });
    this.events.publish('user.otp_issued', {
      userId: user.id,
      email: user.email,
      purpose,
      expiresAt: expiresAt.toISOString(),
    });
    this.logger.log(`OTP issued for ${purpose} to user ${user.id}`);
  }

  private async recordFailedLogin(user: User): Promise<void> {
    user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
    if (user.failedLoginAttempts >= this.maxFailedLoginAttempts) {
      user.lockedUntil = new Date(Date.now() + this.accountLockMs);
      await this.repository.saveUser(user);
      throw new ForbiddenException(
        'Account is locked for 24 hours due to multiple failed login attempts.',
      );
    }
    await this.repository.saveUser(user);
  }

  private async clearExpiredLoginLock(user: User): Promise<void> {
    if (!user.lockedUntil || user.lockedUntil > new Date()) {
      return;
    }
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await this.repository.saveUser(user);
  }

  private assertLoginNotLocked(user: User): void {
    if (!user.lockedUntil || user.lockedUntil <= new Date()) {
      return;
    }
    throw new ForbiddenException(
      'Account is locked for 24 hours due to multiple failed login attempts.',
    );
  }

  private assertRequestedRole(user: User, role: RoleName): void {
    const roles = this.users.roles(user);
    if (role === RoleName.CUSTOMER && roles.includes(RoleName.ADMIN)) {
      throw new ForbiddenException('Admin accounts must use the admin portal.');
    }
    if (roles.includes(role)) {
      return;
    }
    if (role === RoleName.ADMIN) {
      throw new ForbiddenException('Admin access is required.');
    }
    throw new ForbiddenException('Selected login role is not assigned.');
  }

  private async clearFailedLoginState(user: User): Promise<void> {
    if (!user.failedLoginAttempts && !user.lockedUntil) {
      return;
    }
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await this.repository.saveUser(user);
  }

  private async verifyOtp(
    user: User,
    purpose: OtpPurpose,
    code: string,
  ): Promise<void> {
    const [databaseOtp, redisHash] = await Promise.all([
      this.repository.findActiveOtp(user.id, purpose),
      this.cache.getOtp(user.id, purpose),
    ]);
    if (
      !databaseOtp ||
      !redisHash ||
      !(await bcrypt.compare(code, databaseOtp.codeHash)) ||
      !(await bcrypt.compare(code, redisHash))
    ) {
      throw new BadRequestException('OTP is invalid or expired');
    }
    await Promise.all([
      this.repository.markOtpUsed(databaseOtp.id),
      this.cache.deleteOtp(user.id, purpose),
    ]);
  }

  private async userByEmail(email: string): Promise<User> {
    const user = await this.repository.findByEmail(email);
    if (!user) {
      throw new BadRequestException('Invalid request');
    }
    return user;
  }

  private async assertRefreshToken(
    token: RefreshToken | null,
    raw: string,
    userId: string,
  ): Promise<void> {
    if (
      !token ||
      token.userId !== userId ||
      token.revoked ||
      token.expiresAt <= new Date() ||
      !(await bcrypt.compare(raw, token.tokenHash))
    ) {
      throw new UnauthorizedException('Refresh token is invalid or revoked');
    }
  }

  private async removeSessionToken(
    userId: string,
    tokenId: string,
  ): Promise<void> {
    const state = await this.cache.getSession<SessionState>(userId);
    if (!state) {
      return;
    }
    state.tokens = state.tokens.filter((token) => token.id !== tokenId);
    if (state.tokens.length === 0) {
      await this.cache.deleteSession(userId);
    } else {
      await this.cache.setSession(userId, state, 604_800);
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
    if (this.isUniqueConstraintError(error)) {
      const details = this.databaseErrorDetails(error);
      if (
        details.includes('phone') ||
        details.includes('uq_users_phone_active') ||
        details.includes('idx_users_phone_active')
      ) {
        throw new ConflictException('Phone number is already registered');
      }
      if (details.includes('username')) {
        throw new ConflictException('Username is already taken');
      }
      if (details.includes('email')) {
        throw new ConflictException('Email is already registered');
      }
      throw new ConflictException('Account details are already registered');
    }
    if (error instanceof HttpException) {
      throw error;
    }
    throw new InternalServerErrorException(message);
  }

  private isUniqueConstraintError(error: unknown): boolean {
    const databaseError = this.asDatabaseError(error);
    return (
      databaseError.code === '23505' ||
      databaseError.driverError?.code === '23505'
    );
  }

  private databaseErrorDetails(error: unknown): string {
    const databaseError = this.asDatabaseError(error);
    return [
      databaseError.message,
      databaseError.detail,
      databaseError.constraint,
      databaseError.driverError?.message,
      databaseError.driverError?.detail,
      databaseError.driverError?.constraint,
    ]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .toLowerCase();
  }

  private asDatabaseError(error: unknown): DatabaseErrorShape {
    if (typeof error === 'object' && error !== null) {
      return error as DatabaseErrorShape;
    }
    return {};
  }
}
