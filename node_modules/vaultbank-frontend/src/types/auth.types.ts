export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  phone: string | null;
  panNumber?: string | null;
  roles: string[];
  isVerified: boolean;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type RoleName = "admin" | "agent" | "customer";

export interface RegisterDto {
  username: string;
  fullName: string;
  email: string;
  phone?: string;
  password: string;
}

export interface RegisterResponse {
  userId: string;
  email: string;
  message: string;
}

export interface VerifyEmailDto {
  email: string;
  otp: string;
}

export interface LoginDto {
  username: string;
  password: string;
  role?: Extract<RoleName, "admin" | "customer">;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface AdminLoginChallenge {
  requiresTwoFactor: true;
  challengeId: string;
  email: string;
  message: string;
  expiresInSeconds: number;
}

export type LoginResponse = AuthResponse | AdminLoginChallenge;

export interface VerifyAdminLoginDto {
  challengeId: string;
  email: string;
  otp: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}

export interface ResetPasswordDto {
  email: string;
  otp: string;
  newPassword: string;
}

export interface UpdateProfileDto {
  email?: string;
  fullName?: string;
  phone?: string | null;
  panNumber?: string | null;
}

export interface ApiError {
  code: string;
  message: string;
  status?: number;
  details?: unknown;
  path?: string;
  retryAfterSeconds?: number;
  fieldErrors?: Record<string, string>;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
  path?: string;
}

export interface BackendUser {
  id: string;
  username?: string;
  email: string;
  full_name?: string;
  fullName?: string;
  phone?: string | null;
  pan_number?: string | null;
  panNumber?: string | null;
  roles?: string[];
  is_verified?: boolean;
  isVerified?: boolean;
  is_active?: boolean;
  isActive?: boolean;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
}

export interface BackendTokenResponse {
  access_token?: string;
  accessToken?: string;
  refresh_token?: string;
  refreshToken?: string;
}

export interface BackendAuthResponse extends BackendTokenResponse {
  user: BackendUser;
}

export interface BackendAdminLoginChallenge {
  requires_2fa?: boolean;
  requiresTwoFactor?: boolean;
  challenge_id?: string;
  challengeId?: string;
  email: string;
  message?: string;
  expires_in_seconds?: number;
  expiresInSeconds?: number;
}
