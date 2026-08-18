import { memo, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Lock,
  PiggyBank,
  Snowflake,
  Wallet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { accountsApi } from "@/api/accounts.api";
import { AccountNumberDisplay } from "@/components/accounts/AccountNumberDisplay";
import { AccountStatusBadge } from "@/components/accounts/AccountStatusBadge";
import {
  BalanceSparkline,
  buildMockTrend,
} from "@/components/accounts/BalanceSparkline";
import { BalanceDisplay } from "@/components/accounts/BalanceDisplay";
import { Button } from "@/components/ui/button";
import {
  ACCOUNT_TYPE_LABELS,
  getAccountLast4,
} from "@/constants/accounts.constants";
import { accountQueryKeys } from "@/hooks/useAccounts";
import {
  findApprovedAccountById,
  getAccountApprovalRequests,
} from "@/lib/account-approval-store";
import { cn } from "@/lib/utils";
import {
  AccountStatus,
  AccountType,
  type Account,
} from "@/types/accounts.types";

interface AccountCardProps {
  account: Account;
  className?: string;
}

const typeMeta = {
  [AccountType.SAVINGS]: {
    icon: PiggyBank,
    iconClass: "bg-primary/10 text-primary",
    badgeClass: "bg-primary/10 text-primary",
  },
  [AccountType.CURRENT]: {
    icon: Wallet,
    iconClass: "bg-violet-50 text-violet-700",
    badgeClass: "bg-violet-50 text-violet-700",
  },
  [AccountType.FIXED]: {
    icon: Lock,
    iconClass: "bg-amber-50 text-amber-700",
    badgeClass: "bg-amber-50 text-amber-700",
  },
};

function AccountCardComponent({ account, className }: AccountCardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const meta = typeMeta[account.type];
  const Icon = meta.icon;
  const last4 = getAccountLast4(account.accountNumber);
  const trend = useMemo(() => buildMockTrend(account.balance), [account.balance]);
  const trendColor =
    trend[trend.length - 1] >= trend[0] ? "#10B981" : "#EF4444";
  const isFrozen = account.status === AccountStatus.FROZEN;

  function prefetchDetails() {
    const localAccount = findApprovedAccountById(
      account.id,
      getAccountApprovalRequests(),
    );
    if (localAccount) {
      queryClient.setQueryData(accountQueryKeys.detail(account.id), localAccount);
      return;
    }
    void queryClient.prefetchQuery({
      queryKey: accountQueryKeys.detail(account.id),
      queryFn: () => accountsApi.getById(account.id),
      staleTime: 30 * 1000,
    });
  }

  return (
    <article
      aria-label={`${ACCOUNT_TYPE_LABELS[account.type]} ending ${last4}`}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-focus",
        isFrozen && "opacity-80",
        className,
      )}
      onMouseEnter={prefetchDetails}
      role="article"
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
            meta.badgeClass,
          )}
        >
          {ACCOUNT_TYPE_LABELS[account.type]}
        </span>
        <AccountStatusBadge status={account.status} />
      </div>

      <div className="mt-6 flex items-start gap-4">
        <div className={cn("rounded-2xl p-3", meta.iconClass)}>
          <Icon className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-secondary">
            {ACCOUNT_TYPE_LABELS[account.type]}
          </h2>
          <div className="mt-2">
            <AccountNumberDisplay accountNumber={account.accountNumber} />
          </div>
        </div>
      </div>

      <div className="mt-7">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          Balance
        </p>
        <div className="mt-2">
          <BalanceDisplay
            amount={account.balance}
            className="text-3xl"
            currency={account.currency}
            size="lg"
          />
        </div>
      </div>

      <div className="mt-5 rounded-xl bg-slate-50 px-2 py-3">
        <BalanceSparkline
          color={trendColor}
          data={trend}
          height={80}
        />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button
          onClick={() => navigate(`/payments?from=${account.id}`)}
          variant="outline"
        >
          <ArrowLeftRight className="h-4 w-4" />
          Transfer
        </Button>
        <Button onClick={() => navigate(`/accounts/${account.id}`)}>
          Details
        </Button>
      </div>

      {isFrozen ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/65 backdrop-blur-[1px]">
          <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-center text-blue-700 shadow-sm">
            <Snowflake className="mx-auto h-6 w-6" />
            <p className="mt-1 text-sm font-semibold">Account frozen</p>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export const AccountCard = memo(AccountCardComponent);

AccountCard.displayName = "AccountCard";
