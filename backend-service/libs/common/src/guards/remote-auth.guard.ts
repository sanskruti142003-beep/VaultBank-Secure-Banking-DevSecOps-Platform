import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CacheService } from '@app/redis';
import {
  AUTH_TOKEN_VALIDATOR,
  AuthenticatedRequest,
  AuthenticatedUser,
  TokenValidator,
} from '../types/auth.types';

@Injectable()
export class RemoteAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_TOKEN_VALIDATOR)
    private readonly validator: TokenValidator,
    private readonly cache: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.bearerToken(request.headers.authorization);
    const cacheKey = `token_valid:${createHash('sha256').update(token).digest('hex')}`;
    const cached = await this.cache.getCache<AuthenticatedUser>(cacheKey);
    const user = cached ?? (await this.validator.validateToken(token));
    if (!cached) {
      await this.cache.setCache(cacheKey, user, 30);
    }
    request.user = user;
    return true;
  }

  private bearerToken(value: string | undefined): string {
    const [scheme, token] = value?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Bearer token is required');
    }
    return token;
  }
}
