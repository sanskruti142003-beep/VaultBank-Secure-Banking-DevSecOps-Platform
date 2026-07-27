import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import {
  AuthenticatedUser,
  BaseHttpService,
  TokenValidator,
} from '@app/common';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

@Injectable()
export class AuthHttpService extends BaseHttpService implements TokenValidator {
  private readonly serviceLogger = new Logger(AuthHttpService.name);

  constructor(http: HttpService) {
    super(http, process.env.AUTH_SERVICE_URL ?? 'http://auth-service:3001/v1');
  }

  async validateToken(token: string): Promise<AuthenticatedUser> {
    try {
      const response = await this.get<ApiResponse<AuthenticatedUser>>(
        '/auth/validate',
        { headers: { authorization: `Bearer ${token}` } },
      );
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
}
