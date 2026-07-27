import {
  AccountStatus,
  AccountType,
  Currency,
  KycStatus,
} from "@/types/accounts.types";

export const ACCOUNT_ERRORS = {
  ACCOUNT_NOT_FOUND: "This account could not be found.",
  FORBIDDEN: "You don't have access to this account.",
  KYC_REQUIRED: "Identity verification required to proceed.",
  BENEFICIARY_ALREADY_EXISTS:
    "This account is already saved as a beneficiary.",
  ACCOUNT_FROZEN: "This account is frozen. Contact support.",
  ACCOUNT_CLOSED: "This account is closed.",
  LIMIT_EXCEEDED: "Transfer limit exceeded.",
  INSUFFICIENT_BALANCE: "Insufficient balance for this transfer.",
  VALIDATION_ERROR: "Please check your input and try again.",
  NETWORK_ERROR: "Connection lost. Please check your network.",
} as const;

export const ACCOUNT_TYPE_LABELS = {
  [AccountType.SAVINGS]: "Savings Account",
  [AccountType.CURRENT]: "Current Account",
  [AccountType.FIXED]: "Fixed Deposit",
} as const;

export const ACCOUNT_TYPE_DESCRIPTIONS = {
  [AccountType.SAVINGS]: "Earn interest while keeping funds accessible",
  [AccountType.CURRENT]: "Everyday banking with no restrictions",
  [AccountType.FIXED]: "Lock in higher rates for fixed terms",
} as const;

export const CURRENCY_SYMBOLS = {
  [Currency.USD]: "$",
  [Currency.EUR]: "\u20ac",
  [Currency.GBP]: "\u00a3",
} as const;

export const CURRENCY_NAMES = {
  [Currency.USD]: "US Dollar",
  [Currency.EUR]: "Euro",
  [Currency.GBP]: "British Pound",
} as const;

export const ACCOUNT_STATUS_LABELS = {
  [AccountStatus.ACTIVE]: "Active",
  [AccountStatus.FROZEN]: "Frozen",
  [AccountStatus.CLOSED]: "Closed",
} as const;

export const KYC_STATUS_LABELS = {
  [KycStatus.PENDING]: "KYC pending",
  [KycStatus.APPROVED]: "KYC approved",
  [KycStatus.REJECTED]: "KYC rejected",
} as const;

export const ACCOUNT_LIMIT_DEFAULTS = {
  dailyTransferLimit: 25_000,
  singleTxnLimit: 5_000,
} as const;

export const VAULTBANK_IFSC_CODE = "VLTB0000001";

export const ACCOUNT_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseMoney(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (!value) {
    return 0;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCurrency(
  value: string | number | null | undefined,
  currency: Currency,
): string {
  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${CURRENCY_SYMBOLS[currency]}${formatter.format(parseMoney(value))}`;
}

export function formatCompactCurrency(
  value: string | number | null | undefined,
  currency: Currency,
): string {
  const formatter = new Intl.NumberFormat("en-US", {
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  return `${CURRENCY_SYMBOLS[currency]}${formatter.format(parseMoney(value))}`;
}

export function getAccountLast4(accountNumber: string): string {
  return accountNumber.slice(-4).padStart(4, "0");
}

export function maskAccountNumber(accountNumber: string): string {
  return `\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 ${getAccountLast4(accountNumber)}`;
}

export function groupAccountNumber(accountNumber: string): string {
  return accountNumber.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

export function getAccountErrorMessage(code: string | undefined): string {
  if (!code) {
    return "Something went wrong. Please try again.";
  }
  return (
    ACCOUNT_ERRORS[code as keyof typeof ACCOUNT_ERRORS] ??
    "Something went wrong. Please try again."
  );
}
