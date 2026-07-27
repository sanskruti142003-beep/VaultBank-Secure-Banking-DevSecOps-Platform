import { useEffect, useMemo, useState } from "react";
import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  Info,
  Lock,
  PiggyBank,
  Wallet,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ACCOUNT_TYPE_DESCRIPTIONS,
  ACCOUNT_TYPE_LABELS,
  CURRENCY_NAMES,
  formatCurrency,
  getAccountErrorMessage,
  parseMoney,
} from "@/constants/accounts.constants";
import {
  createAccountOpenRequest,
  useAccountApprovalRequests,
  type AccountApprovalRequest,
} from "@/lib/account-approval-store";
import { titleCase } from "@/lib/dashboard-format";
import { openAccountSchema } from "@/lib/validations/accounts.schemas";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { AccountType, Currency } from "@/types/accounts.types";

const accountOptions = [
  {
    type: AccountType.SAVINGS,
    icon: PiggyBank,
    accent: "text-primary bg-primary/10",
    benefits: [
      "Earn interest on deposits",
      "No monthly fee",
      "Instant transfers after KYC",
    ],
  },
  {
    type: AccountType.CURRENT,
    icon: Wallet,
    accent: "text-violet-700 bg-violet-50",
    benefits: [
      "Unlimited transactions",
      "Debit card included",
      "Overdraft facility available",
    ],
  },
  {
    type: AccountType.FIXED,
    icon: Lock,
    accent: "text-amber-700 bg-amber-50",
    benefits: [
      "Fixed terms available",
      "Guaranteed returns",
      "Higher interest than savings",
    ],
  },
];

const currencyOptions = [
  {
    currency: Currency.USD,
    market: "Most popular",
    recommended: true,
  },
  {
    currency: Currency.EUR,
    market: "European markets",
    recommended: false,
  },
  {
    currency: Currency.GBP,
    market: "UK markets",
    recommended: false,
  },
];

export function OpenAccountForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<AccountType | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency | null>(null);
  const [submittedRequest, setSubmittedRequest] =
    useState<AccountApprovalRequest | null>(null);
  const [openingDeposit, setOpeningDeposit] = useState("0");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const auth = useAuth();
  const accountApprovalRequests = useAccountApprovalRequests(auth.user?.id);
  const typeFromUrl = searchParams.get("type");

  useEffect(() => {
    if (
      typeFromUrl &&
      Object.values(AccountType).includes(typeFromUrl as AccountType)
    ) {
      setSelectedType(typeFromUrl as AccountType);
      setStep(2);
    }
  }, [typeFromUrl]);

  const selectedOption = useMemo(
    () => accountOptions.find((option) => option.type === selectedType),
    [selectedType],
  );
  const liveSubmittedRequest = useMemo(
    () =>
      submittedRequest
        ? accountApprovalRequests.find((request) => request.id === submittedRequest.id) ??
          submittedRequest
        : null,
    [accountApprovalRequests, submittedRequest],
  );
  const SelectedAccountIcon = selectedOption?.icon;

  useEffect(() => {
    if (liveSubmittedRequest?.status !== "approved") {
      return undefined;
    }

    const redirectTimer = window.setTimeout(() => {
      navigate("/accounts", { replace: true });
    }, 2500);
    return () => window.clearTimeout(redirectTimer);
  }, [liveSubmittedRequest?.status, navigate]);

  async function submitAccount() {
    setInlineError(null);
    const parsed = openAccountSchema.safeParse({
      type: selectedType,
      currency: selectedCurrency,
    });
    if (!parsed.success) {
      setInlineError("Choose an account type and currency before continuing.");
      return;
    }
    const depositValue = parseMoney(openingDeposit);
    if (depositValue < 0) {
      setInlineError("Opening deposit cannot be negative.");
      return;
    }
    try {
      setIsSubmitting(true);
      const request = createAccountOpenRequest({
        user: auth.user,
        accountType: parsed.data.type,
        currency: parsed.data.currency,
        openingDeposit: depositValue.toFixed(4),
      });
      setSubmittedRequest(request);
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.7 },
      });
    } catch (error) {
      const apiError = error as { code?: string };
      setInlineError(
        apiError.code === "VALIDATION_ERROR"
          ? "Please check your selections and try again."
          : getAccountErrorMessage(apiError.code),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submittedRequest) {
    const request = liveSubmittedRequest ?? submittedRequest;
    const approved = request.status === "approved";
    const rejected = request.status === "rejected";
    const statusTone = approved
      ? "bg-emerald-50 text-emerald-700"
      : rejected
        ? "bg-red-50 text-red-700"
        : "bg-amber-50 text-amber-700";

    return (
      <motion.section
        animate={{ opacity: 1, scale: 1 }}
        className="mx-auto max-w-2xl rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm"
        initial={{ opacity: 0, scale: 0.98 }}
      >
        <motion.div
          animate={{ scale: 1 }}
          className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${statusTone}`}
          initial={{ scale: 0.75 }}
          transition={{ type: "spring", stiffness: 240, damping: 16 }}
        >
          <CheckCircle2 className="h-11 w-11" />
        </motion.div>
        <h2 className="mt-5 text-3xl font-bold text-secondary">
          {approved
            ? "Account approved!"
            : rejected
              ? "Account request rejected"
              : "Request sent to admin"}
        </h2>
        <p className="mt-2 text-muted">
          {approved
            ? `Your ${ACCOUNT_TYPE_LABELS[request.accountType].toLowerCase()} is approved. Redirecting you to Accounts now.`
            : rejected
              ? `Your ${ACCOUNT_TYPE_LABELS[request.accountType].toLowerCase()} request was rejected by admin.`
              : `Your ${ACCOUNT_TYPE_LABELS[request.accountType].toLowerCase()} in ${request.currency} is waiting for admin approval.`}
        </p>
        <div className={`mt-5 rounded-2xl p-4 text-left ${statusTone}`}>
          <p className="text-sm font-medium">Approval status</p>
          <p className="mt-1 text-2xl font-bold">{titleCase(request.status)}</p>
          <p className="mt-2 text-sm">
            {approved
              ? "The account is now available in your customer portal."
              : rejected
                ? "You can submit a new request with updated details."
                : "The account will appear in your account list only after admin approval."}
          </p>
        </div>
        <p className="mt-5 rounded-xl bg-primary/5 px-4 py-3 text-sm text-muted">
          Requested opening deposit:{" "}
          {formatCurrency(
            request.openingDeposit ?? "0",
            request.currency,
          )}
          {request.approvedAccount?.accountNumber
            ? ` - Account ${request.approvedAccount.accountNumber}`
            : ""}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button onClick={() => navigate("/accounts")}>
            {approved ? "Go to accounts now" : "Back to accounts"}
          </Button>
          {!approved ? (
            <Button
              onClick={() => {
                setSubmittedRequest(null);
                setSelectedType(null);
                setSelectedCurrency(null);
                setOpeningDeposit("0");
                setStep(1);
              }}
              variant="outline"
            >
              Submit another request
            </Button>
          ) : null}
        </div>
      </motion.section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Step {step} of 3</p>
          <div className="mt-3 flex gap-2">
            {[1, 2, 3].map((item) => (
              <span
                className={cn(
                  "h-2 w-16 rounded-full",
                  item <= step ? "bg-primary" : "bg-slate-200",
                )}
                key={item}
              />
            ))}
          </div>
        </div>
        {step > 1 ? (
          <Button onClick={() => setStep((current) => current - 1)} variant="ghost">
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
        ) : null}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            initial={{ opacity: 0, x: 16 }}
            key="type"
          >
            <h2 className="text-2xl font-bold text-secondary">
              Choose account type
            </h2>
            <p className="mt-2 text-sm text-muted">
              Select the account that fits how you bank.
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {accountOptions.map((option) => {
                const Icon = option.icon;
                const selected = selectedType === option.type;
                return (
                  <button
                    className={cn(
                      "flex min-h-72 flex-col rounded-2xl border p-5 text-left transition",
                      selected
                        ? "border-2 border-primary bg-primary/5"
                        : "border-slate-200 hover:border-slate-300",
                    )}
                    key={option.type}
                    onClick={() => setSelectedType(option.type)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className={cn("rounded-2xl p-3", option.accent)}>
                        <Icon className="h-7 w-7" />
                      </div>
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full border",
                          selected
                            ? "border-primary bg-primary text-white"
                            : "border-slate-300 bg-white",
                        )}
                      >
                        {selected ? <Check className="h-4 w-4" /> : null}
                      </span>
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-secondary">
                      {ACCOUNT_TYPE_LABELS[option.type]}
                    </h3>
                    <p className="mt-2 text-sm text-muted">
                      {ACCOUNT_TYPE_DESCRIPTIONS[option.type]}
                    </p>
                    <ul className="mt-5 space-y-2 text-sm text-muted">
                      {option.benefits.map((benefit) => (
                        <li className="flex gap-2" key={benefit}>
                          <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                          <span>{benefit}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
            <Button
              className="mt-6 w-full sm:w-auto"
              disabled={!selectedType}
              onClick={() => setStep(2)}
            >
              Continue
            </Button>
          </motion.div>
        ) : null}

        {step === 2 ? (
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            initial={{ opacity: 0, x: 16 }}
            key="currency"
          >
            <h2 className="text-2xl font-bold text-secondary">
              Choose your currency
            </h2>
            <p className="mt-2 text-sm text-muted">
              Select the currency for this account.
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {currencyOptions.map((option) => {
                const selected = selectedCurrency === option.currency;
                return (
                  <button
                    className={cn(
                      "rounded-2xl border p-5 text-left transition",
                      selected
                        ? "border-2 border-primary bg-primary/5"
                        : "border-slate-200 hover:border-slate-300",
                    )}
                    key={option.currency}
                    onClick={() => setSelectedCurrency(option.currency)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xl font-bold text-secondary">
                          {option.currency}
                        </p>
                        <p className="mt-1 text-sm text-muted">
                          {CURRENCY_NAMES[option.currency]}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full border",
                          selected
                            ? "border-primary bg-primary text-white"
                            : "border-slate-300 bg-white",
                        )}
                      >
                        {selected ? <Check className="h-4 w-4" /> : null}
                      </span>
                    </div>
                    <p className="mt-4 text-sm text-muted">{option.market}</p>
                    {option.recommended ? (
                      <span className="mt-4 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        Recommended
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <Button
              className="mt-6 w-full sm:w-auto"
              disabled={!selectedCurrency}
              onClick={() => setStep(3)}
            >
              Continue
            </Button>
          </motion.div>
        ) : null}

        {step === 3 ? (
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            initial={{ opacity: 0, x: 16 }}
            key="confirm"
          >
            <h2 className="text-2xl font-bold text-secondary">
              Confirm your account
            </h2>
            <p className="mt-2 text-sm text-muted">
              Review the details before opening.
            </p>
            <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-5">
              {selectedOption && SelectedAccountIcon ? (
                <div className={cn("inline-flex rounded-2xl p-4", selectedOption.accent)}>
                  <SelectedAccountIcon className="h-8 w-8" />
                </div>
              ) : null}
              <h3 className="mt-4 text-xl font-semibold text-secondary">
                {selectedType ? ACCOUNT_TYPE_LABELS[selectedType] : "Account"}
              </h3>
              <p className="mt-1 text-sm text-muted">
                {selectedCurrency ? CURRENCY_NAMES[selectedCurrency] : ""}{" "}
                {selectedCurrency ? `(${selectedCurrency})` : ""}
              </p>
              <dl className="mt-5 grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted">Opening balance</dt>
                  <dd className="font-semibold text-secondary">
                    {selectedCurrency
                      ? formatCurrency(openingDeposit, selectedCurrency)
                      : "$0.00"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted">Monthly fee</dt>
                  <dd className="font-semibold text-secondary">Free</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted">Interest rate</dt>
                  <dd className="font-semibold text-secondary">
                    {selectedType === AccountType.FIXED ? "4.8% APY" : "3.5% APY"}
                  </dd>
                </div>
              </dl>
              <label className="mt-5 block border-t border-slate-200 pt-5 text-sm font-semibold text-secondary">
                Add opening deposit
                <Input
                  className="mt-2"
                  min="0"
                  onChange={(event) => setOpeningDeposit(event.target.value)}
                  placeholder="Enter amount to add"
                  step="0.01"
                  type="number"
                  value={openingDeposit}
                />
                <span className="mt-2 block text-xs font-normal text-muted">
                  Leave it as 0 if you want to add money later.
                </span>
              </label>
              <div className="mt-5 border-t border-slate-200 pt-5">
                <p className="flex items-center gap-2 text-sm font-semibold text-secondary">
                  <Info className="h-4 w-4 text-primary" />
                  What happens next
                </p>
                <ol className="mt-3 space-y-2 text-sm text-muted">
                  <li>1. Request is sent to admin</li>
                  <li>2. Admin approves or rejects the account</li>
                  <li>3. Approved accounts appear in your account list</li>
                  <li>4. Notifications update when admin completes review</li>
                </ol>
              </div>
            </div>
            <button
              className="mt-4 text-sm font-semibold text-primary hover:text-primary-dark"
              onClick={() => setStep(1)}
              type="button"
            >
              Edit selections
            </button>
            <p className="mt-5 text-xs leading-5 text-muted">
              By submitting this request you agree to our Account Terms and
              Conditions. Account usage starts only after admin approval.
            </p>
            {inlineError ? (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">
                {inlineError}
              </p>
            ) : null}
            <Button
              className="mt-5 w-full"
              disabled={isSubmitting}
              onClick={() => void submitAccount()}
              size="lg"
            >
              {isSubmitting ? "Sending request..." : "Send for admin approval"}
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
