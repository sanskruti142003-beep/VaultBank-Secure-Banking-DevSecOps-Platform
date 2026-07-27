import {
  axiosInstance,
  toApiError,
  unwrapRequest,
  type AuthAxiosRequestConfig,
} from "@/api/axios";
import { normalizePhone } from "@/lib/utils";
import type {
  AuthResponse,
  BackendAdminLoginChallenge,
  BackendAuthResponse,
  BackendTokenResponse,
  BackendUser,
  LoginDto,
  LoginResponse,
  RoleName,
  RegisterDto,
  RegisterResponse,
  ResetPasswordDto,
  TokenResponse,
  UpdateProfileDto,
  User,
  VerifyEmailDto,
  VerifyAdminLoginDto,
} from "@/types/auth.types";

interface BackendRegisterResponse {
  message?: string;
  user?: BackendUser;
  userId?: string;
  email?: string;
}

interface AvailabilityResponse {
  available: boolean;
}

interface AccountDeletionOtpResponse {
  email: string;
  message: string;
}

export function normalizeUser(user: BackendUser): User {
  return {
    id: user.id,
    username: user.username ?? "",
    email: user.email,
    fullName: user.fullName ?? user.full_name ?? "",
    phone: user.phone ?? null,
    panNumber: user.panNumber ?? user.pan_number ?? null,
    roles: user.roles ?? [],
    isVerified: user.isVerified ?? user.is_verified ?? false,
    isActive: user.isActive ?? user.is_active,
    createdAt: user.createdAt ?? user.created_at,
    updatedAt: user.updatedAt ?? user.updated_at,
  };
}

function normalizeTokens(response: BackendTokenResponse): TokenResponse {
  const accessToken = response.accessToken ?? response.access_token;
  const refreshToken = response.refreshToken ?? response.refresh_token;
  if (!accessToken || !refreshToken) {
    throw new Error("Missing authentication tokens.");
  }
  return { accessToken, refreshToken };
}

function normalizeAuthResponse(response: BackendAuthResponse): AuthResponse {
  return {
    ...normalizeTokens(response),
    user: normalizeUser(response.user),
  };
}

function isAdminLoginChallenge(
  response: BackendAuthResponse | BackendAdminLoginChallenge,
): response is BackendAdminLoginChallenge {
  return Boolean(
    (response as BackendAdminLoginChallenge).requires_2fa ||
      (response as BackendAdminLoginChallenge).requiresTwoFactor,
  );
}

function normalizeAdminChallenge(
  response: BackendAdminLoginChallenge,
): LoginResponse {
  return {
    requiresTwoFactor: true,
    challengeId: response.challengeId ?? response.challenge_id ?? "",
    email: response.email,
    message: response.message ?? "Admin verification OTP sent.",
    expiresInSeconds:
      response.expiresInSeconds ?? response.expires_in_seconds ?? 120,
  };
}

export const authApi = {
  async register(data: RegisterDto): Promise<RegisterResponse> {
    const response = await unwrapRequest(
      axiosInstance.post<BackendRegisterResponse>("/auth/register", {
        username: data.username,
        email: data.email,
        password: data.password,
        phone: data.phone ? normalizePhone(data.phone) : undefined,
        full_name: data.fullName,
      }),
    );
    const user = response.user ? normalizeUser(response.user) : undefined;
    return {
      userId: response.userId ?? user?.id ?? "",
      email: response.email ?? user?.email ?? data.email,
      message: response.message ?? "OTP sent to email",
    };
  },

  async verifyEmail(data: VerifyEmailDto): Promise<{ message: string }> {
    await unwrapRequest(
      axiosInstance.post<{ verified: true }>("/auth/verify-email", data),
    );
    return { message: "Email verified. Please login." };
  },

  async login(data: LoginDto): Promise<LoginResponse> {
    const response = await unwrapRequest(
      axiosInstance.post<BackendAuthResponse | BackendAdminLoginChallenge>(
        "/auth/login",
        {
          username: data.username,
          password: data.password,
          role: data.role,
        },
      ),
    );
    if (isAdminLoginChallenge(response)) {
      return normalizeAdminChallenge(response);
    }
    return normalizeAuthResponse(response);
  },

  async verifyAdminLogin(data: VerifyAdminLoginDto): Promise<AuthResponse> {
    const response = await unwrapRequest(
      axiosInstance.post<BackendAuthResponse>("/auth/admin/verify-2fa", {
        challenge_id: data.challengeId,
        email: data.email,
        otp: data.otp,
      }),
    );
    return normalizeAuthResponse(response);
  },

  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    const response = await unwrapRequest(
      axiosInstance.post<BackendTokenResponse>(
        "/auth/refresh",
        { refresh_token: refreshToken },
        { _skipAuthRefresh: true } as AuthAxiosRequestConfig,
      ),
    );
    return normalizeTokens(response);
  },

  async logout(): Promise<void> {
    await unwrapRequest(axiosInstance.post<{ loggedOut: true }>("/auth/logout"));
  },

  async forgotPassword(email: string): Promise<void> {
    await unwrapRequest(axiosInstance.post<{ message: string }>(
      "/auth/forgot-password",
      { email },
    ));
  },

  async resetPassword(data: ResetPasswordDto): Promise<void> {
    await unwrapRequest(
      axiosInstance.post<{ reset: true }>("/auth/reset-password", {
        email: data.email,
        otp: data.otp,
        new_password: data.newPassword,
      }),
    );
  },

  async getMe(): Promise<User> {
    const response = await unwrapRequest(
      axiosInstance.get<BackendUser>("/auth/me"),
    );
    return normalizeUser(response);
  },

  async updateProfile(data: UpdateProfileDto): Promise<User> {
    const payload: {
      email?: string;
      full_name?: string;
      pan_number?: string | null;
      phone?: string | null;
    } = {};
    if (data.email !== undefined) {
      payload.email = data.email.trim().toLowerCase();
    }
    if (data.fullName !== undefined) {
      payload.full_name = data.fullName.trim();
    }
    if (data.phone !== undefined) {
      payload.phone = data.phone ? normalizePhone(data.phone) : null;
    }
    if (data.panNumber !== undefined) {
      payload.pan_number = data.panNumber;
    }
    const response = await unwrapRequest(
      axiosInstance.patch<BackendUser>("/auth/me", payload),
    );
    return normalizeUser(response);
  },

  async getAdminUsers(): Promise<User[]> {
    const response = await unwrapRequest(
      axiosInstance.get<BackendUser[]>("/auth/admin/users"),
    );
    return response.map(normalizeUser);
  },

  async assignRole(userId: string, role: RoleName): Promise<void> {
    await unwrapRequest(
      axiosInstance.post<{ assigned: true }>("/auth/assign-role", {
        userId,
        role,
      }),
    );
  },

  async checkEmail(email: string): Promise<boolean | null> {
    try {
      const response = await unwrapRequest(
        axiosInstance.get<AvailabilityResponse>("/auth/check-email", {
          params: { email: email.trim().toLowerCase() },
        }),
      );
      return response.available;
    } catch (error: unknown) {
      const apiError = toApiError(error);
      if (apiError.status === 404 || apiError.code === "USER_NOT_FOUND") {
        return null;
      }
      throw apiError;
    }
  },

  async checkUsername(username: string): Promise<boolean | null> {
    try {
      const response = await unwrapRequest(
        axiosInstance.get<AvailabilityResponse>("/auth/check-username", {
          params: { username: username.trim().toLowerCase() },
        }),
      );
      return response.available;
    } catch (error: unknown) {
      const apiError = toApiError(error);
      if (apiError.status === 404 || apiError.code === "USER_NOT_FOUND") {
        return null;
      }
      throw apiError;
    }
  },

  async checkPhone(phone: string): Promise<boolean | null> {
    try {
      const response = await unwrapRequest(
        axiosInstance.get<AvailabilityResponse>("/auth/check-phone", {
          params: { phone: normalizePhone(phone) },
        }),
      );
      return response.available;
    } catch (error: unknown) {
      const apiError = toApiError(error);
      if (apiError.status === 404 || apiError.code === "USER_NOT_FOUND") {
        return null;
      }
      throw apiError;
    }
  },

  async resendOtp(email: string): Promise<void> {
    await unwrapRequest(
      axiosInstance.post<{ message: string }>("/auth/resend-otp", { email }),
    );
  },

  async requestAccountDeletionOtp(): Promise<AccountDeletionOtpResponse> {
    return await unwrapRequest(
      axiosInstance.post<AccountDeletionOtpResponse>(
        "/auth/account-deletion/send-otp",
      ),
    );
  },
};
