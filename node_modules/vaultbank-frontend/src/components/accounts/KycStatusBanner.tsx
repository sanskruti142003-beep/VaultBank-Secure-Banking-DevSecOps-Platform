import { AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { AccountStatusBadge } from "@/components/accounts/AccountStatusBadge";
import { cn } from "@/lib/utils";
import { KycStatus } from "@/types/accounts.types";

interface KycStatusBannerProps {
  status: KycStatus;
  accountId?: string;
  className?: string;
}

const copy = {
  [KycStatus.PENDING]: {
    icon: AlertCircle,
    title: "Identity verification is pending",
    body: "Transfers and some account features unlock after KYC review is complete.",
    classes: "border-amber-100 bg-amber-50 text-amber-900",
  },
  [KycStatus.APPROVED]: {
    icon: CheckCircle2,
    title: "Identity verification approved",
    body: "This account has full access to eligible banking features.",
    classes: "border-emerald-100 bg-emerald-50 text-emerald-900",
  },
  [KycStatus.REJECTED]: {
    icon: ShieldAlert,
    title: "Identity verification needs attention",
    body: "Please contact support to resolve your KYC review and restore account access.",
    classes: "border-red-100 bg-red-50 text-red-900",
  },
};

export function KycStatusBanner({
  status,
  accountId,
  className,
}: KycStatusBannerProps) {
  const item = copy[status];
  const Icon = item.icon;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between",
        item.classes,
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-white/80 p-2">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{item.title}</h2>
            <AccountStatusBadge status={status} type="kyc" />
          </div>
          <p className="mt-1 text-sm opacity-80">{item.body}</p>
        </div>
      </div>
      {accountId ? (
        <Link
          className="text-sm font-semibold text-primary hover:text-primary-dark"
          to={`/accounts/${accountId}`}
        >
          Review account
        </Link>
      ) : null}
    </div>
  );
}
