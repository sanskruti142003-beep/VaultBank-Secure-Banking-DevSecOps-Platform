import { Request } from 'express';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  phone?: string | null;
  roles: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  correlationId?: string;
}

export interface TokenValidator {
  validateToken(token: string): Promise<AuthenticatedUser>;
}

export const AUTH_TOKEN_VALIDATOR = Symbol('AUTH_TOKEN_VALIDATOR');
