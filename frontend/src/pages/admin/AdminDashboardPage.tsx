import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Lock,
  ShieldCheck,
  UserCheck,
  UsersRound,
  Wallet,
} from "lucide-react";
import toast from "react-hot-toast";
import { accountsApi } from "@/api/accounts.api";
import { authApi } from "@/api/auth.api";
import {
  DashboardCard,
  MetricCard,
  StatusPill,
} from "@/components/dashboard/DashboardCard";
import { Button } from "@/components/ui/button";
import {
  ACCOUNT_TYPE_LABELS,
  formatCurrency,
  groupAccountNumber,
  parseMoney,
} from "@/constants/accounts.constants";
import { accountStatusTone, formatDate, kycTone, titleCase } from "@/lib/dashboard-format";
import { AccountStatus, KycStatus, type Account } from "@/types/accounts.types";
import type { RoleName, User } from "@/types/auth.types";

const adminQueryKeys = {
  users: ["admin", "users"] as const,
  accounts: ["admin", "accounts"] as const,
};

function hasRole(user: User, role: RoleName): boolean {
  return user.roles.includes(role);
}

function userInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function AdminDashboardPage() {
  const queryClient = useQueryClient();
  const [userSearch, setUserSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState<RoleName>("agent");

  const usersQuery = useQuery({
    queryKey: adminQueryKeys.users,
    queryFn: authApi.getAdminUsers,
  });

  const accountsQuery = useQuery({
    queryKey: adminQueryKeys.accounts,
    queryFn: accountsApi.getAdminAll,
  });

  const accounts = accountsQuery.data ?? [];
  const users = usersQuery.data ?? [];

  const kycMutation = useMutation({
    mutationFn: ({
      accountId,
      status,
    }: {
      accountId: string;
      status: Account["kycStatus"];
    }) => accountsApi.updateKyc(accountId, status),
    onSuccess: () => {
      toast.success("KYC status updated");
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.accounts });
    },
  });

  const freezeMutation = useMutation({
    mutationFn: ({
      accountId,
      frozen,
    }: {
      accountId: string;
      frozen: boolean;
    }) =>
      frozen
        ? accountsApi.unfreeze(accountId)
        : accountsApi.freeze(accountId),
    onSuccess: () => {
      toast.success("Account status updated");
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.accounts });
    },
  });

  const roleMutation = useMutation({
    mutationFn: () => authApi.assignRole(selectedUserId, selectedRole),
    onSuccess: () => {
      toast.success("Role assigned");
      setSelectedUserId("");
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.users });
    },
  });

  const totalBalance = useMemo(
    () => accounts.reduce((sum, account) => sum + parseMoney(account.balance), 0),
    [accounts],
  );
  const pendingKyc = accounts.filter(
    (account) => account.kycStatus === KycStatus.PENDING,
  );
  const frozenAccounts = accounts.filter(
    (account) => account.status === AccountStatus.FROZEN,
  );

  const filteredUsers = users.filter((user) => {
    const query = userSearch.trim().toLowerCase();
    return (
      !query ||
      user.fullName.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      user.roles.some((role) => role.includes(query))
    );
  });

  const filteredAccounts = accounts.filter((account) => {
    const query = accountSearch.trim().toLowerCase();
    return (
      !query ||
      account.accountNumber.includes(query.replace(/\s+/g, "")) ||
      account.userId.toLowerCase().includes(query) ||
      account.type.toLowerCase().includes(query) ||
      account.kycStatus.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-secondary">Admin Overview</h1>
          <p className="mt-2 text-sm text-muted">
            Monitor customers, accounts, KYC reviews, and operational actions.
          </p>
        </div>
        <Button
          onClick={() => {
            void usersQuery.refetch();
            void accountsQuery.refetch();
          }}
          variant="outline"
        >
          Refresh data
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          helper="Registered profiles"
          icon={UsersRound}
          title="Total Users"
          tone="blue"
          value={usersQuery.isLoading ? "..." : users.length}
        />
        <MetricCard
          helper="Across all customers"
          icon={CreditCard}
          title="Total Accounts"
          tone="green"
          value={accountsQuery.isLoading ? "..." : accounts.length}
        />
        <MetricCard
          helper="Need admin review"
          icon={AlertTriangle}
          title="Pending KYC"
          tone="amber"
          value={pendingKyc.length}
        />
        <MetricCard
          helper={`${frozenAccounts.length} frozen accounts`}
          icon={Wallet}
          title="Managed Balance"
          tone="violet"
          value={formatCurrency(totalBalance, accounts[0]?.currency ?? "USD")}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <DashboardCard id="users">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-secondary">Users</h2>
                <p className="mt-1 text-sm text-muted">
                  Review customer, agent, and admin access.
                </p>
              </div>
              <input
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder="Search users..."
                value={userSearch}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-5 py-3">User</th>
                    <th className="px-5 py-3">Roles</th>
                    <th className="px-5 py-3">Verification</th>
                    <th className="px-5 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                            {userInitials(user.fullName)}
                          </span>
                          <span>
                            <span className="block font-semibold text-secondary">
                              {user.fullName}
                            </span>
                            <span className="text-xs text-muted">
                              {user.email}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          {user.roles.map((role) => (
                            <StatusPill
                              key={role}
                              tone={role === "admin" ? "green" : "blue"}
                            >
                              {role}
                            </StatusPill>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <StatusPill tone={user.isVerified ? "green" : "amber"}>
                          {user.isVerified ? "Verified" : "Pending"}
                        </StatusPill>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-muted">
                        {formatDate(user.createdAt)}
                      </td>
                    </tr>
                  ))}
                  {!filteredUsers.length ? (
                    <tr>
                      <td className="px-5 py-6 text-center text-muted" colSpan={4}>
                        No users found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </DashboardCard>

          <DashboardCard id="accounts">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-secondary">Accounts</h2>
                <p className="mt-1 text-sm text-muted">
                  Approve KYC and manage account status.
                </p>
              </div>
              <input
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                onChange={(event) => setAccountSearch(event.target.value)}
                placeholder="Search accounts..."
                value={accountSearch}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Account</th>
                    <th className="px-5 py-3">Balance</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">KYC</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAccounts.map((account) => {
                    const frozen = account.status === AccountStatus.FROZEN;
                    return (
                      <tr key={account.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4">
                          <p className="font-semibold text-secondary">
                            {ACCOUNT_TYPE_LABELS[account.type]}
                          </p>
                          <p className="text-xs text-muted">
                            {groupAccountNumber(account.accountNumber)}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 font-semibold text-secondary">
                          {formatCurrency(account.balance, account.currency)}
                        </td>
                        <td className="px-5 py-4">
                          <StatusPill tone={accountStatusTone(account.status)}>
                            {titleCase(account.status)}
                          </StatusPill>
                        </td>
                        <td className="px-5 py-4">
                          <StatusPill tone={kycTone(account.kycStatus)}>
                            {titleCase(account.kycStatus)}
                          </StatusPill>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            {account.kycStatus !== KycStatus.APPROVED ? (
                              <Button
                                disabled={kycMutation.isPending}
                                onClick={() =>
                                  kycMutation.mutate({
                                    accountId: account.id,
                                    status: KycStatus.APPROVED,
                                  })
                                }
                                size="sm"
                              >
                                Approve
                              </Button>
                            ) : null}
                            {account.kycStatus !== KycStatus.REJECTED ? (
                              <Button
                                disabled={kycMutation.isPending}
                                onClick={() =>
                                  kycMutation.mutate({
                                    accountId: account.id,
                                    status: KycStatus.REJECTED,
                                  })
                                }
                                size="sm"
                                variant="outline"
                              >
                                Reject
                              </Button>
                            ) : null}
                            <Button
                              disabled={freezeMutation.isPending}
                              onClick={() =>
                                freezeMutation.mutate({
                                  accountId: account.id,
                                  frozen,
                                })
                              }
                              size="sm"
                              variant={frozen ? "outline" : "destructive"}
                            >
                              {frozen ? "Unfreeze" : "Freeze"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!filteredAccounts.length ? (
                    <tr>
                      <td className="px-5 py-6 text-center text-muted" colSpan={5}>
                        No accounts found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </DashboardCard>
        </div>

        <aside className="space-y-5">
          <DashboardCard className="p-5">
            <div className="flex items-center gap-3">
              <UserCheck className="h-5 w-5 text-primary" />
              <h2 className="font-bold text-secondary">Assign Role</h2>
            </div>
            <p className="mt-3 text-sm text-muted">
              Add a role to an existing user account.
            </p>
            <label className="mt-5 block">
              <span className="text-sm font-semibold text-secondary">User</span>
              <select
                className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                onChange={(event) => setSelectedUserId(event.target.value)}
                value={selectedUserId}
              >
                <option value="">Select user</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName} - {user.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block">
              <span className="text-sm font-semibold text-secondary">Role</span>
              <select
                className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                onChange={(event) =>
                  setSelectedRole(event.target.value as RoleName)
                }
                value={selectedRole}
              >
                <option value="agent">agent</option>
                <option value="admin">admin</option>
                <option value="customer">customer</option>
              </select>
            </label>
            <Button
              className="mt-5 w-full"
              disabled={!selectedUserId || roleMutation.isPending}
              onClick={() => roleMutation.mutate()}
            >
              {roleMutation.isPending ? "Assigning..." : "Assign role"}
            </Button>
          </DashboardCard>

          <DashboardCard id="security" className="p-5">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <h2 className="font-bold text-secondary">Security Review</h2>
            </div>
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
                <span className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span className="font-semibold text-secondary">
                    Verified admins
                  </span>
                </span>
                <span className="font-bold text-secondary">
                  {users.filter((user) => hasRole(user, "admin")).length}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
                <span className="flex items-center gap-3">
                  <Lock className="h-5 w-5 text-amber-600" />
                  <span className="font-semibold text-secondary">
                    Frozen accounts
                  </span>
                </span>
                <span className="font-bold text-secondary">
                  {frozenAccounts.length}
                </span>
              </div>
            </div>
          </DashboardCard>

          <DashboardCard id="reports" className="p-5">
            <h2 className="font-bold text-secondary">Admin Report</h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Current system view includes {users.length} users and{" "}
              {accounts.length} accounts.
            </p>
            <Button
              className="mt-5 w-full"
              onClick={() => {
                const rows = [
                  ["Metric", "Value"],
                  ["Users", users.length],
                  ["Accounts", accounts.length],
                  ["Pending KYC", pendingKyc.length],
                  ["Frozen Accounts", frozenAccounts.length],
                ];
                const csv = rows.map((row) => row.join(",")).join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = "vaultbank-admin-report.csv";
                link.click();
                URL.revokeObjectURL(url);
              }}
              variant="outline"
            >
              Download CSV
            </Button>
          </DashboardCard>
        </aside>
      </div>
    </div>
  );
}
