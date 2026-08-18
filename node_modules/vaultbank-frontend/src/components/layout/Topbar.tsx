import { FormEvent, useState } from "react";
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  FileText,
  Mail,
  Menu,
  Search,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ACCOUNT_TYPE_LABELS, groupAccountNumber } from "@/constants/accounts.constants";
import { useAuth } from "@/hooks/useAuth";
import {
  markAccountApprovalNotificationsRead,
  useAccountApprovalRequests,
  type AccountApprovalRequest,
} from "@/lib/account-approval-store";
import { markKycNotificationsRead, useKycSubmission } from "@/lib/kyc-store";

interface TopbarProps {
  onMenuClick: () => void;
}

function titleForPath(pathname: string): string {
  if (pathname === "/dashboard") {
    return "Overview";
  }
  if (pathname === "/accounts/new") {
    return "Open account";
  }
  if (pathname.includes("/beneficiaries")) {
    return "Beneficiaries";
  }
  if (pathname.startsWith("/accounts/")) {
    return "Account detail";
  }
  if (pathname === "/accounts") {
    return "Accounts";
  }
  if (pathname === "/transactions") {
    return "Transaction History";
  }
  if (pathname === "/payments") {
    return "Payments";
  }
  if (pathname === "/ekyc") {
    return "eKYC Verification";
  }
  if (pathname === "/cards") {
    return "Cards";
  }
  if (pathname.startsWith("/reports")) {
    return "Reports";
  }
  if (pathname === "/settings" || pathname === "/profile") {
    return "Profile & Settings";
  }
  return "VaultBank";
}

function breadcrumbForPath(pathname: string) {
  const crumbs = [{ label: "Home", to: "/dashboard" }];
  if (pathname.startsWith("/accounts")) {
    crumbs.push({ label: "Accounts", to: "/accounts" });
  }
  if (pathname === "/transactions") {
    crumbs.push({ label: "Transactions", to: "/transactions" });
  }
  if (pathname === "/payments") {
    crumbs.push({ label: "Payments", to: "/payments" });
  }
  if (pathname === "/ekyc") {
    crumbs.push({ label: "eKYC", to: "/ekyc" });
  }
  if (pathname === "/cards") {
    crumbs.push({ label: "Cards", to: "/cards" });
  }
  if (pathname.startsWith("/reports")) {
    crumbs.push({ label: "Reports", to: "/reports" });
  }
  if (pathname === "/settings") {
    crumbs.push({ label: "Settings", to: "/settings" });
  }
  if (pathname === "/profile") {
    crumbs.push({ label: "Profile", to: "/profile" });
  }
  if (pathname === "/accounts/new") {
    crumbs.push({ label: "Open account", to: "/accounts/new" });
  } else if (pathname.includes("/beneficiaries")) {
    crumbs.push({ label: "Beneficiaries", to: pathname });
  } else if (pathname.startsWith("/accounts/")) {
    crumbs.push({ label: "Account detail", to: pathname });
  }
  return crumbs;
}

function initials(name: string | undefined): string {
  return (name ?? "VB")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function accountNotificationCopy(request: AccountApprovalRequest) {
  const accountLabel = ACCOUNT_TYPE_LABELS[request.accountType];
  if (request.action === "open" && request.status === "approved") {
    return {
      title: "Account approved",
      helper: `Your ${accountLabel.toLowerCase()} is approved and ready to use.`,
      tone: "success" as const,
    };
  }
  if (request.action === "open" && request.status === "rejected") {
    return {
      title: "Account request rejected",
      helper: `Your ${accountLabel.toLowerCase()} request was rejected by admin.`,
      tone: "danger" as const,
    };
  }
  if (request.action === "delete" && request.status === "approved") {
    return {
      title: "Account deletion approved",
      helper: `${request.accountNumber ? groupAccountNumber(request.accountNumber) : accountLabel} was removed after admin approval.`,
      tone: "warning" as const,
    };
  }
  return {
    title: "Account deletion rejected",
    helper: `${request.accountNumber ? groupAccountNumber(request.accountNumber) : accountLabel} remains available.`,
    tone: "danger" as const,
  };
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [query, setQuery] = useState("");
  const breadcrumbs = breadcrumbForPath(location.pathname);
  const kycSubmission = useKycSubmission(auth.user?.id);
  const accountApprovalRequests = useAccountApprovalRequests(auth.user?.id);
  const accountNotifications = accountApprovalRequests
    .filter((request) => request.status !== "pending")
    .sort(
      (a, b) =>
        new Date(b.reviewedAt ?? b.requestedAt).getTime() -
        new Date(a.reviewedAt ?? a.requestedAt).getTime(),
    );
  const kycNotifications = [...(kycSubmission?.notifications ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const unreadNotifications =
    kycNotifications.filter((item) => !item.read).length +
    accountNotifications.filter((item) => !item.customerReadAt).length;
  const accountNotificationItems = accountNotifications.map((item) => {
    const copy = accountNotificationCopy(item);
    return {
      id: item.id,
      icon:
        copy.tone === "success"
          ? CheckCircle2
          : copy.tone === "danger"
            ? XCircle
            : ShieldAlert,
      title: copy.title,
      helper: copy.helper,
      to: "/accounts",
      unread: !item.customerReadAt,
      tone: copy.tone,
      createdAt: item.reviewedAt ?? item.requestedAt,
    };
  });
  const kycNotificationItems = kycNotifications.map((item) => ({
        id: item.id,
        icon:
          item.tone === "success"
            ? CheckCircle2
            : item.tone === "danger"
              ? XCircle
              : item.title.toLowerCase().includes("document")
                ? FileText
                : ShieldAlert,
        title: item.title,
        helper: item.message,
        to: "/ekyc",
        unread: !item.read,
        tone: item.tone,
        createdAt: item.createdAt,
      }));
  const realNotificationItems = [
    ...accountNotificationItems,
    ...kycNotificationItems,
  ].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const notificationItems = realNotificationItems.length
    ? realNotificationItems
    : [
        {
          id: "signed-in",
          icon: CheckCircle2,
          title: "Signed in successfully",
          helper: "Your session is active.",
          to: "/dashboard",
          unread: false,
          tone: "success" as const,
          createdAt: "",
        },
        {
          id: "verify-identity",
          icon: ShieldAlert,
          title: "Verify your identity",
          helper: "Complete eKYC to unlock all features.",
          to: "/ekyc",
          unread: false,
          tone: "info" as const,
          createdAt: "",
        },
        {
          id: "security-settings",
          icon: Bell,
          title: "Review security settings",
          helper: "Check alerts and trusted devices.",
          to: "/profile",
          unread: false,
          tone: "info" as const,
          createdAt: "",
        },
      ];

  function markAllNotificationsRead() {
    markKycNotificationsRead(auth.user?.id);
    markAccountApprovalNotificationsRead(auth.user?.id);
  }

  async function signOut() {
    await auth.logoutMutation.mutateAsync();
    navigate("/auth/login", { replace: true });
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      toast("Type what you want to find first.");
      return;
    }

    const route =
      normalized.includes("account") || normalized.includes("balance")
        ? "/accounts"
        : normalized.includes("transaction") || normalized.includes("history")
          ? "/transactions"
          : normalized.includes("payment") || normalized.includes("transfer")
            ? "/payments"
            : normalized.includes("kyc") || normalized.includes("identity")
              ? "/ekyc"
              : normalized.includes("card")
                ? "/cards"
                : normalized.includes("report") || normalized.includes("statement")
                  ? "/reports"
                  : normalized.includes("profile") || normalized.includes("setting")
                    ? "/profile"
                    : "";

    if (!route) {
      toast.error("No matching dashboard section found.");
      return;
    }
    navigate(route);
    setQuery("");
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          aria-label="Open navigation menu"
          className="lg:hidden"
          onClick={onMenuClick}
          size="icon"
          variant="ghost"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-secondary">
            {titleForPath(location.pathname)}
          </h1>
          <nav className="hidden text-xs text-muted sm:block">
            {breadcrumbs.map((crumb, index) => (
              <span key={crumb.to}>
                {index > 0 ? " / " : null}
                {index === breadcrumbs.length - 1 ? (
                  <span className="text-secondary">{crumb.label}</span>
                ) : (
                  <Link className="hover:text-primary" to={crumb.to}>
                    {crumb.label}
                  </Link>
                )}
              </span>
            ))}
          </nav>
        </div>
      </div>

      <form
        className="hidden min-w-64 max-w-xl flex-1 lg:block"
        onSubmit={submitSearch}
      >
        <label className="relative block">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-11 pr-4 text-sm text-secondary shadow-sm placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search for transactions, accounts, and more..."
            type="search"
            value={query}
          />
        </label>
      </form>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative">
          <button
            aria-expanded={notificationsOpen}
            aria-label="Notifications"
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-slate-100 hover:text-secondary"
            onClick={() => {
              setNotificationsOpen((current) => !current);
              setMessagesOpen(false);
              setMenuOpen(false);
            }}
            type="button"
          >
            <Bell className="h-5 w-5" />
            {unreadNotifications ? (
              <span className="absolute -right-0.5 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white ring-2 ring-white">
                {unreadNotifications > 9 ? "9+" : unreadNotifications}
              </span>
            ) : null}
          </button>
          {notificationsOpen ? (
            <div className="absolute right-0 top-12 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <p className="text-sm font-bold text-secondary">Notifications</p>
                {realNotificationItems.length ? (
                  <button
                    className="text-xs font-semibold text-primary"
                    onClick={markAllNotificationsRead}
                    type="button"
                  >
                    Mark read
                  </button>
                ) : null}
              </div>
              {notificationItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    className="flex w-full gap-3 rounded-lg px-3 py-3 text-left hover:bg-slate-50"
                    key={item.id}
                    onClick={() => {
                      if (realNotificationItems.length) {
                        markAllNotificationsRead();
                      }
                      navigate(item.to);
                      setNotificationsOpen(false);
                    }}
                    type="button"
                  >
                    <Icon
                      className={
                        item.tone === "success"
                          ? "mt-0.5 h-5 w-5 text-emerald-600"
                          : item.tone === "danger"
                            ? "mt-0.5 h-5 w-5 text-red-600"
                            : "mt-0.5 h-5 w-5 text-primary"
                      }
                    />
                    <span>
                      <span className="flex items-center gap-2 text-sm font-semibold text-secondary">
                        {item.title}
                        {item.unread ? (
                          <span className="h-2 w-2 rounded-full bg-primary" />
                        ) : null}
                      </span>
                      <span className="text-xs text-muted">{item.helper}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className="relative hidden sm:block">
          <button
            aria-expanded={messagesOpen}
            aria-label="Messages"
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-slate-100 hover:text-secondary"
            onClick={() => {
              setMessagesOpen((current) => !current);
              setNotificationsOpen(false);
              setMenuOpen(false);
            }}
            type="button"
          >
            <Mail className="h-5 w-5" />
          </button>
          {messagesOpen ? (
            <div className="absolute right-0 top-12 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
              <p className="font-bold text-secondary">Secure inbox</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                You have no new bank messages. New account, card, and payment
                updates will appear here.
              </p>
              <button
                className="mt-3 text-sm font-semibold text-primary"
                onClick={() => {
                  toast.success("Inbox marked as read.");
                  setMessagesOpen(false);
                }}
                type="button"
              >
                Mark all as read
              </button>
            </div>
          ) : null}
        </div>
        <div className="hidden h-8 w-px bg-slate-200 sm:block" />
        <div className="relative">
          <button
            className="flex items-center gap-2 rounded-full p-1.5 hover:bg-slate-100"
            onClick={() => {
              setMenuOpen((current) => !current);
              setMessagesOpen(false);
              setNotificationsOpen(false);
            }}
            type="button"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              {initials(auth.user?.fullName)}
            </span>
            <span className="hidden max-w-40 truncate text-sm font-medium text-secondary md:block">
              {auth.user?.fullName ?? "VaultBank user"}
            </span>
            <ChevronDown className="hidden h-4 w-4 text-muted md:block" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-12 w-52 rounded-xl border border-slate-100 bg-white p-2 shadow-lg">
              <button
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-secondary hover:bg-slate-50"
                onClick={() => {
                  navigate("/profile");
                  setMenuOpen(false);
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
      </div>
    </header>
  );
}
