import {
  ACCOUNT_STATUS_LABELS,
  KYC_STATUS_LABELS,
} from "@/constants/accounts.constants";
import { cn } from "@/lib/utils";
import { AccountStatus, KycStatus } from "@/types/accounts.types";

interface AccountStatusBadgeProps {
  status: AccountStatus | KycStatus;
  type?: "account" | "kyc";
  className?: string;
}

const accountClasses = {
  [AccountStatus.ACTIVE]: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  [AccountStatus.FROZEN]: "bg-blue-50 text-blue-700 ring-blue-100",
  [AccountStatus.CLOSED]: "bg-slate-100 text-slate-600 ring-slate-200",
};

const kycClasses = {
  [KycStatus.PENDING]: "bg-amber-50 text-amber-700 ring-amber-100",
  [KycStatus.APPROVED]: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  [KycStatus.REJECTED]: "bg-red-50 text-red-700 ring-red-100",
};

export function AccountStatusBadge({
  status,
  type = "account",
  className,
}: AccountStatusBadgeProps) {
  const label =
    type === "kyc"
      ? KYC_STATUS_LABELS[status as KycStatus]
      : ACCOUNT_STATUS_LABELS[status as AccountStatus];
  const color =
    type === "kyc"
      ? kycClasses[status as KycStatus]
      : accountClasses[status as AccountStatus];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1",
        color,
        className,
      )}
    >
      {label}
    </span>
  );
}
