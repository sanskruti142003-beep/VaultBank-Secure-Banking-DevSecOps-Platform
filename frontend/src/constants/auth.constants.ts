import type { ApiError } from "@/types/auth.types";

export const APP_NAME = import.meta.env.VITE_APP_NAME || "VaultBank";

export const ROUTES = {
  root: "/",
  auth: "/auth",
  login: "/auth/login",
  register: "/auth/register",
  verifyEmail: "/auth/verify-email",
  forgotPassword: "/auth/forgot-password",
  resetPassword: "/auth/reset-password",
  dashboard: "/dashboard",
  adminDashboard: "/admin/dashboard",
} as const;

export const AUTH_STORAGE_KEY = "banking_auth";
export const REMEMBERED_EMAIL_KEY = "vaultbank_remembered_email";
export const REMEMBERED_EMAIL_OPT_IN_KEY = "vaultbank_remembered_email_opt_in";
export const REMEMBERED_USERNAME_KEY = "vaultbank_remembered_username";
export const REMEMBERED_USERNAME_OPT_IN_KEY =
  "vaultbank_remembered_username_opt_in";
export const OTP_LENGTH = 6;
export const OTP_RESEND_LIMIT = 3;
export const VERIFY_OTP_SECONDS = 120;
export const RESET_OTP_SECONDS = 120;
export const PASSWORD_MIN_LENGTH = 12;

export const PAGE_TITLES = {
  login: `Sign In - ${APP_NAME}`,
  register: `Create Account - ${APP_NAME}`,
  verifyEmail: `Verify Email - ${APP_NAME}`,
  forgotPassword: `Forgot Password - ${APP_NAME}`,
  resetPassword: `Reset Password - ${APP_NAME}`,
  dashboard: `Dashboard - ${APP_NAME}`,
} as const;

export const AUTH_ERRORS = {
  INVALID_CREDENTIALS:
    "Incorrect username or password. Please check and try again.",
  EMAIL_NOT_VERIFIED: "Please verify your email before signing in.",
  ACCOUNT_LOCKED:
    "Your account is locked for 24 hours because the password was entered incorrectly 3 times.",
  RATE_LIMIT_EXCEEDED: "Too many attempts. Please wait before trying again.",
  EMAIL_ALREADY_EXISTS: "An account with this email already exists.",
  USERNAME_ALREADY_EXISTS: "This username is already taken.",
  PHONE_ALREADY_EXISTS: "This mobile number is already registered.",
  INVALID_OTP: "Invalid verification code.",
  OTP_EXPIRED: "This code has expired. Please request a new one.",
  PASSWORD_TOO_WEAK: "Password does not meet security requirements.",
  INVALID_REFRESH_TOKEN: "Session expired. Please sign in again.",
  REFRESH_TOKEN_EXPIRED: "Session expired. Please sign in again.",
  USER_NOT_FOUND: "No account found with this email.",
  NETWORK_ERROR: "Unable to connect. Please check your connection.",
  VALIDATION_ERROR: "Please review the highlighted fields.",
  UNKNOWN_ERROR: "Something went wrong. Please try again.",
  ADMIN_ACCESS_REQUIRED:
    "This account does not have admin access. Please use an admin account.",
  ADMIN_PORTAL_REQUIRED:
    "This admin account can only sign in through the admin portal.",
} as const;

export const AUTH_COPY = {
  tagline: "Secure banking at your fingertips",
  features: [
    "256-bit SSL encryption",
    "Real-time fraud monitoring",
    "FDIC insured deposits",
  ],
  compliance: "256-bit encrypted / FDIC insured / PCI-DSS compliant",
  login: {
    title: "Welcome back",
    subtitle: "Sign in to your account",
    submit: "Sign in",
    submitting: "Signing in...",
    noAccount: "Don't have an account?",
    createAccount: "Create account",
  },
  register: {
    title: "Create your account",
    subtitle: "Start banking smarter today",
    submit: "Create account",
    submitting: "Creating account...",
    hasAccount: "Already have an account?",
    signIn: "Sign in",
  },
  verify: {
    title: "Verification pending",
    subtitle: "Enter the 6-digit code sent to",
    accountCreated: "Account created. Email verification is pending.",
    wrongEmail: "Wrong email?",
    verifiedTitle: "User verified successfully",
    verifiedSubtitle: "Redirecting you to sign in.",
    verified: "User verified successfully. Please sign in.",
  },
  forgot: {
    title: "Forgot your password?",
    subtitle: "Enter your email and we'll send you a reset code.",
    sentTitle: "Reset code sent",
    sentSubtitle: "Check your inbox and spam folder for the code we just sent.",
  },
  reset: {
    title: "Reset your password",
    subtitle: "Enter the code from your email and choose a new password.",
    successTitle: "Password reset!",
    successSubtitle: "Your password has been changed successfully.",
  },
} as const;

export function getAuthErrorMessage(error: ApiError | undefined): string {
  if (!error) {
    return AUTH_ERRORS.UNKNOWN_ERROR;
  }
  const code = error.code as keyof typeof AUTH_ERRORS;
  return AUTH_ERRORS[code] ?? error.message ?? AUTH_ERRORS.UNKNOWN_ERROR;
}

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value
  );
}
