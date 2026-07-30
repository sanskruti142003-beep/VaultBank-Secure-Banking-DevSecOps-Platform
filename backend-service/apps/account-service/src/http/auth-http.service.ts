import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuthenticatedUser,
  BaseHttpService,
  TokenValidator,
} from '@app/common';
import { isAxiosError } from 'axios';

interface ValidationResponse {
  success: boolean;
  data: AuthenticatedUser;
}

interface VerifyOtpResponse {
  success: boolean;
  data: { verified: true };
}

interface UserProfileResponse {
  success?: boolean;
  data?: {
    email?: string;
    full_name?: string;
    fullName?: string;
  };
  email?: string;
  full_name?: string;
  fullName?: string;
}

export interface UserProfileLookup {
  email?: string;
  fullName?: string;
}

@Injectable()
export class AuthHttpService extends BaseHttpService implements TokenValidator {
  private readonly serviceLogger = new Logger(AuthHttpService.name);
  private readonly authBaseUrl: string;

  constructor(http: HttpService) {
    const baseUrl =
      process.env.AUTH_SERVICE_URL ?? 'http://auth-service:3001/v1';
    super(http, baseUrl);
    this.authBaseUrl = baseUrl.replace(/\/$/, '');
  }

  async validateToken(token: string): Promise<AuthenticatedUser> {
    try {
      const response = await this.get<ValidationResponse>('/auth/validate', {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.success || !response.data.userId) {
        throw new UnauthorizedException('Token validation failed');
      }
      return response.data;
    } catch (error: unknown) {
      this.serviceLogger.warn(
        `Remote token validation failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new UnauthorizedException('Token is invalid or expired');
    }
  }

  async verifyAccountDeletionOtp(userId: string, otp: string): Promise<void> {
    try {
      const response = await this.http.axiosRef.post<VerifyOtpResponse>(
        `${this.authBaseUrl}/internal/auth/verify-account-deletion-otp`,
        { userId, otp },
      );
      if (!response.data.success || !response.data.data.verified) {
        throw new BadRequestException('OTP is invalid or expired');
      }
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      if (isAxiosError(error) && error.response?.status === 400) {
        throw new BadRequestException('OTP is invalid or expired');
      }
      this.serviceLogger.warn(
        `Remote OTP verification failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new ServiceUnavailableException(
        'Unable to verify OTP right now. Please try again.',
      );
    }
  }

  async getUserProfile(userId: string): Promise<UserProfileLookup | null> {
    try {
      const response = await this.http.axiosRef.get<UserProfileResponse>(
        `${this.authBaseUrl}/internal/auth/users/${userId}`,
      );
      const profile = response.data.data ?? response.data;
      return {
        email: profile.email,
        fullName: profile.fullName ?? profile.full_name,
      };
    } catch (error: unknown) {
      this.serviceLogger.warn(
        `Remote user profile lookup failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return null;
    }
  }
}
