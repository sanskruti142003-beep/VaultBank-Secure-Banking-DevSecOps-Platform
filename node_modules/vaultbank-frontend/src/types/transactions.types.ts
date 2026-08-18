export enum TransactionType {
  TRANSFER = "transfer",
  DEPOSIT = "deposit",
  WITHDRAWAL = "withdrawal",
}

export enum TransactionStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  REVERSED = "reversed",
}

export interface Transaction {
  id: string;
  reference: string;
  fromAccountId: string | null;
  toAccountId: string | null;
  amount: string;
  currency: string;
  type: TransactionType;
  status: TransactionStatus;
  description: string | null;
  metadata: Record<string, unknown> | null;
  initiatedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TransactionFilters {
  accountId: string;
  fromDate?: string;
  toDate?: string;
  status?: TransactionStatus | "all";
  type?: TransactionType | "all";
  page?: number;
  limit?: number;
}

export interface InitiateDepositDto {
  toAccountId: string;
  amount: string;
  currency: string;
}

export interface InitiateWithdrawalDto {
  fromAccountId: string;
  amount: string;
  currency: string;
}

export interface InitiateTransferDto {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  currency: string;
  description?: string;
}
