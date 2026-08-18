import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheck, UserRound } from "lucide-react";
import { motion, useAnimationControls } from "framer-motion";
import { useEffect, useState, type FormEvent } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import toast from "react-hot-toast";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FormError } from "@/components/common/FormError";
import { LoadingButton } from "@/components/common/LoadingButton";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { OtpInput } from "@/components/auth/OtpInput";
import { SocialAuthButtons } from "@/components/auth/SocialAuthButtons";
import {
  AUTH_COPY,
  getAuthErrorMessage,
  isApiError,
  REMEMBERED_USERNAME_KEY,
  REMEMBERED_USERNAME_OPT_IN_KEY,
  ROUTES,
} from "@/constants/auth.constants";
import { useAuth } from "@/hooks/useAuth";
import {
  loginSchema,
  type LoginFormValues,
} from "@/lib/validations/auth.schemas";
import { cn, firstName, formatSeconds } from "@/lib/utils";
import type { AdminLoginChallenge } from "@/types/auth.types";

interface AuthLocationState {
  username?: string;
}

interface LoginFormProps {
  role?: "customer" | "admin";
  submitLabel?: string;
  submittingLabel?: string;
  redirectTo?: string;
  showSocialAuth?: boolean;
  usernameLabel?: string;
  usernamePlaceholder?: string;
  autoFocus?: boolean;
}

function isAdminChallenge(value: unknown): value is AdminLoginChallenge {
  return (
    typeof value === "object" &&
    value !== null &&
    "requiresTwoFactor" in value
  );
}

function rememberedUsername(): string {
  const optedIn =
    localStorage.getItem(REMEMBERED_USERNAME_OPT_IN_KEY) === "true";
  return optedIn ? localStorage.getItem(REMEMBERED_USERNAME_KEY) ?? "" : "";
}

function emailFromDetails(details: unknown): string | undefined {
  if (
    typeof details === "object" &&
    details !== null &&
    "email" in details &&
    typeof details.email === "string"
  ) {
    return details.email;
  }
  return undefined;
}

export function LoginForm({
  role = "customer",
  submitLabel = AUTH_COPY.login.submit,
  submittingLabel = AUTH_COPY.login.submitting,
  redirectTo,
  showSocialAuth = true,
  usernameLabel = "Username",
  usernamePlaceholder = "john.smith",
  autoFocus = true,
}: LoginFormProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const controls = useAnimationControls();
  const state = location.state as AuthLocationState | null;
  const [formError, setFormError] = useState<string>();
  const [rateCountdown, setRateCountdown] = useState(0);
  const [adminChallenge, setAdminChallenge] =
    useState<AdminLoginChallenge | null>(null);
  const [adminOtp, setAdminOtp] = useState("");
  const [adminOtpError, setAdminOtpError] = useState("");
  const [adminOtpCountdown, setAdminOtpCountdown] = useState(0);
  const usernameFieldId = `${role}-username`;
  const passwordFieldId = `${role}-password`;

  const savedUsername = rememberedUsername();
  const defaultUsername = state?.username ?? savedUsername;
  const defaultRememberMe = !state?.username && Boolean(savedUsername);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: defaultUsername,
      password: "",
      rememberMe: defaultRememberMe,
    },
  });

  const username = watch("username");
  const isSubmitting = adminChallenge
    ? auth.verifyAdminLoginMutation.isPending
    : auth.loginMutation.isPending;

  useEffect(() => {
    if (rateCountdown <= 0) {
      return undefined;
    }
    const interval = window.setInterval(() => {
      setRateCountdown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [rateCountdown]);

  useEffect(() => {
    if (adminOtpCountdown <= 0) {
      return undefined;
    }
    const interval = window.setInterval(() => {
      setAdminOtpCountdown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [adminOtpCountdown]);

  const onSubmit: SubmitHandler<LoginFormValues> = async (values) => {
    setFormError(undefined);
    try {
      const response = await auth.loginMutation.mutateAsync({
        username: values.username,
        password: values.password,
        role,
      });
      if (isAdminChallenge(response)) {
        setAdminChallenge(response);
        setAdminOtp("");
        setAdminOtpError("");
        setAdminOtpCountdown(response.expiresInSeconds);
        toast.success(`Admin OTP sent to ${response.email}`);
        return;
      }
      if (values.rememberMe) {
        localStorage.setItem(REMEMBERED_USERNAME_KEY, values.username);
        localStorage.setItem(REMEMBERED_USERNAME_OPT_IN_KEY, "true");
      } else {
        localStorage.removeItem(REMEMBERED_USERNAME_KEY);
        localStorage.removeItem(REMEMBERED_USERNAME_OPT_IN_KEY);
      }
      toast.success(`Welcome back, ${firstName(response.user.fullName)}!`);
      navigate(
        redirectTo ??
          (role === "admin" ? ROUTES.adminDashboard : ROUTES.dashboard),
        { replace: true },
      );
    } catch (error: unknown) {
      const apiError = isApiError(error) ? error : undefined;
      const code = apiError?.code;
      if (code === "INVALID_CREDENTIALS") {
        setValue("password", "");
        await controls.start({
          x: [0, -10, 10, -10, 10, 0],
          transition: { duration: 0.42, ease: "easeInOut" },
        });
        controls.set({ x: 0 });
      }
      if (code === "RATE_LIMIT_EXCEEDED") {
        setRateCountdown(apiError?.retryAfterSeconds ?? 60);
      }
      if (code === "EMAIL_NOT_VERIFIED") {
        const verificationEmail = emailFromDetails(apiError?.details);
        toast.success("Verification code sent to your registered email");
        navigate(ROUTES.verifyEmail, {
          replace: true,
          state: { email: verificationEmail, fromLogin: true },
        });
        return;
      }
      setFormError(getAuthErrorMessage(apiError));
    }
  };

  async function verifyAdminOtp(code = adminOtp) {
    if (!adminChallenge) {
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setAdminOtpError("Enter the 6-digit code sent to your admin email.");
      return;
    }
    try {
      setAdminOtpError("");
      const response = await auth.verifyAdminLoginMutation.mutateAsync({
        challengeId: adminChallenge.challengeId,
        email: adminChallenge.email,
        otp: code,
      });
      toast.success(`Welcome back, ${firstName(response.user.fullName)}!`);
      navigate(redirectTo ?? ROUTES.adminDashboard, { replace: true });
    } catch (error: unknown) {
      const apiError = isApiError(error) ? error : undefined;
      setAdminOtpError(getAuthErrorMessage(apiError));
      setAdminOtp("");
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    if (adminChallenge) {
      event.preventDefault();
      void verifyAdminOtp();
      return;
    }
    void handleSubmit(onSubmit)(event);
  }

  const resendVerification = async () => {
    if (!username) {
      return;
    }
    try {
      toast.error("Please use forgot password or registration email verification.");
      navigate(ROUTES.verifyEmail, {
        replace: true,
        state: { fromLogin: true },
      });
    } catch {
      toast.error("Verification resend is not available yet.");
    }
  };

  return (
    <motion.form
      className="space-y-5"
      animate={controls}
      onSubmit={handleFormSubmit}
      aria-busy={isSubmitting}
      autoComplete="off"
      noValidate
    >
      <div className="space-y-1.5">
        <label
          className="text-sm font-medium text-secondary"
          htmlFor={usernameFieldId}
        >
          {usernameLabel}
        </label>
        <div className="relative">
          <UserRound
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            id={usernameFieldId}
            className="pl-10"
            type="text"
            placeholder={usernamePlaceholder}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            data-lpignore="true"
            autoFocus={autoFocus}
            disabled={isSubmitting || Boolean(adminChallenge)}
            hasError={Boolean(errors.username)}
            aria-invalid={Boolean(errors.username)}
            aria-describedby={errors.username ? "username-error" : undefined}
            {...register("username")}
          />
        </div>
        <FormError id="username-error" message={errors.username?.message} />
      </div>

      <PasswordInput
        id={passwordFieldId}
        label="Password"
        placeholder="Enter your password"
        autoComplete="new-password"
        data-lpignore="true"
        disabled={isSubmitting || Boolean(adminChallenge)}
        error={errors.password?.message}
        {...register("password")}
      />

      {role === "admin" ? (
        <div
          className={cn(
            "space-y-4 rounded-xl border p-4",
            adminChallenge
              ? "border-emerald-200 bg-emerald-50"
              : "border-slate-200 bg-slate-50",
          )}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "rounded-full bg-white p-2",
                adminChallenge ? "text-emerald-600" : "text-muted",
              )}
            >
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold text-secondary">
                Admin 2FA verification
              </p>
              <p className="mt-1 text-sm leading-6 text-muted">
                {adminChallenge
                  ? `Enter the 6-digit OTP sent to ${adminChallenge.email}.`
                  : "Enter your admin username and password first. We will send the OTP to this page."}
              </p>
              {adminOtpCountdown > 0 ? (
                <p className="mt-1 text-xs font-semibold text-emerald-700">
                  Code expires in {formatSeconds(adminOtpCountdown)}
                </p>
              ) : null}
            </div>
          </div>
          {adminChallenge ? (
            <OtpInput
              autoFocus
              disabled={isSubmitting}
              error={adminOtpError}
              isLoading={isSubmitting}
              onChange={(value) => {
                setAdminOtp(value);
                setAdminOtpError("");
              }}
              onComplete={(value) => void verifyAdminOtp(value)}
              value={adminOtp}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-medium text-muted">
              Click Login as Admin first. The OTP boxes will unlock here after
              the code is sent.
            </div>
          )}
          {adminOtpError ? <FormError message={adminOtpError} /> : null}
          {adminChallenge ? (
            <button
              className="text-sm font-semibold text-primary hover:text-primary-dark"
              onClick={() => {
                setAdminChallenge(null);
                setAdminOtp("");
                setAdminOtpError("");
                setValue("password", "");
              }}
              type="button"
            >
              Use another admin account
            </button>
          ) : null}
        </div>
      ) : null}

      {!adminChallenge ? (
        <div className="flex items-center justify-between gap-4 text-sm">
        <label className="flex items-center gap-2 text-muted">
          <input
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
            type="checkbox"
            disabled={isSubmitting}
            {...register("rememberMe")}
          />
          <span>Remember me</span>
        </label>
        <Link
          className="font-medium text-primary transition hover:text-primary-dark"
          to={ROUTES.forgotPassword}
        >
          Forgot password?
        </Link>
      </div>
      ) : null}

      {formError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <FormError
            message={
              rateCountdown > 0
                ? `Too many attempts. Try again in ${formatSeconds(
                    rateCountdown,
                  )}`
                : formError
            }
          />
          {formError.includes("verify") ? (
            <button
              className="mt-2 text-sm font-medium text-primary hover:text-primary-dark"
              type="button"
              disabled={auth.resendOtpMutation.isPending}
              onClick={() => {
                void resendVerification();
              }}
            >
              Resend verification email
            </button>
          ) : null}
        </div>
      ) : null}

      <LoadingButton
        className="w-full"
        isLoading={isSubmitting}
        loadingText={submittingLabel}
        type="submit"
      >
        {adminChallenge ? "Verify admin OTP" : submitLabel}
      </LoadingButton>

      {showSocialAuth && !adminChallenge ? (
        <>
          <div className="flex items-center gap-3 text-sm text-muted">
            <span className="h-px flex-1 bg-border" />
            <span>Or continue with</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <SocialAuthButtons />
        </>
      ) : null}
    </motion.form>
  );
}
