import { useEffect, useMemo, useState, type FormEvent } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  BarChart3,
  Bell,
  ChevronDown,
  ClipboardList,
  CreditCard,
  Headphones,
  Home,
  IdCard,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import toast from "react-hot-toast";
import { Logo } from "@/components/common/Logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const adminNavItems = [
  { to: "/admin/dashboard", label: "Admin Overview", icon: LayoutDashboard },
  { to: "/admin/customers", label: "Customers", icon: UsersRound },
  { to: "/admin/accounts", label: "Accounts", icon: Landmark },
  { to: "/admin/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/admin/payments-review", label: "Payments Review", icon: WalletCards },
  { to: "/admin/ekyc", label: "eKYC Verifications", icon: IdCard },
  { to: "/admin/cards", label: "Cards", icon: CreditCard },
  { to: "/admin/beneficiaries", label: "Beneficiaries", icon: UsersRound },
  { to: "/admin/fraud-alerts", label: "Fraud Alerts", icon: AlertTriangle },
  { to: "/admin/reports", label: "Reports", icon: BarChart3 },
  { to: "/admin/support-requests", label: "Support Requests", icon: Headphones },
  { to: "/admin/staff-roles", label: "Staff & Roles", icon: ShieldCheck },
  { to: "/admin/audit-logs", label: "Audit Logs", icon: ClipboardList },
  { to: "/admin/system-settings", label: "System Settings", icon: Settings },
];

const adminNotificationItems = [
  {
    title: "Pending support cases",
    helper: "Review customers with account holds.",
    icon: Bell,
    to: "/admin/support-requests",
  },
  {
    title: "Security settings",
    helper: "Check login alerts and session controls.",
    icon: ShieldCheck,
    to: "/admin/system-settings",
  },
  {
    title: "Fraud alerts",
    helper: "Monitor suspicious account activity.",
    icon: AlertTriangle,
    to: "/admin/fraud-alerts",
  },
];

function initials(name: string | undefined): string {
  return (name ?? "AU")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function pageTitle(pathname: string) {
  return (
    adminNavItems.find((item) => pathname === item.to)?.label ??
    adminNavItems.find((item) => pathname.startsWith(item.to))?.label ??
    "Admin Overview"
  );
}

function adminSearchRoute(query: string): string {
  const normalized = query.toLowerCase();
  if (normalized.includes("account") || normalized.includes("kyc")) {
    return "/admin/accounts";
  }
  if (normalized.includes("transaction") || normalized.includes("transfer")) {
    return "/admin/transactions";
  }
  if (normalized.includes("payment")) {
    return "/admin/payments-review";
  }
  if (normalized.includes("card")) {
    return "/admin/cards";
  }
  if (normalized.includes("beneficiar")) {
    return "/admin/beneficiaries";
  }
  if (normalized.includes("fraud") || normalized.includes("alert")) {
    return "/admin/fraud-alerts";
  }
  if (normalized.includes("report")) {
    return "/admin/reports";
  }
  if (normalized.includes("staff") || normalized.includes("role")) {
    return "/admin/staff-roles";
  }
  if (normalized.includes("audit")) {
    return "/admin/audit-logs";
  }
  if (normalized.includes("support")) {
    return "/admin/support-requests";
  }
  if (normalized.includes("setting") || normalized.includes("security")) {
    return "/admin/system-settings";
  }
  return `/admin/customers?search=${encodeURIComponent(query)}`;
}

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsReviewed, setNotificationsReviewed] = useState(false);
  const title = useMemo(() => pageTitle(location.pathname), [location.pathname]);
  const notificationCount = notificationsReviewed
    ? 0
    : adminNotificationItems.length;

  useEffect(() => {
    setNotificationsOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  async function signOut() {
    await auth.logoutMutation.mutateAsync();
    navigate("/auth/login", { replace: true });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      toast("Type a customer, account, or admin section to search.");
      return;
    }
    navigate(adminSearchRoute(query));
    setSearchQuery("");
    setNotificationsOpen(false);
    setProfileOpen(false);
  }

  const sidebar = (
    <aside
      className={cn(
        "flex h-full flex-col bg-[#062247] px-4 py-5 text-white shadow-2xl shadow-slate-950/20",
        collapsed ? "w-20" : "w-72",
      )}
    >
      <div className={cn("flex items-center", collapsed && "justify-center")}>
        {collapsed ? (
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white">
            <Shield className="h-6 w-6" />
          </span>
        ) : (
          <div className="[&_*]:text-white">
            <Logo />
          </div>
        )}
      </div>

      <nav className="mt-8 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {adminNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              className={({ isActive }) =>
                cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-white/85 transition hover:bg-white/10 hover:text-white",
                  isActive && "bg-primary text-white shadow-lg shadow-primary/30",
                  collapsed && "justify-center px-0",
                )
              }
              key={item.to}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? item.label : undefined}
              to={item.to}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {collapsed ? null : <span className="truncate">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-5 space-y-3">
        <Button
          className={cn(
            "w-full border border-white/10 bg-white/5 text-white hover:bg-white/10",
            collapsed && "px-0",
          )}
          onClick={() => setCollapsed((value) => !value)}
          variant="ghost"
        >
          <ArrowLeft className={cn("h-4 w-4 transition", collapsed && "rotate-180")} />
          {collapsed ? null : "Collapse"}
        </Button>
        <Button
          className={cn("w-full justify-start text-white hover:bg-white/10", collapsed && "justify-center px-0")}
          onClick={() => void signOut()}
          variant="ghost"
          title={collapsed ? "Sign out" : undefined}
        >
          <LogOut className="h-4 w-4" />
          {collapsed ? null : "Sign out"}
        </Button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">{sidebar}</div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-950/40 lg:hidden" onMouseDown={() => setMobileOpen(false)} role="presentation">
          <div className="h-full" onMouseDown={(event) => event.stopPropagation()}>{sidebar}</div>
        </div>
      ) : null}

      <div className={cn("transition-all duration-200", collapsed ? "lg:pl-20" : "lg:pl-72")}>
        <header className="sticky top-0 z-30 flex h-20 items-center gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-6">
          <Button className="lg:hidden" onClick={() => setMobileOpen(true)} size="icon" variant="ghost">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold text-secondary">{title}</h1>
            <p className="mt-1 flex items-center gap-2 text-xs text-muted">
              <Home className="h-3.5 w-3.5" />
              Home
              <span>/</span>
              {title}
            </p>
          </div>
          <form className="hidden w-full max-w-xl xl:block" onSubmit={submitSearch}>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-11 pr-14 text-sm text-secondary shadow-sm placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search customers, accounts, transactions..."
                type="search"
                value={searchQuery}
              />
              <button
                aria-label="Search admin portal"
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-primary hover:bg-primary/10"
                type="submit"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>
          </form>
          <div className="relative">
            <button
              aria-expanded={notificationsOpen}
              aria-label="Admin notifications"
              className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100"
              onClick={() => {
                setNotificationsOpen((current) => !current);
                setProfileOpen(false);
              }}
              type="button"
            >
              <Bell className="h-5 w-5" />
              {notificationCount > 0 ? (
                <span className="absolute right-1 top-1 rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">
                  {notificationCount}
                </span>
              ) : null}
            </button>
            {notificationsOpen ? (
              <div className="absolute right-0 top-12 z-40 w-80 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
                <div className="px-3 py-2">
                  <p className="text-sm font-bold text-secondary">Admin notifications</p>
                  <p className="text-xs text-muted">Operational items that need review.</p>
                </div>
                {adminNotificationItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      className="flex w-full gap-3 rounded-lg px-3 py-3 text-left hover:bg-slate-50"
                      key={item.title}
                      onClick={() => {
                        setNotificationsReviewed(true);
                        navigate(item.to);
                        setNotificationsOpen(false);
                      }}
                      type="button"
                    >
                      <Icon className="mt-0.5 h-5 w-5 text-primary" />
                      <span>
                        <span className="block text-sm font-semibold text-secondary">
                          {item.title}
                        </span>
                        <span className="text-xs text-muted">{item.helper}</span>
                      </span>
                    </button>
                  );
                })}
                <Button
                  className="mt-1 w-full justify-center"
                  onClick={() => {
                    setNotificationsReviewed(true);
                    toast.success("Notifications marked as reviewed.");
                    setNotificationsOpen(false);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  Mark all reviewed
                </Button>
              </div>
            ) : null}
          </div>
          <div className="hidden h-8 w-px bg-slate-200 md:block" />
          <div className="relative hidden md:block">
            <button
              aria-expanded={profileOpen}
              className="flex items-center gap-3 rounded-lg p-2 text-left hover:bg-slate-100"
              onClick={() => {
                setProfileOpen((current) => !current);
                setNotificationsOpen(false);
              }}
              type="button"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">
                {initials(auth.user?.fullName)}
              </span>
              <span>
                <span className="block text-sm font-bold text-secondary">
                  {auth.user?.fullName ?? "Admin User"}
                </span>
                <span className="block text-xs text-muted">Super Administrator</span>
              </span>
              <ChevronDown className="h-4 w-4 text-muted" />
            </button>
            {profileOpen ? (
              <div className="absolute right-0 top-14 z-40 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
                <button
                  className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-secondary hover:bg-slate-50"
                  onClick={() => {
                    navigate("/admin/dashboard");
                    setProfileOpen(false);
                  }}
                  type="button"
                >
                  Admin overview
                </button>
                <button
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-secondary hover:bg-slate-50"
                  onClick={() => {
                    navigate("/admin/staff-roles");
                    setProfileOpen(false);
                  }}
                  type="button"
                >
                  Staff & roles
                </button>
                <button
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-secondary hover:bg-slate-50"
                  onClick={() => {
                    navigate("/admin/system-settings");
                    setProfileOpen(false);
                  }}
                  type="button"
                >
                  Admin settings
                </button>
                <div className="my-1 h-px bg-slate-100" />
                <Button className="w-full justify-start" onClick={() => void signOut()} variant="ghost">
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </div>
            ) : null}
          </div>
        </header>
        <main className="min-h-[calc(100vh-5rem)] px-4 py-5 sm:px-6 lg:px-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
