import { useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  Eye,
  Landmark,
  Lock,
  MoreVertical,
  Plus,
  ShieldCheck,
  Timer,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { CopyButton } from "@/components/common/CopyButton";
import { useNavigate } from "react-router-dom";
import {
  DashboardCard,
  IconTile,
  StatusPill,
} from "@/components/dashboard/DashboardCard";
import { Button } from "@/components/ui/button";
import {
  ACCOUNT_TYPE_LABELS,
  formatCurrency,
  groupAccountNumber,
  parseMoney,
} from "@/constants/accounts.constants";
import { useAccounts } from "@/hooks/useAccounts";
import { useAuth } from "@/hooks/useAuth";
import {
  createAccountDeleteRequest,
  pendingDeleteAccountIds,
  useAccountApprovalRequests,
} from "@/lib/account-approval-store";
import {
  accountDisplayName,
  accountStatusTone,
  formatDate,
  kycTone,
  titleCase,
} from "@/lib/dashboard-format";
import { cn } from "@/lib/utils";
import {
  AccountType,
  KycStatus,
  type Account,
} from "@/types/accounts.types";

const accountOptions = [
  {
    type: AccountType.SAVINGS,
    icon: Landmark,
    tone: "green" as const,
    title: "Savings Account",
    copy: "Earn interest on your savings with flexible deposits and withdrawals.",
    badge: "Higher Interest",
  },
  {
    type: AccountType.CURRENT,
    icon: Wallet,
    tone: "blue" as const,
    title: "Current Account",
    copy: "Ideal for daily transactions with unlimited deposits and withdrawals.",
    badge: "No Minimum Balance",
  },
  {
    type: AccountType.FIXED,
    icon: Lock,
    tone: "amber" as const,
    title: "Fixed Deposit",
    copy: "Lock in your money for a fixed term and earn higher returns.",
    badge: "Guaranteed Returns",
  },
];

function errorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}

function AccountRow({
  account,
  onDelete,
  pendingDelete,
}: {
  account: Account;
  onDelete: (account: Account) => void;
  pendingDelete?: boolean;
}) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const meta =
    account.type === AccountType.SAVINGS
      ? { icon: Landmark, tone: "green" as const }
      : account.type === AccountType.CURRENT
        ? { icon: Wallet, tone: "blue" as const }
        : { icon: Lock, tone: "amber" as const };

  return (
    <article className="relative grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-primary/30 md:grid-cols-[1.6fr_1fr_1fr_0.8fr_auto] md:items-center">
      <div className="flex min-w-0 items-center gap-4">
        <IconTile icon={meta.icon} tone={meta.tone} />
        <span className="min-w-0">
          <button
            className="block text-left font-bold text-secondary hover:text-primary"
            onClick={() => navigate(`/accounts/${account.id}`)}
            type="button"
          >
            {ACCOUNT_TYPE_LABELS[account.type]}
          </button>
          <span className="mt-1 block text-sm text-muted">Account Number</span>
          <span className="mt-1 flex items-center gap-2 text-sm font-medium text-secondary">
            {groupAccountNumber(account.accountNumber)}
            <CopyButton
              className="h-7 w-7"
              onCopied={() => toast.success("Account number copied")}
              size="sm"
              text={account.accountNumber}
            />
          </span>
          {pendingDelete ? (
            <span className="mt-2 flex items-center gap-1 text-xs font-semibold text-amber-700">
              <Timer className="h-3.5 w-3.5" />
              Delete request pending admin approval
            </span>
          ) : null}
        </span>
      </div>
      <div>
        <p className="text-xs text-muted">Available Balance</p>
        <p className="mt-1 flex items-center gap-2 text-lg font-bold text-secondary">
          {formatCurrency(account.balance, account.currency)}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted">Account Type</p>
        <p className="mt-1 font-semibold text-secondary">
          {accountDisplayName(account)}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted">Status</p>
        <div className="mt-1">
          <StatusPill tone={accountStatusTone(account.status)}>
            {titleCase(account.status)}
          </StatusPill>
        </div>
      </div>
      <div className="relative justify-self-start md:justify-self-end">
        <Button
          aria-expanded={menuOpen}
          aria-label="View account actions"
          onClick={() => setMenuOpen((open) => !open)}
          size="icon"
          variant="ghost"
        >
          <MoreVertical className="h-5 w-5" />
        </Button>
        {menuOpen ? (
          <div className="absolute right-0 top-12 z-20 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
            <button
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-secondary hover:bg-slate-50"
              onClick={() => {
                setMenuOpen(false);
                navigate(`/accounts/${account.id}`);
              }}
              type="button"
            >
              <Eye className="h-4 w-4 text-muted" />
              View details
            </button>
            <button
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium",
                pendingDelete
                  ? "cursor-not-allowed text-slate-400"
                  : "text-danger hover:bg-red-50",
              )}
              disabled={pendingDelete}
              onClick={() => {
                if (pendingDelete) {
                  return;
                }
                setMenuOpen(false);
                onDelete(account);
              }}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              Delete account
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function AccountsPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const { accounts, isLoading } = useAccounts();
  const approvalRequests = useAccountApprovalRequests(auth.user?.id);
  const pendingRequests = approvalRequests.filter(
    (request) => request.status === "pending",
  );
  const reviewedRequests = approvalRequests
    .filter((request) => request.status !== "pending")
    .slice(0, 3);
  const pendingDeleteIds = pendingDeleteAccountIds(approvalRequests);
  const [selectedType, setSelectedType] = useState<AccountType>(AccountType.SAVINGS);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [isSubmittingDeleteRequest, setIsSubmittingDeleteRequest] = useState(false);
  const primaryCurrency = accounts[0]?.currency;
  const totalBalance = accounts.reduce(
    (sum, account) => sum + parseMoney(account.balance),
    0,
  );
  const kycComplete =
    accounts.length === 0 ||
    accounts.every((account) => account.kycStatus === KycStatus.APPROVED);

  function openSelectedAccount() {
    navigate(`/accounts/new?type=${selectedType}`);
  }

  function openDeleteDialog(account: Account) {
    setDeleteTarget(account);
    setDeleteError("");
  }

  function closeDeleteDialog() {
    if (isSubmittingDeleteRequest) {
      return;
    }
    setDeleteTarget(null);
    setDeleteError("");
  }

  function confirmDeleteAccount() {
    if (!deleteTarget) {
      return;
    }
    try {
      setDeleteError("");
      setIsSubmittingDeleteRequest(true);
      createAccountDeleteRequest({
        user: auth.user,
        account: deleteTarget,
      });
      toast.success("Delete request sent to admin for approval.");
      setDeleteTarget(null);
      setDeleteError("");
    } catch (error: unknown) {
      const message = errorMessage(
        error,
        "Unable to submit delete request. Please try again.",
      );
      setDeleteError(message);
      toast.error(message);
    } finally {
      setIsSubmittingDeleteRequest(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-secondary">Accounts</h1>
          <p className="mt-2 text-sm text-muted">
            Manage your savings and current accounts.
          </p>
        </div>
        <Button onClick={openSelectedAccount}>
          <Plus className="h-4 w-4" />
          Open New Account
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <DashboardCard className="p-5">
            <h2 className="text-lg font-bold text-secondary">
              Open a New Account
            </h2>
            <p className="mt-1 text-sm text-muted">
              Choose the account type that fits your needs.
            </p>
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {accountOptions.map((option) => (
                <button
                  className={cn(
                    "min-h-40 rounded-xl border p-5 text-left transition hover:border-primary/30 hover:bg-primary/5",
                    selectedType === option.type
                      ? "border-primary bg-primary/5"
                      : "border-slate-200 bg-white",
                  )}
                  key={option.type}
                  onClick={() => setSelectedType(option.type)}
                  type="button"
                >
                  <div className="flex items-start gap-4">
                    <IconTile icon={option.icon} tone={option.tone} />
                    <div>
                      <h3 className="font-bold text-secondary">{option.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted">
                        {option.copy}
                      </p>
                      <StatusPill className="mt-3" tone={option.tone}>
                        {option.badge}
                      </StatusPill>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-5 text-xs font-medium text-muted">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Quick account opening
              </span>
              <span>Instant verification</span>
              <span>Secure banking</span>
            </div>
          </DashboardCard>

          {pendingRequests.length || reviewedRequests.length ? (
            <DashboardCard className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-secondary">
                    Account Approval Requests
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Admin must approve account opening and deletion requests.
                  </p>
                </div>
                <StatusPill tone={pendingRequests.length ? "amber" : "green"}>
                  {pendingRequests.length
                    ? `${pendingRequests.length} Pending`
                    : "All reviewed"}
                </StatusPill>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {[...pendingRequests, ...reviewedRequests].map((request) => (
                  <div
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    key={request.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-secondary">
                          {request.action === "open"
                            ? "Open account"
                            : "Delete account"}
                        </p>
                        <p className="mt-1 text-sm text-muted">
                          {ACCOUNT_TYPE_LABELS[request.accountType]} -{" "}
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
                    <p className="mt-3 text-xs text-muted">
                      Requested {formatDate(request.requestedAt)}
                      {request.reviewedAt
                        ? ` - Reviewed ${formatDate(request.reviewedAt)}`
                        : ""}
                    </p>
                  </div>
                ))}
              </div>
            </DashboardCard>
          ) : null}

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-secondary">Your Accounts</h2>
              {accounts.length ? (
                <span className="text-sm font-medium text-muted">
                  Total {primaryCurrency ? formatCurrency(totalBalance, primaryCurrency) : "$0.00"}
                </span>
              ) : null}
            </div>

            {isLoading ? (
              <DashboardCard className="p-5 text-sm text-muted">
                Loading accounts...
              </DashboardCard>
            ) : accounts.length ? (
              <div className="space-y-3">
                {accounts.map((account) => (
                  <AccountRow
                    account={account}
                    key={account.id}
                    onDelete={openDeleteDialog}
                    pendingDelete={pendingDeleteIds.has(account.id)}
                  />
                ))}
              </div>
            ) : (
              <DashboardCard className="flex min-h-64 flex-col items-center justify-center border-dashed px-6 py-10 text-center">
                <IconTile icon={CreditCard} />
                <h3 className="mt-4 text-lg font-bold text-secondary">
                  No accounts yet
                </h3>
                <p className="mt-2 max-w-md text-sm text-muted">
                  Open a savings, current, or fixed deposit account to begin.
                </p>
                <Button className="mt-5" onClick={openSelectedAccount}>
                  Open account
                </Button>
              </DashboardCard>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <DashboardCard className="p-5">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-primary" />
              <h2 className="font-bold text-secondary">
                Account Opening Checklist
              </h2>
            </div>
            <p className="mt-3 text-sm text-muted">
              Complete the following to open new accounts.
            </p>
            <div className="mt-5 space-y-3">
              {[
                {
                  title: "Mobile Number Verified",
                  helper: auth.user?.phone ?? "Add your mobile number",
                  done: Boolean(auth.user?.phone),
                  to: "/profile",
                },
                {
                  title: "Email Verified",
                  helper: auth.user?.email ?? "Verify your email",
                  done: Boolean(auth.user?.isVerified),
                  to: "/profile",
                },
                {
                  title: "eKYC Completed",
                  helper: kycComplete ? "Identity verified" : "Verification pending",
                  done: kycComplete,
                  to: "/ekyc",
                },
                {
                  title: "Initial Deposit",
                  helper: "Minimum $50.00 required",
                  done: totalBalance > 0,
                  to: "/payments",
                },
              ].map((item, index) => (
                <button
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-4 text-left transition hover:border-primary/30 hover:bg-primary/5"
                  key={item.title}
                  onClick={() => navigate(item.to)}
                  type="button"
                >
                  {item.done ? (
                    <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-primary text-sm font-bold text-primary">
                      {index + 1}
                    </span>
                  )}
                  <div>
                    <p className="font-semibold text-secondary">{item.title}</p>
                    <p className="text-sm text-muted">{item.helper}</p>
                  </div>
                </button>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard className="p-5">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="font-bold text-secondary">
                Your security is our priority
              </h2>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted">
              All accounts are protected with bank-level security and encryption.
            </p>
            <Button className="mt-5 w-full" onClick={() => navigate("/profile")} variant="ghost">
              Learn more about security
            </Button>
          </DashboardCard>

          {accounts[0] ? (
            <DashboardCard className="p-5">
              <h2 className="font-bold text-secondary">Latest account update</h2>
              <p className="mt-2 text-sm text-muted">
                {accountDisplayName(accounts[0])} updated on{" "}
                {formatDate(accounts[0].updatedAt)}.
              </p>
              <StatusPill className="mt-4" tone={kycTone(accounts[0].kycStatus)}>
                KYC {titleCase(accounts[0].kycStatus)}
              </StatusPill>
            </DashboardCard>
          ) : null}
        </aside>
      </div>

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          onMouseDown={closeDeleteDialog}
          role="presentation"
        >
          <section
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-5 shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="rounded-full bg-red-50 p-3 text-danger">
                  <Trash2 className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-secondary">
                    Request account deletion
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    This account will be sent to admin for approval. It will
                    remain usable until the admin approves deletion.
                  </p>
                </div>
              </div>
              <Button
                aria-label="Close delete account dialog"
                className="h-8 w-8 rounded-full"
                onClick={closeDeleteDialog}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Account
              </p>
              <p className="mt-1 font-bold text-secondary">
                {ACCOUNT_TYPE_LABELS[deleteTarget.type]}
              </p>
              <p className="mt-1 text-sm text-muted">
                {groupAccountNumber(deleteTarget.accountNumber)}
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                <Timer className="h-4 w-4" />
                Admin approval required
              </div>
              <p className="mt-2 text-sm text-amber-800">
                After approval, the account will be removed from your customer
                portal.
              </p>
            </div>

            {deleteError ? (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">
                {deleteError}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button onClick={closeDeleteDialog} type="button" variant="outline">
                Cancel
              </Button>
              <Button
                disabled={isSubmittingDeleteRequest}
                onClick={confirmDeleteAccount}
                type="button"
                variant="destructive"
              >
                {isSubmittingDeleteRequest ? "Sending..." : "Send request"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
