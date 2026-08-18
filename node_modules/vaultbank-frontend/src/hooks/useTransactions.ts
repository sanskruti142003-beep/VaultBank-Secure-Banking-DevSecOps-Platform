import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { transactionsApi } from "@/api/transactions.api";
import { accountQueryKeys } from "@/hooks/useAccounts";
import { useAuthStore } from "@/store/auth.store";
import type {
  InitiateDepositDto,
  InitiateTransferDto,
  InitiateWithdrawalDto,
  TransactionFilters,
} from "@/types/transactions.types";
import type { ApiError } from "@/types/auth.types";

export const transactionQueryKeys = {
  history: (filters: TransactionFilters) => ["transactions", filters] as const,
};

export function useTransactions(
  filters: TransactionFilters | null,
  options: { enabled?: boolean } = {},
) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const enabled = Boolean(accessToken && filters?.accountId && options.enabled !== false);
  const query = useQuery({
    queryKey: filters
      ? transactionQueryKeys.history(filters)
      : ["transactions", "disabled"],
    queryFn: () => transactionsApi.getHistory(filters as TransactionFilters),
    enabled,
    staleTime: 30 * 1000,
    retry: false,
  });

  return {
    ...query,
    transactions: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    totalPages: query.data?.totalPages ?? 1,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useTransactionActions() {
  const queryClient = useQueryClient();

  function refreshAccounts(accountIds: Array<string | null | undefined> = []) {
    void queryClient.invalidateQueries({ queryKey: accountQueryKeys.all });
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    accountIds
      .filter((accountId): accountId is string => Boolean(accountId))
      .forEach((accountId) => {
        void queryClient.invalidateQueries({
          queryKey: accountQueryKeys.detail(accountId),
        });
      });
  }

  const depositMutation = useMutation({
    mutationFn: (data: InitiateDepositDto) => transactionsApi.deposit(data),
    onSuccess: (_transaction, variables) => {
      refreshAccounts([variables.toAccountId]);
      toast.success("Deposit completed");
    },
    onError: (error: ApiError) => toast.error(error.message),
  });

  const withdrawalMutation = useMutation({
    mutationFn: (data: InitiateWithdrawalDto) => transactionsApi.withdrawal(data),
    onSuccess: (_transaction, variables) => {
      refreshAccounts([variables.fromAccountId]);
      toast.success("Withdrawal completed");
    },
    onError: (error: ApiError) => toast.error(error.message),
  });

  const transferMutation = useMutation({
    mutationFn: (data: InitiateTransferDto) => transactionsApi.transfer(data),
    onSuccess: (_transaction, variables) => {
      refreshAccounts([variables.fromAccountId, variables.toAccountId]);
      toast.success("Transfer completed");
    },
    onError: (error: ApiError) => toast.error(error.message),
  });

  return {
    deposit: depositMutation.mutateAsync,
    withdraw: withdrawalMutation.mutateAsync,
    transfer: transferMutation.mutateAsync,
    isDepositing: depositMutation.isPending,
    isWithdrawing: withdrawalMutation.isPending,
    isTransferring: transferMutation.isPending,
  };
}
