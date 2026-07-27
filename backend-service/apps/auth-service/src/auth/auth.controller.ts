import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser, Roles, RolesGuard } from '@app/common';
import { CacheService } from '@app/redis';
import { createHash } from 'node:crypto';
import {
  AdminLoginChallengeResult,
  AuthService,
  AuthTokens,
  LoginResult,
} from './auth.service';
import { JwtAuthGuard } from './auth.guard';
import { RegisterDto } from '../users/dto/register.dto';
import { VerifyEmailDto } from '../users/dto/verify-email.dto';
import { LoginDto } from '../users/dto/login.dto';
import { RefreshTokenDto } from '../users/dto/refresh-token.dto';
import { ForgotPasswordDto } from '../users/dto/forgot-password.dto';
import { ResetPasswordDto } from '../users/dto/reset-password.dto';
import { UpdateProfileDto } from '../users/dto/update-profile.dto';
import { UsersService } from '../users/users.service';
import { AssignRoleDto } from '../users/dto/assign-role.dto';
import { SendOtpDto } from '../users/dto/send-otp.dto';
import { CheckUsernameDto } from '../users/dto/check-username.dto';
import { CheckEmailDto } from '../users/dto/check-email.dto';
import { CheckPhoneDto } from '../users/dto/check-phone.dto';
import { VerifyAccountDeletionOtpDto } from '../users/dto/verify-account-deletion-otp.dto';
import { VerifyAdminLoginDto } from '../users/dto/verify-admin-login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly cache: CacheService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto): Promise<Record<string, unknown>> {
    return this.auth.register(dto);
  }

  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ verified: true }> {
    return this.auth.verifyEmail(dto.email, dto.otp);
  }

  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Req() request: Request,
  ): Promise<LoginResult | AdminLoginChallengeResult> {
    return this.auth.login(
      dto,
      request.ip ?? 'unknown',
      request.header('user-agent') ?? 'unknown',
    );
  }

  @Post('admin/verify-2fa')
  verifyAdminLogin(
    @Body() dto: VerifyAdminLoginDto,
    @Req() request: Request,
  ): Promise<LoginResult> {
    return this.auth.verifyAdminLoginOtp(
      dto.challenge_id,
      dto.email,
      dto.otp,
      request.ip ?? 'unknown',
      request.header('user-agent') ?? 'unknown',
    );
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthTokens> {
    return this.auth.refresh(dto.refresh_token);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser('userId') userId: string): Promise<{ loggedOut: true }> {
    return this.auth.logout(userId);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    return this.auth.forgotPassword(dto.email);
  }

  @Post('send-otp')
  sendOtp(@Body() dto: SendOtpDto): Promise<{ message: string }> {
    return this.auth.sendEmailOtp(dto.email);
  }

  @Get('check-username')
  checkUsername(
    @Query() dto: CheckUsernameDto,
  ): Promise<{ available: boolean }> {
    return this.auth.checkUsername(dto.username);
  }

  @Get('check-email')
  checkEmail(@Query() dto: CheckEmailDto): Promise<{ available: boolean }> {
    return this.auth.checkEmail(dto.email);
  }

  @Get('check-phone')
  checkPhone(@Query() dto: CheckPhoneDto): Promise<{ available: boolean }> {
    return this.auth.checkPhone(dto.phone);
  }

  @Post('resend-otp')
  resendOtp(@Body() dto: SendOtpDto): Promise<{ message: string }> {
    return this.auth.sendEmailOtp(dto.email);
  }

  @Post('account-deletion/send-otp')
  @UseGuards(JwtAuthGuard)
  sendAccountDeletionOtp(
    @CurrentUser('userId') userId: string,
  ): Promise<{ email: string; message: string }> {
    return this.auth.sendAccountDeletionOtp(userId);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto): Promise<{ reset: true }> {
    return this.auth.resetPassword(dto.email, dto.otp, dto.new_password);
  }

  @Get('validate')
  @UseGuards(JwtAuthGuard)
  validate(
    @CurrentUser('userId') userId: string,
  ): Promise<Record<string, unknown>> {
    return this.auth.validateUser(userId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(
    @CurrentUser('userId') userId: string,
  ): Promise<Record<string, unknown>> {
    return this.users.profile(await this.users.getById(userId));
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(
    @CurrentUser('userId') userId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: UpdateProfileDto,
  ): Promise<Record<string, unknown>> {
    const updatedUser = await this.users.updateProfile(userId, dto);
    await this.invalidateTokenValidationCache(authorization);
    return this.users.profile(updatedUser);
  }

  @Post('assign-role')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async assignRole(@Body() dto: AssignRoleDto): Promise<{ assigned: true }> {
    await this.users.assignRole(dto.userId, dto.role);
    return { assigned: true };
  }

  @Get('admin/users')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  adminUsers(): Promise<Record<string, unknown>[]> {
    return this.users.listProfiles();
  }

  @Delete('admin/users')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async deleteAllUsers(): Promise<{ deleted: true; count: number }> {
    const count = await this.users.deleteAllUsers();
    return { deleted: true, count };
  }

  private async invalidateTokenValidationCache(
    authorization: string | undefined,
  ): Promise<void> {
    const [scheme, token] = authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      return;
    }
    await this.cache.invalidateCache(
      `token_valid:${createHash('sha256').update(token).digest('hex')}`,
    );
  }
}

@Controller('internal/auth')
export class InternalAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Post('verify-account-deletion-otp')
  verifyAccountDeletionOtp(
    @Body() dto: VerifyAccountDeletionOtpDto,
  ): Promise<{ verified: true }> {
    return this.auth.verifyAccountDeletionOtp(dto.userId, dto.otp);
  }

  @Get('users/:id')
  async getInternalUserProfile(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Record<string, unknown>> {
    return this.users.profile(await this.users.getById(id));
  }
}
