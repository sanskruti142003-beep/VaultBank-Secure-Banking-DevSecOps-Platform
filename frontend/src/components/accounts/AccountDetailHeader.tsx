import {
  ArrowLeftRight,
  CalendarDays,
  CreditCard,
  DollarSign,
  Lock,
  PiggyBank,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AccountNumberDisplay } from "@/components/accounts/AccountNumberDisplay";
import { AccountStatusBadge } from "@/components/accounts/AccountStatusBadge";
import { BalanceDisplay } from "@/components/accounts/BalanceDisplay";
import { ActionDialog } from "@/components/common/ActionDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ACCOUNT_TYPE_LABELS,
  getAccountLast4,
  parseMoney,
} from "@/constants/accounts.constants";
import { useTransactionActions } from "@/hooks/useTransactions";
import { cn } from "@/lib/utils";
import { AccountType, type Account } from "@/types/accounts.types";

interface AccountDetailHeaderProps {
  account: Account;
  className?: string;
}

const typeMeta = {
  [AccountType.SAVINGS]: {
    icon: PiggyBank,
    iconClass: "bg-primary/10 text-primary",
    background: "from-primary/10 via-white to-white",
  },
  [AccountType.CURRENT]: {
    icon: Wallet,
    iconClass: "bg-violet-50 text-violet-700",
    background: "from-violet-100/70 via-white to-white",
  },
  [AccountType.FIXED]: {
    icon: Lock,
    iconClass: "bg-amber-50 text-amber-700",
    background: "from-amber-100/70 via-white to-white",
  },
};

function formatDate(value: string): string {
  if (!value) {
    return "Recently";
  }
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AccountDetailHeader({
  account,
  className,
}: AccountDetailHeaderProps) {
  const navigate = useNavigate();
  const { deposit, isDepositing } = useTransactionActions();
  const [addMoneyOpen, setAddMoneyOpen] = useState(false);
  const [addMoneyAmount, setAddMoneyAmount] = useState("");
  const [addMoneyError, setAddMoneyError] = useState("");
  const meta = typeMeta[account.type];
  const Icon = meta.icon;
  const last4 = getAccountLast4(account.accountNumber);

  async function addMoney() {
    setAddMoneyError("");
    const amount = parseMoney(addMoneyAmount);
    if (amount <= 0) {
      setAddMoneyError("Enter an amount greater than zero.");
      return;
    }
    try {
      await deposit({
        toAccountId: account.id,
        amount: amount.toFixed(2),
        currency: account.currency,
      });
      setAddMoneyAmount("");
      setAddMoneyOpen(false);
    } catch (error) {
      setAddMoneyError(
        error instanceof Error ? error.message : "Could not add money.",
      );
    }
  }

  return (
    <>
      <section
        className={cn(
          "overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm",
          className,
        )}
      >
      <div
        className={cn(
          "grid gap-6 bg-gradient-to-br p-5 sm:p-6 lg:grid-cols-[1.35fr_0.9fr]",
          meta.background,
        )}
      >
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <div className={cn("rounded-2xl p-3", meta.iconClass)}>
              <Icon className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Account ending {last4}
              </p>
              <h2 className="mt-1 text-2xl font-bold text-secondary sm:text-3xl">
                {ACCOUNT_TYPE_LABELS[account.type]}
              </h2>
            </div>
            <AccountStatusBadge status={account.status} />
            <AccountStatusBadge status={account.kycStatus} type="kyc" />
          </div>

          <div className="mt-8">
            <p className="text-sm font-medium text-muted">Available balance</p>
            <div className="mt-2">
              <BalanceDisplay
                amount={account.balance}
                className="text-4xl sm:text-5xl"
                currency={account.currency}
                size="lg"
              />
            </div>
          </div>

          <div className="mt-6">
            <AccountNumberDisplay accountNumber={account.accountNumber} />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => setAddMoneyOpen(true)} variant="outline">
              <DollarSign className="h-4 w-4" />
              Add Money
            </Button>
            <Button
              onClick={() => navigate(`/payments?from=${account.id}`)}
            >
              <ArrowLeftRight className="h-4 w-4" />
              Transfer
            </Button>
            <Button
              onClick={() => navigate(`/accounts/${account.id}/beneficiaries`)}
              variant="outline"
            >
              <Users className="h-4 w-4" />
              Beneficiaries
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white/80 p-4 shadow-sm backdrop-blur">
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">
            Account details
          </h3>
          <dl className="mt-5 space-y-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="flex items-center gap-2 text-muted">
                <CreditCard className="h-4 w-4" />
                Number
              </dt>
              <dd className="font-semibold text-secondary">Ending {last4}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="flex items-center gap-2 text-muted">
                <CalendarDays className="h-4 w-4" />
                Opened
              </dt>
              <dd className="font-semibold text-secondary">
                {formatDate(account.createdAt)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="flex items-center gap-2 text-muted">
                <Wallet className="h-4 w-4" />
                Currency
              </dt>
              <dd className="font-semibold text-secondary">{account.currency}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="flex items-center gap-2 text-muted">
                <ShieldCheck className="h-4 w-4" />
                Verification
              </dt>
              <dd>
                <AccountStatusBadge status={account.kycStatus} type="kyc" />
              </dd>
            </div>
          </dl>
        </div>
      </div>
      </section>

      <ActionDialog
        description={`Deposit money into ${ACCOUNT_TYPE_LABELS[account.type]} ending ${last4}.`}
        footer={
          <>
            <Button onClick={() => setAddMoneyOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button disabled={isDepositing} onClick={() => void addMoney()}>
              {isDepositing ? "Adding..." : "Add Money"}
            </Button>
          </>
        }
        onOpenChange={setAddMoneyOpen}
        open={addMoneyOpen}
        title="Add Money"
      >
        <label className="block text-sm font-semibold text-secondary">
          Amount
          <Input
            className="mt-2"
            min="0"
            onChange={(event) => setAddMoneyAmount(event.target.value)}
            placeholder="Enter deposit amount"
            step="0.01"
            type="number"
            value={addMoneyAmount}
          />
        </label>
        {addMoneyError ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">
            {addMoneyError}
          </p>
        ) : null}
      </ActionDialog>
    </>
  );
}
