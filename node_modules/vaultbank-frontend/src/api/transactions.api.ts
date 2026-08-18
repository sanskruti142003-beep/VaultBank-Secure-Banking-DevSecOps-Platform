import { axiosInstance, unwrapRequest } from "@/api/axios";
import type {
  InitiateDepositDto,
  InitiateTransferDto,
  InitiateWithdrawalDto,
  PaginatedResult,
  Transaction,
  TransactionFilters,
} from "@/types/transactions.types";
import type { ApiError } from "@/types/auth.types";

type BackendTransaction = Partial<Transaction> & {
  from_account_id?: string | null;
  to_account_id?: string | null;
  initiated_at?: string;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

type BackendPaginated<T> = {
  data?: T[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  total_pages?: number;
};

function normalizeTransaction(transaction: BackendTransaction): Transaction {
  return {
    id: transaction.id ?? "",
    reference: transaction.reference ?? "",
    fromAccountId: transaction.fromAccountId ?? transaction.from_account_id ?? null,
    toAccountId: transaction.toAccountId ?? transaction.to_account_id ?? null,
    amount: transaction.amount ?? "0",
    currency: transaction.currency ?? "USD",
    type: transaction.type as Transaction["type"],
    status: transaction.status as Transaction["status"],
    description: transaction.description ?? null,
    metadata: transaction.metadata ?? null,
    initiatedAt: transaction.initiatedAt ?? transaction.initiated_at ?? "",
    completedAt: transaction.completedAt ?? transaction.completed_at ?? null,
    createdAt: transaction.createdAt ?? transaction.created_at ?? "",
    updatedAt: transaction.updatedAt ?? transaction.updated_at ?? "",
  };
}

function normalizePage<T>(
  page: BackendPaginated<T>,
  mapper: (item: T) => Transaction,
): PaginatedResult<Transaction> {
  return {
    data: (page.data ?? []).map(mapper),
    total: page.total ?? 0,
    page: page.page ?? 1,
    limit: page.limit ?? 20,
    totalPages: page.totalPages ?? page.total_pages ?? 1,
  };
}

function cleanFilters(filters: TransactionFilters) {
  return {
    accountId: filters.accountId || undefined,
    fromDate: filters.fromDate || undefined,
    toDate: filters.toDate || undefined,
    status: filters.status && filters.status !== "all" ? filters.status : undefined,
    type: filters.type && filters.type !== "all" ? filters.type : undefined,
    page: filters.page ?? 1,
    limit: filters.limit ?? 20,
  };
}

function emptyPage(filters: TransactionFilters): PaginatedResult<Transaction> {
  return {
    data: [],
    total: 0,
    page: filters.page ?? 1,
    limit: filters.limit ?? 20,
    totalPages: 1,
  };
}

export const transactionsApi = {
  async getHistory(
    filters: TransactionFilters,
  ): Promise<PaginatedResult<Transaction>> {
    try {
      const response = await unwrapRequest(
        axiosInstance.get<BackendPaginated<BackendTransaction>>("/transactions", {
          params: cleanFilters(filters),
        }),
      );
      return normalizePage(response, normalizeTransaction);
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.status === 404 || apiError.status === 503) {
        return emptyPage(filters);
      }
      throw error;
    }
  },

  async getAdminHistory(
    filters: Partial<TransactionFilters> = {},
  ): Promise<PaginatedResult<Transaction>> {
    const response = await unwrapRequest(
      axiosInstance.get<BackendPaginated<BackendTransaction>>(
        "/transactions/admin/all",
        {
          params: cleanFilters({
            accountId: filters.accountId ?? "",
            fromDate: filters.fromDate,
            toDate: filters.toDate,
            status: filters.status,
            type: filters.type,
            page: filters.page ?? 1,
            limit: filters.limit ?? 100,
          }),
        },
      ),
    );
    return normalizePage(response, normalizeTransaction);
  },

  async deposit(data: InitiateDepositDto): Promise<Transaction> {
    const response = await unwrapRequest(
      axiosInstance.post<BackendTransaction>("/transactions/deposit", data),
    );
    return normalizeTransaction(response);
  },

  async withdrawal(data: InitiateWithdrawalDto): Promise<Transaction> {
    const response = await unwrapRequest(
      axiosInstance.post<BackendTransaction>("/transactions/withdrawal", data),
    );
    return normalizeTransaction(response);
  },

  async transfer(data: InitiateTransferDto): Promise<Transaction> {
    const response = await unwrapRequest(
      axiosInstance.post<BackendTransaction>("/transactions/transfer", data),
    );
    return normalizeTransaction(response);
  },

  async reverse(transactionId: string, reason: string): Promise<Transaction> {
    const response = await unwrapRequest(
      axiosInstance.post<BackendTransaction>(
        `/transactions/${transactionId}/reverse`,
        { reason },
      ),
    );
    return normalizeTransaction(response);
  },
};
