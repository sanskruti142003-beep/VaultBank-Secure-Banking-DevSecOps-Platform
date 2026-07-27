import {
  AccountStatus,
  AccountType,
  Currency,
  KycStatus,
  type Account,
} from "@/types/accounts.types";
import {
  TransactionStatus,
  TransactionType,
  type Transaction,
} from "@/types/transactions.types";
import { PaymentStatus } from "@/types/payments.types";

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatTime(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function currencyForAccount(account: Account | undefined): Currency {
  return account?.currency ?? Currency.USD;
}

export function accountDisplayName(account: Account): string {
  const labels = {
    [AccountType.SAVINGS]: "Savings Account",
    [AccountType.CURRENT]: "Current Account",
    [AccountType.FIXED]: "Fixed Deposit",
  };
  return labels[account.type];
}

export function transactionTitle(transaction: Transaction): string {
  if (transaction.description) {
    return transaction.description;
  }
  const labels = {
    [TransactionType.TRANSFER]: "Bank Transfer",
    [TransactionType.DEPOSIT]: "Account Deposit",
    [TransactionType.WITHDRAWAL]: "Cash Withdrawal",
  };
  return labels[transaction.type];
}

export function isIncoming(
  transaction: Transaction,
  accountId: string | undefined,
): boolean {
  if (transaction.type === TransactionType.DEPOSIT) {
    return true;
  }
  if (transaction.type === TransactionType.WITHDRAWAL) {
    return false;
  }
  return Boolean(accountId && transaction.toAccountId === accountId);
}

export function accountStatusTone(status: AccountStatus) {
  if (status === AccountStatus.ACTIVE) {
    return "green" as const;
  }
  if (status === AccountStatus.FROZEN) {
    return "amber" as const;
  }
  return "red" as const;
}

export function kycTone(status: KycStatus) {
  if (status === KycStatus.APPROVED) {
    return "green" as const;
  }
  if (status === KycStatus.REJECTED) {
    return "red" as const;
  }
  return "amber" as const;
}

export function transactionStatusTone(status: TransactionStatus) {
  if (status === TransactionStatus.COMPLETED) {
    return "green" as const;
  }
  if (status === TransactionStatus.FAILED || status === TransactionStatus.REVERSED) {
    return "red" as const;
  }
  return "amber" as const;
}

export function paymentStatusTone(status: PaymentStatus) {
  if (status === PaymentStatus.SUCCESS) {
    return "green" as const;
  }
  if (status === PaymentStatus.FAILED || status === PaymentStatus.REFUNDED) {
    return "red" as const;
  }
  return "amber" as const;
}

export function titleCase(value: string): string {
  return value
    .split("_")
    .join(" ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
