import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Lock,
  MoreVertical,
  Plus,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import { accountsApi } from "@/api/accounts.api";
import {
  DashboardCard,
  StatusPill,
} from "@/components/dashboard/DashboardCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatCurrency,
  getAccountLast4,
  parseMoney,
  VAULTBANK_IFSC_CODE,
} from "@/constants/accounts.constants";
import { useAccounts } from "@/hooks/useAccounts";
import { useAuth } from "@/hooks/useAuth";
import { useAddBeneficiary, useBeneficiaries } from "@/hooks/useBeneficiaries";
import { useCreatePayment, usePayments, useSendPaymentOtp } from "@/hooks/usePayments";
import { accountDisplayName, paymentStatusTone, titleCase } from "@/lib/dashboard-format";
import { cn } from "@/lib/utils";
import { AccountStatus, KycStatus, type Account } from "@/types/accounts.types";
import { Currency } from "@/types/accounts.types";
import { PaymentGateway } from "@/types/payments.types";

const selectClass =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-secondary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

type PaymentOutcome = {
  message: string;
  status: "failed" | "success";
};

function maskedEmail(email: string | null | undefined): string {
  if (!email) {
    return "registered email";
  }
  const [name, domain] = email.split("@");
  if (!domain) {
    return "registered email";
  }
  return `${name.slice(0, 2)}***@${domain}`;
}

function accountOptionLabel(account: Account) {
  return `${accountDisplayName(account)} - ${getAccountLast4(account.accountNumber)}`;
}

function messageFromError(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (status === 429) {
      return "Too many account checks. Please wait a moment, then try again.";
    }
  }
  if (error instanceof Error) {
    if (error.message.includes("429")) {
      return "Too many account checks. Please wait a moment, then try again.";
    }
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return fallback;
}

export function PaymentsPage() {
  const [searchParams] = useSearchParams();
  const { accounts } = useAccounts();
  const initialFrom = searchParams.get("from") ?? "";
  const [fromAccountId, setFromAccountId] = useState(initialFrom);
  const [beneficiaryId, setBeneficiaryId] = useState("");
  const [isAddingNewBeneficiary, setIsAddingNewBeneficiary] = useState(false);
  const [destinationAccount, setDestinationAccount] = useState<Account | null>(null);
  const [resolvedBeneficiaryAccounts, setResolvedBeneficiaryAccounts] = useState<
    Record<string, Account>
  >({});
  const [isResolvingBeneficiary, setIsResolvingBeneficiary] = useState(false);
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("family");
  const [remarks, setRemarks] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [bankName, setBankName] = useState("VaultBank");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [otpOpen, setOtpOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpSeconds, setOtpSeconds] = useState(120);
  const [inlineError, setInlineError] = useState("");
  const [otpError, setOtpError] = useState("");
  const [paymentOutcome, setPaymentOutcome] = useState<PaymentOutcome | null>(null);
  const auth = useAuth();
  const navigate = useNavigate();
  const { createPayment, isPending } = useCreatePayment();
  const { sendPaymentOtp, isPending: isSendingOtp } = useSendPaymentOtp();
  const { payments } = usePayments(1, 5);
  const { refetch: refetchProfile } = auth.meQuery;

  const fromAccount = accounts.find((account) => account.id === fromAccountId);
  const { beneficiaries } = useBeneficiaries(fromAccountId || undefined);
  const { addBeneficiary, isPending: isAddingBeneficiary } = useAddBeneficiary(
    fromAccountId,
  );
  const registeredEmail = auth.user?.email ?? auth.meQuery.data?.email;
  const currentUserName =
    auth.user?.fullName ?? auth.meQuery.data?.fullName ?? "Current customer";
  const ownRecipientAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.id !== fromAccountId &&
          account.status !== AccountStatus.CLOSED,
      ),
    [accounts, fromAccountId],
  );
  const recipientOptions = useMemo(
    () => [
      ...ownRecipientAccounts.map((account) => ({
        id: `own:${account.id}`,
        type: "own" as const,
        label: accountDisplayName(account),
        name: currentUserName,
        accountNumber: account.accountNumber,
        account,
      })),
      ...beneficiaries.map((beneficiary) => ({
        id: `beneficiary:${beneficiary.id}`,
        type: "beneficiary" as const,
        label: beneficiary.name,
        name: beneficiary.name,
        accountNumber: beneficiary.beneficiaryAccountNumber,
        beneficiary,
      })),
    ],
    [beneficiaries, currentUserName, ownRecipientAccounts],
  );
  const selectedRecipient = recipientOptions.find(
    (recipient) => recipient.id === beneficiaryId,
  );
  const selectedRecipientId = selectedRecipient?.id ?? "";
  const selectedRecipientType = selectedRecipient?.type ?? "";
  const selectedRecipientName = selectedRecipient?.name ?? "";
  const selectedRecipientAccountNumber = selectedRecipient?.accountNumber ?? "";
  const selectedOwnRecipientAccount =
    selectedRecipient?.type === "own" ? selectedRecipient.account : null;
  const availableBalance = parseMoney(fromAccount?.balance);

  useEffect(() => {
    if (auth.accessToken) {
      void refetchProfile();
    }
  }, [auth.accessToken, refetchProfile]);

  useEffect(() => {
    if (
      accounts[0] &&
      (!fromAccountId || !accounts.some((account) => account.id === fromAccountId))
    ) {
      setFromAccountId(accounts[0].id);
    }
  }, [accounts, fromAccountId]);

  useEffect(() => {
    if (isAddingNewBeneficiary) {
      return;
    }
    if (!recipientOptions.length) {
      setBeneficiaryId("");
      return;
    }
    if (
      !beneficiaryId ||
      !recipientOptions.some((recipient) => recipient.id === beneficiaryId)
    ) {
      setBeneficiaryId(recipientOptions[0].id);
    }
  }, [beneficiaryId, isAddingNewBeneficiary, recipientOptions]);

  useEffect(() => {
    if (isAddingNewBeneficiary) {
      setDestinationAccount(null);
      setIsResolvingBeneficiary(false);
      return undefined;
    }
    if (!selectedRecipientId) {
      setDestinationAccount(null);
      return undefined;
    }

    setBankName("VaultBank");
    setAccountNumber(selectedRecipientAccountNumber);
    setConfirmAccountNumber(selectedRecipientAccountNumber);
    setBeneficiaryName(selectedRecipientName);

    if (selectedRecipientType === "own" && selectedOwnRecipientAccount) {
      setDestinationAccount(selectedOwnRecipientAccount);
      setInlineError("");
      setIsResolvingBeneficiary(false);
      return undefined;
    }

    const cachedAccount =
      resolvedBeneficiaryAccounts[selectedRecipientAccountNumber];
    if (cachedAccount) {
      setDestinationAccount(cachedAccount);
      setBeneficiaryName(cachedAccount.ownerName ?? selectedRecipientName);
      setInlineError("");
      setIsResolvingBeneficiary(false);
      return undefined;
    }

    let cancelled = false;
    setIsResolvingBeneficiary(true);
    accountsApi
      .getByAccountNumber(selectedRecipientAccountNumber)
      .then((account) => {
        if (!cancelled) {
          setDestinationAccount(account);
          setResolvedBeneficiaryAccounts((current) => ({
            ...current,
            [selectedRecipientAccountNumber]: account,
          }));
          setBeneficiaryName(account.ownerName ?? selectedRecipientName);
          setInlineError("");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setDestinationAccount(null);
          setInlineError(
            messageFromError(
              error,
              "This beneficiary account could not be found. Please check the account number.",
            ),
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsResolvingBeneficiary(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    isAddingNewBeneficiary,
    resolvedBeneficiaryAccounts,
    selectedOwnRecipientAccount,
    selectedRecipientAccountNumber,
    selectedRecipientId,
    selectedRecipientName,
    selectedRecipientType,
  ]);

  useEffect(() => {
    if (!otpOpen || otpSeconds <= 0) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setOtpSeconds((seconds) => Math.max(seconds - 1, 0));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [otpOpen, otpSeconds]);

  const recentPayments = payments;

  const amountValue = parseMoney(amount);
  const recipientAccountNumber = accountNumber.trim();
  const transferBlockReason = (() => {
    if (!fromAccount) {
      return "Select the account you want to transfer from.";
    }
    if (fromAccount.status !== AccountStatus.ACTIVE) {
      return "The source account must be active before transfer.";
    }
    if (fromAccount.kycStatus !== KycStatus.APPROVED) {
      return "Complete eKYC before making a transfer.";
    }
    if (amountValue <= 0) {
      return "Enter an amount greater than zero to continue.";
    }
    if (availableBalance < amountValue) {
      return "Insufficient balance for this transfer.";
    }
    if (recipientAccountNumber !== confirmAccountNumber.trim()) {
      return "Account numbers do not match.";
    }
    if (!/^\d{8,20}$/.test(recipientAccountNumber)) {
      return "Select a beneficiary or enter a valid account number.";
    }
    if (isResolvingBeneficiary) {
      return "Checking beneficiary account...";
    }
    if (destinationAccount) {
      if (fromAccount.id === destinationAccount.id) {
        return "Choose a different account to receive the transfer.";
      }
      if (destinationAccount.status !== AccountStatus.ACTIVE) {
        return "The beneficiary account must be active before transfer.";
      }
      if (destinationAccount.currency !== fromAccount.currency) {
        return "The beneficiary account currency must match your account.";
      }
    }
    return "";
  })();
  const canProceedToVerify = !transferBlockReason;

  async function latestRegisteredEmail(): Promise<string> {
    const fallbackEmail = registeredEmail?.trim() ?? "";
    if (!auth.accessToken) {
      return fallbackEmail;
    }

    try {
      const result = await refetchProfile();
      if (result.data) {
        auth.setUser(result.data);
      }
      return result.data?.email?.trim() || fallbackEmail;
    } catch {
      return fallbackEmail;
    }
  }

  async function sendTransferOtp(errorTarget: "inline" | "otp"): Promise<boolean> {
    const email = await latestRegisteredEmail();
    if (!email) {
      const message = "Add an email address to your profile before making a transfer.";
      if (errorTarget === "otp") {
        setOtpError(message);
      } else {
        setInlineError(message);
      }
      return false;
    }
    try {
      const response = await sendPaymentOtp({ email });
      if (response.deliveryStatus === "blocked") {
        if (errorTarget === "otp") {
          setOtpError(response.message);
        } else {
          setInlineError(response.message);
        }
        toast.error(response.message);
        return false;
      }
      setOtp("");
      setOtpSeconds(response.expiresInSeconds);
      setOtpError("");
      setInlineError("");
      setPaymentOutcome(null);
      toast.success(`OTP sent to ${maskedEmail(response.email)}.`);
      return true;
    } catch (error) {
      const message = messageFromError(
        error,
        "OTP could not be sent. Please try again.",
      );
      if (errorTarget === "otp") {
        setOtpError(message);
      } else {
        setInlineError(message);
      }
      return false;
    }
  }

  function closeOtpPanel() {
    setOtpOpen(false);
    setOtp("");
    setOtpError("");
  }

  function startNewBeneficiary() {
    setIsAddingNewBeneficiary(true);
    setBeneficiaryId("");
    setDestinationAccount(null);
    setBeneficiaryName("");
    setBankName("VaultBank");
    setAccountNumber("");
    setConfirmAccountNumber("");
    setInlineError("");
    toast("Enter the beneficiary details, then save.");
  }

  function cancelNewBeneficiary() {
    setIsAddingNewBeneficiary(false);
    setInlineError("");
    if (recipientOptions[0]) {
      setBeneficiaryId(recipientOptions[0].id);
    }
  }

  async function proceed(event: FormEvent) {
    event.preventDefault();
    setInlineError("");
    setPaymentOutcome(null);
    let resolvedDestination = destinationAccount;
    if (!fromAccount) {
      setInlineError("Please select the account you want to transfer from.");
      return;
    }
    if (fromAccount.status !== AccountStatus.ACTIVE) {
      setInlineError("The source account must be active before transfer.");
      return;
    }
    if (fromAccount.kycStatus !== KycStatus.APPROVED) {
      setInlineError("Complete eKYC before making a transfer.");
      return;
    }
    if (amountValue <= 0) {
      setInlineError("Enter an amount greater than zero.");
      return;
    }
    if (availableBalance < amountValue) {
      setInlineError("Insufficient balance for this transfer.");
      return;
    }
    if (accountNumber.trim() !== confirmAccountNumber.trim()) {
      setInlineError("Account numbers do not match.");
      return;
    }
    if (!/^\d{8,20}$/.test(recipientAccountNumber)) {
      setInlineError("Select a beneficiary or enter a valid account number.");
      return;
    }
    if (!resolvedDestination) {
      setIsResolvingBeneficiary(true);
      try {
        const account = await accountsApi.getByAccountNumber(
          recipientAccountNumber,
        );
        resolvedDestination = account;
        setDestinationAccount(resolvedDestination);
        setResolvedBeneficiaryAccounts((current) => ({
          ...current,
          [recipientAccountNumber]: account,
        }));
        setBeneficiaryName(
          resolvedDestination.ownerName?.trim() || beneficiaryName,
        );
      } catch (error) {
        setInlineError(
          messageFromError(
            error,
            "This beneficiary account could not be found. Please check the account number.",
          ),
        );
        return;
      } finally {
        setIsResolvingBeneficiary(false);
      }
    }
    if (fromAccount.id === resolvedDestination.id) {
      setInlineError("Choose a different account to receive the transfer.");
      return;
    }
    if (resolvedDestination.status !== AccountStatus.ACTIVE) {
      setInlineError("The beneficiary account must be active before transfer.");
      return;
    }
    if (resolvedDestination.currency !== fromAccount.currency) {
      setInlineError("The beneficiary account currency must match your account.");
      return;
    }
    if (!(await sendTransferOtp("inline"))) {
      return;
    }
    setOtpOpen(true);
  }

  async function confirmOtp() {
    setOtpError("");
    if (otp.length !== 6) {
      setOtpError("Enter the 6 digit verification code.");
      return;
    }
    if (otpSeconds === 0) {
      setOtpError("OTP expired. Please resend the OTP.");
      return;
    }
    if (!fromAccount || !destinationAccount) {
      setOtpError("Please select valid accounts.");
      return;
    }
    if (fromAccount.kycStatus !== KycStatus.APPROVED) {
      setOtpError("Complete eKYC before making a transfer.");
      setPaymentOutcome(null);
      return;
    }
    const email = await latestRegisteredEmail();
    if (!email) {
      setOtpError("Add an email address to your profile before making a transfer.");
      return;
    }
    try {
      await createPayment({
        fromAccountId: fromAccount.id,
        toAccountId: destinationAccount.id,
        amount: amountValue.toFixed(2),
        currency: fromAccount.currency,
        gateway: PaymentGateway.BANK_TRANSFER,
        description: remarks || `Transfer for ${titleCase(purpose)}`,
        email,
        otp,
      });
    } catch (error) {
      const message = messageFromError(
        error,
        "Payment failed. Check the OTP and try again.",
      );
      const failedMessage = message.toLowerCase().includes("payment failed")
        ? message
        : `Payment failed. ${message}`;
      setPaymentOutcome({
        status: "failed",
        message: failedMessage,
      });
      setOtpError(
        failedMessage,
      );
      return;
    }
    setPaymentOutcome({
      status: "success",
      message: "Payment submitted. Status will update after processing.",
    });
    closeOtpPanel();
    setOtp("");
    setAmount("");
    setRemarks("");
  }

  async function saveBeneficiary() {
    setInlineError("");
    const recipientName = beneficiaryName.trim();
    const recipientAccountNumber = accountNumber.trim();
    const confirmRecipientAccountNumber = confirmAccountNumber.trim();

    if (!fromAccount) {
      setInlineError("Please select the account you want to transfer from.");
      return;
    }
    if (!/^\d{8,20}$/.test(recipientAccountNumber)) {
      setInlineError("Enter a valid beneficiary account number.");
      return;
    }
    if (recipientAccountNumber !== confirmRecipientAccountNumber) {
      setInlineError("Account numbers do not match.");
      return;
    }
    if (accounts.some((account) => account.accountNumber === recipientAccountNumber)) {
      setInlineError(
        "This is your own account. Select it directly from the Beneficiary dropdown.",
      );
      return;
    }

    setIsResolvingBeneficiary(true);
    try {
      const account = await accountsApi.getByAccountNumber(recipientAccountNumber);
      setResolvedBeneficiaryAccounts((current) => ({
        ...current,
        [recipientAccountNumber]: account,
      }));
      if (account.status !== AccountStatus.ACTIVE) {
        setInlineError("The beneficiary account is not active.");
        return;
      }
      if (account.currency !== fromAccount.currency) {
        setInlineError("The beneficiary account currency must match your account.");
        return;
      }
      const resolvedName = account.ownerName?.trim() || recipientName;
      if (resolvedName.length < 2) {
        setInlineError("Beneficiary name could not be fetched. Enter the name manually.");
        return;
      }

      const existing = beneficiaries.find(
        (beneficiary) =>
          beneficiary.beneficiaryAccountNumber === recipientAccountNumber,
      );
      if (existing) {
        setIsAddingNewBeneficiary(false);
        setBeneficiaryId(`beneficiary:${existing.id}`);
        setDestinationAccount(account);
        toast.success(`${existing.name} is already saved and selected.`);
        return;
      }

      const beneficiary = await addBeneficiary({
        name: resolvedName,
        bankCode: VAULTBANK_IFSC_CODE,
        beneficiaryAccountNumber: account.accountNumber,
      });
      setIsAddingNewBeneficiary(false);
      setBeneficiaryId(`beneficiary:${beneficiary.id}`);
      setDestinationAccount(account);
      setBeneficiaryName(resolvedName);
      setBankName("VaultBank");
      setAccountNumber(account.accountNumber);
      setConfirmAccountNumber(account.accountNumber);
    } catch (error) {
      setInlineError(
        messageFromError(
          error,
          "Beneficiary account could not be verified. Please check the account number.",
        ),
      );
    } finally {
      setIsResolvingBeneficiary(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-secondary">Transfer Money</h1>
        <p className="mt-2 text-sm text-muted">
          Send funds to another VaultBank account securely.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <DashboardCard className="p-5">
          <form className="space-y-6" onSubmit={proceed}>
            <div className="grid gap-5 lg:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-secondary">
                  From Account
                </span>
                <select
                  className={selectClass}
                  onChange={(event) => setFromAccountId(event.target.value)}
                  value={fromAccountId}
                >
                  {accounts.length === 0 ? (
                    <option value="">No accounts available</option>
                  ) : (
                    accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {accountOptionLabel(account)} - Available{" "}
                        {formatCurrency(account.balance, account.currency)}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-secondary">
                  Beneficiary
                </span>
                <select
                  className={selectClass}
                  disabled={recipientOptions.length === 0 && !isAddingNewBeneficiary}
                  onChange={(event) => {
                    setIsAddingNewBeneficiary(false);
                    setBeneficiaryId(event.target.value);
                  }}
                  value={isAddingNewBeneficiary ? "" : beneficiaryId}
                >
                  {isAddingNewBeneficiary ? (
                    <option value="">New beneficiary</option>
                  ) : null}
                  {recipientOptions.length === 0 ? (
                    <option value="">Add a beneficiary or open another account first</option>
                  ) : (
                    recipientOptions.map((recipient) => (
                      <option key={recipient.id} value={recipient.id}>
                        {recipient.label} - {recipient.accountNumber.slice(-4)}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-dark disabled:text-muted"
                disabled={isAddingBeneficiary || isResolvingBeneficiary}
                onClick={() => {
                  if (isAddingNewBeneficiary) {
                    void saveBeneficiary();
                    return;
                  }
                  startNewBeneficiary();
                }}
                type="button"
              >
                <Plus className="h-4 w-4" />
                {isAddingBeneficiary || isResolvingBeneficiary
                  ? "Checking Beneficiary..."
                  : isAddingNewBeneficiary
                    ? "Save Beneficiary"
                    : "Add New Beneficiary"}
              </button>
              {isAddingNewBeneficiary && recipientOptions.length ? (
                <button
                  className="text-sm font-semibold text-muted hover:text-secondary"
                  onClick={cancelNewBeneficiary}
                  type="button"
                >
                  Cancel
                </button>
              ) : null}
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-secondary">
                  Beneficiary Name
                </span>
                <Input
                  onChange={(event) => {
                    if (!isAddingNewBeneficiary) {
                      setIsAddingNewBeneficiary(true);
                    }
                    setBeneficiaryName(event.target.value);
                  }}
                  placeholder="Enter beneficiary name"
                  value={beneficiaryName}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-secondary">
                  Bank Name
                </span>
                <Input
                  onChange={(event) => {
                    if (!isAddingNewBeneficiary) {
                      setIsAddingNewBeneficiary(true);
                    }
                    setBankName(event.target.value);
                  }}
                  placeholder="Enter bank name"
                  value={bankName}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-secondary">
                  IFSC Code
                </span>
                <Input
                  className="bg-slate-50 font-semibold"
                  readOnly
                  value={VAULTBANK_IFSC_CODE}
                />
                <span className="mt-1 block text-xs text-muted">
                  VaultBank IFSC is applied automatically.
                </span>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-secondary">
                  Account Number
                </span>
                <Input
                  onChange={(event) => {
                    const value = event.target.value.replace(/\D/g, "");
                    if (!isAddingNewBeneficiary) {
                      setIsAddingNewBeneficiary(true);
                    }
                    setAccountNumber(value);
                    if (value !== selectedRecipient?.accountNumber) {
                      setBeneficiaryId("");
                      setDestinationAccount(null);
                    }
                  }}
                  inputMode="numeric"
                  placeholder="Enter account number"
                  value={accountNumber}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-secondary">
                  Confirm Account Number
                </span>
                <Input
                  onChange={(event) => {
                    if (!isAddingNewBeneficiary) {
                      setIsAddingNewBeneficiary(true);
                    }
                    setConfirmAccountNumber(event.target.value.replace(/\D/g, ""));
                  }}
                  inputMode="numeric"
                  placeholder="Re-enter account number"
                  value={confirmAccountNumber}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-secondary">
                  Amount
                </span>
                <div className="flex">
                  <span className="inline-flex h-11 items-center gap-2 rounded-l-lg border border-r-0 border-slate-200 bg-slate-50 px-3 text-sm text-muted">
                    {fromAccount?.currency ?? "USD"}
                    <ChevronDown className="h-4 w-4" />
                  </span>
                  <Input
                    className="rounded-l-none"
                    min="0"
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="Enter amount"
                    step="0.01"
                    type="number"
                    value={amount}
                  />
                </div>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-secondary">
                  Purpose
                </span>
                <select
                  className={selectClass}
                  onChange={(event) => setPurpose(event.target.value)}
                  value={purpose}
                >
                  <option value="family">Family Support</option>
                  <option value="rent">Rent</option>
                  <option value="invoice">Invoice Payment</option>
                  <option value="savings">Savings Transfer</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-secondary">
                  Remarks Optional
                </span>
                <Input
                  onChange={(event) => setRemarks(event.target.value)}
                  placeholder="Enter remarks"
                  value={remarks}
                />
              </label>
            </div>

            <div className="flex flex-col gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <p className="flex items-center gap-2 text-muted">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  OTP will be sent to your registered email {maskedEmail(registeredEmail)}.
                </p>
                {transferBlockReason ? (
                  <p className="mt-2 font-medium text-amber-700">
                    {transferBlockReason}
                  </p>
                ) : null}
              </div>
              <Button
                disabled={
                  !canProceedToVerify ||
                  isPending ||
                  isSendingOtp ||
                  isAddingBeneficiary ||
                  isResolvingBeneficiary
                }
                type="submit"
              >
                <Send className="h-4 w-4" />
                {isSendingOtp
                  ? "Sending OTP..."
                  : isResolvingBeneficiary
                    ? "Checking Beneficiary..."
                    : "Proceed to Verify"}
              </Button>
            </div>
            {inlineError ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">
                {inlineError}
              </p>
            ) : null}
            {paymentOutcome ? (
              <p
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium",
                  paymentOutcome.status === "success"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-danger",
                )}
              >
                {paymentOutcome.message}
              </p>
            ) : null}
          </form>
        </DashboardCard>

        <aside className="space-y-5">
          <DashboardCard className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-secondary">Recent Beneficiaries</h2>
              <Button
                onClick={() => {
                  if (fromAccountId) {
                    navigate(`/accounts/${fromAccountId}/beneficiaries`);
                  }
                }}
                size="sm"
                variant="ghost"
              >
                View All
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {beneficiaries.length ? (
                beneficiaries.slice(0, 5).map((beneficiary) => (
                  <div
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition hover:border-primary/50 hover:bg-primary/5",
                      `beneficiary:${beneficiary.id}` === beneficiaryId
                        ? "border-primary bg-primary/5"
                        : "border-slate-200",
                    )}
                    key={beneficiary.id}
                    onClick={() => setBeneficiaryId(`beneficiary:${beneficiary.id}`)}
                    role="button"
                    tabIndex={0}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                      {beneficiary.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-secondary">
                        {beneficiary.name}
                      </span>
                      <span className="block truncate text-sm text-muted">
                        {beneficiary.bankCode} - {beneficiary.beneficiaryAccountNumber.slice(-4)}
                      </span>
                    </span>
                    <MoreVertical className="h-4 w-4 text-muted" />
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-muted">
                  Saved beneficiaries will appear here.
                </div>
              )}
            </div>
          </DashboardCard>

          <DashboardCard className="p-5">
            <h2 className="font-bold text-secondary">Recent Payments</h2>
            <div className="mt-4 space-y-3">
              {recentPayments.length ? (
                recentPayments.map((payment) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
                    key={payment.id}
                  >
                    <div>
                      <p className="font-semibold text-secondary">
                        {formatCurrency(payment.amount, fromAccount?.currency ?? Currency.USD)}
                      </p>
                      <p className="text-xs text-muted">
                        {payment.description ?? "Bank transfer"}
                      </p>
                    </div>
                    <StatusPill tone={paymentStatusTone(payment.status)}>
                      {titleCase(payment.status)}
                    </StatusPill>
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-muted">
                  No payment activity yet.
                </p>
              )}
            </div>
          </DashboardCard>
        </aside>
      </div>

      {otpOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-950/30">
          <aside className="ml-auto flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-secondary">Verify OTP</h2>
              <Button aria-label="Close OTP panel" onClick={closeOtpPanel} size="icon" variant="ghost">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-5 text-center">
              <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-primary/10">
                <ShieldCheck className="h-14 w-14 text-primary" />
                <span className="absolute bottom-4 right-4 rounded-full bg-emerald-500 p-1 text-white">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
              </div>
              <h3 className="mt-6 text-xl font-bold text-secondary">
                OTP sent by email to {maskedEmail(registeredEmail)}
              </h3>
              <p className="mt-3 max-w-xs text-sm leading-6 text-muted">
                Enter the 6-digit OTP to confirm this transfer.
              </p>
              <input
                autoFocus
                className="mt-6 h-14 w-56 rounded-xl border border-slate-200 text-center text-2xl font-bold tracking-[0.5em] text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) =>
                  setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="------"
                value={otp}
              />
              <p className="mt-5 text-sm text-muted">
                OTP expires in{" "}
                <span className="font-semibold text-primary">
                  {String(Math.floor(otpSeconds / 60)).padStart(2, "0")}:
                  {String(otpSeconds % 60).padStart(2, "0")}
                </span>
              </p>
              {otpError ? (
                <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">
                  {otpError}
                </p>
              ) : null}
              <div className="mt-6 w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-muted">
                <Lock className="mx-auto mb-2 h-5 w-5 text-primary" />
                For your protection, every bank transfer requires confirmation.
              </div>
            </div>
            <div className="mt-auto border-t border-slate-100 pt-4">
              <Button
                className="w-full"
                disabled={isPending || isSendingOtp}
                onClick={() => void confirmOtp()}
                size="lg"
              >
                {isPending ? "Confirming..." : "Confirm OTP"}
              </Button>
              <button
                className="mt-4 block w-full text-center text-sm font-semibold text-primary disabled:text-muted"
                disabled={otpSeconds > 90 || isSendingOtp}
                onClick={() => {
                  void sendTransferOtp("otp");
                }}
                type="button"
              >
                {isSendingOtp
                  ? "Sending OTP..."
                  : `Resend OTP ${otpSeconds > 90 ? `in ${otpSeconds - 90}s` : ""}`}
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
