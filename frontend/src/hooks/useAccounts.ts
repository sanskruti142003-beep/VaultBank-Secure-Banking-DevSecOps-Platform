import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { accountsApi } from "@/api/accounts.api";
import { getAccountErrorMessage } from "@/constants/accounts.constants";
import {
  approvedDeleteAccountIds,
  findApprovedAccountById,
  getAccountApprovalRequests,
  useAccountApprovalRequests,
} from "@/lib/account-approval-store";
import { useAuthStore } from "@/store/auth.store";
import { AccountStatus } from "@/types/accounts.types";
import type {
  Account,
  CreateAccountDto,
  UpdateLimitsDto,
} from "@/types/accounts.types";
import type { ApiError } from "@/types/auth.types";

export const accountQueryKeys = {
  all: ["accounts"] as const,
  detail: (accountId: string) => ["accounts", accountId] as const,
};

export function useAccounts() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const accountRequests = useAccountApprovalRequests(user?.id);
  const query = useQuery({
    queryKey: accountQueryKeys.all,
    queryFn: accountsApi.getAll,
    enabled: Boolean(accessToken),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
  });

  const reviewedRequestKey = useMemo(
    () =>
      accountRequests
        .filter((request) => request.status !== "pending")
        .map(
          (request) =>
            `${request.id}:${request.status}:${request.accountId ?? ""}:${
              request.accountNumber ?? ""
            }:${request.reviewedAt ?? ""}`,
        )
        .join("|"),
    [accountRequests],
  );

  useEffect(() => {
    if (!accessToken || !reviewedRequestKey) {
      return;
    }
    void queryClient.invalidateQueries({ queryKey: accountQueryKeys.all });
  }, [accessToken, queryClient, reviewedRequestKey]);

  const accounts = useMemo(() => {
    const approvedDeleteIds = approvedDeleteAccountIds(accountRequests);
    const merged = query.data ?? [];
    const seen = new Set<string>();

    return merged.filter((account) => {
      if (seen.has(account.id)) {
        return false;
      }
      seen.add(account.id);
      return (
        account.status !== AccountStatus.CLOSED &&
        !approvedDeleteIds.has(account.id)
      );
    });
  }, [accountRequests, query.data]);

  return {
    ...query,
    accounts,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useAccount(accountId: string | undefined) {
  const user = useAuthStore((state) => state.user);
  const accountRequests = useAccountApprovalRequests(user?.id);
  const query = useQuery({
    queryKey: accountQueryKeys.detail(accountId ?? ""),
    queryFn: async () => {
      try {
        return await accountsApi.getById(accountId ?? "");
      } catch (error) {
        const localAccount = findApprovedAccountById(
          accountId,
          getAccountApprovalRequests(),
        );
        if (localAccount) {
          return localAccount;
        }
        throw error;
      }
    },
    enabled: Boolean(accountId),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    refetchIntervalInBackground: false,
  });

  return {
    ...query,
    account:
      query.data ??
      findApprovedAccountById(accountId, accountRequests),
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

interface UseOpenAccountOptions {
  navigateOnSuccess?: boolean;
}

export function useOpenAccount(options: UseOpenAccountOptions = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { navigateOnSuccess = true } = options;
  const mutation = useMutation({
    mutationFn: (data: CreateAccountDto) => accountsApi.create(data),
    onSuccess: (account) => {
      queryClient.setQueryData<Account[]>(accountQueryKeys.all, (current) =>
        current ? [...current, account] : [account],
      );
      queryClient.setQueryData(accountQueryKeys.detail(account.id), account);
      void queryClient.invalidateQueries({ queryKey: accountQueryKeys.all });
      if (navigateOnSuccess) {
        navigate(`/accounts/${account.id}`);
      }
    },
  });

  return {
    ...mutation,
    openAccount: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error as ApiError | null,
  };
}

export function useUpdateLimits(accountId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: UpdateLimitsDto) =>
      accountsApi.updateLimits(accountId, data),
    onSuccess: (limits) => {
      queryClient.setQueryData<Account>(
        accountQueryKeys.detail(accountId),
        (account) => (account ? { ...account, limits } : account),
      );
      void queryClient.invalidateQueries({
        queryKey: accountQueryKeys.detail(accountId),
      });
    },
    onError: (error: ApiError) => {
      toast.error(getAccountErrorMessage(error.code));
    },
  });

  return {
    ...mutation,
    updateLimits: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}

export function useAdminAccountActions(accountId: string) {
  const queryClient = useQueryClient();

  function onAccountChange(account: Account) {
    queryClient.setQueryData(accountQueryKeys.detail(accountId), account);
    void queryClient.invalidateQueries({ queryKey: accountQueryKeys.all });
  }

  const freezeMutation = useMutation({
    mutationFn: () => accountsApi.freeze(accountId),
    onSuccess: onAccountChange,
  });

  const unfreezeMutation = useMutation({
    mutationFn: () => accountsApi.unfreeze(accountId),
    onSuccess: onAccountChange,
  });

  const closeMutation = useMutation({
    mutationFn: () => accountsApi.close(accountId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountQueryKeys.all });
      void queryClient.invalidateQueries({
        queryKey: accountQueryKeys.detail(accountId),
      });
    },
  });

  return {
    freezeAccount: freezeMutation.mutateAsync,
    unfreezeAccount: unfreezeMutation.mutateAsync,
    closeAccount: closeMutation.mutateAsync,
    isFreezing: freezeMutation.isPending,
    isUnfreezing: unfreezeMutation.isPending,
    isClosing: closeMutation.isPending,
  };
}

export function useDeleteAccountWithOtp() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ accountId, otp }: { accountId: string; otp: string }) =>
      accountsApi.deleteWithOtp(accountId, otp),
    onSuccess: (_result, variables) => {
      queryClient.setQueryData<Account[]>(accountQueryKeys.all, (current) =>
        current?.filter((account) => account.id !== variables.accountId) ?? [],
      );
      queryClient.removeQueries({
        queryKey: accountQueryKeys.detail(variables.accountId),
      });
      void queryClient.invalidateQueries({ queryKey: accountQueryKeys.all });
    },
  });

  return {
    ...mutation,
    deleteAccount: mutation.mutateAsync,
    isDeleting: mutation.isPending,
  };
}
