import {
  ArrowLeftRight,
  CreditCard,
  Home,
  MoreHorizontal,
  Send,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const navItems = [
  {
    to: "/dashboard",
    label: "Home",
    icon: Home,
    isActive: (pathname: string) => pathname === "/dashboard",
  },
  {
    to: "/accounts",
    label: "Accounts",
    icon: CreditCard,
    isActive: (pathname: string) => pathname.startsWith("/accounts"),
  },
  {
    to: "/transactions",
    label: "Transactions",
    icon: ArrowLeftRight,
    isActive: (pathname: string) => pathname.startsWith("/transactions"),
  },
  {
    to: "/payments",
    label: "Payments",
    icon: Send,
    isActive: (pathname: string) => pathname.startsWith("/payments"),
  },
  {
    to: "/settings",
    label: "More",
    icon: MoreHorizontal,
    isActive: (pathname: string) =>
      pathname.startsWith("/settings") ||
      pathname.startsWith("/reports") ||
      pathname.startsWith("/cards") ||
      pathname.startsWith("/ekyc") ||
      pathname.startsWith("/profile"),
  },
];

export function MobileNav() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Primary mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden"
    >
      <div className="grid grid-cols-5 gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.isActive(pathname);

          return (
            <NavLink
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold text-slate-500 transition",
                active && "bg-primary/10 text-primary",
              )}
              key={item.to}
              to={item.to}
            >
              <Icon className="h-5 w-5" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
