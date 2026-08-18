import { useEffect, useState } from "react";
import { LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { LoginForm } from "@/components/auth/LoginForm";
import { PageTransition } from "@/components/common/PageTransition";
import { AUTH_COPY, PAGE_TITLES, ROUTES } from "@/constants/auth.constants";
import { cn } from "@/lib/utils";

export function LoginPage() {
  const [selectedRole, setSelectedRole] = useState<"customer" | "admin">(
    "customer",
  );

  useEffect(() => {
    document.title = PAGE_TITLES.login;
  }, []);

  return (
    <PageTransition className="mx-auto w-full max-w-6xl space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-secondary">
          Sign In - VaultBank
        </h1>
        <p className="mt-2 text-sm text-muted">
          Choose the right sign-in profile for your work today.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg md:p-8">
        <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
          {[
            {
              role: "customer" as const,
              title: "Customer Login",
              helper: "Access your personal accounts",
              icon: UserRound,
              activeClass: "border-primary bg-primary text-white",
              idleClass: "border-slate-200 bg-white text-secondary hover:border-primary/40",
            },
            {
              role: "admin" as const,
              title: "Admin Login",
              helper: "Secure administrative access",
              icon: ShieldCheck,
              activeClass: "border-emerald-500 bg-emerald-600 text-white",
              idleClass:
                "border-emerald-200 bg-emerald-50/40 text-secondary hover:border-emerald-400",
            },
          ].map((item) => {
            const Icon = item.icon;
            const active = selectedRole === item.role;
            return (
              <button
                className={cn(
                  "flex min-h-20 items-center gap-4 rounded-xl border p-4 text-left transition",
                  active ? item.activeClass : item.idleClass,
                )}
                key={item.role}
                onClick={() => setSelectedRole(item.role)}
                type="button"
              >
                <span
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full",
                    active ? "bg-white/20 text-white" : "bg-white text-primary",
                    item.role === "admin" && !active && "text-emerald-600",
                  )}
                >
                  <Icon className="h-6 w-6" />
                </span>
                <span>
                  <span className="block font-bold">{item.title}</span>
                  <span
                    className={cn(
                      "mt-1 block text-sm",
                      active ? "text-white/85" : "text-muted",
                    )}
                  >
                    {item.helper}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <section
            className={cn(
              "rounded-2xl border p-5 transition",
              selectedRole === "customer"
                ? "border-primary/30 shadow-sm"
                : "border-slate-200",
            )}
          >
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserRound className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-xl font-bold text-secondary">
                  Customer Login
                </h2>
                <p className="text-sm text-muted">
                  Sign in to access your accounts
                </p>
              </div>
            </div>
            <LoginForm
              role="customer"
              submitLabel="Login as Customer"
              submittingLabel="Signing in..."
              redirectTo={ROUTES.dashboard}
              autoFocus={selectedRole === "customer"}
            />
            <p className="mt-5 text-center text-sm text-muted">
              {AUTH_COPY.login.noAccount}{" "}
              <Link
                className="font-medium text-primary transition hover:text-primary-dark"
                to={ROUTES.register}
              >
                {AUTH_COPY.login.createAccount}
              </Link>
            </p>
          </section>

          <section
            className={cn(
              "rounded-2xl border p-5 transition",
              selectedRole === "admin"
                ? "border-emerald-400 shadow-sm"
                : "border-slate-200",
            )}
          >
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <ShieldCheck className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-xl font-bold text-secondary">
                  Admin Login
                </h2>
                <p className="text-sm text-muted">
                  Sign in to access the admin panel
                </p>
              </div>
            </div>
            <LoginForm
              role="admin"
              submitLabel="Login as Admin"
              submittingLabel="Checking admin access..."
              redirectTo={ROUTES.adminDashboard}
              showSocialAuth={false}
              usernameLabel="Admin username"
              usernamePlaceholder="vault.admin"
              autoFocus={selectedRole === "admin"}
            />
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <div className="flex gap-3">
                <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
                <p>
                  Admin access is allowed only when the signed-in account has
                  the admin role.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <p className="flex items-center justify-center gap-2 text-center text-sm text-muted">
        <LockKeyhole className="h-4 w-4" />
        Use separate credentials for admin and customer access.
      </p>
    </PageTransition>
  );
}
