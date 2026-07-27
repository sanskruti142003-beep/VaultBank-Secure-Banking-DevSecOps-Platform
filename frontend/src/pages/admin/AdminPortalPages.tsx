import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Ban,
  Bell,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Download,
  Eye,
  FileText,
  Filter,
  Gauge,
  Globe2,
  Home,
  IdCard,
  KeyRound,
  Landmark,
  LayoutGrid,
  List,
  Lock,
  Mail,
  Phone,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Snowflake,
  Timer,
  UserCheck,
  UserPlus,
  UsersRound,
  Wallet,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import { accountsApi } from "@/api/accounts.api";
import { authApi } from "@/api/auth.api";
import { paymentsApi } from "@/api/payments.api";
import { transactionsApi } from "@/api/transactions.api";
import {
  DashboardCard,
  IconTile,
  StatusPill,
} from "@/components/dashboard/DashboardCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ACCOUNT_TYPE_LABELS,
  getAccountLast4,
  groupAccountNumber,
  parseMoney,
} from "@/constants/accounts.constants";
import {
  accountDisplayName,
  accountStatusTone,
  formatDate,
  formatTime,
  kycTone,
  paymentStatusTone,
  titleCase,
  transactionStatusTone,
  transactionTitle,
} from "@/lib/dashboard-format";
import {
  isPaymentBackedTransaction,
  mergeTransactionsWithFailedPayments,
} from "@/lib/payment-transactions";
import {
  approveAccountApprovalRequest,
  approvedAccountsFromRequests,
  approvedDeleteAccountIds,
  rejectAccountApprovalRequest,
  useAllAccountApprovalRequests,
  type AccountApprovalRequest,
} from "@/lib/account-approval-store";
import { useAllLocalBeneficiaries } from "@/hooks/useBeneficiaries";
import {
  addKycNotification,
  createKycNotification,
  isKycIdentityDocumentType,
  kycIdentityStatus,
  updateKycSubmission,
  useKycSubmissions,
  type KycAsset,
  type KycSubmission,
} from "@/lib/kyc-store";
import { cn, customerDisplayId } from "@/lib/utils";
import {
  AccountStatus,
  KycStatus,
  type Account,
  type Beneficiary,
} from "@/types/accounts.types";
import type { RoleName, User } from "@/types/auth.types";
import { PaymentStatus, type PaymentOrder } from "@/types/payments.types";
import {
  TransactionStatus,
  TransactionType,
  type Transaction,
} from "@/types/transactions.types";

type Tone = "blue" | "green" | "amber" | "red" | "violet" | "slate";
type SortableItem = { createdAt?: string; updatedAt?: string };
interface AuditLogRow {
  id: string;
  timestamp: string;
  admin: string;
  action: string;
  customer: string;
  account: string;
  reason: string;
  result: string;
  severity: string;
}

const adminQueryKeys = {
  users: ["admin", "users"] as const,
  accounts: ["admin", "accounts"] as const,
  payments: ["admin", "payments"] as const,
  transactions: ["admin", "transactions"] as const,
  beneficiaries: ["admin", "beneficiaries"] as const,
};

const pieColors = ["#1B4FD8", "#10B981", "#8B5CF6", "#F59E0B", "#14B8A6"];

const selectClass =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-secondary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

function useAdminData() {
  const approvalRequests = useAllAccountApprovalRequests();
  const localBeneficiaries = useAllLocalBeneficiaries();
  const usersQuery = useQuery({
    queryKey: adminQueryKeys.users,
    queryFn: authApi.getAdminUsers,
    staleTime: 30_000,
    retry: false,
  });
  const accountsQuery = useQuery({
    queryKey: adminQueryKeys.accounts,
    queryFn: accountsApi.getAdminAll,
    staleTime: 30_000,
    retry: false,
  });
  const paymentsQuery = useQuery({
    queryKey: adminQueryKeys.payments,
    queryFn: () => paymentsApi.listAdmin(1, 100),
    staleTime: 30_000,
    retry: false,
  });
  const transactionsQuery = useQuery({
    queryKey: adminQueryKeys.transactions,
    queryFn: () => transactionsApi.getAdminHistory({ page: 1, limit: 100 }),
    staleTime: 30_000,
    retry: false,
  });
  const beneficiariesQuery = useQuery({
    queryKey: adminQueryKeys.beneficiaries,
    queryFn: accountsApi.getAdminBeneficiaries,
    staleTime: 30_000,
    retry: false,
  });

  const users = usersQuery.data ?? [];
  const serverAccounts = accountsQuery.data ?? [];
  const accounts = useMemo(() => {
    const deletedAccountIds = approvedDeleteAccountIds(approvalRequests);
    const merged = [...serverAccounts, ...approvedAccountsFromRequests(approvalRequests)];
    const seen = new Set<string>();

    return merged.filter((account) => {
      if (seen.has(account.id) || deletedAccountIds.has(account.id)) {
        return false;
      }
      seen.add(account.id);
      return account.status !== AccountStatus.CLOSED;
    });
  }, [approvalRequests, serverAccounts]);
  const payments = paymentsQuery.data?.data ?? [];
  const serverTransactions = transactionsQuery.data?.data ?? [];
  const transactions = useMemo(
    () => mergeTransactionsWithFailedPayments(serverTransactions, payments),
    [payments, serverTransactions],
  );
  const beneficiaries = useMemo(() => {
    const deletedAccountIds = approvedDeleteAccountIds(approvalRequests);
    const seen = new Set<string>();

    return [...(beneficiariesQuery.data ?? []), ...localBeneficiaries]
      .filter((beneficiary) => {
        if (
          seen.has(beneficiary.id) ||
          deletedAccountIds.has(beneficiary.accountId)
        ) {
          return false;
        }
        seen.add(beneficiary.id);
        return true;
      })
      .sort(
        (left, right) =>
          Date.parse(right.createdAt || "0") - Date.parse(left.createdAt || "0"),
      );
  }, [approvalRequests, beneficiariesQuery.data, localBeneficiaries]);

  return {
    users,
    accounts,
    payments,
    transactions,
    beneficiaries,
    totals: {
      payments: paymentsQuery.data?.total ?? payments.length,
      transactions: Math.max(transactionsQuery.data?.total ?? 0, transactions.length),
    },
    queries: {
      usersQuery,
      accountsQuery,
      paymentsQuery,
      transactionsQuery,
      beneficiariesQuery,
    },
    isLoading:
      usersQuery.isLoading ||
      accountsQuery.isLoading ||
      paymentsQuery.isLoading ||
      transactionsQuery.isLoading ||
      beneficiariesQuery.isLoading,
  };
}

function invalidateAdminQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["admin"] });
}

function money(value: string | number | null | undefined, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(parseMoney(value));
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function safeDate(value: string | undefined) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function latestFirst<T extends SortableItem>(items: T[]) {
  return [...items].sort(
    (a, b) =>
      safeDate(b.updatedAt ?? b.createdAt) - safeDate(a.updatedAt ?? a.createdAt),
  );
}

function initials(name: string | undefined, fallback = "AU") {
  return (name || fallback)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function maskPhone(phone: string | null | undefined) {
  if (!phone || phone.length < 6) {
    return "Not added";
  }
  return `${phone.slice(0, 4)} ${"*".repeat(Math.max(phone.length - 7, 2))}${phone.slice(-3)}`;
}

function csvDownload(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows
    .map((row) =>
      row.map((cell) => `"${String(cell).split('"').join('""')}"`).join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  toast.success("Download started.");
}

function userName(users: User[], userId: string | undefined) {
  return users.find((user) => user.id === userId)?.fullName ?? "Customer";
}

function isCustomerProfile(user: User) {
  return user.roles.includes("customer") && !user.roles.includes("admin");
}

function accountById(accounts: Account[], id: string | null | undefined) {
  return accounts.find((account) => account.id === id);
}

function accountOwner(users: User[], accounts: Account[], accountId: string | null | undefined) {
  const account = accountById(accounts, accountId);
  return userName(users, account?.userId);
}

function accountLabel(accounts: Account[], accountId: string | null | undefined) {
  const account = accountById(accounts, accountId);
  if (!account) {
    return "-";
  }
  return `${accountDisplayName(account)} ${getAccountLast4(account.accountNumber)}`;
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-secondary">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

function AdminMetric({
  title,
  value,
  helper,
  icon,
  tone = "blue",
  trend,
  trendTone = "green",
}: {
  title: string;
  value: string | number;
  helper: string;
  icon: ComponentType<{ className?: string }>;
  tone?: Tone;
  trend?: string;
  trendTone?: "green" | "red" | "slate";
}) {
  const trendClass =
    trendTone === "red"
      ? "text-danger"
      : trendTone === "green"
        ? "text-accent"
        : "text-muted";
  return (
    <DashboardCard className="p-5">
      <div className="flex items-center gap-4">
        <IconTile icon={icon} tone={tone} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-600">{title}</p>
          <p className="mt-2 truncate text-2xl font-bold text-secondary">
            {value}
          </p>
          <p className="mt-2 text-xs text-muted">
            {trend ? <span className={cn("font-semibold", trendClass)}>{trend} </span> : null}
            {helper}
          </p>
        </div>
      </div>
    </DashboardCard>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative block">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <Input
        className="pl-10"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </label>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td className="px-5 py-10 text-center text-sm text-muted" colSpan={colSpan}>
        {label}
      </td>
    </tr>
  );
}

function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <DashboardCard className="overflow-hidden">
      <div className="overflow-x-auto">{children}</div>
    </DashboardCard>
  );
}

function alertRows(
  accounts: Account[],
  payments: PaymentOrder[],
  transactions: Transaction[],
  beneficiaries: Beneficiary[],
  users: User[],
) {
  const failedPayments = payments
    .filter((payment) => payment.status === PaymentStatus.FAILED)
    .slice(0, 2)
    .map((payment) => ({
      id: `payment-${payment.id}`,
      title: "Failed payment requires review",
      helper: `${accountOwner(users, accounts, payment.fromAccountId)} - ${money(
        payment.amount,
        payment.currency,
      )}`,
      tone: "red" as Tone,
      icon: XCircle,
      time: formatTime(payment.updatedAt),
      accountId: payment.fromAccountId,
    }));
  const failedTransactions = transactions
    .filter(
      (transaction) =>
        transaction.status === TransactionStatus.FAILED &&
        !isPaymentBackedTransaction(transaction),
    )
    .slice(0, 2)
    .map((transaction) => ({
      id: `failed-transaction-${transaction.id}`,
      title: "Failed transaction requires review",
      helper: `${accountOwner(users, accounts, transaction.fromAccountId)} - ${money(
        transaction.amount,
        transaction.currency,
      )}`,
      tone: "red" as Tone,
      icon: XCircle,
      time: formatTime(transaction.updatedAt),
      accountId: transaction.fromAccountId,
    }));
  const frozen = accounts
    .filter((account) => account.status === AccountStatus.FROZEN)
    .slice(0, 2)
    .map((account) => ({
      id: `account-${account.id}`,
      title: "Account frozen",
      helper: `${userName(users, account.userId)} - ${groupAccountNumber(
        account.accountNumber,
      )}`,
      tone: "blue" as Tone,
      icon: Lock,
      time: formatTime(account.updatedAt),
      accountId: account.id,
    }));
  const pendingKyc = accounts
    .filter((account) => account.kycStatus === KycStatus.PENDING)
    .slice(0, 2)
    .map((account) => ({
      id: `kyc-${account.id}`,
      title: "KYC pending",
      helper: userName(users, account.userId),
      tone: "amber" as Tone,
      icon: IdCard,
      time: formatTime(account.updatedAt),
      accountId: account.id,
    }));
  const highTransfers = transactions
    .filter((transaction) => parseMoney(transaction.amount) >= 50_000)
    .slice(0, 2)
    .map((transaction) => ({
      id: `txn-${transaction.id}`,
      title: "High value transaction flagged",
      helper: `${transaction.reference} - ${money(
        transaction.amount,
        transaction.currency,
      )}`,
      tone: "red" as Tone,
      icon: AlertTriangle,
      time: formatTime(transaction.updatedAt),
      accountId: transaction.fromAccountId,
    }));
  const newBeneficiaries = beneficiaries
    .filter((beneficiary) => !beneficiary.isVerified)
    .slice(0, 1)
    .map((beneficiary) => ({
      id: `beneficiary-${beneficiary.id}`,
      title: "New beneficiary pending review",
      helper: beneficiary.name,
      tone: "amber" as Tone,
      icon: UserPlus,
      time: formatTime(beneficiary.createdAt),
      accountId: beneficiary.accountId,
    }));
  return [
    ...failedPayments,
    ...failedTransactions,
    ...frozen,
    ...pendingKyc,
    ...highTransfers,
    ...newBeneficiaries,
  ].slice(0, 6);
}

function recentAuditRows(
  users: User[],
  accounts: Account[],
  payments: PaymentOrder[],
  transactions: Transaction[],
): AuditLogRow[] {
  const accountLogs = latestFirst(accounts)
    .filter(
      (account) =>
        account.status !== AccountStatus.ACTIVE ||
        account.kycStatus !== KycStatus.PENDING,
    )
    .slice(0, 5)
    .map((account) => ({
      id: `account-${account.id}`,
      timestamp: account.updatedAt,
      admin: "admin_system",
      action:
        account.status === AccountStatus.FROZEN
          ? "ACCOUNT_FROZEN"
          : account.kycStatus === KycStatus.APPROVED
            ? "KYC_APPROVED"
            : account.kycStatus === KycStatus.REJECTED
              ? "KYC_REJECTED"
              : "ACCOUNT_REVIEWED",
      customer: userName(users, account.userId),
      account: account.accountNumber,
      reason: account.status === AccountStatus.FROZEN ? "Administrative hold" : "Verification workflow",
      result: "SUCCESS",
      severity: account.status === AccountStatus.FROZEN ? "HIGH" : "MEDIUM",
    }));
  const paymentLogs = latestFirst(payments)
    .filter((payment) => payment.status === PaymentStatus.FAILED)
    .slice(0, 3)
    .map((payment) => ({
      id: `payment-${payment.id}`,
      timestamp: payment.updatedAt,
      admin: "payment_monitor",
      action: "PAYMENT_FAILED",
      customer: accountOwner(users, accounts, payment.fromAccountId),
      account: accountLabel(accounts, payment.fromAccountId),
      reason: payment.description ?? "Payment failure",
      result: "FAILED",
      severity: "HIGH",
    }));
  const transactionLogs = latestFirst(transactions)
    .filter((transaction) => transaction.status === TransactionStatus.REVERSED)
    .slice(0, 3)
    .map((transaction) => ({
      id: `transaction-${transaction.id}`,
      timestamp: transaction.updatedAt,
      admin: "admin_user",
      action: "TRANSACTION_REVERSED",
      customer: accountOwner(users, accounts, transaction.fromAccountId),
      account: accountLabel(accounts, transaction.fromAccountId),
      reason: String(transaction.metadata?.reversalReason ?? "Admin reversal"),
      result: "SUCCESS",
      severity: "HIGH",
    }));
  return [...accountLogs, ...paymentLogs, ...transactionLogs]
    .sort((a, b) => safeDate(b.timestamp) - safeDate(a.timestamp))
    .slice(0, 10);
}

function OverviewCharts({ transactions }: { transactions: Transaction[] }) {
  const lineData = useMemo(() => {
    const labels = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      return {
        key: date.toISOString().slice(0, 10),
        label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date),
        amount: 0,
      };
    });
    transactions.forEach((transaction) => {
      const key = transaction.initiatedAt?.slice(0, 10);
      const match = labels.find((item) => item.key === key);
      if (match) {
        match.amount += parseMoney(transaction.amount);
      }
    });
    return labels;
  }, [transactions]);

  const pieData = useMemo(() => {
    const rows = Object.values(TransactionType).map((type) => ({
      name: titleCase(type),
      value: transactions.filter((transaction) => transaction.type === type).length,
    }));
    return rows.filter((row) => row.value > 0);
  }, [transactions]);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <DashboardCard className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-secondary">Daily Transaction Volume</h2>
          <StatusPill tone="blue">Live API</StatusPill>
        </div>
        <div className="h-72">
          <ResponsiveContainer>
            <LineChart data={lineData}>
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={compact} />
              <Tooltip formatter={(value) => money(Number(value))} />
              <Line
                type="monotone"
                dataKey="amount"
                stroke="#1B4FD8"
                strokeWidth={3}
                dot={{ r: 4, fill: "#1B4FD8" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </DashboardCard>

      <DashboardCard className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-secondary">Transaction Type Mix</h2>
          <Button size="sm" variant="ghost">View all</Button>
        </div>
        <div className="grid gap-5 md:grid-cols-[220px_1fr] md:items-center">
          <div className="h-56">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={pieData.length ? pieData : [{ name: "No activity", value: 1 }]}
                  dataKey="value"
                  innerRadius={62}
                  outerRadius={92}
                  paddingAngle={2}
                >
                  {(pieData.length ? pieData : [{ name: "No activity", value: 1 }]).map(
                    (_, index) => (
                      <Cell key={index} fill={pieData.length ? pieColors[index % pieColors.length] : "#CBD5E1"} />
                    ),
                  )}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3">
            {(pieData.length ? pieData : [{ name: "No activity", value: 0 }]).map(
              (row, index) => (
                <div className="flex items-center justify-between text-sm" key={row.name}>
                  <span className="flex items-center gap-2 text-muted">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor: pieData.length
                          ? pieColors[index % pieColors.length]
                          : "#CBD5E1",
                      }}
                    />
                    {row.name}
                  </span>
                  <span className="font-semibold text-secondary">{row.value}</span>
                </div>
              ),
            )}
          </div>
        </div>
      </DashboardCard>
    </div>
  );
}

export function AdminOverviewPage() {
  const navigate = useNavigate();
  const { users, accounts, payments, transactions, beneficiaries, totals, isLoading } =
    useAdminData();
  const customerUsers = users.filter(isCustomerProfile);
  const pendingKyc = accounts.filter((account) => account.kycStatus === KycStatus.PENDING);
  const frozenAccounts = accounts.filter((account) => account.status === AccountStatus.FROZEN);
  const failedTransactions = transactions.filter((transaction) => transaction.status === TransactionStatus.FAILED);
  const dailyVolume = transactions
    .filter((transaction) => transaction.status === TransactionStatus.COMPLETED)
    .reduce((sum, transaction) => sum + parseMoney(transaction.amount), 0);
  const alerts = alertRows(accounts, payments, transactions, beneficiaries, users);

  const quickActions = [
    { label: "Add Customer", helper: "Create new customer", icon: UserPlus, to: "/admin/customers" },
    { label: "Open Account", helper: "Review account requests", icon: Landmark, to: "/admin/accounts" },
    { label: "Review eKYC", helper: "Pending verifications", icon: IdCard, to: "/admin/ekyc" },
    { label: "Review Alerts", helper: "Investigate alerts", icon: AlertTriangle, to: "/admin/fraud-alerts" },
    { label: "Generate Report", helper: "View system reports", icon: FileText, to: "/admin/reports" },
    { label: "Manage Users", helper: "Staff and role management", icon: UsersRound, to: "/admin/staff-roles" },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Admin Overview"
        subtitle={isLoading ? "Loading live operational data..." : "Monitor customers, accounts, reviews, and alerts."}
        action={
          <Button onClick={() => window.location.reload()} variant="outline">
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetric title="Total Customers" value={customerUsers.length} helper="vs last 7 days" trend="+5.3%" icon={UsersRound} tone="blue" />
        <AdminMetric title="Total Bank Accounts" value={accounts.length} helper="vs last 7 days" trend="+4.8%" icon={Landmark} tone="green" />
        <AdminMetric title="Total Transactions" value={totals.transactions} helper="vs last 7 days" trend="+7.2%" icon={ArrowLeftRight} tone="violet" />
        <AdminMetric title="Pending eKYC Requests" value={pendingKyc.length} helper="vs last 7 days" trend="+8.4%" trendTone="red" icon={IdCard} tone="amber" />
        <AdminMetric title="Failed Transactions" value={failedTransactions.length} helper="vs last 7 days" trend="+12.6%" trendTone="red" icon={XCircle} tone="red" />
        <AdminMetric title="Suspicious Activity Alerts" value={alerts.length} helper="requires review" trend="+15.4%" trendTone="red" icon={ShieldAlert} tone="amber" />
        <AdminMetric title="Frozen / Blocked Accounts" value={frozenAccounts.length} helper="vs last 7 days" trend="-3.1%" icon={Lock} tone="blue" />
        <AdminMetric title="Daily Transaction Volume" value={money(dailyVolume)} helper={`${totals.payments} payments tracked`} trend="+9.6%" icon={Wallet} tone="green" />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <OverviewCharts transactions={transactions} />
        <DashboardCard className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-secondary">Recent Alerts</h2>
            <Button onClick={() => navigate("/admin/fraud-alerts")} size="sm" variant="ghost">View all</Button>
          </div>
          <div className="mt-4 space-y-3">
            {alerts.length ? alerts.map((alert) => (
              <button
                className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-3 text-left transition hover:border-primary/30 hover:bg-primary/5"
                key={alert.id}
                onClick={() => navigate("/admin/fraud-alerts")}
                type="button"
              >
                <IconTile className="h-10 w-10 rounded-lg" icon={alert.icon} tone={alert.tone} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-secondary">{alert.title}</span>
                  <span className="block truncate text-xs text-muted">{alert.helper}</span>
                </span>
                <span className="text-xs text-muted">{alert.time}</span>
              </button>
            )) : (
              <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-muted">
                No operational alerts from the current API data.
              </p>
            )}
          </div>
        </DashboardCard>
      </div>

      <DashboardCard className="p-4">
        <h2 className="px-1 font-bold text-secondary">Quick Actions</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {quickActions.map((action) => (
            <button
              className="flex min-h-20 items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-primary/30 hover:bg-primary/5"
              key={action.label}
              onClick={() => navigate(action.to)}
              type="button"
            >
              <IconTile className="h-10 w-10 rounded-lg" icon={action.icon} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-secondary">{action.label}</span>
                <span className="text-xs text-muted">{action.helper}</span>
              </span>
            </button>
          ))}
        </div>
      </DashboardCard>

      <DashboardCard className="border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center gap-3">
          <IconTile icon={ShieldCheck} />
          <div>
            <p className="font-bold text-secondary">Sensitive customer secrets are never visible to admins.</p>
            <p className="mt-1 text-sm text-muted">
              Admin actions use role checks, audit logging, and masked account/customer data.
            </p>
          </div>
        </div>
      </DashboardCard>
    </div>
  );
}

export function AdminCustomersPage() {
  const { users, accounts, transactions } = useAdminData();
  const customerUsers = users.filter(isCustomerProfile);
  const customerUserIds = new Set(customerUsers.map((user) => user.id));
  const customerAccounts = accounts.filter((account) =>
    customerUserIds.has(account.userId),
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [customerId, setCustomerId] = useState(
    () => searchParams.get("customerId") ?? "",
  );
  const [status, setStatus] = useState(
    () => searchParams.get("status") ?? "all",
  );
  const [kyc, setKyc] = useState(() => searchParams.get("kyc") ?? "all");
  const [selectedId, setSelectedId] = useState("");
  const [profileTab, setProfileTab] = useState<"overview" | "accounts" | "activity" | "support">("overview");
  const searchParamValue = searchParams.get("search") ?? "";
  const customerIdParamValue = searchParams.get("customerId") ?? "";
  const statusParamValue = searchParams.get("status") ?? "all";
  const kycParamValue = searchParams.get("kyc") ?? "all";

  useEffect(() => {
    setSearch(searchParamValue);
    setCustomerId(customerIdParamValue);
    setStatus(statusParamValue);
    setKyc(kycParamValue);
  }, [
    customerIdParamValue,
    kycParamValue,
    searchParamValue,
    statusParamValue,
  ]);

  const filtered = customerUsers.filter((user) => {
    const userAccounts = customerAccounts.filter((account) => account.userId === user.id);
    const query = search.trim().toLowerCase();
    const customerQuery = customerId.trim().toLowerCase();
    const matchesQuery =
      !query ||
      [
        user.fullName,
        user.username,
        user.email,
        user.phone ?? "",
        user.id,
        customerDisplayId(user.id),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    const matchesCustomerId =
      !customerQuery ||
      user.id.toLowerCase().includes(customerQuery) ||
      customerDisplayId(user.id).toLowerCase().includes(customerQuery);
    const matchesStatus =
      status === "all" ||
      (status === "active" ? user.isActive !== false : user.isActive === false);
    const matchesKyc =
      kyc === "all" ||
      userAccounts.some((account) => account.kycStatus === kyc);
    return matchesQuery && matchesCustomerId && matchesStatus && matchesKyc;
  });
  const selected = customerUsers.find((user) => user.id === selectedId) ?? filtered[0] ?? customerUsers[0];
  const selectedAccounts = customerAccounts.filter((account) => account.userId === selected?.id);
  const selectedTransactions = transactions.filter((transaction) =>
    selectedAccounts.some(
      (account) =>
        transaction.fromAccountId === account.id || transaction.toAccountId === account.id,
    ),
  );

  function applyFilters() {
    const next = new URLSearchParams();
    if (search.trim()) {
      next.set("search", search.trim());
    }
    if (customerId.trim()) {
      next.set("customerId", customerId.trim());
    }
    if (status !== "all") {
      next.set("status", status);
    }
    if (kyc !== "all") {
      next.set("kyc", kyc);
    }
    setSearchParams(next, { replace: true });
    setSelectedId(filtered[0]?.id ?? "");
    setProfileTab("overview");
  }

  function exportUsers() {
    csvDownload("vaultbank-admin-customers.csv", [
      ["Customer ID", "Name", "Email", "Phone", "Roles", "Status"],
      ...filtered.map((user) => [
        customerDisplayId(user.id),
        user.fullName,
        user.email,
        user.phone ?? "",
        user.roles.join("|"),
        user.isActive === false ? "inactive" : "active",
      ]),
    ]);
  }

  return (
    <div className="space-y-5">
      <SectionHeader title="Customers" subtitle="Search, review, and manage customer access." />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetric title="Total Customers" value={customerUsers.length} helper="registered customer profiles" trend="+5.3%" icon={UsersRound} />
        <AdminMetric title="Active Today" value={customerUsers.filter((user) => user.isActive !== false).length} helper="active customer profiles" trend="+4.1%" icon={UserCheck} tone="green" />
        <AdminMetric title="Locked Users" value={customerUsers.filter((user) => user.isActive === false).length} helper="needs access review" trend="-8.7%" trendTone="red" icon={Ban} tone="red" />
        <AdminMetric title="Pending Support Cases" value={customerAccounts.filter((account) => account.status === AccountStatus.FROZEN).length} helper="derived from customer account holds" trend="+12.6%" trendTone="red" icon={Bell} tone="amber" />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="space-y-5">
          <DashboardCard className="p-4">
            <form
              className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.2fr_1.2fr_1fr_1fr_auto_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                applyFilters();
              }}
            >
              <SearchBox value={search} onChange={setSearch} placeholder="Search by name, email, mobile..." />
              <Input placeholder="Customer ID" value={customerId} onChange={(event) => setCustomerId(event.target.value)} />
              <select className={selectClass} onChange={(event) => setStatus(event.target.value)} value={status}>
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <select className={selectClass} onChange={(event) => setKyc(event.target.value)} value={kyc}>
                <option value="all">All KYC Statuses</option>
                {Object.values(KycStatus).map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
              </select>
              <Button
                onClick={() => {
                  setSearch("");
                  setCustomerId("");
                  setStatus("all");
                  setKyc("all");
                  setSelectedId("");
                  setSearchParams({}, { replace: true });
                }}
                type="button"
                variant="outline"
              >
                Clear
              </Button>
              <Button type="submit"><Search className="h-4 w-4" /> Search</Button>
            </form>
          </DashboardCard>

          <TableShell>
            <table className="min-w-[1040px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-5 py-4">Customer ID</th>
                  <th className="px-5 py-4">Name</th>
                  <th className="px-5 py-4">Email</th>
                  <th className="px-5 py-4">Mobile</th>
                  <th className="px-5 py-4">Account Status</th>
                  <th className="px-5 py-4">KYC Status</th>
                  <th className="px-5 py-4">Last Login</th>
                  <th className="px-5 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length ? filtered.slice(0, 10).map((user) => {
                  const account = accounts.find((item) => item.userId === user.id);
                  return (
                    <tr className={cn("hover:bg-slate-50", selected?.id === user.id && "bg-primary/5")} key={user.id}>
                      <td className="px-5 py-4 font-semibold text-primary">{customerDisplayId(user.id)}</td>
                      <td className="px-5 py-4 font-semibold text-secondary">{user.fullName}</td>
                      <td className="px-5 py-4 text-muted">{user.email}</td>
                      <td className="px-5 py-4 text-muted">{maskPhone(user.phone)}</td>
                      <td className="px-5 py-4">
                        <StatusPill tone={user.isActive === false ? "red" : "green"}>{user.isActive === false ? "Inactive" : "Active"}</StatusPill>
                      </td>
                      <td className="px-5 py-4">
                        <StatusPill tone={account ? kycTone(account.kycStatus) : "slate"}>{account ? titleCase(account.kycStatus) : "No Account"}</StatusPill>
                      </td>
                      <td className="px-5 py-4 text-muted">{formatDate(user.updatedAt)}</td>
                      <td className="px-5 py-4">
                        <Button onClick={() => setSelectedId(user.id)} size="sm" variant="outline">
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                }) : <EmptyRow colSpan={8} label="No customers match the current filters." />}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm text-muted">
              <span>Showing {Math.min(filtered.length, 10)} of {filtered.length} customers</span>
              <Button onClick={exportUsers} size="sm" variant="outline"><Download className="h-4 w-4" /> Export</Button>
            </div>
          </TableShell>
        </div>

        <DashboardCard className="p-5">
          {selected ? (
            <>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {initials(selected.fullName)}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-secondary">{selected.fullName}</h2>
                      <StatusPill tone={selected.isActive === false ? "red" : "green"}>{selected.isActive === false ? "Inactive" : "Active"}</StatusPill>
                    </div>
                    <p className="text-xs text-muted">Customer ID: {customerDisplayId(selected.id)}</p>
                  </div>
                </div>
              </div>
              <div className="mt-5 flex border-b border-slate-200">
                {[
                  ["overview", "Overview"],
                  ["accounts", `Accounts (${selectedAccounts.length})`],
                  ["activity", "Activity"],
                  ["support", "Support"],
                ].map(([id, label]) => (
                  <button
                    className={cn(
                      "px-3 py-2 text-sm font-semibold text-muted",
                      profileTab === id && "border-b-2 border-primary text-primary",
                    )}
                    key={id}
                    onClick={() => setProfileTab(id as typeof profileTab)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
              {profileTab === "overview" ? (
                <dl className="mt-5 space-y-3 text-sm">
                  {[
                    ["Email", selected.email],
                    ["Mobile Number", selected.phone ?? "Not added"],
                    ["Registered", formatDate(selected.createdAt)],
                    ["Roles", selected.roles.join(", ")],
                    ["KYC Status", selectedAccounts[0] ? titleCase(selectedAccounts[0].kycStatus) : "No Account"],
                    ["Registered Devices", String(Math.max(1, selectedAccounts.length + 1))],
                  ].map(([label, value]) => (
                    <div className="flex justify-between gap-4" key={label}>
                      <dt className="text-muted">{label}</dt>
                      <dd className="text-right font-semibold text-secondary">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {profileTab === "accounts" ? (
                <div className="mt-5 space-y-3">
                  {selectedAccounts.length ? selectedAccounts.map((account) => (
                    <div className="rounded-lg border border-slate-200 p-3" key={account.id}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-secondary">{accountDisplayName(account)}</span>
                        <StatusPill tone={accountStatusTone(account.status)}>{titleCase(account.status)}</StatusPill>
                      </div>
                      <p className="mt-1 text-sm text-muted">{groupAccountNumber(account.accountNumber)}</p>
                    </div>
                  )) : <p className="text-sm text-muted">No customer accounts found.</p>}
                </div>
              ) : null}
              {profileTab === "activity" ? (
                <div className="mt-5 space-y-3">
                  {selectedTransactions.slice(0, 5).map((transaction) => (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3" key={transaction.id}>
                      <div>
                        <p className="font-semibold text-secondary">{transactionTitle(transaction)}</p>
                        <p className="text-xs text-muted">{transaction.reference}</p>
                      </div>
                      <span className="font-semibold text-secondary">{money(transaction.amount, transaction.currency)}</span>
                    </div>
                  ))}
                  {!selectedTransactions.length ? <p className="text-sm text-muted">No transaction activity yet.</p> : null}
                </div>
              ) : null}
              {profileTab === "support" ? (
                <div className="mt-5 space-y-3">
                  {(selectedAccounts.filter((account) => account.status === AccountStatus.FROZEN).length ? selectedAccounts.filter((account) => account.status === AccountStatus.FROZEN) : selectedAccounts.slice(0, 1)).map((account) => (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" key={account.id}>
                      Account review requested for {getAccountLast4(account.accountNumber)}.
                    </div>
                  ))}
                  {!selectedAccounts.length ? <p className="text-sm text-muted">No support cases.</p> : null}
                </div>
              ) : null}
              <div className="mt-5 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
                Admins cannot access passwords, OTPs, PINs, CVV, or authentication secrets.
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">Select a customer to view profile details.</p>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}

export function AdminAccountsPage() {
  const queryClient = useQueryClient();
  const { users, accounts } = useAdminData();
  const approvalRequests = useAllAccountApprovalRequests();
  const pendingApprovalRequests = approvalRequests.filter(
    (request) => request.status === "pending",
  );
  const reviewedApprovalRequests = approvalRequests
    .filter((request) => request.status !== "pending")
    .slice(0, 4);
  const serverAccountIds = new Set(accounts.map((account) => account.id));
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const selected = accounts.find((account) => account.id === selectedId) ?? accounts[0];
  const statusCounts = {
    pending:
      accounts.filter((account) => account.kycStatus === KycStatus.PENDING).length +
      pendingApprovalRequests.length,
    active: accounts.filter((account) => account.status === AccountStatus.ACTIVE).length,
    frozen: accounts.filter((account) => account.status === AccountStatus.FROZEN).length,
    dormant: accounts.filter((account) => account.status === AccountStatus.CLOSED).length,
  };

  const filtered = accounts.filter((account) => {
    const query = search.trim().toLowerCase();
    return (
      !query ||
      [
        account.accountNumber,
        userName(users, account.userId),
        account.type,
        account.status,
        account.kycStatus,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  });

  const actionMutation = useMutation({
    mutationFn: async ({
      account,
      action,
    }: {
      account: Account;
      action: "freeze" | "unfreeze" | "close" | "approve" | "reject";
    }) => {
      if (action === "freeze") return accountsApi.freeze(account.id);
      if (action === "unfreeze") return accountsApi.unfreeze(account.id);
      if (action === "close") {
        await accountsApi.close(account.id);
        return account;
      }
      return accountsApi.updateKyc(
        account.id,
        action === "approve" ? KycStatus.APPROVED : KycStatus.REJECTED,
      );
    },
    onSuccess: () => {
      toast.success("Account updated.");
      invalidateAdminQueries(queryClient);
    },
  });

  const approvalMutation = useMutation({
    mutationFn: async ({
      request,
      decision,
    }: {
      request: AccountApprovalRequest;
      decision: "approve" | "reject";
    }) => {
      if (decision === "reject") {
        return rejectAccountApprovalRequest(request.id, "Admin");
      }

      if (request.action === "open") {
        const approvedAccount = await accountsApi.createApprovedForUser(
          request.userId,
          {
            type: request.accountType,
            currency: request.currency,
            openingDeposit: request.openingDeposit ?? "0.0000",
          },
        );
        return approveAccountApprovalRequest(
          request.id,
          "Admin",
          undefined,
          approvedAccount,
        );
      }

      if (
        request.action === "delete" &&
        request.accountId &&
        serverAccountIds.has(request.accountId)
      ) {
        await accountsApi.close(request.accountId);
      }
      return approveAccountApprovalRequest(request.id, "Admin");
    },
    onSuccess: (_request, variables) => {
      toast.success(
        variables.decision === "approve"
          ? "Account request approved."
          : "Account request rejected.",
      );
      invalidateAdminQueries(queryClient);
    },
    onError: () => {
      toast.error("Unable to update account approval request.");
    },
  });

  async function setLimits(account: Account) {
    const daily = Number.parseFloat(window.prompt("Daily transfer limit", account.limits?.dailyTransferLimit ?? "10000") ?? "");
    const single = Number.parseFloat(window.prompt("Single transaction limit", account.limits?.singleTxnLimit ?? "5000") ?? "");
    if (!Number.isFinite(daily) || !Number.isFinite(single) || daily < single) {
      toast.error("Enter valid limits. Single limit cannot exceed daily limit.");
      return;
    }
    await accountsApi.updateLimits(account.id, {
      dailyTransferLimit: daily,
      singleTxnLimit: single,
    });
    toast.success("Limits updated.");
    invalidateAdminQueries(queryClient);
  }

  return (
    <div className="space-y-5">
      <SectionHeader title="Accounts" subtitle="Search and manage customer accounts." />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetric title="Pending Requests" value={statusCounts.pending} helper="KYC/account review" trend="+12.6%" trendTone="red" icon={Timer} tone="amber" />
        <AdminMetric title="Active Accounts" value={statusCounts.active} helper="vs last 7 days" trend="+4.8%" icon={UserCheck} tone="green" />
        <AdminMetric title="Frozen Accounts" value={statusCounts.frozen} helper="requires review" trend="+3.2%" icon={Snowflake} tone="blue" />
        <AdminMetric title="Closed Accounts" value={statusCounts.dormant} helper="inactive or closed" trend="+8.1%" trendTone="red" icon={Ban} tone="violet" />
      </section>

      <DashboardCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-secondary">
              Account Opening & Deletion Approvals
            </h2>
            <p className="mt-1 text-sm text-muted">
              Customer account requests must be approved here before they take effect.
            </p>
          </div>
          <StatusPill tone={pendingApprovalRequests.length ? "amber" : "green"}>
            {pendingApprovalRequests.length
              ? `${pendingApprovalRequests.length} Pending`
              : "No pending requests"}
          </StatusPill>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {[...pendingApprovalRequests, ...reviewedApprovalRequests].map((request) => (
            <div
              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              key={request.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-secondary">
                    {request.action === "open"
                      ? "Open new account"
                      : "Delete account"}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {request.userName} - {request.userEmail ?? "No email"}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {ACCOUNT_TYPE_LABELS[request.accountType]}{" "}
                    {request.accountNumber
                      ? groupAccountNumber(request.accountNumber)
                      : request.currency}
                  </p>
                </div>
                <StatusPill
                  tone={
                    request.status === "approved"
                      ? "green"
                      : request.status === "rejected"
                        ? "red"
                        : "amber"
                  }
                >
                  {titleCase(request.status)}
                </StatusPill>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2">
                <span>Requested {formatDate(request.requestedAt)}</span>
                <span>
                  {request.reviewedAt
                    ? `Reviewed ${formatDate(request.reviewedAt)}`
                    : request.action === "open"
                      ? `Deposit ${money(request.openingDeposit, request.currency)}`
                      : "Awaiting admin action"}
                </span>
              </div>
              {request.status === "pending" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    disabled={approvalMutation.isPending}
                    onClick={() =>
                      approvalMutation.mutate({ request, decision: "approve" })
                    }
                    size="sm"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    disabled={approvalMutation.isPending}
                    onClick={() =>
                      approvalMutation.mutate({ request, decision: "reject" })
                    }
                    size="sm"
                    variant="outline"
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          {!pendingApprovalRequests.length && !reviewedApprovalRequests.length ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-muted">
              No account approval requests yet.
            </div>
          ) : null}
        </div>
      </DashboardCard>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <TableShell>
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-bold text-secondary">Accounts</h2>
              <p className="text-sm text-muted">Showing {filtered.length} accounts</p>
            </div>
            <div className="flex gap-3">
              <SearchBox value={search} onChange={setSearch} placeholder="Search by account no., customer, email..." />
              <Button variant="outline"><Filter className="h-4 w-4" /> Filters</Button>
              <Button onClick={() => csvDownload("vaultbank-admin-accounts.csv", [["Account", "Customer", "Type", "Balance", "Status"], ...filtered.map((account) => [account.accountNumber, userName(users, account.userId), account.type, account.balance, account.status])])}>
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-5 py-4">Account No.</th>
                <th className="px-5 py-4">Customer</th>
                <th className="px-5 py-4">Type</th>
                <th className="px-5 py-4">Balance</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">KYC</th>
                <th className="px-5 py-4">Transaction Limit</th>
                <th className="px-5 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.slice(0, 12).map((account) => (
                <tr className={cn("hover:bg-slate-50", selected?.id === account.id && "bg-primary/5")} key={account.id}>
                  <td className="px-5 py-4 font-semibold text-primary">{account.accountNumber}</td>
                  <td className="px-5 py-4 font-semibold text-secondary">{userName(users, account.userId)}</td>
                  <td className="px-5 py-4">{ACCOUNT_TYPE_LABELS[account.type]}</td>
                  <td className="px-5 py-4 font-semibold">{money(account.balance, account.currency)}</td>
                  <td className="px-5 py-4"><StatusPill tone={accountStatusTone(account.status)}>{titleCase(account.status)}</StatusPill></td>
                  <td className="px-5 py-4"><StatusPill tone={kycTone(account.kycStatus)}>{titleCase(account.kycStatus)}</StatusPill></td>
                  <td className="px-5 py-4 text-muted">{money(account.limits?.dailyTransferLimit, account.currency)} / Day</td>
                  <td className="px-5 py-4">
                    <Button onClick={() => setSelectedId(account.id)} size="sm" variant="outline">Details</Button>
                  </td>
                </tr>
              ))}
              {!filtered.length ? <EmptyRow colSpan={8} label="No accounts found." /> : null}
            </tbody>
          </table>
        </TableShell>

        <DashboardCard className="p-5">
          {selected ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-secondary">{selected.accountNumber}</h2>
                  <p className="text-sm text-muted">{ACCOUNT_TYPE_LABELS[selected.type]}</p>
                </div>
                <StatusPill tone={accountStatusTone(selected.status)}>{titleCase(selected.status)}</StatusPill>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="font-semibold text-secondary">{userName(users, selected.userId)}</p>
                <p className="mt-1 text-sm text-muted">Current balance {money(selected.balance, selected.currency)}</p>
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <InfoTile label="Available Balance" value={money(selected.balance, selected.currency)} icon={Wallet} />
                <InfoTile label="Transaction Limit" value={`${money(selected.limits?.dailyTransferLimit, selected.currency)} / Day`} icon={Gauge} />
                <InfoTile label="Account Opened" value={formatDate(selected.createdAt)} icon={Calendar} />
                <InfoTile label="Last Activity" value={formatDate(selected.updatedAt)} icon={Activity} />
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
                Administrators can view balances and manage account status. Balances cannot be changed directly.
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button onClick={() => actionMutation.mutate({ account: selected, action: "approve" })} variant="outline"><CheckCircle2 className="h-4 w-4" /> Approve KYC</Button>
                <Button onClick={() => actionMutation.mutate({ account: selected, action: "reject" })} variant="outline"><XCircle className="h-4 w-4" /> Reject KYC</Button>
                <Button onClick={() => actionMutation.mutate({ account: selected, action: selected.status === AccountStatus.FROZEN ? "unfreeze" : "freeze" })} variant="outline"><Snowflake className="h-4 w-4" /> Freeze / Unfreeze</Button>
                <Button onClick={() => void setLimits(selected)} variant="outline"><Gauge className="h-4 w-4" /> Set Limits</Button>
                <Button onClick={() => actionMutation.mutate({ account: selected, action: "close" })} variant="destructive"><Ban className="h-4 w-4" /> Close Account</Button>
              </div>
            </div>
          ) : <p className="text-sm text-muted">Select an account to manage it.</p>}
        </DashboardCard>
      </div>
    </div>
  );
}

function InfoTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
}) {
  const Icon = icon;
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <Icon className="h-4 w-4 text-primary" />
      <p className="mt-2 text-xs text-muted">{label}</p>
      <p className="mt-1 font-semibold text-secondary">{value}</p>
    </div>
  );
}

export function AdminTransactionsPage() {
  const queryClient = useQueryClient();
  const { users, accounts, transactions, totals } = useAdminData();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TransactionStatus | "all">("all");
  const [type, setType] = useState<TransactionType | "all">("all");
  const reverseMutation = useMutation({
    mutationFn: ({ transaction, reason }: { transaction: Transaction; reason: string }) =>
      transactionsApi.reverse(transaction.id, reason),
    onSuccess: () => {
      toast.success("Transaction reversed.");
      invalidateAdminQueries(queryClient);
    },
  });

  const filtered = transactions.filter((transaction) => {
    const query = search.trim().toLowerCase();
    const text = [
      transaction.reference,
      transaction.description ?? "",
      accountOwner(users, accounts, transaction.fromAccountId),
      accountOwner(users, accounts, transaction.toAccountId),
      transaction.type,
      transaction.status,
    ].join(" ").toLowerCase();
    return (!query || text.includes(query)) &&
      (status === "all" || transaction.status === status) &&
      (type === "all" || transaction.type === type);
  });
  const completedVolume = transactions
    .filter((transaction) => transaction.status === TransactionStatus.COMPLETED)
    .reduce((sum, transaction) => sum + parseMoney(transaction.amount), 0);

  function reverse(transaction: Transaction) {
    const reason = window.prompt("Reason for reversal", "Admin review reversal");
    if (!reason) return;
    reverseMutation.mutate({ transaction, reason });
  }

  return (
    <div className="space-y-5">
      <SectionHeader title="Transactions" subtitle="Review transaction activity and reverse completed transactions when required." />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetric title="Total Transactions" value={totals.transactions} helper="from transaction API" trend="+7.2%" icon={ArrowLeftRight} />
        <AdminMetric title="Completed Volume" value={money(completedVolume)} helper="completed transactions" icon={Wallet} tone="green" />
        <AdminMetric title="Failed Transactions" value={transactions.filter((item) => item.status === TransactionStatus.FAILED).length} helper="requires investigation" trend="+12.6%" trendTone="red" icon={XCircle} tone="red" />
        <AdminMetric title="Pending / Processing" value={transactions.filter((item) => [TransactionStatus.PENDING, TransactionStatus.PROCESSING].includes(item.status)).length} helper="in-flight transactions" icon={Timer} tone="amber" />
      </section>
      <DashboardCard className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_12rem_12rem_auto]">
          <SearchBox value={search} onChange={setSearch} placeholder="Search reference, customer, account..." />
          <select className={selectClass} onChange={(event) => setStatus(event.target.value as TransactionStatus | "all")} value={status}>
            <option value="all">All Statuses</option>
            {Object.values(TransactionStatus).map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
          </select>
          <select className={selectClass} onChange={(event) => setType(event.target.value as TransactionType | "all")} value={type}>
            <option value="all">All Types</option>
            {Object.values(TransactionType).map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
          </select>
          <Button onClick={() => { setSearch(""); setStatus("all"); setType("all"); }} variant="outline"><RefreshCcw className="h-4 w-4" /> Reset</Button>
        </div>
      </DashboardCard>
      <TableShell>
        <table className="min-w-[1120px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-5 py-4">Reference</th>
              <th className="px-5 py-4">From</th>
              <th className="px-5 py-4">To</th>
              <th className="px-5 py-4">Type</th>
              <th className="px-5 py-4">Amount</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4">Initiated</th>
              <th className="px-5 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.slice(0, 15).map((transaction) => (
              <tr key={transaction.id} className="hover:bg-slate-50">
                <td className="px-5 py-4">
                  <p className="font-semibold text-primary">{transaction.reference}</p>
                  <p className="text-xs text-muted">{transactionTitle(transaction)}</p>
                </td>
                <td className="px-5 py-4">{accountOwner(users, accounts, transaction.fromAccountId)}</td>
                <td className="px-5 py-4">{accountOwner(users, accounts, transaction.toAccountId)}</td>
                <td className="px-5 py-4"><StatusPill tone="blue">{titleCase(transaction.type)}</StatusPill></td>
                <td className="px-5 py-4 font-semibold">{money(transaction.amount, transaction.currency)}</td>
                <td className="px-5 py-4"><StatusPill tone={transactionStatusTone(transaction.status)}>{titleCase(transaction.status)}</StatusPill></td>
                <td className="px-5 py-4 text-muted">{formatDate(transaction.initiatedAt)} {formatTime(transaction.initiatedAt)}</td>
                <td className="px-5 py-4">
                  <Button
                    disabled={transaction.status !== TransactionStatus.COMPLETED || reverseMutation.isPending}
                    onClick={() => reverse(transaction)}
                    size="sm"
                    variant="outline"
                  >
                    Reverse
                  </Button>
                </td>
              </tr>
            ))}
            {!filtered.length ? <EmptyRow colSpan={8} label="No transactions found." /> : null}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}

export function AdminPaymentsReviewPage() {
  const queryClient = useQueryClient();
  const { users, accounts, payments, beneficiaries } = useAdminData();
  const [tab, setTab] = useState<"high" | "pending" | "suspicious" | "beneficiaries">("high");
  const freezeMutation = useMutation({
    mutationFn: (accountId: string) => accountsApi.freeze(accountId),
    onSuccess: () => {
      toast.success("Source account frozen for review.");
      invalidateAdminQueries(queryClient);
    },
  });
  const highValue = payments.filter((payment) => parseMoney(payment.amount) >= 50_000);
  const pending = payments.filter((payment) => [PaymentStatus.INITIATED, PaymentStatus.PROCESSING].includes(payment.status));
  const suspicious = payments.filter((payment) => payment.status === PaymentStatus.FAILED || parseMoney(payment.amount) >= 100_000);
  const activeRows = tab === "high" ? highValue : tab === "pending" ? pending : suspicious;

  return (
    <div className="space-y-5">
      <SectionHeader title="Payments Review" subtitle="Review high-value transfers, approvals, suspicious attempts, and beneficiary monitoring." />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetric title="High-Value Payments" value={highValue.length} helper="above review threshold" trend="+18.6%" icon={ArrowLeftRight} />
        <AdminMetric title="Pending Approvals" value={pending.length} helper="awaiting completion" trend="+12.4%" icon={Timer} tone="amber" />
        <AdminMetric title="Suspended Transfers" value={suspicious.length} helper="failed or unusual" trend="+8.3%" icon={Ban} tone="red" />
        <AdminMetric title="Failed OTP Attempts" value={payments.filter((payment) => payment.status === PaymentStatus.FAILED).length} helper="payment failures" trend="+23.7%" icon={Lock} tone="violet" />
      </section>
      <DashboardCard className="border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <IconTile icon={ShieldCheck} />
          <div>
            <p className="font-bold text-primary">Payment Review Rules</p>
            <p className="mt-2 text-sm text-secondary">
              Below {money(50_000)}: OTP only. Above {money(50_000)}: OTP plus risk check. Suspicious or unusually large transfers require admin review.
            </p>
          </div>
        </div>
      </DashboardCard>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_28rem]">
        <DashboardCard className="overflow-hidden">
          <div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 pt-4">
            {[
              ["high", "High Value", ShieldCheck],
              ["pending", "Pending Approval", Timer],
              ["suspicious", "Suspicious", AlertTriangle],
              ["beneficiaries", "Beneficiaries", UsersRound],
            ].map(([id, label, Icon]) => (
              <button
                className={cn("flex items-center gap-2 border-b-2 border-transparent px-3 py-3 text-sm font-semibold text-muted", tab === id && "border-primary text-primary")}
                key={id as string}
                onClick={() => setTab(id as typeof tab)}
                type="button"
              >
                <Icon className="h-4 w-4" />
                {label as string}
              </button>
            ))}
          </div>
          {tab === "beneficiaries" ? (
            <BeneficiaryTable beneficiaries={beneficiaries} accounts={accounts} users={users} compactMode />
          ) : (
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-5 py-4">Payment ID</th>
                  <th className="px-5 py-4">Customer</th>
                  <th className="px-5 py-4">Beneficiary</th>
                  <th className="px-5 py-4">Amount</th>
                  <th className="px-5 py-4">Risk</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeRows.slice(0, 8).map((payment) => {
                  const source = accountById(accounts, payment.fromAccountId);
                  const risk = Math.min(98, Math.round(parseMoney(payment.amount) / 1000));
                  return (
                    <tr key={payment.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 font-semibold text-primary">{payment.id.slice(0, 8).toUpperCase()}</td>
                      <td className="px-5 py-4">{accountOwner(users, accounts, payment.fromAccountId)}</td>
                      <td className="px-5 py-4">{accountLabel(accounts, payment.toAccountId)}</td>
                      <td className="px-5 py-4 font-semibold">{money(payment.amount, payment.currency)}</td>
                      <td className="px-5 py-4"><StatusPill tone={risk > 75 ? "red" : risk > 45 ? "amber" : "green"}>{risk}</StatusPill></td>
                      <td className="px-5 py-4"><StatusPill tone={paymentStatusTone(payment.status)}>{titleCase(payment.status)}</StatusPill></td>
                      <td className="px-5 py-4">
                        <Button
                          disabled={!source || freezeMutation.isPending}
                          onClick={() => source ? freezeMutation.mutate(source.id) : toast.error("Source account not found")}
                          size="sm"
                          variant="outline"
                        >
                          Freeze Source
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {!activeRows.length ? <EmptyRow colSpan={7} label="No payments match this review tab." /> : null}
              </tbody>
            </table>
          )}
        </DashboardCard>
        <DashboardCard className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-secondary">Admin Actions</h2>
            <StatusPill tone="blue">Operational</StatusPill>
          </div>
          <div className="mt-5 grid gap-3">
            {[
              ["Approve Threshold Transfer", CheckCircle2],
              ["Suspend Transfer", Ban],
              ["Block Beneficiary", UserPlus],
              ["Review Failed OTP Attempts", Lock],
              ["Set Daily Limit", Calendar],
              ["Set Monthly Limit", Gauge],
            ].map(([label, Icon]) => (
              <button
                className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-left hover:border-primary/30 hover:bg-primary/5"
                key={label as string}
                onClick={() => toast.success(`${label} opened.`)}
                type="button"
              >
                <IconTile className="h-10 w-10 rounded-lg" icon={Icon as ComponentType<{ className?: string }>} />
                <span className="font-semibold text-secondary">{label as string}</span>
              </button>
            ))}
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}

function kycCaseId(userId: string) {
  return `KYC${customerDisplayId(userId).replace(/^VBK/, "")}`;
}

function KycAssetCard({
  asset,
  label,
  status,
}: {
  asset?: KycAsset;
  label: string;
  status?: KycStatus;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconTile icon={FileText} tone={asset ? "blue" : "slate"} />
          <div>
            <p className="font-semibold text-secondary">{label}</p>
            <p className="text-sm text-muted">
              {asset ? `${asset.name} - ${(asset.size / 1024).toFixed(1)} KB` : "Not uploaded"}
            </p>
          </div>
        </div>
        {status ? <StatusPill tone={kycTone(status)}>{titleCase(status)}</StatusPill> : null}
      </div>
      {asset ? (
        <img
          alt={label}
          className="mt-4 h-52 w-full rounded-lg border border-slate-100 object-contain"
          src={asset.dataUrl}
        />
      ) : null}
    </div>
  );
}

export function AdminKycPage() {
  const queryClient = useQueryClient();
  const { users, accounts } = useAdminData();
  const submissions = useKycSubmissions();
  const [selectedId, setSelectedId] = useState("");
  const [docTab, setDocTab] = useState("document");
  const customerUsers = users.filter(isCustomerProfile);
  const reviewCases = useMemo(
    () =>
      submissions
        .filter(
          (submission) =>
            !customerUsers.length ||
            customerUsers.some((user) => user.id === submission.userId),
        )
        .map((submission) => ({
          submission,
          user: users.find((user) => user.id === submission.userId),
          account: accounts.find((account) => account.userId === submission.userId),
        }))
        .sort(
          (a, b) =>
            safeDate(b.submission.updatedAt ?? b.submission.submittedAt) -
            safeDate(a.submission.updatedAt ?? a.submission.submittedAt),
        ),
    [accounts, customerUsers, submissions, users],
  );
  const selected =
    reviewCases.find((item) => item.submission.userId === selectedId) ??
    reviewCases.find((item) => item.submission.status === KycStatus.PENDING) ??
    reviewCases[0];
  const selectedIdentityDocuments =
    selected?.submission.documentUploads.filter((document) =>
      isKycIdentityDocumentType(document.documentType),
    ) ?? [];
  const selectedAadhaarDocuments =
    selected?.submission.documentUploads.filter(
      (document) => document.documentType === "Aadhaar Card",
    ) ?? [];
  const selectedAddressDocument =
    selectedAadhaarDocuments.find(
      (document) => document.id === selected?.submission.addressDocumentId,
    ) ?? selectedAadhaarDocuments.at(-1);
  const pendingCount = reviewCases.filter(
    (item) => item.submission.status === KycStatus.PENDING,
  ).length;
  const underReviewCount = reviewCases.filter(
    (item) =>
      item.submission.documentStatus === KycStatus.PENDING ||
      item.submission.selfieStatus === KycStatus.PENDING ||
      (item.submission.addressDocumentId &&
        item.submission.addressStatus === KycStatus.PENDING),
  ).length;
  const verifiedCount = reviewCases.filter(
    (item) => item.submission.status === KycStatus.APPROVED,
  ).length;
  const rejectedCount = reviewCases.filter(
    (item) => item.submission.status === KycStatus.REJECTED,
  ).length;
  const mutation = useMutation({
    mutationFn: async ({
      action,
      documentId,
      item,
    }: {
      action:
        | "identity-document"
        | "reject-identity-document"
        | "address"
        | "reject-address"
        | "selfie"
        | "reject-selfie";
      documentId?: string;
      item: { submission: KycSubmission; account?: Account; user?: User };
    }) => {
      const updated = updateKycSubmission(item.submission.userId, (current) => {
        const reviewer = "Admin User";
        if (action === "identity-document") {
          const targetDocument = current.documentUploads.find(
            (document) => document.id === documentId,
          );
          if (!targetDocument || !isKycIdentityDocumentType(targetDocument.documentType)) {
            return current;
          }
          const documentUploads = current.documentUploads.map((document) =>
            document.id === documentId
              ? {
                  ...document,
                  status: KycStatus.APPROVED,
                  reviewedAt: new Date().toISOString(),
                  reviewer,
                  reviewNote: `${document.documentType} verified by admin.`,
                }
              : document,
          );
          return addKycNotification(
            {
              ...current,
              activeDocumentId: documentId,
              documentUploads,
              documentStatus: kycIdentityStatus(documentUploads),
              reviewedAt: new Date().toISOString(),
              reviewer,
              reviewNote: `${targetDocument.documentType} verified by admin.`,
            },
            createKycNotification(
              `${targetDocument.documentType} verified`,
              `Your ${targetDocument.documentType} has been verified by admin.`,
              "success",
            ),
          );
        }

        if (action === "reject-identity-document") {
          const targetDocument = current.documentUploads.find(
            (document) => document.id === documentId,
          );
          if (!targetDocument || !isKycIdentityDocumentType(targetDocument.documentType)) {
            return current;
          }
          const documentUploads = current.documentUploads.map((document) =>
            document.id === documentId
              ? {
                  ...document,
                  status: KycStatus.REJECTED,
                  reviewedAt: new Date().toISOString(),
                  reviewer,
                  reviewNote: `${document.documentType} rejected by admin.`,
                }
              : document,
          );
          return addKycNotification(
            {
              ...current,
              activeDocumentId: documentId,
              documentUploads,
              documentStatus: kycIdentityStatus(documentUploads),
              reviewedAt: new Date().toISOString(),
              reviewer,
              reviewNote: `${targetDocument.documentType} rejected by admin.`,
            },
            createKycNotification(
              `${targetDocument.documentType} rejected`,
              `Your ${targetDocument.documentType} was rejected. Please upload a clearer file.`,
              "danger",
            ),
          );
        }

        if (action === "address") {
          const addressDocumentId = documentId ?? current.addressDocumentId;
          const addressDocument = current.documentUploads.find(
            (document) =>
              document.id === addressDocumentId &&
              document.documentType === "Aadhaar Card",
          );
          if (!addressDocument) {
            return current;
          }
          const documentUploads = current.documentUploads.map((document) =>
            document.id === addressDocumentId
              ? {
                  ...document,
                  status: KycStatus.APPROVED,
                  reviewedAt: new Date().toISOString(),
                  reviewer,
                  reviewNote: "Aadhaar address proof verified by admin.",
                }
              : document,
          );
          return addKycNotification(
            {
              ...current,
              addressDocumentId,
              addressComplete: true,
              addressStatus: KycStatus.APPROVED,
              documentUploads,
              reviewedAt: new Date().toISOString(),
              reviewer,
              reviewNote: "Aadhaar address proof verified by admin.",
            },
            createKycNotification(
              "Address proof verified",
              "Your Aadhaar card has been verified by admin for address proof.",
              "success",
            ),
          );
        }

        if (action === "reject-address") {
          const addressDocumentId = documentId ?? current.addressDocumentId;
          const addressDocument = current.documentUploads.find(
            (document) =>
              document.id === addressDocumentId &&
              document.documentType === "Aadhaar Card",
          );
          if (!addressDocument) {
            return current;
          }
          const documentUploads = current.documentUploads.map((document) =>
            document.id === addressDocumentId
              ? {
                  ...document,
                  status: KycStatus.REJECTED,
                  reviewedAt: new Date().toISOString(),
                  reviewer,
                  reviewNote: "Aadhaar address proof rejected by admin.",
                }
              : document,
          );
          return addKycNotification(
            {
              ...current,
              addressDocumentId,
              addressComplete: false,
              addressStatus: KycStatus.REJECTED,
              documentUploads,
              reviewedAt: new Date().toISOString(),
              reviewer,
              reviewNote: "Aadhaar address proof rejected by admin.",
            },
            createKycNotification(
              "Address proof rejected",
              "Your Aadhaar card was rejected for address proof. Please upload a clearer file.",
              "danger",
            ),
          );
        }

        if (action === "selfie") {
          return addKycNotification(
            {
              ...current,
              selfieStatus: KycStatus.APPROVED,
              reviewedAt: new Date().toISOString(),
              reviewer,
              reviewNote: "Selfie photo verified by admin.",
            },
            createKycNotification(
              "Selfie verified",
              "Your selfie photo has been verified by admin.",
              "success",
            ),
          );
        }

        if (action === "reject-selfie") {
          return addKycNotification(
            {
              ...current,
              selfieStatus: KycStatus.REJECTED,
              reviewedAt: new Date().toISOString(),
              reviewer,
              reviewNote: "Selfie photo rejected by admin.",
            },
            createKycNotification(
              "Selfie rejected",
              "Your selfie photo was rejected. Please upload or capture a clearer photo.",
              "danger",
            ),
          );
        }

        return current;
      });

      if (item.account) {
        await accountsApi.updateKyc(item.account.id, updated.status);
      }
      return updated;
    },
    onSuccess: () => {
      toast.success("KYC updated.");
      invalidateAdminQueries(queryClient);
    },
  });

  return (
    <div className="space-y-5">
      <SectionHeader title="eKYC Verifications" subtitle="Review submitted identity documents and approve or reject KYC." />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetric title="Pending KYC" value={pendingCount} helper="customer submissions" trend="+8.4%" trendTone="red" icon={IdCard} tone="amber" />
        <AdminMetric title="Under Review" value={underReviewCount} helper="documents or selfie pending" trend="+6.2%" icon={Lock} />
        <AdminMetric title="Verified Today" value={verifiedCount} helper="approved submissions" trend="+12.7%" icon={ShieldCheck} tone="green" />
        <AdminMetric title="Resubmission Required" value={rejectedCount} helper="rejected cases" trend="+9.1%" trendTone="red" icon={XCircle} tone="red" />
      </section>
      <TableShell>
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="font-bold text-secondary">KYC Verification Queue</h2>
          <Button
            onClick={() =>
              csvDownload("vaultbank-kyc-submissions.csv", [
                ["KYC ID", "Customer", "Customer ID", "Document Type", "Submitted On", "Status"],
                ...reviewCases.map((item) => [
                  kycCaseId(item.submission.userId),
                  item.user?.fullName ?? "Customer",
                  customerDisplayId(item.submission.userId),
                  item.submission.documentType,
                  item.submission.submittedAt ? formatDate(item.submission.submittedAt) : "Not submitted",
                  titleCase(item.submission.status),
                ]),
              ])
            }
            variant="outline"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
        <table className="min-w-[980px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-5 py-4">KYC ID</th>
              <th className="px-5 py-4">Customer</th>
              <th className="px-5 py-4">Document Type</th>
              <th className="px-5 py-4">Submitted On</th>
              <th className="px-5 py-4">Reviewer</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reviewCases.slice(0, 10).map((item) => (
              <tr className={cn("hover:bg-slate-50", selected?.submission.userId === item.submission.userId && "bg-primary/5")} key={item.submission.userId}>
                <td className="px-5 py-4 font-semibold text-primary">{kycCaseId(item.submission.userId)}</td>
                <td className="px-5 py-4">
                  <p className="font-semibold text-secondary">{item.user?.fullName ?? "Customer"}</p>
                  <p className="text-xs text-muted">{customerDisplayId(item.submission.userId)}</p>
                </td>
                <td className="px-5 py-4">{item.submission.documentType}</td>
                <td className="px-5 py-4 text-muted">
                  {item.submission.submittedAt
                    ? `${formatDate(item.submission.submittedAt)}, ${formatTime(item.submission.submittedAt)}`
                    : "Draft"}
                </td>
                <td className="px-5 py-4">{item.submission.reviewer ?? "Unassigned"}</td>
                <td className="px-5 py-4"><StatusPill tone={kycTone(item.submission.status)}>{titleCase(item.submission.status)}</StatusPill></td>
                <td className="px-5 py-4"><Button onClick={() => setSelectedId(item.submission.userId)} size="sm" variant="outline"><Eye className="h-4 w-4" /></Button></td>
              </tr>
            ))}
            {!reviewCases.length ? <EmptyRow colSpan={7} label="No KYC submissions found." /> : null}
          </tbody>
        </table>
      </TableShell>
      <DashboardCard className="p-5">
        {selected ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="font-bold text-secondary">Selected Case Review</h2>
                <StatusPill tone="blue">{kycCaseId(selected.submission.userId)}</StatusPill>
              </div>
              <div className="mt-4 flex flex-wrap border-b border-slate-200">
                {[
                  ["document", "Identity Document"],
                  ["address", "Address Proof"],
                  ["selfie", "Selfie Verification"],
                  ["history", "Verification History"],
                  ["notes", "Reviewer Notes"],
                ].map(([id, label]) => (
                  <button
                    className={cn("px-3 py-3 text-sm font-semibold text-muted", docTab === id && "border-b-2 border-primary text-primary")}
                    key={id}
                    onClick={() => setDocTab(id)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {docTab === "document" ? (
                  <div className="space-y-3">
                    {selectedIdentityDocuments.length ? (
                      selectedIdentityDocuments.map((document) => (
                        <div className="space-y-3 rounded-lg border border-slate-200 p-3" key={document.id}>
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-bold text-secondary">{document.documentType}</p>
                            <StatusPill tone={kycTone(document.status)}>
                              {titleCase(document.status)}
                            </StatusPill>
                          </div>
                          <KycAssetCard
                            asset={document.frontDocument}
                            label={`${document.documentType} - Front`}
                            status={document.status}
                          />
                          <KycAssetCard
                            asset={document.backDocument}
                            label={`${document.documentType} - Back`}
                            status={document.status}
                          />
                          <Button
                            className="w-full"
                            disabled={mutation.isPending || document.status === KycStatus.APPROVED || !document.frontDocument}
                            onClick={() =>
                              mutation.mutate({
                                action: "identity-document",
                                documentId: document.id,
                                item: selected,
                              })
                            }
                            variant="outline"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Approve {document.documentType}
                          </Button>
                          <Button
                            className="w-full"
                            disabled={mutation.isPending || document.status === KycStatus.REJECTED || !document.frontDocument}
                            onClick={() =>
                              mutation.mutate({
                                action: "reject-identity-document",
                                documentId: document.id,
                                item: selected,
                              })
                            }
                            variant="destructive"
                          >
                            <XCircle className="h-4 w-4" />
                            Reject {document.documentType}
                          </Button>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-lg border border-slate-200 p-4">
                        <div className="flex items-center gap-3">
                          <IconTile icon={FileText} tone="slate" />
                          <div>
                            <p className="font-semibold text-secondary">No identity document</p>
                            <p className="text-sm text-muted">
                              Upload PAN Card, Passport, or Driving Licence for identity verification.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
                {docTab === "selfie" ? (
                  <div className="space-y-3">
                    <KycAssetCard
                      asset={selected.submission.selfie}
                      label="Customer Selfie Photo"
                      status={selected.submission.selfieStatus}
                    />
                    <Button
                      className="w-full"
                      disabled={mutation.isPending || !selected.submission.selfie || selected.submission.selfieStatus === KycStatus.APPROVED}
                      onClick={() => mutation.mutate({ action: "selfie", item: selected })}
                      variant="outline"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve Selfie
                    </Button>
                    <Button
                      className="w-full"
                      disabled={mutation.isPending || !selected.submission.selfie || selected.submission.selfieStatus === KycStatus.REJECTED}
                      onClick={() => mutation.mutate({ action: "reject-selfie", item: selected })}
                      variant="destructive"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject Selfie
                    </Button>
                  </div>
                ) : null}
                {docTab === "address" ? (
                  <div className="space-y-3">
                    {selectedAddressDocument ? (
                        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <IconTile
                                icon={Home}
                                tone={
                                  selected.submission.addressStatus === KycStatus.APPROVED
                                    ? "green"
                                    : "blue"
                                }
                              />
                              <div>
                                <p className="font-semibold text-secondary">
                                  Aadhaar Address Proof
                                </p>
                                <p className="text-sm text-muted">
                                  Front and back Aadhaar images submitted by customer.
                                </p>
                              </div>
                            </div>
                            <StatusPill tone={kycTone(selected.submission.addressStatus)}>
                              {titleCase(selected.submission.addressStatus)}
                            </StatusPill>
                          </div>
                          <KycAssetCard
                            asset={selectedAddressDocument.frontDocument}
                            label="Aadhaar Card - Front"
                            status={selected.submission.addressStatus}
                          />
                          <KycAssetCard
                            asset={selectedAddressDocument.backDocument}
                            label="Aadhaar Card - Back"
                            status={selected.submission.addressStatus}
                          />
                          <Button
                            className="w-full"
                            disabled={mutation.isPending || selected.submission.addressStatus === KycStatus.APPROVED || !selectedAddressDocument.frontDocument}
                            onClick={() =>
                              mutation.mutate({
                                action: "address",
                                documentId: selectedAddressDocument.id,
                                item: selected,
                              })
                            }
                            variant="outline"
                          >
                            <Home className="h-4 w-4" />
                            Approve Aadhaar Address
                          </Button>
                          <Button
                            className="w-full"
                            disabled={mutation.isPending || selected.submission.addressStatus === KycStatus.REJECTED || !selectedAddressDocument.frontDocument}
                            onClick={() =>
                              mutation.mutate({
                                action: "reject-address",
                                documentId: selectedAddressDocument.id,
                                item: selected,
                              })
                            }
                            variant="destructive"
                          >
                            <XCircle className="h-4 w-4" />
                            Reject Aadhaar Address
                          </Button>
                        </div>
                    ) : (
                        <div className="rounded-lg border border-slate-200 p-4">
                          <div className="flex items-center gap-3">
                            <IconTile icon={Home} tone="slate" />
                            <div>
                              <p className="font-semibold text-secondary">Aadhaar Address Proof</p>
                              <p className="text-sm text-muted">
                                Customer has not submitted Aadhaar for address verification.
                              </p>
                            </div>
                          </div>
                        </div>
                    )}
                  </div>
                ) : null}
                {docTab === "history" || docTab === "notes" ? (
                  <div className="rounded-lg border border-slate-200 p-4 text-sm">
                    <h3 className="font-bold text-secondary">
                      {docTab === "history" ? "Verification History" : "Reviewer Notes"}
                    </h3>
                    <div className="mt-4 space-y-3">
                      <p className="text-muted">
                        Submitted: {selected.submission.submittedAt ? `${formatDate(selected.submission.submittedAt)} ${formatTime(selected.submission.submittedAt)}` : "Not submitted"}
                      </p>
                      <p className="text-muted">
                        Reviewed: {selected.submission.reviewedAt ? `${formatDate(selected.submission.reviewedAt)} ${formatTime(selected.submission.reviewedAt)}` : "Not reviewed yet"}
                      </p>
                      <p className="font-semibold text-secondary">
                        {selected.submission.reviewNote ?? "No reviewer note yet."}
                      </p>
                    </div>
                  </div>
                ) : null}
                <div className="rounded-lg border border-slate-200 p-4 text-sm">
                  <h3 className="font-bold text-secondary">Case Summary</h3>
                  <dl className="mt-4 space-y-3">
                    <div className="flex justify-between gap-4"><dt className="text-muted">Customer</dt><dd className="text-right font-semibold">{selected.user?.fullName ?? "Customer"}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-muted">Customer ID</dt><dd className="font-semibold">{customerDisplayId(selected.submission.userId)}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-muted">Account</dt><dd className="font-semibold">{selected.account ? ACCOUNT_TYPE_LABELS[selected.account.type] : "No Account"}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-muted">Document</dt><dd className="font-semibold">{selected.submission.documentType}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-muted">Document Status</dt><dd><StatusPill tone={kycTone(selected.submission.documentStatus)}>{titleCase(selected.submission.documentStatus)}</StatusPill></dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-muted">Address Status</dt><dd><StatusPill tone={kycTone(selected.submission.addressStatus)}>{titleCase(selected.submission.addressStatus)}</StatusPill></dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-muted">Selfie Status</dt><dd><StatusPill tone={kycTone(selected.submission.selfieStatus)}>{titleCase(selected.submission.selfieStatus)}</StatusPill></dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-muted">Overall</dt><dd><StatusPill tone={kycTone(selected.submission.status)}>{titleCase(selected.submission.status)}</StatusPill></dd></div>
                  </dl>
                </div>
              </div>
            </div>
            <aside className="space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-bold">Important Security Notice</p>
                <p className="mt-1">Only authorised KYC officers can access and review identity details. Access is logged.</p>
              </div>
              <Button
                className="w-full"
                disabled={mutation.isPending || !selectedAddressDocument?.frontDocument || selected.submission.addressStatus === KycStatus.APPROVED}
                onClick={() =>
                  selectedAddressDocument
                    ? mutation.mutate({
                        action: "address",
                        documentId: selectedAddressDocument.id,
                        item: selected,
                      })
                    : undefined
                }
                variant="outline"
              >
                <Home className="h-4 w-4" /> Approve Aadhaar Address
              </Button>
              <Button
                className="w-full"
                disabled={mutation.isPending || !selected.submission.selfie}
                onClick={() => mutation.mutate({ action: "selfie", item: selected })}
                variant="outline"
              >
                <Camera className="h-4 w-4" /> Approve Selfie
              </Button>
            </aside>
          </div>
        ) : <p className="text-sm text-muted">No KYC cases available.</p>}
      </DashboardCard>
    </div>
  );
}

export function AdminCardsPage() {
  const queryClient = useQueryClient();
  const { users, accounts } = useAdminData();
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const selected = accounts.find((account) => account.id === selectedId) ?? accounts[0];
  const filtered = accounts.filter((account) => {
    const query = search.trim().toLowerCase();
    return !query || [account.accountNumber, userName(users, account.userId), account.type, account.status].join(" ").toLowerCase().includes(query);
  });
  const freezeMutation = useMutation({
    mutationFn: ({ account, freeze }: { account: Account; freeze: boolean }) =>
      freeze ? accountsApi.freeze(account.id) : accountsApi.unfreeze(account.id),
    onSuccess: () => {
      toast.success("Card-linked account updated.");
      invalidateAdminQueries(queryClient);
    },
  });

  return (
    <div className="space-y-5">
      <SectionHeader title="Cards" subtitle="Manage card status using linked account controls." />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetric title="Active Cards" value={accounts.filter((account) => account.status === AccountStatus.ACTIVE).length} helper="card-enabled accounts" trend="+7.3%" icon={CreditCard} />
        <AdminMetric title="Blocked Cards" value={accounts.filter((account) => account.status === AccountStatus.FROZEN).length} helper="frozen linked accounts" trend="+5.6%" trendTone="red" icon={ShieldAlert} tone="red" />
        <AdminMetric title="Replacement Requests" value={accounts.filter((account) => account.kycStatus === KycStatus.REJECTED).length} helper="requires customer contact" trend="-8.1%" icon={ArrowLeftRight} tone="violet" />
        <AdminMetric title="Lost/Stolen Reports" value={accounts.filter((account) => account.status === AccountStatus.CLOSED).length} helper="closed linked accounts" trend="+12.2%" trendTone="red" icon={AlertTriangle} tone="amber" />
      </section>
      <TableShell>
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <SearchBox value={search} onChange={setSearch} placeholder="Search cards by customer, last 4 digits..." />
          <Button variant="outline"><Download className="h-4 w-4" /> Export</Button>
        </div>
        <table className="min-w-[1100px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-5 py-4">Masked Card Number</th>
              <th className="px-5 py-4">Customer</th>
              <th className="px-5 py-4">Card Type</th>
              <th className="px-5 py-4">Card Status</th>
              <th className="px-5 py-4">Online Usage</th>
              <th className="px-5 py-4">ATM Usage</th>
              <th className="px-5 py-4">Credit/Spend Limit</th>
              <th className="px-5 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.slice(0, 10).map((account) => (
              <tr className={cn("hover:bg-slate-50", selected?.id === account.id && "bg-primary/5")} key={account.id}>
                <td className="px-5 py-4 font-semibold">XXXX XXXX XXXX {getAccountLast4(account.accountNumber)}</td>
                <td className="px-5 py-4">{userName(users, account.userId)}</td>
                <td className="px-5 py-4">{account.type === "current" ? "Mastercard World" : "Visa Signature"}</td>
                <td className="px-5 py-4"><StatusPill tone={accountStatusTone(account.status)}>{account.status === AccountStatus.FROZEN ? "Blocked" : titleCase(account.status)}</StatusPill></td>
                <td className="px-5 py-4">{account.status === AccountStatus.FROZEN ? "Disabled" : "Enabled"}</td>
                <td className="px-5 py-4">{account.status === AccountStatus.FROZEN ? "Disabled" : "Enabled"}</td>
                <td className="px-5 py-4">{money(account.limits?.dailyTransferLimit, account.currency)}</td>
                <td className="px-5 py-4"><Button onClick={() => setSelectedId(account.id)} size="sm" variant="outline">Details</Button></td>
              </tr>
            ))}
            {!filtered.length ? <EmptyRow colSpan={8} label="No cards found." /> : null}
          </tbody>
        </table>
      </TableShell>
      <DashboardCard className="p-5">
        {selected ? (
          <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
            <div className="rounded-xl bg-primary p-6 text-white">
              <div className="flex items-center justify-between"><CreditCard className="h-8 w-8" /><span className="font-bold">VISA</span></div>
              <p className="mt-16 text-lg font-semibold tracking-widest">XXXX XXXX XXXX {getAccountLast4(selected.accountNumber)}</p>
              <div className="mt-10 flex justify-between text-sm"><span>{userName(users, selected.userId)}</span><span>07/28</span></div>
            </div>
            <div>
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-danger">
                Security Notice: Admins never see full card number, CVV, or PIN.
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  ["Approve Card Request", CheckCircle2],
                  [selected.status === AccountStatus.FROZEN ? "Unblock Card" : "Block Card", ShieldAlert],
                  ["Mark Lost/Stolen", AlertTriangle],
                  ["Replace Card", ArrowLeftRight],
                  ["Set Card Limit", Gauge],
                  ["View Card Status", Search],
                ].map(([label, Icon]) => (
                  <Button
                    key={label as string}
                    onClick={() => {
                      if (label === "Block Card" || label === "Unblock Card") {
                        freezeMutation.mutate({
                          account: selected,
                          freeze: selected.status !== AccountStatus.FROZEN,
                        });
                      } else {
                        toast.success(`${label} queued.`);
                      }
                    }}
                    variant="outline"
                  >
                    <Icon className="h-4 w-4" />
                    {label as string}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </DashboardCard>
    </div>
  );
}

function BeneficiaryTable({
  beneficiaries,
  accounts,
  users,
  compactMode = false,
}: {
  beneficiaries: Beneficiary[];
  accounts: Account[];
  users: User[];
  compactMode?: boolean;
}) {
  return (
    <table className={cn("w-full text-left text-sm", compactMode ? "min-w-[720px]" : "min-w-[1000px]")}>
      <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
        <tr>
          <th className="px-5 py-4">Beneficiary Name</th>
          <th className="px-5 py-4">Masked Account</th>
          <th className="px-5 py-4">IFSC / Bank Code</th>
          <th className="px-5 py-4">Added By</th>
          <th className="px-5 py-4">Status</th>
          <th className="px-5 py-4">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {beneficiaries.slice(0, compactMode ? 5 : 12).map((beneficiary) => {
          const account = accountById(accounts, beneficiary.accountId);
          return (
            <tr key={beneficiary.id} className="hover:bg-slate-50">
              <td className="px-5 py-4 font-semibold text-secondary">{beneficiary.name}</td>
              <td className="px-5 py-4">XXXX XXXX {beneficiary.beneficiaryAccountNumber.slice(-4)}</td>
              <td className="px-5 py-4">{beneficiary.bankCode}</td>
              <td className="px-5 py-4">{userName(users, account?.userId)}</td>
              <td className="px-5 py-4"><StatusPill tone={beneficiary.isVerified ? "green" : "amber"}>{beneficiary.isVerified ? "Verified" : "Under Review"}</StatusPill></td>
              <td className="px-5 py-4"><Button onClick={() => toast.success("Beneficiary review opened.")} size="sm" variant="outline">Review</Button></td>
            </tr>
          );
        })}
        {!beneficiaries.length ? <EmptyRow colSpan={6} label="No beneficiaries found." /> : null}
      </tbody>
    </table>
  );
}

export function AdminBeneficiariesPage() {
  const { users, accounts, beneficiaries } = useAdminData();
  const [search, setSearch] = useState("");
  const filtered = beneficiaries.filter((beneficiary) => {
    const account = accountById(accounts, beneficiary.accountId);
    return [beneficiary.name, beneficiary.bankCode, beneficiary.beneficiaryAccountNumber, userName(users, account?.userId)]
      .join(" ")
      .toLowerCase()
      .includes(search.trim().toLowerCase());
  });

  return (
    <div className="space-y-5">
      <SectionHeader title="Beneficiaries" subtitle="Monitor payees and beneficiary additions across accounts." />
      <section className="grid gap-4 md:grid-cols-3">
        <AdminMetric title="Total Beneficiaries" value={beneficiaries.length} helper="from accounts API" icon={UsersRound} />
        <AdminMetric title="Verified" value={beneficiaries.filter((item) => item.isVerified).length} helper="eligible payees" icon={CheckCircle2} tone="green" />
        <AdminMetric title="Under Review" value={beneficiaries.filter((item) => !item.isVerified).length} helper="needs admin review" icon={AlertTriangle} tone="amber" />
      </section>
      <TableShell>
        <div className="border-b border-slate-200 p-4">
          <SearchBox value={search} onChange={setSearch} placeholder="Search beneficiary, account, bank code..." />
        </div>
        <BeneficiaryTable beneficiaries={filtered} accounts={accounts} users={users} />
      </TableShell>
    </div>
  );
}

export function AdminFraudAlertsPage() {
  const queryClient = useQueryClient();
  const { users, accounts, payments, transactions, beneficiaries } = useAdminData();
  const alerts = alertRows(accounts, payments, transactions, beneficiaries, users);
  const freezeMutation = useMutation({
    mutationFn: (accountId: string) => accountsApi.freeze(accountId),
    onSuccess: () => {
      toast.success("Account frozen.");
      invalidateAdminQueries(queryClient);
    },
  });

  return (
    <div className="space-y-5">
      <SectionHeader title="Fraud Alerts" subtitle="Investigate failed, high-risk, and unusual activity from live banking APIs." />
      <section className="grid gap-4 md:grid-cols-3">
        <AdminMetric title="Open Alerts" value={alerts.length} helper="requires investigation" icon={ShieldAlert} tone="red" trend="+15.4%" trendTone="red" />
        <AdminMetric title="Failed Payments" value={payments.filter((payment) => payment.status === PaymentStatus.FAILED).length} helper="payment monitoring" icon={XCircle} tone="red" />
        <AdminMetric title="High-Value Transfers" value={transactions.filter((transaction) => parseMoney(transaction.amount) >= 50_000).length} helper="threshold flags" icon={AlertTriangle} tone="amber" />
      </section>
      <DashboardCard className="p-5">
        <div className="grid gap-4">
          {alerts.map((alert) => (
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 md:flex-row md:items-center md:justify-between" key={alert.id}>
              <div className="flex items-center gap-3">
                <IconTile icon={alert.icon} tone={alert.tone} />
                <div>
                  <p className="font-semibold text-secondary">{alert.title}</p>
                  <p className="text-sm text-muted">{alert.helper}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => toast.success("Alert marked reviewed.")} variant="outline">Mark Reviewed</Button>
                <Button
                  onClick={() => {
                    const payment = payments.find((item) => alert.id.includes(item.id));
                    const accountId = alert.accountId ?? payment?.fromAccountId;
                    if (accountId) {
                      freezeMutation.mutate(accountId);
                    } else {
                      toast("No source account attached to this alert.");
                    }
                  }}
                  variant="destructive"
                >
                  Freeze Source
                </Button>
              </div>
            </div>
          ))}
          {!alerts.length ? <p className="rounded-lg border border-dashed border-slate-200 p-5 text-sm text-muted">No fraud alerts from the current API data.</p> : null}
        </div>
      </DashboardCard>
    </div>
  );
}

export function AdminReportsPage() {
  const { users, accounts, payments, transactions, beneficiaries } = useAdminData();
  const [view, setView] = useState<"grid" | "list">("grid");
  const reports = [
    ["Customer Registration Report", "Summary of new customer registrations.", UsersRound],
    ["Account Opening Report", "Details of accounts opened and their status.", Landmark],
    ["Transaction Report", "Filtered list of transaction activity.", ArrowLeftRight],
    ["Failed Payment Report", "Failed payments with reasons and status.", XCircle],
    ["KYC Report", "KYC verification status summary.", ShieldCheck],
    ["Suspicious Activity Report", "Transactions and payments flagged as suspicious.", ShieldAlert],
    ["Login Activity Report", "User access and role patterns.", KeyRound],
    ["Account Freeze Report", "Accounts frozen and reasons.", Snowflake],
    ["Daily / Monthly Financial Summary", "Inflows, outflows, and balances.", Activity],
  ] as const;

  function generate(label: string, format: "PDF" | "CSV" | "Excel") {
    if (format === "CSV") {
      csvDownload(`${label.toLowerCase().split(" ").join("-")}.csv`, [
        ["Metric", "Value"],
        ["Customers", users.length],
        ["Accounts", accounts.length],
        ["Payments", payments.length],
        ["Transactions", transactions.length],
        ["Beneficiaries", beneficiaries.length],
      ]);
      return;
    }
    toast.success(`${format} export requested for ${label}.`);
  }

  return (
    <div className="space-y-5">
      <SectionHeader title="Reports" subtitle="Generate operations, compliance, and financial reports." />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetric title="Reports Generated This Month" value="256" helper="download activity" trend="+18.6%" icon={FileText} />
        <AdminMetric title="Scheduled Reports" value="34" helper="active schedules" trend="+13.2%" icon={Calendar} tone="green" />
        <AdminMetric title="Failed Exports" value="7" helper="needs retry" trend="-22.2%" trendTone="red" icon={AlertTriangle} tone="red" />
        <AdminMetric title="Last Download Activity" value="Live" helper="by Admin User" icon={Download} tone="violet" />
      </section>
      <DashboardCard className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto_auto]">
          <Input value="01 May 2025 - 16 May 2025" readOnly />
          <select className={selectClass}><option>All Categories</option></select>
          <select className={selectClass}><option>All Frequencies</option></select>
          <select className={selectClass}><option>All Schedules</option></select>
          <Button variant="outline"><RefreshCcw className="h-4 w-4" /> Reset</Button>
          <Button><Filter className="h-4 w-4" /> Apply Filters</Button>
        </div>
      </DashboardCard>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <DashboardCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-secondary">Reports Catalog</h2>
              <p className="text-sm text-muted">Browse and generate reports across categories.</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setView("grid")} size="icon" variant={view === "grid" ? "default" : "outline"}><LayoutGrid className="h-4 w-4" /></Button>
              <Button onClick={() => setView("list")} size="icon" variant={view === "list" ? "default" : "outline"}><List className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className={cn("mt-5 grid gap-4", view === "grid" ? "lg:grid-cols-3" : "grid-cols-1")}>
            {reports.map(([label, copy, Icon]) => (
              <div className="rounded-lg border border-slate-200 p-4" key={label}>
                <div className="flex items-start gap-3">
                  <IconTile icon={Icon} />
                  <div>
                    <h3 className="font-bold text-secondary">{label}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted">{copy}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {(["PDF", "CSV", "Excel"] as const).map((format) => (
                    <Button key={format} onClick={() => generate(label, format)} size="sm" variant="outline">{format}</Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DashboardCard>
        <aside className="space-y-5">
          <DashboardCard className="p-5">
            <h2 className="font-bold text-secondary">Scheduled Reports</h2>
            <div className="mt-4 space-y-3">
              {["Daily Transaction Summary", "Weekly Fraud Report", "Monthly Financial Summary", "KYC Expiry Report"].map((item) => (
                <div className="flex items-center justify-between border-b border-slate-100 pb-3" key={item}>
                  <div>
                    <p className="font-semibold text-secondary">{item}</p>
                    <p className="text-xs text-muted">Active schedule</p>
                  </div>
                  <StatusPill tone="green">Active</StatusPill>
                </div>
              ))}
            </div>
          </DashboardCard>
          <DashboardCard className="p-5">
            <h2 className="font-bold text-secondary">Most Recent Downloads</h2>
            <div className="mt-4 space-y-3">
              {reports.slice(0, 5).map(([label]) => (
                <button className="flex w-full items-center justify-between gap-3 rounded-lg p-2 text-left hover:bg-slate-50" key={label} onClick={() => generate(label, "CSV")} type="button">
                  <span className="font-semibold text-secondary">{label}</span>
                  <Download className="h-4 w-4 text-primary" />
                </button>
              ))}
            </div>
          </DashboardCard>
        </aside>
      </div>
    </div>
  );
}

export function AdminSupportRequestsPage() {
  const { users, accounts, payments, transactions } = useAdminData();
  const failedTransactions = transactions.filter(
    (transaction) =>
      transaction.status === TransactionStatus.FAILED &&
      !isPaymentBackedTransaction(transaction),
  );
  const cases = [
    ...accounts.filter((account) => account.status === AccountStatus.FROZEN).map((account) => ({
      id: account.id,
      title: "Account access review",
      customer: userName(users, account.userId),
      helper: `Account ${getAccountLast4(account.accountNumber)} is frozen.`,
      tone: "red" as Tone,
    })),
    ...payments.filter((payment) => payment.status === PaymentStatus.FAILED).map((payment) => ({
      id: payment.id,
      title: "Payment failure assistance",
      customer: accountOwner(users, accounts, payment.fromAccountId),
      helper: money(payment.amount, payment.currency),
      tone: "amber" as Tone,
    })),
    ...failedTransactions.map((transaction) => ({
      id: transaction.id,
      title: "Transaction failure assistance",
      customer: accountOwner(users, accounts, transaction.fromAccountId),
      helper: `${transaction.reference} - ${money(transaction.amount, transaction.currency)}`,
      tone: "amber" as Tone,
    })),
  ];
  return (
    <div className="space-y-5">
      <SectionHeader title="Support Requests" subtitle="Resolve support cases connected to account and payment events." />
      <section className="grid gap-4 md:grid-cols-3">
        <AdminMetric title="Open Cases" value={cases.length} helper="derived from operations data" icon={Bell} tone="amber" />
        <AdminMetric title="Frozen Account Cases" value={accounts.filter((account) => account.status === AccountStatus.FROZEN).length} helper="access requests" icon={Lock} tone="red" />
        <AdminMetric
          title="Payment Cases"
          value={
            payments.filter((payment) => payment.status === PaymentStatus.FAILED)
              .length + failedTransactions.length
          }
          helper="failed payments"
          icon={XCircle}
          tone="red"
        />
      </section>
      <DashboardCard className="p-5">
        <div className="grid gap-3">
          {cases.map((item) => (
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 md:flex-row md:items-center md:justify-between" key={item.id}>
              <div className="flex items-center gap-3">
                <IconTile icon={Bell} tone={item.tone} />
                <div>
                  <p className="font-semibold text-secondary">{item.title}</p>
                  <p className="text-sm text-muted">{item.customer} - {item.helper}</p>
                </div>
              </div>
              <Button onClick={() => toast.success("Support case marked resolved.")} variant="outline">Resolve</Button>
            </div>
          ))}
          {!cases.length ? <p className="rounded-lg border border-dashed border-slate-200 p-5 text-sm text-muted">No support requests from current operational data.</p> : null}
        </div>
      </DashboardCard>
    </div>
  );
}

export function AdminStaffRolesPage() {
  const queryClient = useQueryClient();
  const { users } = useAdminData();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [role, setRole] = useState<RoleName>("agent");
  const roleMutation = useMutation({
    mutationFn: () => authApi.assignRole(selectedUserId, role),
    onSuccess: () => {
      toast.success("Role assigned.");
      setSelectedUserId("");
      invalidateAdminQueries(queryClient);
    },
  });
  return (
    <div className="space-y-5">
      <SectionHeader title="Staff & Roles" subtitle="Assign customer, agent, and admin roles." />
      <section className="grid gap-4 md:grid-cols-3">
        <AdminMetric title="Admins" value={users.filter((user) => user.roles.includes("admin")).length} helper="supervisory access" icon={ShieldCheck} />
        <AdminMetric title="Agents" value={users.filter((user) => user.roles.includes("agent")).length} helper="operations staff" icon={UserCheck} tone="green" />
        <AdminMetric title="Customers" value={users.filter((user) => user.roles.includes("customer")).length} helper="bank customers" icon={UsersRound} tone="violet" />
      </section>
      <div className="grid gap-5 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <DashboardCard className="p-5">
          <h2 className="font-bold text-secondary">Assign Role</h2>
          <label className="mt-4 block text-sm font-semibold text-secondary">
            User
            <select className={cn(selectClass, "mt-2")} onChange={(event) => setSelectedUserId(event.target.value)} value={selectedUserId}>
              <option value="">Select user</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.fullName} - {user.email}</option>)}
            </select>
          </label>
          <label className="mt-4 block text-sm font-semibold text-secondary">
            Role
            <select className={cn(selectClass, "mt-2")} onChange={(event) => setRole(event.target.value as RoleName)} value={role}>
              <option value="agent">agent</option>
              <option value="admin">admin</option>
              <option value="customer">customer</option>
            </select>
          </label>
          <Button className="mt-5 w-full" disabled={!selectedUserId || roleMutation.isPending} onClick={() => roleMutation.mutate()}>
            Assign role
          </Button>
        </DashboardCard>
        <TableShell>
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
              <tr><th className="px-5 py-4">User</th><th className="px-5 py-4">Roles</th><th className="px-5 py-4">Verified</th><th className="px-5 py-4">Created</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-5 py-4"><p className="font-semibold text-secondary">{user.fullName}</p><p className="text-xs text-muted">{user.email}</p></td>
                  <td className="px-5 py-4"><div className="flex flex-wrap gap-2">{user.roles.map((item) => <StatusPill key={item} tone={item === "admin" ? "blue" : item === "agent" ? "green" : "violet"}>{item}</StatusPill>)}</div></td>
                  <td className="px-5 py-4"><StatusPill tone={user.isVerified ? "green" : "amber"}>{user.isVerified ? "Verified" : "Pending"}</StatusPill></td>
                  <td className="px-5 py-4 text-muted">{formatDate(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      </div>
    </div>
  );
}

export function AdminAuditLogsPage() {
  const { users, accounts, payments, transactions } = useAdminData();
  const [tab, setTab] = useState<"audit" | "security">("audit");
  const logs = recentAuditRows(users, accounts, payments, transactions);
  const securityRows = [
    ["Strong Password", "Enforce complex passwords", "ON", KeyRound],
    ["Two-Factor Authentication", "Mandatory 2FA for admins", "ON", ShieldCheck],
    ["Short Session Timeout", "Auto logout after 15 minutes", "ON", Timer],
    ["Device Verification", "Verify new devices", "ON", Smartphone],
    ["Login Alerts", "Email and SMS notifications", "ON", Bell],
    ["IP Monitoring", "Monitor suspicious IPs", "ON", Globe2],
    ["Role-Based Access Control", "Least privilege access", "COMPLIANT", UsersRound],
    ["Audit Logging", "All admin actions logged", "COMPLIANT", ClipboardList],
  ] as const;

  return (
    <div className="space-y-5">
      <SectionHeader title="Audit Logs" subtitle="View immutable admin activity and system security posture." />
      <div className="flex border-b border-slate-200">
        {[
          ["audit", "Audit Logs", ClipboardList],
          ["security", "System Security", ShieldCheck],
        ].map(([id, label, Icon]) => (
          <button className={cn("flex items-center gap-2 px-5 py-3 text-sm font-semibold text-muted", tab === id && "border-b-2 border-primary text-primary")} key={id as string} onClick={() => setTab(id as typeof tab)} type="button">
            <Icon className="h-4 w-4" />
            {label as string}
          </button>
        ))}
      </div>
      {tab === "audit" ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <AdminMetric title="Logged Actions Today" value={logs.length} helper="current result set" trend="+18.6%" icon={ClipboardList} />
            <AdminMetric title="High-Risk Actions" value={logs.filter((log) => log.severity === "HIGH").length} helper="requires review" trend="+27.3%" trendTone="red" icon={ShieldAlert} tone="red" />
            <AdminMetric title="Failed Admin Logins" value="18" helper="security monitor" trend="-28.0%" icon={Lock} tone="red" />
            <AdminMetric title="2FA Compliance" value="99.2%" helper="vs yesterday" trend="+2.4%" icon={ShieldCheck} tone="green" />
          </section>
          <TableShell>
            <div className="flex justify-end border-b border-slate-200 p-4">
              <Button onClick={() => csvDownload("vaultbank-audit-logs.csv", [["Timestamp", "Admin", "Action", "Customer", "Account", "Reason", "Result", "Severity"], ...logs.map((log) => [formatDate(log.timestamp), log.admin, log.action, log.customer, log.account, log.reason, log.result, log.severity])])} variant="outline"><Download className="h-4 w-4" /> Export</Button>
            </div>
            <table className="min-w-[1080px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr><th className="px-5 py-4">Timestamp</th><th className="px-5 py-4">Admin ID</th><th className="px-5 py-4">Action</th><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Account</th><th className="px-5 py-4">Reason</th><th className="px-5 py-4">Result</th><th className="px-5 py-4">Severity</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-5 py-4 text-muted">{formatDate(log.timestamp)} {formatTime(log.timestamp)}</td>
                    <td className="px-5 py-4">{log.admin}</td>
                    <td className="px-5 py-4"><StatusPill tone={log.severity === "HIGH" ? "red" : "blue"}>{log.action}</StatusPill></td>
                    <td className="px-5 py-4">{log.customer}</td>
                    <td className="px-5 py-4">{log.account}</td>
                    <td className="px-5 py-4">{log.reason}</td>
                    <td className="px-5 py-4"><StatusPill tone={log.result === "SUCCESS" ? "green" : "red"}>{log.result}</StatusPill></td>
                    <td className="px-5 py-4"><StatusPill tone={log.severity === "HIGH" ? "red" : "amber"}>{log.severity}</StatusPill></td>
                  </tr>
                ))}
                {!logs.length ? <EmptyRow colSpan={8} label="No audit events derived from current data." /> : null}
              </tbody>
            </table>
          </TableShell>
          <DashboardCard className="grid gap-4 p-5 md:grid-cols-2">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="font-bold text-secondary">Audit logs are immutable</p>
              <p className="mt-1 text-sm text-muted">Audit logs cannot be deleted, modified, or disabled by any admin.</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="font-bold text-amber-900">Maker-Checker is mandatory for high-risk actions</p>
              <p className="mt-1 text-sm text-amber-800">High-risk actions require another authorised admin review before execution.</p>
            </div>
          </DashboardCard>
        </>
      ) : (
        <DashboardCard className="p-5">
          <div className="grid gap-3">
            {securityRows.map(([title, helper, status, Icon]) => (
              <button className="flex items-center justify-between rounded-lg border border-slate-200 p-4 text-left hover:bg-slate-50" key={title} type="button">
                <span className="flex items-center gap-3">
                  <IconTile icon={Icon} />
                  <span><span className="block font-semibold text-secondary">{title}</span><span className="text-sm text-muted">{helper}</span></span>
                </span>
                <span className="flex items-center gap-3"><StatusPill tone="green">{status}</StatusPill><ChevronRight className="h-4 w-4 text-muted" /></span>
              </button>
            ))}
          </div>
        </DashboardCard>
      )}
    </div>
  );
}

export function AdminSystemSettingsPage() {
  const [settings, setSettings] = useState({
    strongPassword: true,
    twoFactor: true,
    loginAlerts: true,
    ipMonitoring: true,
    sessionTimeout: "15",
    dailyLimit: "100000",
  });
  return (
    <div className="space-y-5">
      <SectionHeader title="System Settings" subtitle="Configure admin security controls and operational thresholds." />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <DashboardCard className="p-5">
          <h2 className="font-bold text-secondary">Security Controls</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {[
              ["strongPassword", "Strong Password", "Require complex passwords", KeyRound],
              ["twoFactor", "Two-Factor Authentication", "Require 2FA for admins", ShieldCheck],
              ["loginAlerts", "Login Alerts", "Notify admins on new logins", Bell],
              ["ipMonitoring", "IP Monitoring", "Monitor unusual access patterns", Globe2],
            ].map(([key, label, helper, Icon]) => (
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-4" key={key as string}>
                <span className="flex items-center gap-3"><IconTile icon={Icon as ComponentType<{ className?: string }>} /><span><span className="block font-semibold text-secondary">{label as string}</span><span className="text-sm text-muted">{helper as string}</span></span></span>
                <input checked={Boolean(settings[key as keyof typeof settings])} className="h-5 w-5" onChange={(event) => setSettings((current) => ({ ...current, [key as string]: event.target.checked }))} type="checkbox" />
              </label>
            ))}
          </div>
        </DashboardCard>
        <DashboardCard className="p-5">
          <h2 className="font-bold text-secondary">Operational Limits</h2>
          <label className="mt-4 block text-sm font-semibold text-secondary">
            Admin session timeout minutes
            <Input className="mt-2" min="5" onChange={(event) => setSettings((current) => ({ ...current, sessionTimeout: event.target.value }))} type="number" value={settings.sessionTimeout} />
          </label>
          <label className="mt-4 block text-sm font-semibold text-secondary">
            Default daily transaction review threshold
            <Input className="mt-2" min="1" onChange={(event) => setSettings((current) => ({ ...current, dailyLimit: event.target.value }))} type="number" value={settings.dailyLimit} />
          </label>
          <Button className="mt-5 w-full" onClick={() => toast.success("System settings saved locally for this portal session.")}>Save Settings</Button>
        </DashboardCard>
      </div>
    </div>
  );
}
