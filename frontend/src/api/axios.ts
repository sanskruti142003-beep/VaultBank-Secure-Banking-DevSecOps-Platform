import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { AUTH_ERRORS, ROUTES } from "@/constants/auth.constants";
import { useAuthStore } from "@/store/auth.store";
import type {
  ApiEnvelope,
  ApiError,
  ApiErrorEnvelope,
  BackendTokenResponse,
  TokenResponse,
} from "@/types/auth.types";

interface AuthRequestFlags {
  _retry?: boolean;
  _skipAuthRefresh?: boolean;
}

export type AuthAxiosRequestConfig = AxiosRequestConfig &
  Pick<AuthRequestFlags, "_skipAuthRefresh">;

type RetryableRequestConfig = InternalAxiosRequestConfig & AuthRequestFlags;

const baseURL = import.meta.env.VITE_API_BASE_URL || "https://localhost/api";

interface QueuedRequest {
  resolve: (token: string) => void;
  reject: (error: ApiError) => void;
}

let isRefreshing = false;
let failedQueue: QueuedRequest[] = [];

export const axiosInstance = axios.create({
  baseURL,
  timeout: 15_000,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

function generateCorrelationId(): string {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isApiEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "success" in value &&
    "data" in value
  );
}

function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "success" in value &&
    "error" in value
  );
}

function parseRetryAfter(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds)) {
    return seconds;
  }
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }
  return undefined;
}

function codeFromMessage(message: string, status?: number): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("invalid email or password") ||
    normalized.includes("invalid username or password")
  ) {
    return "INVALID_CREDENTIALS";
  }
  if (normalized.includes("email verification")) {
    return "EMAIL_NOT_VERIFIED";
  }
  if (normalized.includes("inactive") || normalized.includes("locked")) {
    return "ACCOUNT_LOCKED";
  }
  if (normalized.includes("too many") || status === 429) {
    return "RATE_LIMIT_EXCEEDED";
  }
  if (normalized.includes("phone number is already registered")) {
    return "PHONE_ALREADY_EXISTS";
  }
  if (
    normalized.includes("username is already taken") ||
    normalized.includes("username is already registered")
  ) {
    return "USERNAME_ALREADY_EXISTS";
  }
  if (
    normalized.includes("email is already registered") ||
    normalized.includes("email already exists") ||
    normalized.includes("account with this email already exists")
  ) {
    return "EMAIL_ALREADY_EXISTS";
  }
  if (normalized.includes("admin access")) {
    return "ADMIN_ACCESS_REQUIRED";
  }
  if (
    normalized.includes("otp") ||
    normalized.includes("verification code") ||
    normalized.includes("code is invalid") ||
    normalized.includes("code has expired")
  ) {
    return "INVALID_OTP";
  }
  if (normalized.includes("refresh token")) {
    return "INVALID_REFRESH_TOKEN";
  }
  if (
    normalized.includes("admin accounts") ||
    normalized.includes("admin portal")
  ) {
    return "ADMIN_PORTAL_REQUIRED";
  }
  if (status === 404) {
    return "USER_NOT_FOUND";
  }
  if (status && status >= 500) {
    return "UNKNOWN_ERROR";
  }
  return "UNKNOWN_ERROR";
}

export function toApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<unknown>;
    const status = axiosError.response?.status;
    const body = axiosError.response?.data;
    if (isApiErrorEnvelope(body)) {
      const message = body.error.message;
      return {
        code: codeFromMessage(message, status),
        message,
        status,
        details: body.error.details,
        path: body.path,
        retryAfterSeconds: parseRetryAfter(
          axiosError.response?.headers["retry-after"],
        ),
      };
    }
    if (axiosError.code === "ERR_NETWORK" || !axiosError.response) {
      return {
        code: "NETWORK_ERROR",
        message: AUTH_ERRORS.NETWORK_ERROR,
      };
    }
    return {
      code: codeFromMessage(axiosError.message, status),
      message: axiosError.message,
      status,
      retryAfterSeconds: parseRetryAfter(
        axiosError.response?.headers["retry-after"],
      ),
    };
  }
  if (error instanceof Error) {
    return {
      code: "UNKNOWN_ERROR",
      message: error.message,
    };
  }
  return {
    code: "UNKNOWN_ERROR",
    message: AUTH_ERRORS.UNKNOWN_ERROR,
  };
}

function normalizeTokenResponse(response: BackendTokenResponse): TokenResponse {
  const accessToken = response.accessToken ?? response.access_token;
  const refreshToken = response.refreshToken ?? response.refresh_token;
  if (!accessToken || !refreshToken) {
    throw new Error("Token response is missing credentials.");
  }
  return { accessToken, refreshToken };
}

function processQueue(error: ApiError | null, token?: string): void {
  failedQueue.forEach((request) => {
    if (error) {
      request.reject(error);
    } else if (token) {
      request.resolve(token);
    }
  });
  failedQueue = [];
}

function redirectToLogin(): void {
  if (window.location.pathname !== ROUTES.login) {
    window.location.replace(ROUTES.login);
  }
}

async function requestRefreshToken(
  refreshToken: string,
): Promise<TokenResponse> {
  const response = await axios.post<ApiEnvelope<BackendTokenResponse>>(
    `${baseURL}/auth/refresh`,
    { refresh_token: refreshToken },
    {
      headers: {
        "Content-Type": "application/json",
        "X-Correlation-ID": generateCorrelationId(),
      },
      withCredentials: true,
    },
  );
  return normalizeTokenResponse(response.data.data);
}

axiosInstance.interceptors.request.use((config) => {
  const authConfig = config as RetryableRequestConfig;
  const headers = AxiosHeaders.from(authConfig.headers);
  headers.set("X-Correlation-ID", generateCorrelationId());
  const accessToken = useAuthStore.getState().accessToken;
  if (accessToken && !authConfig._skipAuthRefresh) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  authConfig.headers = headers;
  return authConfig;
});

axiosInstance.interceptors.response.use(
  (response: AxiosResponse<unknown>) => {
    const data = isApiEnvelope(response.data)
      ? response.data.data
      : response.data;
    return data as AxiosResponse<unknown>;
  },
  async (error: unknown) => {
    const apiError = toApiError(error);
    const originalRequest = axios.isAxiosError(error)
      ? (error.config as RetryableRequestConfig | undefined)
      : undefined;

    const state = useAuthStore.getState();
    const shouldRefresh =
      apiError.status === 401 &&
      Boolean(state.accessToken) &&
      Boolean(state.refreshToken) &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest._skipAuthRefresh;

    if (!shouldRefresh || !originalRequest) {
      if (
        apiError.code === "INVALID_REFRESH_TOKEN" ||
        apiError.code === "REFRESH_TOKEN_EXPIRED"
      ) {
        state.clearAuth();
        redirectToLogin();
      }
      return Promise.reject(apiError);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token) => {
            const headers = AxiosHeaders.from(originalRequest.headers);
            headers.set("Authorization", `Bearer ${token}`);
            originalRequest.headers = headers;
            resolve(axiosInstance(originalRequest));
          },
          reject,
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = state.refreshToken;
      if (!refreshToken) {
        throw apiError;
      }
      const tokens = await requestRefreshToken(refreshToken);
      state.setTokens(tokens.accessToken, tokens.refreshToken);
      processQueue(null, tokens.accessToken);
      const headers = AxiosHeaders.from(originalRequest.headers);
      headers.set("Authorization", `Bearer ${tokens.accessToken}`);
      originalRequest.headers = headers;
      return axiosInstance(originalRequest);
    } catch (refreshError: unknown) {
      const normalized = toApiError(refreshError);
      processQueue(normalized);
      state.clearAuth();
      redirectToLogin();
      return Promise.reject(normalized);
    } finally {
      isRefreshing = false;
    }
  },
);

export async function unwrapRequest<T>(
  request: Promise<AxiosResponse<T>>,
): Promise<T> {
  const response = await request;
  return response as unknown as T;
}
