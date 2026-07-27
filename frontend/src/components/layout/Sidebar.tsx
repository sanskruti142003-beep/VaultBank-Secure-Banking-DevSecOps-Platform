import { useState } from "react";
import {
  ArrowLeftRight,
  BarChart2,
  ChevronUp,
  CreditCard,
  Home,
  Send,
  Settings,
  ShieldCheck,
  User,
  Wallet,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { Logo } from "@/components/common/Logo";
import { SkeletonCard } from "@/components/common/SkeletonCard";
import { Button } from "@/components/ui/button";
import {
  ACCOUNT_TYPE_LABELS,
  formatCompactCurrency,
  getAccountLast4,
} from "@/constants/accounts.constants";
import { useAccounts } from "@/hooks/useAccounts";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { AccountType } from "@/types/accounts.types";

interface SidebarProps {
  onNavigate?: () => void;
}

const navItems = [
  { to: "/dashboard", label: "Overview", icon: Home },
  { to: "/accounts", label: "Accounts", icon: CreditCard },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/payments", label: "Payments", icon: Send },
  { to: "/ekyc", label: "eKYC", icon: ShieldCheck },
  { to: "/cards", label: "Cards", icon: Wallet },
  { to: "/reports", label: "Reports", icon: BarChart2 },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/profile", label: "Profile", icon: User },
];

const dotColors = {
  [AccountType.SAVINGS]: "bg-primary",
  [AccountType.CURRENT]: "bg-violet-500",
  [AccountType.FIXED]: "bg-amber-500",
};

function userInitials(name: string | undefined): string {
  return (name ?? "VB")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const navigate = useNavigate();
  const auth = useAuth();
  const selectedAccountId = useAuthStore((state) => state.selectedAccountId);
  const setSelectedAccountId = useAuthStore((state) => state.setSelectedAccountId);
  const { accounts, isLoading } = useAccounts();
  const [menuOpen, setMenuOpen] = useState(false);
  const previewAccounts = accounts.slice(0, 3);

  async function signOut() {
    await auth.logoutMutation.mutateAsync();
    navigate("/auth/login", { replace: true });
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r border-slate-200 bg-white px-4 py-5">
      <Logo />
      <nav className="mt-8 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition duration-150 hover:bg-slate-100 hover:text-secondary",
                  isActive && "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
                )
              }
              key={item.to}
              onClick={onNavigate}
              to={item.to}
            >
              <Icon className="h-[18px] w-[18px]" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-8 min-h-0 flex-1">
        <p className="px-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          My accounts
        </p>
        <div className="mt-3 space-y-2">
          {isLoading ? (
            <>
              <SkeletonCard className="p-3" variant="row" />
              <SkeletonCard className="p-3" variant="row" />
            </>
          ) : (
            previewAccounts.map((account) => (
              <button
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-slate-100",
                  selectedAccountId === account.id && "bg-primary/10",
                )}
                key={account.id}
                onClick={() => {
                  setSelectedAccountId(account.id);
                  navigate(`/accounts/${account.id}`);
                  onNavigate?.();
                }}
                type="button"
              >
                <span className={cn("h-2.5 w-2.5 rounded-full", dotColors[account.type])} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-secondary">
                    {ACCOUNT_TYPE_LABELS[account.type]}
                  </span>
                  <span className="block text-xs text-muted">
                    Ending {getAccountLast4(account.accountNumber)}
                  </span>
                </span>
                <span className="text-xs font-medium text-muted">
                  {formatCompactCurrency(account.balance, account.currency)}
                </span>
              </button>
            ))
          )}
        </div>
        {accounts.length > 3 ? (
          <NavLink
            className="mt-2 block px-3 text-sm font-semibold text-primary hover:text-primary-dark"
            onClick={onNavigate}
            to="/accounts"
          >
            View all
          </NavLink>
        ) : null}
      </div>

      <div className="relative mt-5 border-t border-slate-100 pt-4">
        <button
          className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-slate-50"
          onClick={() => setMenuOpen((current) => !current)}
          type="button"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
            {userInitials(auth.user?.fullName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-secondary">
              {auth.user?.fullName ?? "VaultBank user"}
            </span>
            <span className="block truncate text-xs text-muted">
              {auth.user?.email ?? "Signed in"}
            </span>
          </span>
          <ChevronUp className="h-4 w-4 text-muted" />
        </button>
        {menuOpen ? (
          <div className="absolute bottom-16 left-0 right-0 rounded-xl border border-slate-100 bg-white p-2 shadow-lg">
            <button
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-secondary hover:bg-slate-50"
              onClick={() => {
                navigate("/profile");
                onNavigate?.();
              }}
              type="button"
            >
              Profile settings
            </button>
            <div className="my-1 h-px bg-slate-100" />
            <Button
              className="w-full justify-start"
              onClick={() => void signOut()}
              variant="ghost"
            >
              Sign out
            </Button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
