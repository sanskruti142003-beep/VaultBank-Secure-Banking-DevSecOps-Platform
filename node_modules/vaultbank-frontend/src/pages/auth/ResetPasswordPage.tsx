import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import toast from "react-hot-toast";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { OtpInput } from "@/components/auth/OtpInput";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { PasswordStrengthBar } from "@/components/auth/PasswordStrengthBar";
import { FormError } from "@/components/common/FormError";
import { LoadingButton } from "@/components/common/LoadingButton";
import { PageTransition } from "@/components/common/PageTransition";
import { Button } from "@/components/ui/button";
import {
  AUTH_COPY,
  AUTH_ERRORS,
  getAuthErrorMessage,
  isApiError,
  PAGE_TITLES,
  ROUTES,
} from "@/constants/auth.constants";
import { useAuth } from "@/hooks/useAuth";
import {
  resetPasswordSchema,
  type ResetPasswordFormValues,
} from "@/lib/validations/auth.schemas";

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

export function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const email = useMemo(() => emailFromState(location.state), [location.state]);
  const [otpError, setOtpError] = useState<string>();
  const [isComplete, setIsComplete] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    mode: "onBlur",
    defaultValues: {
      email,
      otp: "",
      newPassword: "",
      confirmPassword: "",
    },
  });
  const otp = watch("otp");
  const newPassword = watch("newPassword");
  const confirmPassword = watch("confirmPassword");
  const isSubmitting = auth.resetPasswordMutation.isPending;

  useEffect(() => {
    document.title = PAGE_TITLES.resetPassword;
  }, []);

  useEffect(() => {
    if (!isComplete) {
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      navigate(ROUTES.login, {
        replace: true,
        state: { email, fromReset: true },
      });
    }, 2000);
    return () => window.clearTimeout(timeout);
  }, [email, isComplete, navigate]);

  const onSubmit: SubmitHandler<ResetPasswordFormValues> = async (values) => {
    setOtpError(undefined);
    try {
      await auth.resetPasswordMutation.mutateAsync({
        email,
        otp: values.otp,
        newPassword: values.newPassword,
      });
      setIsComplete(true);
      toast.success("Password reset successful. Please sign in.");
    } catch (unknownError: unknown) {
      const apiError = isApiError(unknownError) ? unknownError : undefined;
      if (apiError?.code === "INVALID_OTP") {
        setOtpError("Incorrect code. Please check and try again.");
        setValue("otp", "", { shouldDirty: true, shouldValidate: true });
        return;
      }
      if (apiError?.code === "OTP_EXPIRED") {
        setOtpError(AUTH_ERRORS.OTP_EXPIRED);
        return;
      }
      if (apiError?.code === "PASSWORD_TOO_WEAK") {
        setError("newPassword", {
          type: "server",
          message: AUTH_ERRORS.PASSWORD_TOO_WEAK,
        });
        return;
      }
      toast.error(getAuthErrorMessage(apiError));
    }
  };

  if (!email) {
    return <Navigate to={ROUTES.forgotPassword} replace />;
  }

  if (isComplete) {
    return (
      <PageTransition className="space-y-6 text-center">
        <motion.div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-accent ring-8 ring-emerald-100"
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.24 }}
        >
          <ShieldCheck className="h-8 w-8" aria-hidden="true" />
        </motion.div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-secondary">
            {AUTH_COPY.reset.successTitle}
          </h1>
          <p className="text-sm text-muted">{AUTH_COPY.reset.successSubtitle}</p>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="space-y-6">
      <div className="space-y-4 text-center">
        <motion.div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"
          initial={{ scale: 0.92, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.24 }}
        >
          <ShieldCheck className="h-8 w-8" aria-hidden="true" />
        </motion.div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-secondary">
            {AUTH_COPY.reset.title}
          </h1>
          <p className="text-sm text-muted">{AUTH_COPY.reset.subtitle}</p>
        </div>
      </div>

      <form
        className="space-y-5"
        aria-busy={isSubmitting}
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <input type="hidden" {...register("email")} />
        <div className="space-y-2">
          <OtpInput
            value={otp}
            onChange={(value) => {
              setValue("otp", value, {
                shouldDirty: true,
                shouldValidate: true,
              });
              if (otpError) {
                setOtpError(undefined);
              }
            }}
            error={otpError ?? errors.otp?.message}
            disabled={isSubmitting}
            isLoading={isSubmitting}
          />
          <FormError
            message={otpError ?? errors.otp?.message}
            className="justify-center text-center"
          />
          {otpError === AUTH_ERRORS.OTP_EXPIRED ? (
            <Button
              className="mx-auto flex"
              variant="ghost"
              type="button"
              onClick={() =>
                navigate(ROUTES.forgotPassword, {
                  replace: true,
                  state: { email },
                })
              }
            >
              Request new code
            </Button>
          ) : null}
        </div>

        <PasswordInput
          id="newPassword"
          label="New password"
          placeholder="Min. 12 characters"
          autoComplete="new-password"
          disabled={isSubmitting}
          error={errors.newPassword?.message}
          {...register("newPassword")}
        />
        <PasswordStrengthBar password={newPassword} />

        <PasswordInput
          id="confirmPassword"
          label="Confirm new password"
          placeholder="Re-enter your new password"
          autoComplete="new-password"
          disabled={isSubmitting}
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />
        {confirmPassword && !errors.confirmPassword ? (
          <p className="flex items-center gap-2 text-sm font-medium text-accent">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Passwords match
          </p>
        ) : null}

        <LoadingButton
          className="w-full"
          isLoading={isSubmitting}
          loadingText="Resetting..."
          type="submit"
        >
          Reset password
        </LoadingButton>
      </form>
    </PageTransition>
  );
}
