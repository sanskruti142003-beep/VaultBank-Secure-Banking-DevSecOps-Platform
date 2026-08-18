import { zodResolver } from "@hookform/resolvers/zod";
import { AsYouType, type CountryCode } from "libphonenumber-js/min";
import {
  CheckCircle2,
  ChevronLeft,
  Mail,
  Phone,
  User,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { FormError } from "@/components/common/FormError";
import { LoadingButton } from "@/components/common/LoadingButton";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { PasswordStrengthBar } from "@/components/auth/PasswordStrengthBar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AUTH_COPY,
  getAuthErrorMessage,
  isApiError,
  ROUTES,
} from "@/constants/auth.constants";
import { useAuth } from "@/hooks/useAuth";
import {
  registerSchema,
  type RegisterFormValues,
} from "@/lib/validations/auth.schemas";
import { cn, normalizePhone } from "@/lib/utils";

type Step = 1 | 2;
type AvailabilityStatus =
  | "idle"
  | "checking"
  | "available"
  | "taken"
  | "unknown";

const countries: Array<{ code: CountryCode; label: string; prefix: string }> = [
  { code: "US", label: "US", prefix: "+1" },
  { code: "GB", label: "GB", prefix: "+44" },
  { code: "IN", label: "IN", prefix: "+91" },
];

export function RegisterForm() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [usernameStatus, setUsernameStatus] =
    useState<AvailabilityStatus>("idle");
  const [emailStatus, setEmailStatus] = useState<AvailabilityStatus>("idle");
  const [phoneStatus, setPhoneStatus] = useState<AvailabilityStatus>("idle");
  const [country, setCountry] = useState<CountryCode>("US");
  const firstStepRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const {
    register,
    handleSubmit,
    trigger,
    setError,
    clearErrors,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    mode: "onBlur",
    defaultValues: {
      fullName: "",
      username: "",
      email: "",
      phone: "+1",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
    },
  });

  const password = watch("password");
  const confirmPassword = watch("confirmPassword");
  const isSubmitting = auth.registerMutation.isPending;
  const fullNameRegistration = register("fullName");
  const usernameRegistration = register("username");
  const emailRegistration = register("email");
  const phoneRegistration = register("phone");
  const passwordRegistration = register("password");

  useEffect(() => {
    if (step === 1) {
      firstStepRef.current?.focus();
    } else {
      passwordRef.current?.focus();
    }
  }, [step]);

  const continueToSecurity = async () => {
    const isValid = await trigger(["fullName", "username", "email", "phone"]);
    if (!isValid) {
      return;
    }

    const [usernameAvailable, emailAvailable, phoneAvailable] =
      await Promise.all([
        usernameStatus === "available"
          ? true
          : usernameStatus === "taken"
            ? false
            : checkUsername(),
        emailStatus === "available"
          ? true
          : emailStatus === "taken"
            ? false
            : checkEmail(),
        phoneStatus === "available"
          ? true
          : phoneStatus === "taken"
            ? false
            : checkPhone(),
      ]);

    if (
      usernameAvailable !== false &&
      emailAvailable !== false &&
      phoneAvailable !== false
    ) {
      setStep(2);
    }
  };

  const checkUsername = async (): Promise<boolean | null> => {
    const isUsernameValid = await trigger("username");
    if (!isUsernameValid) {
      return false;
    }
    const username = getValues("username").trim().toLowerCase();
    setUsernameStatus("checking");
    try {
      const available = await auth.checkUsernameMutation.mutateAsync(username);
      if (getValues("username").trim().toLowerCase() !== username) {
        return null;
      }
      if (available === null) {
        setUsernameStatus("unknown");
        return null;
      }
      setUsernameStatus(available ? "available" : "taken");
      if (!available) {
        setError("username", {
          type: "validate",
          message: "This username is already taken.",
        });
      } else {
        clearErrors("username");
      }
      return available;
    } catch {
      setUsernameStatus("unknown");
      return null;
    }
  };

  const checkEmail = async (): Promise<boolean | null> => {
    const isEmailValid = await trigger("email");
    if (!isEmailValid) {
      return false;
    }
    const email = getValues("email").trim().toLowerCase();
    setEmailStatus("checking");
    try {
      const available = await auth.checkEmailMutation.mutateAsync(email);
      if (getValues("email").trim().toLowerCase() !== email) {
        return null;
      }
      if (available === null) {
        setEmailStatus("unknown");
        return null;
      }
      setEmailStatus(available ? "available" : "taken");
      if (!available) {
        setError("email", {
          type: "validate",
          message: "An account with this email already exists.",
        });
      } else {
        clearErrors("email");
      }
      return available;
    } catch {
      setEmailStatus("unknown");
      return null;
    }
  };

  const checkPhone = async (): Promise<boolean | null> => {
    const isPhoneValid = await trigger("phone");
    if (!isPhoneValid) {
      return false;
    }
    const phone = normalizePhone(getValues("phone"));
    setPhoneStatus("checking");
    try {
      const available = await auth.checkPhoneMutation.mutateAsync(phone);
      if (normalizePhone(getValues("phone")) !== phone) {
        return null;
      }
      if (available === null) {
        setPhoneStatus("unknown");
        return null;
      }
      setPhoneStatus(available ? "available" : "taken");
      if (!available) {
        setError("phone", {
          type: "validate",
          message: "This mobile number is already registered.",
        });
      } else {
        clearErrors("phone");
      }
      return available;
    } catch {
      setPhoneStatus("unknown");
      return null;
    }
  };

  const onSubmit: SubmitHandler<RegisterFormValues> = async (values) => {
    try {
      await auth.registerMutation.mutateAsync({
        username: values.username,
        fullName: values.fullName,
        email: values.email,
        phone: normalizePhone(values.phone),
        password: values.password,
      });
      toast.success(AUTH_COPY.verify.accountCreated);
      navigate(ROUTES.verifyEmail, {
        replace: true,
        state: {
          email: values.email,
          username: values.username,
          fromRegister: true,
          notice: AUTH_COPY.verify.accountCreated,
        },
      });
    } catch (error: unknown) {
      const apiError = isApiError(error) ? error : undefined;
      if (
        apiError?.code === "EMAIL_ALREADY_EXISTS" ||
        (apiError?.status === 409 &&
          apiError.message.toLowerCase().includes("email"))
      ) {
        setStep(1);
        setEmailStatus("taken");
        setError("email", {
          type: "server",
          message: "An account with this email already exists.",
        });
        return;
      }
      if (apiError?.code === "USERNAME_ALREADY_EXISTS") {
        setStep(1);
        setUsernameStatus("taken");
        setError("username", {
          type: "server",
          message: "This username is already taken.",
        });
        return;
      }
      if (apiError?.code === "PHONE_ALREADY_EXISTS") {
        setStep(1);
        setPhoneStatus("taken");
        setError("phone", {
          type: "server",
          message: "This mobile number is already registered.",
        });
        return;
      }
      toast.error(getAuthErrorMessage(apiError));
    }
  };

  const handlePhoneChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const formatter = new AsYouType(country);
    const formatted = formatter.input(event.target.value);
    setPhoneStatus("idle");
    clearErrors("phone");
    setValue("phone", formatted, { shouldDirty: true, shouldValidate: false });
  };

  return (
    <form
      className="space-y-6"
      onSubmit={handleSubmit(onSubmit)}
      aria-busy={isSubmitting}
      noValidate
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-secondary">Step {step} of 2</span>
          <span className="text-muted">
            {step === 1 ? "Personal info" : "Security"}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className={cn(
              "h-full rounded-full bg-primary transition-all duration-200",
              step === 1 ? "w-1/2" : "w-full",
            )}
          />
        </div>
      </div>

      {step === 1 ? (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-secondary"
              htmlFor="fullName"
            >
              Full name
            </label>
            <div className="relative">
              <User
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                id="fullName"
                className="pl-10"
                placeholder="John Smith"
                autoComplete="name"
                disabled={isSubmitting}
                hasError={Boolean(errors.fullName)}
                aria-invalid={Boolean(errors.fullName)}
                aria-describedby={
                  errors.fullName ? "fullName-error" : undefined
                }
                {...fullNameRegistration}
                ref={(node) => {
                  fullNameRegistration.ref(node);
                  firstStepRef.current = node;
                }}
              />
            </div>
            <FormError id="fullName-error" message={errors.fullName?.message} />
          </div>

          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-secondary"
              htmlFor="username"
            >
              Username
            </label>
            <div className="relative">
              <User
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                id="username"
                className="pl-10 pr-10"
                placeholder="john.smith"
                autoComplete="username"
                autoCorrect="off"
                spellCheck={false}
                disabled={isSubmitting}
                hasError={Boolean(errors.username)}
                aria-invalid={Boolean(errors.username)}
                aria-describedby={
                  errors.username ? "username-error" : undefined
                }
                {...usernameRegistration}
                onBlur={(event) => {
                  usernameRegistration.onBlur(event);
                  void checkUsername();
                }}
                onChange={(event) => {
                  usernameRegistration.onChange(event);
                  setUsernameStatus("idle");
                  clearErrors("username");
                }}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                {usernameStatus === "checking" ? (
                  <span className="block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                ) : null}
                {usernameStatus === "available" ? (
                  <CheckCircle2 className="h-5 w-5 text-accent" />
                ) : null}
                {usernameStatus === "taken" ? (
                  <XCircle className="h-5 w-5 text-danger" />
                ) : null}
              </span>
            </div>
            <FormError
              id="username-error"
              message={errors.username?.message}
            />
            {usernameStatus === "unknown" && !errors.username ? (
              <p className="text-sm text-muted">
                Username availability will be confirmed when you submit.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-secondary"
              htmlFor="email"
            >
              Email address
            </label>
            <div className="relative">
              <Mail
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                id="email"
                className="pl-10 pr-10"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                disabled={isSubmitting}
                hasError={Boolean(errors.email)}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={
                  errors.email ? "register-email-error" : undefined
                }
                {...emailRegistration}
                onBlur={(event) => {
                  emailRegistration.onBlur(event);
                  void checkEmail();
                }}
                onChange={(event) => {
                  emailRegistration.onChange(event);
                  setEmailStatus("idle");
                  clearErrors("email");
                }}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                {emailStatus === "checking" ? (
                  <span className="block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                ) : null}
                {emailStatus === "available" ? (
                  <CheckCircle2 className="h-5 w-5 text-accent" />
                ) : null}
                {emailStatus === "taken" ? (
                  <XCircle className="h-5 w-5 text-danger" />
                ) : null}
              </span>
            </div>
            <FormError
              id="register-email-error"
              message={errors.email?.message}
            />
            {emailStatus === "unknown" && !errors.email ? (
              <p className="text-sm text-muted">
                Email availability will be confirmed when you submit.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-secondary"
              htmlFor="phone"
            >
              Phone number
            </label>
            <div className="flex gap-2">
              <select
                className="h-11 rounded-lg border border-border bg-white px-3 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={country}
                disabled={isSubmitting}
                aria-label="Country code"
                onChange={(event) => {
                  const selected = countries.find(
                    (item) => item.code === event.target.value,
                  );
                  if (selected) {
                    setCountry(selected.code);
                    setPhoneStatus("idle");
                    clearErrors("phone");
                    setValue("phone", selected.prefix, {
                      shouldDirty: true,
                      shouldValidate: false,
                    });
                  }
                }}
              >
                {countries.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label} {item.prefix}
                  </option>
                ))}
              </select>
              <div className="relative min-w-0 flex-1">
                <Phone
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                  aria-hidden="true"
                />
                <Input
                  id="phone"
                  className="pl-10 pr-10"
                  placeholder="+1 555 000 0000"
                  autoComplete="tel"
                  disabled={isSubmitting}
                  hasError={Boolean(errors.phone)}
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={errors.phone ? "phone-error" : undefined}
                  {...phoneRegistration}
                  onBlur={(event) => {
                    phoneRegistration.onBlur(event);
                    void checkPhone();
                  }}
                  onChange={(event) => {
                    phoneRegistration.onChange(event);
                    handlePhoneChange(event);
                  }}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {phoneStatus === "checking" ? (
                    <span className="block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  ) : null}
                  {phoneStatus === "available" ? (
                    <CheckCircle2 className="h-5 w-5 text-accent" />
                  ) : null}
                  {phoneStatus === "taken" ? (
                    <XCircle className="h-5 w-5 text-danger" />
                  ) : null}
                </span>
              </div>
            </div>
            <FormError id="phone-error" message={errors.phone?.message} />
            {phoneStatus === "unknown" && !errors.phone ? (
              <p className="text-sm text-muted">
                Phone availability will be confirmed when you submit.
              </p>
            ) : null}
          </div>

          <Button className="w-full" type="button" onClick={continueToSecurity}>
            Continue
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <Button
            className="-ml-3 text-muted hover:text-secondary"
            variant="ghost"
            type="button"
            onClick={() => setStep(1)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </Button>

          <PasswordInput
            id="password"
            label="Create password"
            placeholder="Min. 12 characters"
            autoComplete="new-password"
            disabled={isSubmitting}
            error={errors.password?.message}
            {...passwordRegistration}
            ref={(node) => {
              passwordRegistration.ref(node);
              passwordRef.current = node;
            }}
          />
          <PasswordStrengthBar password={password} />

          <PasswordInput
            id="confirmPassword"
            label="Confirm password"
            placeholder="Re-enter your password"
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

          <div className="space-y-2">
            <label className="flex items-start gap-3 text-sm text-muted">
              <input
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                type="checkbox"
                disabled={isSubmitting}
                {...register("acceptTerms")}
              />
              <span>
                I agree to the{" "}
                <a
                  className="font-medium text-primary hover:text-primary-dark"
                  href="/terms"
                  target="_blank"
                  rel="noreferrer"
                >
                  Terms of Service
                </a>{" "}
                and{" "}
                <a
                  className="font-medium text-primary hover:text-primary-dark"
                  href="/privacy"
                  target="_blank"
                  rel="noreferrer"
                >
                  Privacy Policy
                </a>
              </span>
            </label>
            <FormError message={errors.acceptTerms?.message} />
          </div>

          <LoadingButton
            className="w-full"
            isLoading={isSubmitting}
            loadingText={AUTH_COPY.register.submitting}
            type="submit"
          >
            {AUTH_COPY.register.submit}
          </LoadingButton>
        </div>
      )}

      {errors.email?.message ===
      "An account with this email already exists." ? (
        <p className="text-center text-sm text-muted">
          An account with this email already exists.{" "}
          <Link
            className="font-medium text-primary hover:text-primary-dark"
            to={ROUTES.login}
            state={{ username: watch("username") }}
          >
            Sign in instead
          </Link>
        </p>
      ) : null}
    </form>
  );
}
