import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Landmark,
  LineChart,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate, useParams } from "react-router-dom";
import {
  DashboardCard,
  IconTile,
  MetricCard,
  StatusPill,
} from "@/components/dashboard/DashboardCard";
import { Button } from "@/components/ui/button";
import { transactionsApi } from "@/api/transactions.api";
import {
  ACCOUNT_TYPE_LABELS,
  formatCurrency,
  getAccountLast4,
  maskAccountNumber,
  parseMoney,
} from "@/constants/accounts.constants";
import { useAccounts } from "@/hooks/useAccounts";
import { useAuth } from "@/hooks/useAuth";
import { usePayments } from "@/hooks/usePayments";
import { useTransactions } from "@/hooks/useTransactions";
import {
  accountDisplayName,
  formatDate,
  isIncoming,
  titleCase,
  transactionTitle,
} from "@/lib/dashboard-format";
import { cn } from "@/lib/utils";
import { Currency, type Account } from "@/types/accounts.types";
import { PaymentStatus, type PaymentOrder } from "@/types/payments.types";
import {
  TransactionStatus,
  type Transaction,
} from "@/types/transactions.types";

type ReportTab = "statement" | "cashflow" | "tax" | "receipts";
type DownloadFormat = "pdf" | "excel" | "csv";

interface MonthOption {
  value: string;
  label: string;
  shortLabel: string;
  start: Date;
  end: Date;
}

interface StatementRow {
  id: string;
  date: string;
  description: string;
  type: string;
  moneyIn: number | null;
  moneyOut: number | null;
  balance: number;
  status: string;
}

const reportTabs: Array<{
  id: ReportTab;
  label: string;
  helper: string;
  icon: typeof FileText;
}> = [
  {
    id: "statement",
    label: "Monthly Statement",
    helper: "Account-wise statement",
    icon: FileText,
  },
  {
    id: "cashflow",
    label: "Cash Flow",
    helper: "Money in and out",
    icon: LineChart,
  },
  {
    id: "tax",
    label: "Tax Summary",
    helper: "Tax-ready credits",
    icon: Landmark,
  },
  {
    id: "receipts",
    label: "Payment Receipts",
    helper: "Transfer receipts",
    icon: ReceiptText,
  },
];

const selectClass =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-secondary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

function isReportTab(value: string | undefined): value is ReportTab {
  return reportTabs.some((tab) => tab.id === value);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthOptions(): MonthOption[] {
  const firstStatementMonth = new Date(2026, 6, 1);
  const today = new Date();
  const lastMonth =
    today < firstStatementMonth
      ? firstStatementMonth
      : new Date(today.getFullYear(), today.getMonth(), 1);
  const options: MonthOption[] = [];
  const cursor = new Date(lastMonth);

  while (cursor >= firstStatementMonth) {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);
    options.push({
      value: monthKey(start),
      label: new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
      }).format(start),
      shortLabel: new Intl.DateTimeFormat("en-US", {
        month: "short",
        year: "numeric",
      }).format(start),
      start,
      end,
    });
    cursor.setMonth(cursor.getMonth() - 1);
  }

  return options;
}

function optionForMonth(value: string, options: MonthOption[]): MonthOption {
  return options.find((option) => option.value === value) ?? options[0];
}

function periodLabel(option: MonthOption): string {
  const start = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(option.start);
  const end = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(option.end);
  return `${start} - ${end}`;
}

function isInMonth(value: string, month: MonthOption): boolean {
  const date = new Date(value);
  return date >= month.start && date <= month.end;
}

function sortTransactions(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort(
    (a, b) =>
      new Date(a.initiatedAt || a.createdAt).getTime() -
      new Date(b.initiatedAt || b.createdAt).getTime(),
  );
}

function buildStatementRows(
  account: Account | undefined,
  transactions: Transaction[],
  month: MonthOption,
): StatementRow[] {
  if (!account) {
    return [];
  }

  const currentBalance = parseMoney(account.balance);
  const postedNet = transactions.reduce((sum, transaction) => {
    if (transaction.status !== TransactionStatus.COMPLETED) {
      return sum;
    }
    const amount = parseMoney(transaction.amount);
    return sum + (isIncoming(transaction, account.id) ? amount : -amount);
  }, 0);
  let runningBalance = currentBalance - postedNet;

  const rows: StatementRow[] = [
    {
      id: "opening",
      date: month.start.toISOString(),
      description: "Opening Balance",
      type: "-",
      moneyIn: null,
      moneyOut: null,
      balance: runningBalance,
      status: "Posted",
    },
  ];

  sortTransactions(transactions).forEach((transaction) => {
    const amount = parseMoney(transaction.amount);
    const incoming = isIncoming(transaction, account.id);
    const affectsBalance = transaction.status === TransactionStatus.COMPLETED;

    if (affectsBalance) {
      runningBalance += incoming ? amount : -amount;
    }

    rows.push({
      id: transaction.id,
      date: transaction.initiatedAt || transaction.createdAt,
      description: transactionTitle(transaction),
      type: incoming ? "Credit" : "Debit",
      moneyIn: incoming ? amount : null,
      moneyOut: incoming ? null : amount,
      balance: runningBalance,
      status: titleCase(transaction.status),
    });
  });

  return rows;
}

function sanitizeFilePart(value: string): string {
  return value
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function csvEscape(value: string | number | null | undefined): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function accountFileName(account: Account, month: MonthOption, suffix: string) {
  return `vaultbank-${sanitizeFilePart(accountDisplayName(account))}-${getAccountLast4(
    account.accountNumber,
  )}-${month.value}-${suffix}`;
}

function statementCsv(
  account: Account,
  accountHolder: string,
  month: MonthOption,
  rows: StatementRow[],
): string {
  const header = [
    ["VaultBank Monthly Statement"],
    ["Account Holder", accountHolder],
    ["Account Type", ACCOUNT_TYPE_LABELS[account.type]],
    ["Account Number", maskAccountNumber(account.accountNumber)],
    ["Statement Period", periodLabel(month)],
    [],
    ["Date", "Description", "Type", "Money In", "Money Out", "Balance", "Status"],
  ];
  const body = rows.map((row) => [
    formatDate(row.date),
    row.description,
    row.type,
    row.moneyIn ?? "",
    row.moneyOut ?? "",
    row.balance,
    row.status,
  ]);
  return [...header, ...body]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
}

function statementExcel(
  account: Account,
  accountHolder: string,
  month: MonthOption,
  rows: StatementRow[],
): string {
  const cell = (value: string | number | null | undefined) =>
    `<td>${String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</td>`;
  const bodyRows = rows
    .map((row) =>
      `<tr>${[
        formatDate(row.date),
        row.description,
        row.type,
        row.moneyIn ?? "",
        row.moneyOut ?? "",
        row.balance,
        row.status,
      ]
        .map(cell)
        .join("")}</tr>`,
    )
    .join("");

  return `
    <html>
      <head><meta charset="utf-8" /></head>
      <body>
        <table>
          <tr><th colspan="7">VaultBank Monthly Statement</th></tr>
          <tr>${cell("Account Holder")}${cell(accountHolder)}</tr>
          <tr>${cell("Account Type")}${cell(ACCOUNT_TYPE_LABELS[account.type])}</tr>
          <tr>${cell("Account Number")}${cell(maskAccountNumber(account.accountNumber))}</tr>
          <tr>${cell("Statement Period")}${cell(periodLabel(month))}</tr>
          <tr></tr>
          <tr>
            ${["Date", "Description", "Type", "Money In", "Money Out", "Balance", "Status"]
              .map((heading) => `<th>${heading}</th>`)
              .join("")}
          </tr>
          ${bodyRows}
        </table>
      </body>
    </html>
  `;
}

function escapePdfText(value: string): string {
  return value
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n]+/g, " ");
}

function statementPdf(
  account: Account,
  accountHolder: string,
  month: MonthOption,
  rows: StatementRow[],
  currency: Currency,
): Blob {
  const lines = [
    "VaultBank Monthly Statement",
    `Account holder: ${accountHolder}`,
    `Account: ${ACCOUNT_TYPE_LABELS[account.type]} ${maskAccountNumber(account.accountNumber)}`,
    `Statement period: ${periodLabel(month)}`,
    "",
    "Date          Description                    In        Out       Balance",
    ...rows.slice(0, 28).map((row) => {
      const date = formatDate(row.date).padEnd(13).slice(0, 13);
      const description = row.description.padEnd(30).slice(0, 30);
      const moneyIn =
        row.moneyIn === null ? "-" : formatCurrency(row.moneyIn, currency);
      const moneyOut =
        row.moneyOut === null ? "-" : formatCurrency(row.moneyOut, currency);
      return `${date} ${description} ${moneyIn.padStart(9)} ${moneyOut.padStart(
        9,
      )} ${formatCurrency(row.balance, currency).padStart(11)}`;
    }),
    rows.length > 29 ? "" : "",
    rows.length > 29 ? `Showing first 28 of ${rows.length} rows.` : "",
    "",
    "This is a system generated statement and does not require a signature.",
  ].filter(Boolean);

  const content = [
    "BT",
    "/F1 16 Tf",
    "50 742 Td",
    "18 TL",
    `(${escapePdfText(lines[0])}) Tj`,
    "/F1 9 Tf",
    ...lines.slice(1).flatMap((line) => ["T*", `(${escapePdfText(line)}) Tj`]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(chunks.join("").length);
    chunks.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  });

  const xrefOffset = chunks.join("").length;
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");
  offsets.slice(1).forEach((offset) => {
    chunks.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  });
  chunks.push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
  );

  return new Blob([chunks.join("")], { type: "application/pdf" });
}

function receiptsForAccount(
  payments: PaymentOrder[],
  account: Account | undefined,
  month: MonthOption,
): PaymentOrder[] {
  if (!account) {
    return [];
  }
  return payments
    .filter(
      (payment) =>
        (payment.fromAccountId === account.id || payment.toAccountId === account.id) &&
        isInMonth(payment.createdAt, month),
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

export function ReportsPage() {
  const navigate = useNavigate();
  const { reportTab } = useParams();
  const auth = useAuth();
  const { accounts, isLoading: accountsLoading } = useAccounts();
  const { payments } = usePayments(1, 100);
  const monthOptions = useMemo(getMonthOptions, []);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);
  const activeTab = isReportTab(reportTab) ? reportTab : "statement";
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);
  const month = optionForMonth(selectedMonth, monthOptions);

  useEffect(() => {
    if (!selectedAccountId && accounts[0]) {
      setSelectedAccountId(accounts[0].id);
      return;
    }
    if (
      selectedAccountId &&
      accounts.length > 0 &&
      !accounts.some((account) => account.id === selectedAccountId)
    ) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  const transactionFilters = selectedAccount
    ? {
        accountId: selectedAccount.id,
        fromDate: month.start.toISOString(),
        toDate: month.end.toISOString(),
        page: 1,
        limit: 100,
      }
    : null;
  const {
    transactions,
    isLoading: transactionsLoading,
    isError: transactionsError,
    refetch,
  } = useTransactions(transactionFilters, { enabled: Boolean(selectedAccount) });

  const monthTransactions = useMemo(
    () =>
      selectedAccount
        ? transactions.filter((transaction) => isInMonth(transaction.initiatedAt, month))
        : [],
    [month, selectedAccount, transactions],
  );
  const statementRows = useMemo(
    () => buildStatementRows(selectedAccount, monthTransactions, month),
    [month, monthTransactions, selectedAccount],
  );
  const currency = selectedAccount?.currency ?? Currency.USD;
  const completedTransactions = monthTransactions.filter(
    (transaction) => transaction.status === TransactionStatus.COMPLETED,
  );
  const inflow = completedTransactions
    .filter((transaction) => isIncoming(transaction, selectedAccount?.id))
    .reduce((sum, transaction) => sum + parseMoney(transaction.amount), 0);
  const outflow = completedTransactions
    .filter((transaction) => !isIncoming(transaction, selectedAccount?.id))
    .reduce((sum, transaction) => sum + parseMoney(transaction.amount), 0);
  const closingBalance = statementRows.at(-1)?.balance ?? parseMoney(selectedAccount?.balance);
  const openingBalance = statementRows[0]?.balance ?? closingBalance;
  const selectedReceipts = receiptsForAccount(payments, selectedAccount, month);
  const successfulReceipts = selectedReceipts.filter(
    (payment) => payment.status === PaymentStatus.SUCCESS,
  );
  const accountHolder = auth.user?.fullName ?? "VaultBank customer";

  async function buildRowsForDownload(targetMonth: MonthOption) {
    if (!selectedAccount) {
      throw new Error("Select an account first.");
    }
    if (targetMonth.value === selectedMonth) {
      return statementRows;
    }
    const result = await transactionsApi.getHistory({
      accountId: selectedAccount.id,
      fromDate: targetMonth.start.toISOString(),
      toDate: targetMonth.end.toISOString(),
      page: 1,
      limit: 100,
    });
    const historyTransactions = result.data.filter((transaction) =>
      isInMonth(transaction.initiatedAt, targetMonth),
    );
    return buildStatementRows(selectedAccount, historyTransactions, targetMonth);
  }

  async function downloadStatement(format: DownloadFormat, monthValue = selectedMonth) {
    if (!selectedAccount) {
      toast.error("Open an account before downloading a statement.");
      return;
    }

    const targetMonth = optionForMonth(monthValue, monthOptions);

    try {
      const rows = await buildRowsForDownload(targetMonth);
      const baseName = accountFileName(selectedAccount, targetMonth, "statement");

      if (format === "csv") {
        downloadBlob(
          new Blob([statementCsv(selectedAccount, accountHolder, targetMonth, rows)], {
            type: "text/csv;charset=utf-8",
          }),
          `${baseName}.csv`,
        );
      } else if (format === "excel") {
        downloadBlob(
          new Blob([statementExcel(selectedAccount, accountHolder, targetMonth, rows)], {
            type: "application/vnd.ms-excel;charset=utf-8",
          }),
          `${baseName}.xls`,
        );
      } else {
        downloadBlob(
          statementPdf(selectedAccount, accountHolder, targetMonth, rows, selectedAccount.currency),
          `${baseName}.pdf`,
        );
      }

      toast.success(`${targetMonth.label} statement downloaded.`);
    } catch {
      toast.error("Could not download this statement right now.");
    }
  }

  function downloadTableReport(kind: ReportTab) {
    if (!selectedAccount) {
      toast.error("Open an account before downloading reports.");
      return;
    }

    const fileBase = accountFileName(selectedAccount, month, kind);
    let rows: Array<Array<string | number>> = [];

    if (kind === "cashflow") {
      rows = [
        ["Metric", "Amount"],
        ["Opening Balance", openingBalance],
        ["Money In", inflow],
        ["Money Out", outflow],
        ["Closing Balance", closingBalance],
      ];
    } else if (kind === "tax") {
      rows = [
        ["Date", "Description", "Credit Amount", "Reference"],
        ...completedTransactions
          .filter((transaction) => isIncoming(transaction, selectedAccount.id))
          .map((transaction) => [
            formatDate(transaction.initiatedAt),
            transactionTitle(transaction),
            parseMoney(transaction.amount),
            transaction.reference,
          ]),
      ];
    } else if (kind === "receipts") {
      rows = [
        ["Date", "Description", "Amount", "Status", "Gateway"],
        ...selectedReceipts.map((payment) => [
          formatDate(payment.createdAt),
          payment.description ?? "Bank transfer",
          parseMoney(payment.amount),
          titleCase(payment.status),
          titleCase(payment.gateway),
        ]),
      ];
    } else {
      void downloadStatement("pdf");
      return;
    }

    downloadBlob(
      new Blob([rows.map((row) => row.map(csvEscape).join(",")).join("\n")], {
        type: "text/csv;charset=utf-8",
      }),
      `${fileBase}.csv`,
    );
    toast.success("Report downloaded.");
  }

  function renderEmptyState(copy: string) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-muted">
        {copy}
      </div>
    );
  }

  function renderActiveReport() {
    if (!selectedAccount) {
      return (
        <DashboardCard className="p-6">
          {renderEmptyState("Open an approved account to generate reports.")}
        </DashboardCard>
      );
    }

    if (activeTab === "cashflow") {
      const totalMovement = Math.max(inflow + outflow, 1);
      return (
        <DashboardCard className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-secondary">Cash Flow</h2>
              <p className="mt-1 text-sm text-muted">
                Movement for {accountDisplayName(selectedAccount)} in {month.label}.
              </p>
            </div>
            <Button onClick={() => downloadTableReport("cashflow")} variant="outline">
              <Download className="h-4 w-4" />
              Download CSV
            </Button>
          </div>
          <div className="mt-6 space-y-5">
            {([
              ["Money In", inflow, "bg-emerald-500", TrendingUp],
              ["Money Out", outflow, "bg-red-500", TrendingDown],
            ] as const).map(([label, value, color, Icon]) => {
              const amount = Number(value);
              const width = Math.max(8, Math.round((amount / totalMovement) * 100));
              const CashIcon = Icon;
              return (
                <div key={String(label)}>
                  <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                    <span className="flex items-center gap-2 font-semibold text-secondary">
                      <CashIcon className="h-4 w-4" />
                      {label}
                    </span>
                    <span className="font-bold">
                      {formatCurrency(amount, selectedAccount.currency)}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-100">
                    <div
                      className={cn("h-3 rounded-full", String(color))}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </DashboardCard>
      );
    }

    if (activeTab === "tax") {
      const taxableCredits = completedTransactions.filter((transaction) =>
        isIncoming(transaction, selectedAccount.id),
      );
      const taxableTotal = taxableCredits.reduce(
        (sum, transaction) => sum + parseMoney(transaction.amount),
        0,
      );
      return (
        <DashboardCard className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-secondary">Tax Summary</h2>
              <p className="mt-1 text-sm text-muted">
                Credits received for {month.label}.
              </p>
            </div>
            <Button onClick={() => downloadTableReport("tax")} variant="outline">
              <Download className="h-4 w-4" />
              Download CSV
            </Button>
          </div>
          <div className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Total credits:{" "}
            <span className="font-bold">
              {formatCurrency(taxableTotal, selectedAccount.currency)}
            </span>
          </div>
          <ReportTable
            emptyCopy="No taxable credits found for this account and month."
            rows={taxableCredits.map((transaction) => [
              formatDate(transaction.initiatedAt),
              transactionTitle(transaction),
              formatCurrency(transaction.amount, selectedAccount.currency),
              transaction.reference,
            ])}
            columns={["Date", "Description", "Credit", "Reference"]}
          />
        </DashboardCard>
      );
    }

    if (activeTab === "receipts") {
      return (
        <DashboardCard className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-secondary">Payment Receipts</h2>
              <p className="mt-1 text-sm text-muted">
                Payment receipts linked with the selected account.
              </p>
            </div>
            <Button onClick={() => downloadTableReport("receipts")} variant="outline">
              <Download className="h-4 w-4" />
              Download CSV
            </Button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-sm text-muted">Successful receipts</p>
              <p className="mt-2 text-2xl font-bold text-secondary">
                {successfulReceipts.length}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-sm text-muted">Receipt total</p>
              <p className="mt-2 text-2xl font-bold text-secondary">
                {formatCurrency(
                  successfulReceipts.reduce(
                    (sum, payment) => sum + parseMoney(payment.amount),
                    0,
                  ),
                  selectedAccount.currency,
                )}
              </p>
            </div>
          </div>
          <ReportTable
            emptyCopy="No payment receipts found for this account and month."
            rows={selectedReceipts.map((payment) => [
              formatDate(payment.createdAt),
              payment.description ?? "Bank transfer",
              formatCurrency(payment.amount, selectedAccount.currency),
              titleCase(payment.status),
            ])}
            columns={["Date", "Description", "Amount", "Status"]}
          />
        </DashboardCard>
      );
    }

    return (
      <DashboardCard className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <IconTile className="h-10 w-10 rounded-lg" icon={ShieldCheck} />
            <div>
              <p className="text-lg font-bold text-secondary">VaultBank</p>
              <p className="text-xs text-muted">Your trusted banking partner</p>
            </div>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-muted">Account Holder</dt>
              <dd className="mt-1 font-semibold text-secondary">{accountHolder}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Account Number</dt>
              <dd className="mt-1 font-semibold text-secondary">
                {maskAccountNumber(selectedAccount.accountNumber)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Statement Date</dt>
              <dd className="mt-1 font-semibold text-secondary">
                {formatDate(month.end.toISOString())}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Statement Period</dt>
              <dd className="mt-1 font-semibold text-secondary">{periodLabel(month)}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 p-4">
          <h2 className="font-bold text-secondary">Summary</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryMetric
              icon={Landmark}
              label="Opening Balance"
              value={formatCurrency(openingBalance, currency)}
            />
            <SummaryMetric
              icon={TrendingUp}
              label="Total Money In"
              tone="green"
              value={formatCurrency(inflow, currency)}
            />
            <SummaryMetric
              icon={TrendingDown}
              label="Total Money Out"
              tone="red"
              value={formatCurrency(outflow, currency)}
            />
            <SummaryMetric
              icon={BarChart3}
              label="Closing Balance"
              value={formatCurrency(closingBalance, currency)}
            />
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[860px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Money In</th>
                <th className="px-4 py-3 text-right">Money Out</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactionsLoading ? (
                <tr>
                  <td className="px-4 py-8 text-muted" colSpan={7}>
                    Loading statement...
                  </td>
                </tr>
              ) : transactionsError ? (
                <tr>
                  <td className="px-4 py-8 text-muted" colSpan={7}>
                    Could not load statement.
                    <Button
                      className="ml-3"
                      onClick={() => void refetch()}
                      size="sm"
                      variant="outline"
                    >
                      Try again
                    </Button>
                  </td>
                </tr>
              ) : statementRows.length ? (
                statementRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 text-muted">
                      {formatDate(row.date)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-secondary">
                      {row.description}
                    </td>
                    <td className="px-4 py-3 text-muted">{row.type}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                      {row.moneyIn === null
                        ? "-"
                        : formatCurrency(row.moneyIn, currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">
                      {row.moneyOut === null
                        ? "-"
                        : formatCurrency(row.moneyOut, currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-secondary">
                      {formatCurrency(row.balance, currency)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill tone={row.status === "Completed" || row.status === "Posted" ? "green" : "amber"}>
                        {row.status}
                      </StatusPill>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-8 text-center text-muted" colSpan={7}>
                    No statement rows found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-muted">
          This is a system generated statement and does not require a signature.
        </p>
      </DashboardCard>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-secondary">Monthly Statement</h1>
          <p className="mt-2 text-sm text-muted">
            View and download account-wise reports from July 2026 onward.
          </p>
        </div>
        <Button
          disabled={!selectedAccount}
          onClick={() => downloadTableReport(activeTab)}
          variant="outline"
        >
          <Download className="h-4 w-4" />
          Download Report
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          helper="posted credits this month"
          icon={ArrowDown}
          title="Money In"
          tone="green"
          value={formatCurrency(inflow, currency)}
        />
        <MetricCard
          helper="posted debits this month"
          icon={ArrowUp}
          title="Money Out"
          tone="red"
          value={formatCurrency(outflow, currency)}
        />
        <MetricCard
          helper="selected account closing balance"
          icon={BarChart3}
          title="Closing Balance"
          value={formatCurrency(closingBalance, currency)}
        />
      </div>

      <DashboardCard className="p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
          <label>
            <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-secondary">
              1. Select Account
            </span>
            <select
              className={selectClass}
              disabled={accountsLoading || accounts.length === 0}
              onChange={(event) => setSelectedAccountId(event.target.value)}
              value={selectedAccountId}
            >
              {accounts.length ? (
                accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {accountDisplayName(account)} (**** {getAccountLast4(account.accountNumber)})
                  </option>
                ))
              ) : (
                <option value="">No approved accounts</option>
              )}
            </select>
            <span className="mt-2 block text-xs text-muted">
              Available Balance
            </span>
            <span className="text-sm font-bold text-secondary">
              {formatCurrency(selectedAccount?.balance, currency)}
            </span>
          </label>

          <label>
            <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-secondary">
              2. Select Month
            </span>
            <span className="relative block">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <select
                className={cn(selectClass, "pl-9")}
                onChange={(event) => setSelectedMonth(event.target.value)}
                value={selectedMonth}
              >
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </span>
            <span className="mt-2 block text-xs text-muted">
              Statement Period
            </span>
            <span className="text-sm font-bold text-secondary">{periodLabel(month)}</span>
          </label>

          <div className="flex items-end gap-2">
            <Button
              className="w-full lg:w-auto"
              disabled={!selectedAccount}
              onClick={() => void refetch()}
            >
              <RefreshCcw className="h-4 w-4" />
              View Statement
            </Button>
          </div>
        </div>
      </DashboardCard>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <DashboardCard className="p-2">
            <div className="grid gap-2 md:grid-cols-4">
              {reportTabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-3 text-left transition",
                      active
                        ? "bg-primary text-white shadow-sm"
                        : "text-secondary hover:bg-slate-50",
                    )}
                    key={tab.id}
                    onClick={() => navigate(`/reports/${tab.id}`)}
                    type="button"
                  >
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        active ? "bg-white/15" : "bg-primary/10 text-primary",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">
                        {tab.label}
                      </span>
                      <span
                        className={cn(
                          "block truncate text-xs",
                          active ? "text-white/80" : "text-muted",
                        )}
                      >
                        {tab.helper}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </DashboardCard>
          {renderActiveReport()}
        </div>

        <aside className="space-y-5">
          <DashboardCard className="p-5">
            <h2 className="font-bold text-secondary">Download Statement</h2>
            <p className="mt-1 text-sm text-muted">
              Choose a format for the selected account and month.
            </p>
            <div className="mt-4 grid gap-3">
              {([
                ["PDF", "Best for printing", FileText, "pdf"],
                ["Excel", "Opens in Excel", FileSpreadsheet, "excel"],
                ["CSV", "Best for data export", Download, "csv"],
              ] as const).map(([label, helper, Icon, format]) => {
                const DownloadIcon = Icon;
                return (
                  <button
                    className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-left transition hover:border-primary/30 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!selectedAccount}
                    key={String(label)}
                    onClick={() => void downloadStatement(format)}
                    type="button"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <DownloadIcon className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-bold text-secondary">
                        {label}
                      </span>
                      <span className="text-xs text-muted">{helper}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </DashboardCard>

          <DashboardCard className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold text-secondary">Statement History</h2>
              <button
                className="text-xs font-bold text-primary"
                onClick={() => setSelectedMonth(monthOptions[0].value)}
                type="button"
              >
                View Latest
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {monthOptions.map((option) => (
                <div
                  className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                  key={option.value}
                >
                  <button
                    className="min-w-0 text-left"
                    onClick={() => setSelectedMonth(option.value)}
                    type="button"
                  >
                    <span className="block font-semibold text-secondary">
                      {option.label}
                    </span>
                    <span className="text-xs text-muted">{periodLabel(option)}</span>
                  </button>
                  <Button
                    disabled={!selectedAccount}
                    onClick={() => void downloadStatement("pdf", option.value)}
                    size="icon"
                    variant="outline"
                    aria-label={`Download ${option.label} statement`}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard className="p-5">
            <h2 className="font-bold text-secondary">Quick Info</h2>
            <div className="mt-4 space-y-3 text-sm text-muted">
              <p className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Statements are available from July 2026 onward.
              </p>
              <p className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Downloads are generated for the selected account only.
              </p>
              <p className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Amounts follow the currency of the selected account.
              </p>
            </div>
          </DashboardCard>

          <DashboardCard className="p-5">
            <h2 className="font-bold text-secondary">Need Help?</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              If any statement entry looks incorrect, raise a support request.
            </p>
            <Button
              className="mt-4 w-full"
              onClick={() => toast.success("Support request recorded.")}
              variant="outline"
            >
              Raise Support Request
            </Button>
          </DashboardCard>
        </aside>
      </div>
    </div>
  );
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
  tone = "blue",
}: {
  icon: typeof Landmark;
  label: string;
  value: string;
  tone?: "blue" | "green" | "red";
}) {
  return (
    <div className="flex items-center gap-3 border-r border-slate-100 last:border-0">
      <IconTile
        className="h-9 w-9 rounded-lg"
        icon={Icon}
        tone={tone === "green" ? "green" : tone === "red" ? "red" : "blue"}
      />
      <div className="min-w-0">
        <p className="truncate text-xs text-muted">{label}</p>
        <p
          className={cn(
            "truncate text-base font-bold text-secondary",
            tone === "green" && "text-emerald-600",
            tone === "red" && "text-red-600",
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function ReportTable({
  columns,
  rows,
  emptyCopy,
}: {
  columns: string[];
  rows: string[][];
  emptyCopy: string;
}) {
  return (
    <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-[680px] w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column) => (
              <th className="px-4 py-3" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length ? (
            rows.map((row, index) => (
              <tr className="hover:bg-slate-50" key={`${row.join("-")}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td
                    className={cn(
                      "px-4 py-3",
                      cellIndex === 1
                        ? "font-semibold text-secondary"
                        : "text-slate-600",
                    )}
                    key={`${cell}-${cellIndex}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-4 py-8 text-center text-muted" colSpan={columns.length}>
                {emptyCopy}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
