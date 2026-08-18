import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { ROUTES } from "@/constants/auth.constants";
import { useAuthStore } from "@/store/auth.store";

interface ProtectedRouteProps {
  roles?: string[];
  redirectTo?: string;
  disallowedRoles?: string[];
  disallowedRedirectTo?: string;
}

export function ProtectedRoute({
  roles,
  redirectTo = ROUTES.dashboard,
  disallowedRoles,
  disallowedRedirectTo = ROUTES.login,
}: ProtectedRouteProps) {
  const location = useLocation();
  const { isAuthenticated, hasHydrated, accessToken, refreshToken, isLoading, user } =
    useAuthStore();

  if (
    !hasHydrated ||
    isLoading ||
    (!isAuthenticated && refreshToken) ||
    (refreshToken && !accessToken)
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-primary">
        <Loader2 className="h-8 w-8 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} state={{ from: location }} replace />;
  }

  if (
    roles?.length &&
    !roles.some((role) => user?.roles.includes(role))
  ) {
    return <Navigate to={redirectTo} replace />;
  }

  if (
    disallowedRoles?.length &&
    disallowedRoles.some((role) => user?.roles.includes(role))
  ) {
    return <Navigate to={disallowedRedirectTo} replace />;
  }

  return <Outlet />;
}
