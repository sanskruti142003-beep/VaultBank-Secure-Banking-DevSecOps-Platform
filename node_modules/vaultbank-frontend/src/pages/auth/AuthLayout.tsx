import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Navigate, useLocation, useOutlet } from "react-router-dom";
import { Logo } from "@/components/common/Logo";
import { AUTH_COPY, APP_NAME, ROUTES } from "@/constants/auth.constants";
import { useAuthStore } from "@/store/auth.store";
import { cn } from "@/lib/utils";

const focusedRoutes = new Set<string>([
  ROUTES.verifyEmail,
  ROUTES.forgotPassword,
  ROUTES.resetPassword,
]);

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-primary">
      <Loader2 className="h-8 w-8 animate-spin" aria-label="Loading" />
    </div>
  );
}

function AnimatedOutlet({ className }: { className?: string }) {
  const location = useLocation();
  const outlet = useOutlet();

  return (
    <AnimatePresence mode="wait">
      {outlet ? (
        <div key={location.pathname} className={cn("w-full", className)}>
          {outlet}
        </div>
      ) : null}
    </AnimatePresence>
  );
}

function AuthCard({ focused = false }: { focused?: boolean }) {
  return (
    <div
      className={cn(
        "w-full max-w-md rounded-2xl bg-white p-6 shadow-lg md:p-8",
        focused ? "border border-border" : "md:border md:border-border",
      )}
    >
      <AnimatedOutlet />
    </div>
  );
}

function LeftPanel() {
  const currentYear = new Date().getFullYear();

  return (
    <aside className="auth-pattern relative hidden min-h-screen overflow-hidden bg-gradient-to-br from-primary to-primary-dark px-10 py-12 text-white md:flex md:w-[40%] lg:px-14">
      <div className="absolute inset-0 bg-secondary/10" aria-hidden="true" />
      <div className="relative z-10 flex w-full flex-col">
        <Logo variant="light" />
        <div className="my-auto space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight">
              {AUTH_COPY.tagline}
            </h1>
            <p className="max-w-sm text-base leading-relaxed text-white/80">
              Bank-grade protection, clear account access, and resilient
              authentication for every sign-in.
            </p>
          </div>
          <ul className="space-y-4">
            {AUTH_COPY.features.map((feature, index) => (
              <motion.li
                key={feature}
                className="flex items-center gap-3 text-sm font-medium text-white/90"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.15, duration: 0.24 }}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                </span>
                {feature}
              </motion.li>
            ))}
          </ul>
        </div>
        <div className="space-y-3 text-sm text-white/75">
          <p>{AUTH_COPY.compliance}</p>
          <p>
            {currentYear} {APP_NAME}
          </p>
        </div>
      </div>
    </aside>
  );
}

export function AuthLayout() {
  const location = useLocation();
  const { hasHydrated, isAuthenticated, refreshToken, user } = useAuthStore();
  const isFocusedRoute = focusedRoutes.has(location.pathname);
  const isLoginRoute = location.pathname === ROUTES.login;
  const authenticatedTarget = user?.roles.includes("admin")
    ? ROUTES.adminDashboard
    : ROUTES.dashboard;

  if (!hasHydrated || (refreshToken && !user && !isAuthenticated)) {
    return <LoadingScreen />;
  }

  if (isAuthenticated) {
    return <Navigate to={authenticatedTarget} replace />;
  }

  if (isFocusedRoute) {
    return (
      <main className="flex min-h-screen items-center justify-center overflow-y-auto bg-gradient-to-br from-slate-50 to-blue-50/30 px-6 py-10">
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6">
          <div className="flex justify-center">
            <Logo />
          </div>
          <AuthCard focused />
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-white">
      <LeftPanel />
      <main className="flex min-h-screen flex-1 items-center justify-center overflow-y-auto bg-gradient-to-br from-slate-50 to-blue-50/30 px-6 py-10 md:bg-white md:p-12">
        <div className="w-full space-y-6">
          <div className="flex justify-center md:hidden">
            <Logo />
          </div>
          {isLoginRoute ? (
            <AnimatedOutlet className="mx-auto w-full" />
          ) : (
            <div className="mx-auto flex w-full justify-center">
              <AuthCard />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
