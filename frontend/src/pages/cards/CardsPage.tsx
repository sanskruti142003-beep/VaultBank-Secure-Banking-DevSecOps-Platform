import { useState } from "react";
import { CreditCard, Lock, Plus, ShieldCheck, Snowflake, Wifi } from "lucide-react";
import toast from "react-hot-toast";
import {
  DashboardCard,
  IconTile,
  StatusPill,
} from "@/components/dashboard/DashboardCard";
import { ActionDialog } from "@/components/common/ActionDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatCurrency,
  getAccountLast4,
  parseMoney,
} from "@/constants/accounts.constants";
import { useAccounts } from "@/hooks/useAccounts";
import { accountDisplayName } from "@/lib/dashboard-format";

export function CardsPage() {
  const { accounts } = useAccounts();
  const [requestOpen, setRequestOpen] = useState(false);
  const [pinAccountId, setPinAccountId] = useState<string | null>(null);
  const [limitAccountId, setLimitAccountId] = useState<string | null>(null);
  const [frozenCards, setFrozenCards] = useState<Set<string>>(new Set());
  const [pin, setPin] = useState("");
  const [dailyLimit, setDailyLimit] = useState("2500");
  const selectedPinAccount = accounts.find((account) => account.id === pinAccountId);
  const selectedLimitAccount = accounts.find((account) => account.id === limitAccountId);

  function toggleFreeze(accountId: string) {
    setFrozenCards((current) => {
      const next = new Set(current);
      if (next.has(accountId)) {
        next.delete(accountId);
        toast.success("Card unfrozen");
      } else {
        next.add(accountId);
        toast.success("Card frozen");
      }
      return next;
    });
  }

  function savePin() {
    if (!/^\d{4}$/.test(pin)) {
      toast.error("Enter a 4 digit PIN.");
      return;
    }
    toast.success("Card PIN updated.");
    setPin("");
    setPinAccountId(null);
  }

  function saveLimit() {
    if (parseMoney(dailyLimit) <= 0) {
      toast.error("Enter a valid daily card limit.");
      return;
    }
    toast.success("Card limit updated.");
    setLimitAccountId(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-secondary">Cards</h1>
          <p className="mt-2 text-sm text-muted">
            Manage debit cards connected to your VaultBank accounts.
          </p>
        </div>
        <Button disabled={accounts.length === 0} onClick={() => setRequestOpen(true)}>
          <Plus className="h-4 w-4" />
          Request Card
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-4 lg:grid-cols-2">
          {accounts.length ? (
            accounts.map((account) => (
              <DashboardCard className="overflow-hidden" key={account.id}>
                <div className="bg-primary p-6 text-white">
                  <div className="flex items-center justify-between">
                    <CreditCard className="h-8 w-8" />
                    <Wifi className="h-6 w-6" />
                  </div>
                  <p className="mt-10 text-lg font-semibold tracking-normal">
                    **** **** **** {getAccountLast4(account.accountNumber)}
                  </p>
                  <div className="mt-8 flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase text-white/70">Linked Account</p>
                      <p className="mt-1 font-semibold">
                        {accountDisplayName(account)}
                      </p>
                    </div>
                    <StatusPill className="bg-white/15 text-white ring-white/25" tone="blue">
                      {frozenCards.has(account.id) ? "Frozen" : "Active"}
                    </StatusPill>
                  </div>
                </div>
                <div className="grid gap-3 p-5 sm:grid-cols-3">
                  <Button onClick={() => toggleFreeze(account.id)} variant="outline">
                    <Snowflake className="h-4 w-4" />
                    {frozenCards.has(account.id) ? "Unfreeze" : "Freeze"}
                  </Button>
                  <Button onClick={() => setPinAccountId(account.id)} variant="outline">
                    <Lock className="h-4 w-4" />
                    PIN
                  </Button>
                  <Button onClick={() => setLimitAccountId(account.id)} variant="outline">
                    Limits
                  </Button>
                </div>
              </DashboardCard>
            ))
          ) : (
            <DashboardCard className="flex min-h-72 flex-col items-center justify-center border-dashed px-6 py-10 text-center lg:col-span-2">
              <IconTile icon={CreditCard} />
              <h2 className="mt-4 text-lg font-bold text-secondary">
                No cards yet
              </h2>
              <p className="mt-2 max-w-md text-sm text-muted">
                Open an account first, then request a debit card.
              </p>
            </DashboardCard>
          )}
        </div>

        <aside className="space-y-5">
          <DashboardCard className="p-5">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="font-bold text-secondary">Card Security</h2>
            </div>
            <div className="mt-5 space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted">Online payments</span>
                <StatusPill tone="green">Enabled</StatusPill>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">ATM withdrawals</span>
                <StatusPill tone="green">Enabled</StatusPill>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">International usage</span>
                <StatusPill tone="amber">Review</StatusPill>
              </div>
            </div>
          </DashboardCard>

          <DashboardCard className="p-5">
            <h2 className="font-bold text-secondary">Linked Balance</h2>
            <p className="mt-4 text-3xl font-bold text-secondary">
              {accounts[0]
                ? formatCurrency(
                    accounts.reduce(
                      (sum, account) => sum + parseMoney(account.balance),
                      0,
                    ),
                    accounts[0].currency,
                  )
                : "$0.00"}
            </p>
            <p className="mt-2 text-sm text-muted">
              Available across card-enabled accounts.
            </p>
          </DashboardCard>
        </aside>
      </div>

      <ActionDialog
        description="Select an account and submit a request for a new virtual card."
        footer={
          <>
            <Button onClick={() => setRequestOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button
              onClick={() => {
                toast.success("Card request submitted.");
                setRequestOpen(false);
              }}
            >
              Submit Request
            </Button>
          </>
        }
        onOpenChange={setRequestOpen}
        open={requestOpen}
        title="Request a New Card"
      >
        <label className="block text-sm font-semibold text-secondary">
          Link to account
          <select className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {accountDisplayName(account)} - {getAccountLast4(account.accountNumber)}
              </option>
            ))}
          </select>
        </label>
      </ActionDialog>

      <ActionDialog
        description={
          selectedPinAccount
            ? `Change PIN for card ending ${getAccountLast4(selectedPinAccount.accountNumber)}.`
            : undefined
        }
        footer={
          <>
            <Button onClick={() => setPinAccountId(null)} variant="outline">
              Cancel
            </Button>
            <Button onClick={savePin}>Save PIN</Button>
          </>
        }
        onOpenChange={(open) => setPinAccountId(open ? pinAccountId : null)}
        open={Boolean(pinAccountId)}
        title="Change Card PIN"
      >
        <label className="block text-sm font-semibold text-secondary">
          New 4 digit PIN
          <Input
            className="mt-2 text-center text-lg font-bold tracking-[0.35em]"
            inputMode="numeric"
            maxLength={4}
            onChange={(event) =>
              setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
            }
            placeholder="0000"
            type="password"
            value={pin}
          />
        </label>
      </ActionDialog>

      <ActionDialog
        description={
          selectedLimitAccount
            ? `Set spending limits for card ending ${getAccountLast4(
                selectedLimitAccount.accountNumber,
              )}.`
            : undefined
        }
        footer={
          <>
            <Button onClick={() => setLimitAccountId(null)} variant="outline">
              Cancel
            </Button>
            <Button onClick={saveLimit}>Save Limit</Button>
          </>
        }
        onOpenChange={(open) => setLimitAccountId(open ? limitAccountId : null)}
        open={Boolean(limitAccountId)}
        title="Card Limits"
      >
        <label className="block text-sm font-semibold text-secondary">
          Daily card limit
          <Input
            className="mt-2"
            min="1"
            onChange={(event) => setDailyLimit(event.target.value)}
            type="number"
            value={dailyLimit}
          />
        </label>
      </ActionDialog>
    </div>
  );
}
