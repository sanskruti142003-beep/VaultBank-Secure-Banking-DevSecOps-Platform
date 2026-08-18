import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Ban,
  CalendarDays,
  CreditCard,
  Lock,
  ShieldCheck,
  Snowflake,
  Unlock,
} from "lucide-react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { AccountDetailHeader } from "@/components/accounts/AccountDetailHeader";
import { AccountLimitCard } from "@/components/accounts/AccountLimitCard";
import { AccountStatusBadge } from "@/components/accounts/AccountStatusBadge";
import { BalanceSparkline, buildMockTrend } from "@/components/accounts/BalanceSparkline";
import { KycStatusBanner } from "@/components/accounts/KycStatusBanner";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { SkeletonCard } from "@/components/common/SkeletonCard";
import { Button } from "@/components/ui/button";
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_UUID_PATTERN,
  formatCurrency,
} from "@/constants/accounts.constants";
import {
  useAccount,
  useAdminAccountActions,
} from "@/hooks/useAccounts";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";
import { cn } from "@/lib/utils";
import { BeneficiariesManager } from "@/pages/accounts/BeneficiariesPage";
import { useAuthStore } from "@/store/auth.store";
import { AccountStatus, KycStatus } from "@/types/accounts.types";

type Tab = "overview" | "limits" | "beneficiaries" | "activity";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "limits", label: "Limits" },
  { id: "beneficiaries", label: "Beneficiaries" },
  { id: "activity", label: "Activity" },
];

export function AccountDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { account, isLoading, isError } = useAccount(id);
  const showSkeleton = useDelayedLoading(isLoading);
  const user = useAuthStore((state) => state.user);
  const setSelectedAccountId = useAuthStore((state) => state.setSelectedAccountId);
  const adminActions = useAdminAccountActions(id ?? "");
  const isAdmin = Boolean(user?.roles.includes("admin"));
  const trend = useMemo(
    () => (account ? buildMockTrend(account.balance) : []),
    [account],
  );

  useEffect(() => {
    if (account?.id) {
      setSelectedAccountId(account.id);
    }
  }, [account?.id, setSelectedAccountId]);

  if (!id || !ACCOUNT_UUID_PATTERN.test(id)) {
    return <Navigate replace to="/accounts" />;
  }

  if (showSkeleton) {
    return (
      <div className="space-y-5">
        <SkeletonCard className="min-h-72" />
        <SkeletonCard />
      </div>
    );
  }

  if (isError || !account) {
    return (
      <EmptyState
        action={{ label: "Back to accounts", onClick: () => navigate("/accounts") }}
        description="This account could not be found or you do not have access."
        icon={CreditCard}
        title="Account unavailable"
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Button onClick={() => navigate("/accounts")} variant="outline">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
        breadcrumbs={[
          { label: "Home", href: "/dashboard" },
          { label: "Accounts", href: "/accounts" },
          { label: ACCOUNT_TYPE_LABELS[account.type] },
        ]}
        subtitle="View account details, limits, and beneficiaries"
        title={ACCOUNT_TYPE_LABELS[account.type]}
      />

      {account.kycStatus !== KycStatus.APPROVED ? (
        <KycStatusBanner accountId={account.id} status={account.kycStatus} />
      ) : null}

      <AccountDetailHeader account={account} />

      {isAdmin ? (
        <section className="flex flex-wrap gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          {account.status === AccountStatus.FROZEN ? (
            <ConfirmDialog
              confirmLabel="Unfreeze"
              description="Restore access to this account."
              onConfirm={() => adminActions.unfreezeAccount()}
              title="Unfreeze account?"
              trigger={
                <Button variant="outline">
                  <Unlock className="h-4 w-4" />
                  Unfreeze
                </Button>
              }
            />
          ) : (
            <ConfirmDialog
              confirmLabel="Freeze"
              description="Temporarily block transfers and sensitive account actions."
              onConfirm={() => adminActions.freezeAccount()}
              title="Freeze account?"
              trigger={
                <Button variant="outline">
                  <Snowflake className="h-4 w-4" />
                  Freeze
                </Button>
              }
            />
          )}
          <ConfirmDialog
            confirmLabel="Close account"
            description="Close this account. This action should only be used after final settlement."
            onConfirm={async () => {
              await adminActions.closeAccount();
              navigate("/accounts");
            }}
            title="Close account?"
            trigger={
              <Button variant="destructive">
                <Ban className="h-4 w-4" />
                Close
              </Button>
            }
            variant="danger"
          />
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
        <div aria-label="Account sections" className="grid gap-2 sm:grid-cols-4" role="tablist">
          {tabs.map((tab) => (
            <button
              aria-controls={`panel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              className={cn(
                "rounded-xl px-4 py-3 text-sm font-semibold text-muted transition hover:bg-slate-50",
                activeTab === tab.id && "bg-primary/10 text-primary",
              )}
              id={`tab-${tab.id}`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      <section
        aria-labelledby={`tab-${activeTab}`}
        id={`panel-${activeTab}`}
        role="tabpanel"
      >
        {activeTab === "overview" ? (
          <div className="grid gap-5 lg:grid-cols-[1.4fr_0.9fr]">
            <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-secondary">
                    Balance history
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Last 7 days trend based on current balance.
                  </p>
                </div>
                <AccountStatusBadge status={account.status} />
              </div>
              <div className="mt-5 rounded-2xl bg-slate-50 p-3">
                <BalanceSparkline data={trend} height={190} />
              </div>
            </section>
            <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-secondary">
                Account facts
              </h2>
              <dl className="mt-5 space-y-4 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="flex items-center gap-2 text-muted">
                    <CalendarDays className="h-4 w-4" />
                    Opened
                  </dt>
                  <dd className="font-semibold text-secondary">
                    {new Date(account.createdAt).toLocaleDateString("en-US")}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="flex items-center gap-2 text-muted">
                    <Lock className="h-4 w-4" />
                    Currency
                  </dt>
                  <dd className="font-semibold text-secondary">{account.currency}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="flex items-center gap-2 text-muted">
                    <ShieldCheck className="h-4 w-4" />
                    KYC status
                  </dt>
                  <dd>
                    <AccountStatusBadge status={account.kycStatus} type="kyc" />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted">Available balance</dt>
                  <dd className="font-semibold text-secondary">
                    {formatCurrency(account.balance, account.currency)}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        ) : null}

        {activeTab === "limits" ? <AccountLimitCard account={account} /> : null}

        {activeTab === "beneficiaries" ? (
          <BeneficiariesManager accountId={account.id} embedded />
        ) : null}

        {activeTab === "activity" ? (
          <EmptyState
            description="Transaction history will appear here after your first transfer."
            icon={CreditCard}
            title="No recent activity"
          />
        ) : null}
      </section>
    </div>
  );
}
