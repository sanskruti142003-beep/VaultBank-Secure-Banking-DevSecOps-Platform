import { type ReactNode, useEffect, useRef } from "react";
import { createBrowserRouter, Navigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { ProtectedRoute } from "@/components/common/ProtectedRoute";
import { ACCOUNT_UUID_PATTERN } from "@/constants/accounts.constants";
import { ROUTES } from "@/constants/auth.constants";
import { useAccounts } from "@/hooks/useAccounts";
import { AccountDetailPage } from "@/pages/accounts/AccountDetailPage";
import { AccountsPage } from "@/pages/accounts/AccountsPage";
import { BeneficiariesPage } from "@/pages/accounts/BeneficiariesPage";
import { OpenAccountPage } from "@/pages/accounts/OpenAccountPage";
import { AdminLayout } from "@/pages/admin/AdminLayout";
import {
  AdminAccountsPage,
  AdminAuditLogsPage,
  AdminBeneficiariesPage,
  AdminCardsPage,
  AdminCustomersPage,
  AdminFraudAlertsPage,
  AdminKycPage,
  AdminOverviewPage,
  AdminPaymentsReviewPage,
  AdminReportsPage,
  AdminStaffRolesPage,
  AdminSupportRequestsPage,
  AdminSystemSettingsPage,
  AdminTransactionsPage,
} from "@/pages/admin/AdminPortalPages";
import { AuthLayout } from "@/pages/auth/AuthLayout";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage";
import { LoginPage } from "@/pages/auth/LoginPage";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { ResetPasswordPage } from "@/pages/auth/ResetPasswordPage";
import { VerifyEmailPage } from "@/pages/auth/VerifyEmailPage";
import { CardsPage } from "@/pages/cards/CardsPage";
import { DashboardLayout } from "@/pages/dashboard/DashboardLayout";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { KycPage } from "@/pages/kyc/KycPage";
import { PaymentsPage } from "@/pages/payments/PaymentsPage";
import { ProfilePage } from "@/pages/profile/ProfilePage";
import { ReportsPage } from "@/pages/reports/ReportsPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import { TransactionsPage } from "@/pages/transactions/TransactionsPage";

function RouteLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-primary">
      <Loader2 className="h-8 w-8 animate-spin" aria-label="Loading" />
    </div>
  );
}

function MaxAccountsGuard({ children }: { children: ReactNode }) {
  const { accounts, isLoading } = useAccounts();
  const warnedRef = useRef(false);

  useEffect(() => {
    if (!isLoading && accounts.length >= 5 && !warnedRef.current) {
      warnedRef.current = true;
      toast.error("Maximum number of accounts reached");
    }
  }, [accounts.length, isLoading]);

  if (isLoading) {
    return <RouteLoader />;
  }

  if (accounts.length >= 5) {
    return <Navigate replace to="/accounts" />;
  }

  return children;
}

function ValidAccountRoute({ children }: { children: ReactNode }) {
  const { id } = useParams();

  if (!id || !ACCOUNT_UUID_PATTERN.test(id)) {
    return <Navigate replace to="/accounts" />;
  }

  return children;
}

export const router = createBrowserRouter([
  {
    path: ROUTES.root,
    element: <Navigate to={ROUTES.login} replace />,
  },
  {
    path: ROUTES.auth,
    element: <AuthLayout />,
    children: [
      {
        index: true,
        element: <Navigate to={ROUTES.login} replace />,
      },
      {
        path: "login",
        element: <LoginPage />,
      },
      {
        path: "register",
        element: <RegisterPage />,
      },
      {
        path: "verify-email",
        element: <VerifyEmailPage />,
      },
      {
        path: "forgot-password",
        element: <ForgotPasswordPage />,
      },
      {
        path: "reset-password",
        element: <ResetPasswordPage />,
      },
    ],
  },
  {
    element: <ProtectedRoute roles={["admin"]} redirectTo={ROUTES.dashboard} />,
    children: [
      {
        path: "admin",
        element: <AdminLayout />,
        children: [
          {
            index: true,
            element: <Navigate to={ROUTES.adminDashboard} replace />,
          },
          {
            path: "dashboard",
            element: <AdminOverviewPage />,
          },
          {
            path: "customers",
            element: <AdminCustomersPage />,
          },
          {
            path: "accounts",
            element: <AdminAccountsPage />,
          },
          {
            path: "transactions",
            element: <AdminTransactionsPage />,
          },
          {
            path: "payments-review",
            element: <AdminPaymentsReviewPage />,
          },
          {
            path: "ekyc",
            element: <AdminKycPage />,
          },
          {
            path: "cards",
            element: <AdminCardsPage />,
          },
          {
            path: "beneficiaries",
            element: <AdminBeneficiariesPage />,
          },
          {
            path: "fraud-alerts",
            element: <AdminFraudAlertsPage />,
          },
          {
            path: "reports",
            element: <AdminReportsPage />,
          },
          {
            path: "support-requests",
            element: <AdminSupportRequestsPage />,
          },
          {
            path: "staff-roles",
            element: <AdminStaffRolesPage />,
          },
          {
            path: "audit-logs",
            element: <AdminAuditLogsPage />,
          },
          {
            path: "system-settings",
            element: <AdminSystemSettingsPage />,
          },
        ],
      },
    ],
  },
  {
    element: (
      <ProtectedRoute
        disallowedRoles={["admin"]}
        disallowedRedirectTo={ROUTES.adminDashboard}
      />
    ),
    children: [
      {
        element: <DashboardLayout />,
        children: [
          {
            path: "dashboard",
            element: <DashboardPage />,
          },
          {
            path: "accounts",
            element: <AccountsPage />,
          },
          {
            path: "accounts/new",
            element: (
              <MaxAccountsGuard>
                <OpenAccountPage />
              </MaxAccountsGuard>
            ),
          },
          {
            path: "accounts/:id",
            element: (
              <ValidAccountRoute>
                <AccountDetailPage />
              </ValidAccountRoute>
            ),
          },
          {
            path: "accounts/:id/beneficiaries",
            element: (
              <ValidAccountRoute>
                <BeneficiariesPage />
              </ValidAccountRoute>
            ),
          },
          {
            path: "transactions",
            element: <TransactionsPage />,
          },
          {
            path: "transactions/new",
            element: <Navigate to="/payments" replace />,
          },
          {
            path: "payments",
            element: <PaymentsPage />,
          },
          {
            path: "ekyc",
            element: <KycPage />,
          },
          {
            path: "cards",
            element: <CardsPage />,
          },
          {
            path: "reports",
            element: <ReportsPage />,
          },
          {
            path: "reports/:reportTab",
            element: <ReportsPage />,
          },
          {
            path: "settings",
            element: <SettingsPage />,
          },
          {
            path: "profile",
            element: <ProfilePage />,
          },
        ],
      },
    ],
  },
  {
    path: "*",
    element: <Navigate to={ROUTES.login} replace />,
  },
]);
