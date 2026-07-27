import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Calendar,
  Clock,
  RefreshCcw,
  Search,
} from "lucide-react";
import {
  DashboardCard,
  IconTile,
  MetricCard,
  StatusPill,
} from "@/components/dashboard/DashboardCard";
import { ActionDialog } from "@/components/common/ActionDialog";
import { Button } from "@/components/ui/button";
import {
  formatCurrency,
  getAccountLast4,
  parseMoney,
} from "@/constants/accounts.constants";
import { useAccounts } from "@/hooks/useAccounts";
import { usePayments } from "@/hooks/usePayments";
import { useTransactions } from "@/hooks/useTransactions";
import {
  accountDisplayName,
  formatDate,
  formatTime,
  isIncoming,
  titleCase,
  transactionStatusTone,
  transactionTitle,
} from "@/lib/dashboard-format";
import { mergeTransactionsWithFailedPayments } from "@/lib/payment-transactions";
import { cn } from "@/lib/utils";
import { TransactionStatus, TransactionType } from "@/types/transactions.types";
import type { Transaction } from "@/types/transactions.types";

const selectClass =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-secondary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export function TransactionsPage() {
  const { accounts, isLoading: accountsLoading } = useAccounts();
  const [accountId, setAccountId] = useState("");
  const [status, setStatus] = useState<TransactionStatus | "all">("all");
  const [type, setType] = useState<TransactionType | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);

  useEffect(() => {
    if (!accountId && accounts[0]) {
      setAccountId(accounts[0].id);
    }
  }, [accountId, accounts]);

  const selectedAccount = accounts.find((account) => account.id === accountId);
  const filters = accountId
    ? {
        accountId,
        page,
        limit: 8,
        status,
        type,
      }
    : null;
  const { transactions, total, totalPages, isLoading, isError, refetch } =
    useTransactions(filters, { enabled: Boolean(accountId) });
  const {
    payments,
    isLoading: paymentsLoading,
    isError: paymentsError,
    refetch: refetchPayments,
  } = usePayments(1, 100);
  const visibleTransactions = useMemo(
    () =>
      mergeTransactionsWithFailedPayments(transactions, payments, {
        accountId,
        status,
        type,
      }),
    [accountId, payments, status, transactions, type],
  );

  const filteredTransactions = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) {
      return visibleTransactions;
    }
    return visibleTransactions.filter((transaction) => {
      return [
        transaction.reference,
        transaction.description ?? "",
        transaction.type,
        transaction.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [search, visibleTransactions]);

  const completedTransactions = visibleTransactions.filter(
    (transaction) => transaction.status === TransactionStatus.COMPLETED,
  );
  const inflow = completedTransactions
    .filter((transaction) => isIncoming(transaction, accountId))
    .reduce((sum, transaction) => sum + parseMoney(transaction.amount), 0);
  const outflow = completedTransactions
    .filter((transaction) => !isIncoming(transaction, accountId))
    .reduce((sum, transaction) => sum + parseMoney(transaction.amount), 0);
  const pending = visibleTransactions.filter(
    (transaction) =>
      transaction.status === TransactionStatus.PENDING ||
      transaction.status === TransactionStatus.PROCESSING,
  );
  const pageLoading = isLoading || paymentsLoading;
  const pageError = isError || paymentsError;
  const currency = selectedAccount?.currency ?? accounts[0]?.currency;

  function resetFilters() {
    setStatus("all");
    setType("all");
    setSearch("");
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-secondary">
          Transaction History
        </h1>
        <p className="mt-2 text-sm text-muted">
          View all credits, debits, and transfer activity.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          helper="total credited to this account"
          icon={ArrowDown}
          title="Total Inflow"
          tone="green"
          trend="+"
          trendTone="green"
          value={formatCurrency(inflow, currency ?? "USD")}
        />
        <MetricCard
          helper="total debited from this account"
          icon={ArrowUp}
          title="Total Outflow"
          tone="red"
          trend="-"
          trendTone="red"
          value={formatCurrency(outflow, currency ?? "USD")}
        />
        <MetricCard
          helper={`Total amount ${formatCurrency(
            pending.reduce((sum, transaction) => sum + parseMoney(transaction.amount), 0),
            currency ?? "USD",
          )}`}
          icon={Clock}
          title="Pending Transactions"
          tone="amber"
          value={pending.length}
        />
      </section>

      <DashboardCard className="p-4">
        <div className="grid gap-3 lg:grid-cols-[1.1fr_1fr_1fr_1.2fr_auto]">
          <label className="block">
            <span className="mb-1 flex items-center gap-2 text-xs font-semibold text-muted">
              <Calendar className="h-4 w-4" />
              Account
            </span>
            <select
              className={selectClass}
              disabled={accountsLoading || accounts.length === 0}
              onChange={(event) => {
                setAccountId(event.target.value);
                setPage(1);
              }}
              value={accountId}
            >
              {accounts.length === 0 ? (
                <option value="">No accounts</option>
              ) : (
                accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {accountDisplayName(account)} - {getAccountLast4(account.accountNumber)}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">
              Status
            </span>
            <select
              className={selectClass}
              onChange={(event) => {
                setStatus(event.target.value as TransactionStatus | "all");
                setPage(1);
              }}
              value={status}
            >
              <option value="all">All Statuses</option>
              {Object.values(TransactionStatus).map((item) => (
                <option key={item} value={item}>
                  {titleCase(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">
              Type
            </span>
            <select
              className={selectClass}
              onChange={(event) => {
                setType(event.target.value as TransactionType | "all");
                setPage(1);
              }}
              value={type}
            >
              <option value="all">All Types</option>
              {Object.values(TransactionType).map((item) => (
                <option key={item} value={item}>
                  {titleCase(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">
              Search
            </span>
            <span className="relative block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-secondary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search transactions..."
                value={search}
              />
            </span>
          </label>
          <div className="flex items-end gap-2">
            <Button onClick={resetFilters} variant="outline">
              <RefreshCcw className="h-4 w-4" />
              Reset
            </Button>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-5 py-4">Date</th>
                <th className="px-5 py-4">Description</th>
                <th className="px-5 py-4">Reference ID</th>
                <th className="px-5 py-4">Account</th>
                <th className="px-5 py-4">Type</th>
                <th className="px-5 py-4">Amount</th>
                <th className="px-5 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageLoading ? (
                <tr>
                  <td className="px-5 py-8 text-muted" colSpan={7}>
                    Loading transactions...
                  </td>
                </tr>
              ) : pageError ? (
                <tr>
                  <td className="px-5 py-8 text-muted" colSpan={7}>
                    Could not load transactions.
                    <Button
                      className="ml-3"
                      onClick={() => {
                        void refetch();
                        void refetchPayments();
                      }}
                      size="sm"
                      variant="outline"
                    >
                      Try again
                    </Button>
                  </td>
                </tr>
              ) : filteredTransactions.length ? (
                filteredTransactions.map((transaction) => {
                  const incoming = isIncoming(transaction, accountId);
                  return (
                    <tr
                      className="cursor-pointer hover:bg-slate-50"
                      key={transaction.id}
                      onClick={() => setSelectedTransaction(transaction)}
                    >
                      <td className="whitespace-nowrap px-5 py-4 text-muted">
                        <span className="block">{formatDate(transaction.initiatedAt)}</span>
                        <span className="text-xs">{formatTime(transaction.initiatedAt)}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              "flex h-9 w-9 items-center justify-center rounded-full",
                              incoming
                                ? "bg-emerald-50 text-emerald-600"
                                : "bg-red-50 text-red-600",
                            )}
                          >
                            {incoming ? (
                              <ArrowDown className="h-4 w-4" />
                            ) : (
                              <ArrowUp className="h-4 w-4" />
                            )}
                          </span>
                          <span>
                            <span className="block font-semibold text-secondary">
                              {transactionTitle(transaction)}
                            </span>
                            <span className="text-xs text-muted">
                              {transaction.description ?? titleCase(transaction.type)}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-medium text-slate-600">
                        {transaction.reference}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {selectedAccount ? (
                          <>
                            <span className="block font-medium text-secondary">
                              {accountDisplayName(selectedAccount)}
                            </span>
                            <span className="text-xs">
                              **** {getAccountLast4(selectedAccount.accountNumber)}
                            </span>
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <StatusPill tone={incoming ? "green" : "red"}>
                          {incoming ? "Credit" : "Debit"}
                        </StatusPill>
                      </td>
                      <td
                        className={cn(
                          "whitespace-nowrap px-5 py-4 font-bold",
                          incoming ? "text-emerald-600" : "text-red-600",
                        )}
                      >
                        {incoming ? "+" : "-"}
                        {formatCurrency(transaction.amount, currency ?? "USD")}
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
                  <td className="px-5 py-10 text-center text-muted" colSpan={7}>
                    {accountId
                      ? "No transactions found for this account."
                      : "Open an account to view transactions."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing {filteredTransactions.length} of{" "}
            {Math.max(total, visibleTransactions.length)} transactions
          </span>
          <div className="flex items-center gap-2">
            <Button
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
              size="sm"
              variant="outline"
            >
              Previous
            </Button>
            <span className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
              {page}
            </span>
            <Button
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
              size="sm"
              variant="outline"
            >
              Next
            </Button>
          </div>
        </div>
      </DashboardCard>

      <ActionDialog
        footer={<Button onClick={() => setSelectedTransaction(null)}>Done</Button>}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTransaction(null);
          }
        }}
        open={Boolean(selectedTransaction)}
        title="Transaction Details"
      >
        {selectedTransaction ? (
          <dl className="space-y-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Reference</dt>
              <dd className="font-semibold text-secondary">
                {selectedTransaction.reference}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Description</dt>
              <dd className="font-semibold text-secondary">
                {transactionTitle(selectedTransaction)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Amount</dt>
              <dd className="font-semibold text-secondary">
                {formatCurrency(selectedTransaction.amount, currency ?? "USD")}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Status</dt>
              <dd>
                <StatusPill tone={transactionStatusTone(selectedTransaction.status)}>
                  {titleCase(selectedTransaction.status)}
                </StatusPill>
              </dd>
            </div>
          </dl>
        ) : null}
      </ActionDialog>
    </div>
  );
}
