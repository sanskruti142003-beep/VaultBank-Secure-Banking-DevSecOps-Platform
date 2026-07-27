import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, LockKeyhole, Mail, MailCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import toast from "react-hot-toast";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BackButton } from "@/components/common/BackButton";
import { FormError } from "@/components/common/FormError";
import { LoadingButton } from "@/components/common/LoadingButton";
import { PageTransition } from "@/components/common/PageTransition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AUTH_COPY,
  OTP_RESEND_LIMIT,
  PAGE_TITLES,
  RESET_OTP_SECONDS,
  ROUTES,
} from "@/constants/auth.constants";
import { useAuth } from "@/hooks/useAuth";
import { useOtp } from "@/hooks/useOtp";
import {
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
} from "@/lib/validations/auth.schemas";

type ForgotStep = "email" | "sent";

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

export function ForgotPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const defaultEmail = useMemo(() => emailFromState(location.state), [location.state]);
  const [step, setStep] = useState<ForgotStep>("email");
  const [sentEmail, setSentEmail] = useState(defaultEmail);
  const otpTimer = useOtp(RESET_OTP_SECONDS, OTP_RESEND_LIMIT);
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: defaultEmail,
    },
  });
  const isSubmitting = auth.forgotPasswordMutation.isPending;

  useEffect(() => {
    document.title = PAGE_TITLES.forgotPassword;
  }, []);

  const onSubmit: SubmitHandler<ForgotPasswordFormValues> = async (values) => {
    await auth.forgotPasswordMutation.mutateAsync(values.email);
    setSentEmail(values.email);
    setStep("sent");
    otpTimer.resetResends();
    toast.success("Reset code sent if the email exists.");
  };

  const resendCode = async () => {
    if (!sentEmail || !otpTimer.canResend) {
      return;
    }
    await auth.forgotPasswordMutation.mutateAsync(sentEmail);
    otpTimer.markResent();
    toast.success(`New reset code sent to ${sentEmail}`);
  };

  return (
    <PageTransition>
      <AnimatePresence mode="wait">
        {step === "email" ? (
          <motion.div
            key="email-step"
            className="space-y-6"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <BackButton to={ROUTES.login} label="Back to login" />
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <LockKeyhole className="h-8 w-8" aria-hidden="true" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight text-secondary">
                  {AUTH_COPY.forgot.title}
                </h1>
                <p className="text-sm text-muted">{AUTH_COPY.forgot.subtitle}</p>
              </div>
            </div>

            <form
              className="space-y-5"
              onSubmit={handleSubmit(onSubmit)}
              aria-busy={isSubmitting}
              noValidate
            >
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-secondary" htmlFor="forgot-email">
                  Email address
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                    aria-hidden="true"
                  />
                  <Input
                    id="forgot-email"
                    className="pl-10"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    disabled={isSubmitting}
                    hasError={Boolean(errors.email)}
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? "forgot-email-error" : undefined}
                    {...register("email")}
                  />
                </div>
                <FormError id="forgot-email-error" message={errors.email?.message} />
              </div>

              <LoadingButton
                className="w-full"
                isLoading={isSubmitting}
                loadingText="Sending..."
                type="submit"
              >
                Send reset code
              </LoadingButton>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="sent-step"
            className="space-y-6 text-center"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <motion.div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-accent"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
            >
              <MailCheck className="h-8 w-8" aria-hidden="true" />
            </motion.div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-secondary">
                {AUTH_COPY.forgot.sentTitle}
              </h1>
              <p className="text-sm text-muted">
                We sent a code to{" "}
                <span className="font-semibold text-secondary">{sentEmail}</span>.
                {AUTH_COPY.forgot.sentSubtitle}
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() =>
                navigate(ROUTES.resetPassword, {
                  replace: true,
                  state: { email: sentEmail },
                })
              }
            >
              Enter reset code
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <div className="space-y-3 text-sm">
              {otpTimer.maxResendsReached ? (
                <p className="text-danger">
                  Maximum resends reached.{" "}
                  <Link className="font-medium text-primary" to={ROUTES.login}>
                    Back to login
                  </Link>
                </p>
              ) : (
                <Button
                  variant="ghost"
                  type="button"
                  disabled={!otpTimer.canResend || isSubmitting}
                  onClick={() => {
                    void resendCode();
                  }}
                >
                  {otpTimer.canResend
                    ? "Resend code"
                    : `Resend code (${otpTimer.countdown}s)`}
                </Button>
              )}
              <button
                className="block w-full text-sm font-medium text-primary hover:text-primary-dark"
                type="button"
                onClick={() => {
                  reset({ email: "" });
                  setStep("email");
                }}
              >
                Try a different email
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
