import { useMemo } from "react";
import {
  AlertTriangle,
  Bell,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Landmark,
  Plus,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  DashboardCard,
  IconTile,
  MetricCard,
  StatusPill,
} from "@/components/dashboard/DashboardCard";
import { Button } from "@/components/ui/button";
import {
  ACCOUNT_TYPE_LABELS,
  formatCurrency,
  getAccountLast4,
  parseMoney,
} from "@/constants/accounts.constants";
import { useAccounts } from "@/hooks/useAccounts";
import { usePayments } from "@/hooks/usePayments";
import { useTransactions } from "@/hooks/useTransactions";
import { findApprovedAccountById } from "@/lib/account-approval-store";
import {
  accountDisplayName,
  currencyForAccount,
  formatDate,
  formatTime,
  isIncoming,
  kycTone,
  titleCase,
  transactionStatusTone,
  transactionTitle,
} from "@/lib/dashboard-format";
import { AccountStatus, KycStatus } from "@/types/accounts.types";
import { PaymentStatus } from "@/types/payments.types";

export function DashboardPage() {
  const navigate = useNavigate();
  const { accounts, isLoading: accountsLoading } = useAccounts();
  const primaryAccount = accounts[0];
  const primaryAccountId = primaryAccount?.id;
  const primaryAccountIsLocal = Boolean(
    findApprovedAccountById(primaryAccountId),
  );
  const { transactions, isLoading: transactionsLoading } = useTransactions(
    primaryAccountId && !primaryAccountIsLocal
      ? { accountId: primaryAccountId, page: 1, limit: 5 }
      : null,
    { enabled: Boolean(primaryAccountId && !primaryAccountIsLocal) },
  );
  const { payments } = usePayments(1, 10);

  const totalBalance = useMemo(
    () => accounts.reduce((sum, account) => sum + parseMoney(account.balance), 0),
    [accounts],
  );
  const activeAccounts = accounts.filter(
    (account) => account.status === AccountStatus.ACTIVE,
  );
  const pendingPayments = payments.filter((payment) =>
    [PaymentStatus.INITIATED, PaymentStatus.PROCESSING].includes(payment.status),
  );
  const pendingKycAccount = accounts.find(
    (account) => account.kycStatus !== KycStatus.APPROVED,
  );
  const dashboardCurrency = currencyForAccount(primaryAccount);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-secondary">Overview</h1>
          <p className="mt-2 text-sm text-muted">
            Your balances, accounts, and verification status at a glance.
          </p>
        </div>
        <Button onClick={() => navigate("/accounts/new")}>
          <Plus className="h-4 w-4" />
          Open account
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          helper="Available across all accounts"
          icon={Wallet}
          onClick={() => navigate("/accounts")}
          title="Total Balance"
          tone="blue"
          value={formatCurrency(totalBalance, dashboardCurrency)}
        />
        <MetricCard
          helper="Savings, current, and more"
          icon={Landmark}
          onClick={() => navigate("/accounts")}
          title="Total Accounts"
          tone="green"
          value={accountsLoading ? "..." : activeAccounts.length}
        />
        <MetricCard
          helper="No payments to review"
          icon={Clock}
          onClick={() => navigate("/payments")}
          title="Pending Payments"
          tone="amber"
          value={pendingPayments.length}
        />
        <MetricCard
          helper="Notifications & updates"
          icon={Bell}
          onClick={() => navigate(pendingKycAccount ? "/ekyc" : "/profile")}
          title="Unread Alerts"
          tone="violet"
          value={pendingKycAccount ? 3 : 2}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="space-y-6">
          {accounts.length === 0 ? (
            <DashboardCard className="flex min-h-80 flex-col items-center justify-center border-dashed px-6 py-12 text-center">
              <div className="relative">
                <div className="flex h-28 w-28 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Building2 className="h-16 w-16" />
                </div>
                <span className="absolute -bottom-1 -right-1 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white shadow-lg">
                  <Plus className="h-6 w-6" />
                </span>
              </div>
              <h2 className="mt-6 text-xl font-bold text-secondary">
                You don&apos;t have an account yet
              </h2>
              <p className="mt-2 max-w-md text-sm text-muted">
                Open your first account to start banking with VaultBank.
              </p>
              <Button className="mt-6" onClick={() => navigate("/accounts/new")}>
                Open Account
              </Button>
            </DashboardCard>
          ) : (
            <DashboardCard className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-secondary">
                    Account Snapshot
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {accountDisplayName(primaryAccount)} ending{" "}
                    {getAccountLast4(primaryAccount.accountNumber)}
                  </p>
                </div>
                <StatusPill tone={kycTone(primaryAccount.kycStatus)}>
                  {titleCase(primaryAccount.kycStatus)}
                </StatusPill>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {accounts.slice(0, 3).map((account) => (
                  <button
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-primary/30 hover:bg-primary/5"
                    key={account.id}
                    onClick={() => navigate(`/accounts/${account.id}`)}
                    type="button"
                  >
                    <p className="text-sm font-semibold text-secondary">
                      {ACCOUNT_TYPE_LABELS[account.type]}
                    </p>
                    <p className="mt-2 text-2xl font-bold text-secondary">
                      {formatCurrency(account.balance, account.currency)}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      Ending {getAccountLast4(account.accountNumber)}
                    </p>
                  </button>
                ))}
              </div>
            </DashboardCard>
          )}

          <DashboardCard>
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <IconTile className="h-9 w-9 rounded-lg" icon={CreditCard} />
                <h2 className="text-lg font-bold text-secondary">
                  Recent Transactions
                </h2>
              </div>
              <Button onClick={() => navigate("/transactions")} size="sm" variant="ghost">
                View All
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Description</th>
                    <th className="px-5 py-3">Account</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactionsLoading ? (
                    <tr>
                      <td className="px-5 py-6 text-muted" colSpan={5}>
                        Loading transactions...
                      </td>
                    </tr>
                  ) : transactions.length ? (
                    transactions.map((transaction) => {
                      const incoming = isIncoming(transaction, primaryAccountId);
                      return (
                        <tr
                          className="cursor-pointer hover:bg-slate-50"
                          key={transaction.id}
                          onClick={() => navigate("/transactions")}
                        >
                          <td className="whitespace-nowrap px-5 py-4 text-muted">
                            {formatDate(transaction.initiatedAt)}
                          </td>
                          <td className="px-5 py-4">
                            <p className="font-semibold text-secondary">
                              {transactionTitle(transaction)}
                            </p>
                            <p className="text-xs text-muted">
                              {formatTime(transaction.initiatedAt)}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-muted">
                            {primaryAccount
                              ? getAccountLast4(primaryAccount.accountNumber)
                              : "-"}
                          </td>
                          <td
                            className={`whitespace-nowrap px-5 py-4 font-semibold ${
                              incoming ? "text-emerald-600" : "text-red-600"
                            }`}
                          >
                            {incoming ? "+" : "-"}
                            {formatCurrency(transaction.amount, dashboardCurrency)}
                          </td>
                          <td className="px-5 py-4">
                            <StatusPill tone={transactionStatusTone(transaction.status)}>
                              {titleCase(transaction.status)}
                            </StatusPill>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td className="px-5 py-6 text-center text-muted" colSpan={5}>
                        No more transactions to show
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </DashboardCard>
        </div>

        <aside className="space-y-5">
          <DashboardCard className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-6 w-6 text-primary" />
                <h2 className="text-lg font-bold text-secondary">KYC Status</h2>
              </div>
              <StatusPill tone={pendingKycAccount ? "amber" : "green"}>
                {pendingKycAccount ? "Pending" : "Verified"}
              </StatusPill>
            </div>
            <p className="mt-5 text-sm text-muted">
              {pendingKycAccount
                ? "Complete identity verification to unlock all banking features."
                : "Your identity has been verified."}
            </p>
            <div className="mt-5 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                <div>
                  <p className="font-semibold text-secondary">
                    {pendingKycAccount ? "Level 1 Verification" : "Level 2 Verification"}
                  </p>
                  <p className="text-xs text-muted">
                    {pendingKycAccount
                      ? "Continue verification"
                      : `Verified on ${formatDate(primaryAccount?.updatedAt)}`}
                  </p>
                </div>
              </div>
            </div>
            <Button className="mt-5 w-full" onClick={() => navigate("/ekyc")} variant="outline">
              View KYC Details
            </Button>
          </DashboardCard>

          <DashboardCard className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-warning" />
                <h2 className="text-lg font-bold text-secondary">Pending Actions</h2>
              </div>
              <StatusPill tone="blue">2</StatusPill>
            </div>
            <div className="mt-5 space-y-3">
              <button
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-4 text-left transition hover:border-primary/30 hover:bg-primary/5"
                onClick={() => navigate("/cards")}
                type="button"
              >
                <span>
                  <span className="block font-semibold text-secondary">
                    Link a debit/credit card
                  </span>
                  <span className="text-sm text-muted">
                    Add a card for seamless payments.
                  </span>
                </span>
                <Plus className="h-4 w-4 text-muted" />
              </button>
              <button
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-4 text-left transition hover:border-primary/30 hover:bg-primary/5"
                onClick={() => navigate("/profile")}
                type="button"
              >
                <span>
                  <span className="block font-semibold text-secondary">
                    Enable Two-Factor Authentication
                  </span>
                  <span className="text-sm text-muted">
                    Add an extra layer of security.
                  </span>
                </span>
                <ShieldCheck className="h-4 w-4 text-muted" />
              </button>
            </div>
          </DashboardCard>
        </aside>
      </div>
    </div>
  );
}
