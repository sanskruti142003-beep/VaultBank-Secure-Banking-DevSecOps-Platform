import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { MailCheck } from "lucide-react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { OtpInput } from "@/components/auth/OtpInput";
import { FormError } from "@/components/common/FormError";
import { LoadingButton } from "@/components/common/LoadingButton";
import { Button } from "@/components/ui/button";
import {
  AUTH_COPY,
  AUTH_ERRORS,
  getAuthErrorMessage,
  isApiError,
  OTP_LENGTH,
  OTP_RESEND_LIMIT,
  PAGE_TITLES,
  ROUTES,
  VERIFY_OTP_SECONDS,
} from "@/constants/auth.constants";
import { useAuth } from "@/hooks/useAuth";
import { useOtp } from "@/hooks/useOtp";

interface VerifyEmailLocationState {
  email?: string;
  notice?: string;
  fromRegister?: boolean;
  fromLogin?: boolean;
}

function emailFromState(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "email" in value &&
    typeof value.email === "string"
  ) {
    return value.email;
  }
  return "";
}

function noticeFromState(value: unknown): string | undefined {
  if (
    typeof value === "object" &&
    value !== null &&
    "notice" in value &&
    typeof value.notice === "string"
  ) {
    return value.notice;
  }
  return undefined;
}

export function VerifyEmailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const locationState = location.state as VerifyEmailLocationState | null;
  const email = useMemo(() => emailFromState(locationState), [locationState]);
  const notice = useMemo(
    () =>
      noticeFromState(locationState) ??
      (locationState?.fromRegister ? AUTH_COPY.verify.accountCreated : ""),
    [locationState],
  );
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string>();
  const [isVerified, setIsVerified] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const otpTimer = useOtp(VERIFY_OTP_SECONDS, OTP_RESEND_LIMIT);
  const isLoading = auth.verifyEmailMutation.isPending;

  useEffect(() => {
    document.title = PAGE_TITLES.verifyEmail;
  }, []);

  const verifyCode = useCallback(
    async (code: string) => {
      if (!email || code.length !== OTP_LENGTH || isLoading || isVerified) {
        return;
      }
      setError(undefined);
      try {
        await auth.verifyEmailMutation.mutateAsync({ email, otp: code });
        setIsVerified(true);
        toast.success(AUTH_COPY.verify.verified);
        window.setTimeout(() => {
          navigate(ROUTES.login, {
            replace: true,
            state: { email, fromVerify: true },
          });
        }, 1200);
      } catch (unknownError: unknown) {
        const apiError = isApiError(unknownError) ? unknownError : undefined;
        if (apiError?.code === "INVALID_OTP") {
          const nextAttempts = Math.max(0, attemptsLeft - 1);
          setAttemptsLeft(nextAttempts);
          setError(`Incorrect code. ${nextAttempts} attempts remaining.`);
          return;
        }
        if (apiError?.code === "OTP_EXPIRED") {
          setError(AUTH_ERRORS.OTP_EXPIRED);
          otpTimer.resetTimer();
          return;
        }
        setError(getAuthErrorMessage(apiError));
      }
    },
    [
      attemptsLeft,
      auth.verifyEmailMutation,
      email,
      isLoading,
      isVerified,
      navigate,
      otpTimer,
    ],
  );

  const resendCode = async () => {
    if (!email || !otpTimer.canResend) {
      return;
    }
    try {
      await auth.resendOtpMutation.mutateAsync(email);
      otpTimer.markResent();
      setOtp("");
      setError(undefined);
      toast.success(`New code sent to ${email}`);
    } catch {
      setError("Unable to send a new code right now. Please try again.");
    }
  };

  if (!email) {
    return <Navigate to={ROUTES.register} replace />;
  }

  return (
    <PageBody>
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"
      >
        <MailCheck className="h-8 w-8" aria-hidden="true" />
      </motion.div>

      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-secondary">
          {isVerified ? AUTH_COPY.verify.verifiedTitle : AUTH_COPY.verify.title}
        </h1>
        {notice && !isVerified ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
            {notice}
          </p>
        ) : null}
        <p className="text-sm text-muted">
          {isVerified
            ? AUTH_COPY.verify.verifiedSubtitle
            : AUTH_COPY.verify.subtitle}
        </p>
        <p className="mx-auto max-w-full truncate text-sm font-semibold text-secondary">
          {email}
        </p>
        {!isVerified ? (
          <Link
            className="inline-flex text-sm font-medium text-primary hover:text-primary-dark"
            to={ROUTES.register}
          >
            {AUTH_COPY.verify.wrongEmail}
          </Link>
        ) : null}
      </div>

      <form
        className="space-y-5"
        aria-busy={isLoading}
        onSubmit={(event) => {
          event.preventDefault();
          void verifyCode(otp);
        }}
      >
        <OtpInput
          value={otp}
          onChange={(value) => {
            setOtp(value);
            if (error) {
              setError(undefined);
            }
          }}
          onComplete={(value) => {
            void verifyCode(value);
          }}
          error={error}
          disabled={otpTimer.maxResendsReached}
          isLoading={isLoading}
          success={isVerified}
        />
        <FormError message={error} className="justify-center text-center" />

        <div className="space-y-3 text-center text-sm">
          <p className="text-muted">Didn't receive the code?</p>
          {otpTimer.maxResendsReached ? (
            <p className="text-danger">
              Maximum resends reached.{" "}
              <Link className="font-medium text-primary" to={ROUTES.register}>
                Please register again.
              </Link>
            </p>
          ) : (
            <Button
              variant="ghost"
              type="button"
              disabled={!otpTimer.canResend || auth.resendOtpMutation.isPending}
              onClick={() => {
                void resendCode();
              }}
            >
              {otpTimer.canResend
                ? "Resend code"
                : `Resend code (${otpTimer.countdown}s)`}
            </Button>
          )}
        </div>

        <LoadingButton
          className="w-full"
          isLoading={isLoading}
          loadingText="Verifying..."
          disabled={otp.length !== OTP_LENGTH || isVerified}
          type="submit"
        >
          Verify email
        </LoadingButton>
      </form>
    </PageBody>
  );
}

function PageBody({ children }: { children: ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}
