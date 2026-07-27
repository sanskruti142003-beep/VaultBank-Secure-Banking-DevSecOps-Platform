export const REDIS_SESSIONS = Symbol('REDIS_SESSIONS');
export const REDIS_CACHE = Symbol('REDIS_CACHE');
export const REDIS_RATE_LIMIT = Symbol('REDIS_RATE_LIMIT');
export const REDIS_OTP = Symbol('REDIS_OTP');

export const REDIS_DATABASE = {
  sessions: 0,
  cache: 1,
  rateLimit: 2,
  otp: 3,
} as const;
