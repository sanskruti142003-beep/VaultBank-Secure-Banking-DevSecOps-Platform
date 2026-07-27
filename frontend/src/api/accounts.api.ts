import { axiosInstance, unwrapRequest } from "@/api/axios";
import type {
  Account,
  AccountLimit,
  AddBeneficiaryDto,
  Beneficiary,
  CreateAccountDto,
  UpdateLimitsDto,
} from "@/types/accounts.types";

type BackendAccount = Partial<Account> & {
  user_id?: string;
  owner_name?: string;
  account_number?: string;
  kyc_status?: Account["kycStatus"];
  created_at?: string;
  updated_at?: string;
  limits?: BackendAccountLimit;
};

type BackendAccountLimit = Partial<AccountLimit> & {
  account_id?: string;
  daily_transfer_limit?: string;
  single_txn_limit?: string;
  updated_at?: string;
};

type BackendBeneficiary = Partial<Beneficiary> & {
  account_id?: string;
  bank_code?: string;
  beneficiary_account_number?: string;
  is_verified?: boolean;
  created_at?: string;
  account?: BackendAccount;
};

function normalizeLimit(limit: BackendAccountLimit): AccountLimit {
  return {
    id: limit.id ?? "",
    accountId: limit.accountId ?? limit.account_id ?? "",
    dailyTransferLimit:
      limit.dailyTransferLimit ?? limit.daily_transfer_limit ?? "0",
    singleTxnLimit: limit.singleTxnLimit ?? limit.single_txn_limit ?? "0",
    updatedAt: limit.updatedAt ?? limit.updated_at ?? "",
  };
}

function normalizeAccount(account: BackendAccount): Account {
  return {
    id: account.id ?? "",
    userId: account.userId ?? account.user_id ?? "",
    ownerName: account.ownerName ?? account.owner_name,
    accountNumber: account.accountNumber ?? account.account_number ?? "",
    type: account.type as Account["type"],
    currency: account.currency as Account["currency"],
    balance: account.balance ?? "0",
    status: account.status as Account["status"],
    kycStatus: (account.kycStatus ?? account.kyc_status) as Account["kycStatus"],
    createdAt: account.createdAt ?? account.created_at ?? "",
    updatedAt: account.updatedAt ?? account.updated_at ?? "",
    limits: account.limits ? normalizeLimit(account.limits) : undefined,
  };
}

function normalizeBeneficiary(beneficiary: BackendBeneficiary): Beneficiary {
  return {
    id: beneficiary.id ?? "",
    accountId: beneficiary.accountId ?? beneficiary.account_id ?? "",
    name: beneficiary.name ?? "",
    bankCode: beneficiary.bankCode ?? beneficiary.bank_code ?? "",
    beneficiaryAccountNumber:
      beneficiary.beneficiaryAccountNumber ??
      beneficiary.beneficiary_account_number ??
      "",
    isVerified: beneficiary.isVerified ?? beneficiary.is_verified ?? false,
    createdAt: beneficiary.createdAt ?? beneficiary.created_at ?? "",
  };
}

export const accountsApi = {
  async create(data: CreateAccountDto): Promise<Account> {
    const response = await unwrapRequest(
      axiosInstance.post<BackendAccount>("/accounts", data),
    );
    return normalizeAccount(response);
  },

  async createApproved(data: CreateAccountDto): Promise<Account> {
    const response = await unwrapRequest(
      axiosInstance.post<BackendAccount>("/accounts/approved", data),
    );
    return normalizeAccount(response);
  },

  async createApprovedForUser(
    userId: string,
    data: CreateAccountDto,
  ): Promise<Account> {
    const response = await unwrapRequest(
      axiosInstance.post<BackendAccount>(`/accounts/admin/users/${userId}`, data),
    );
    return normalizeAccount(response);
  },

  async getAll(): Promise<Account[]> {
    const response = await unwrapRequest(
      axiosInstance.get<BackendAccount[]>("/accounts"),
    );
    return response.map(normalizeAccount);
  },

  async getAdminAll(): Promise<Account[]> {
    const response = await unwrapRequest(
      axiosInstance.get<BackendAccount[]>("/accounts/admin/all"),
    );
    return response.map(normalizeAccount);
  },

  async getAdminBeneficiaries(): Promise<Beneficiary[]> {
    const response = await unwrapRequest(
      axiosInstance.get<BackendBeneficiary[]>("/accounts/admin/beneficiaries"),
    );
    return response.map(normalizeBeneficiary);
  },

  async getById(accountId: string): Promise<Account> {
    const response = await unwrapRequest(
      axiosInstance.get<BackendAccount>(`/accounts/${accountId}`),
    );
    return normalizeAccount(response);
  },

  async getByAccountNumber(accountNumber: string): Promise<Account> {
    const response = await unwrapRequest(
      axiosInstance.get<BackendAccount>(
        `/accounts/number/${encodeURIComponent(accountNumber)}`,
      ),
    );
    return normalizeAccount(response);
  },

  async freeze(accountId: string): Promise<Account> {
    const response = await unwrapRequest(
      axiosInstance.patch<BackendAccount>(`/accounts/${accountId}/freeze`),
    );
    return normalizeAccount(response);
  },

  async unfreeze(accountId: string): Promise<Account> {
    const response = await unwrapRequest(
      axiosInstance.patch<BackendAccount>(`/accounts/${accountId}/unfreeze`),
    );
    return normalizeAccount(response);
  },

  async updateKyc(
    accountId: string,
    status: Account["kycStatus"],
  ): Promise<Account> {
    const response = await unwrapRequest(
      axiosInstance.patch<BackendAccount>(`/accounts/${accountId}/kyc`, {
        status,
      }),
    );
    return normalizeAccount(response);
  },

  async close(accountId: string): Promise<void> {
    await unwrapRequest(axiosInstance.delete(`/accounts/${accountId}`));
  },

  async deleteWithOtp(accountId: string, otp: string): Promise<void> {
    await unwrapRequest(
      axiosInstance.post<{ deleted: true }>(`/accounts/${accountId}/delete`, {
        otp,
      }),
    );
  },

  async updateLimits(
    accountId: string,
    data: UpdateLimitsDto,
  ): Promise<AccountLimit> {
    const response = await unwrapRequest(
      axiosInstance.patch<BackendAccountLimit>(`/accounts/${accountId}/limits`, data),
    );
    return normalizeLimit(response);
  },

  async getBeneficiaries(accountId: string): Promise<Beneficiary[]> {
    const response = await unwrapRequest(
      axiosInstance.get<BackendBeneficiary[]>(
        `/accounts/${accountId}/beneficiaries`,
      ),
    );
    return response.map(normalizeBeneficiary);
  },

  async addBeneficiary(
    accountId: string,
    data: AddBeneficiaryDto,
  ): Promise<Beneficiary> {
    const response = await unwrapRequest(
      axiosInstance.post<BackendBeneficiary>(
        `/accounts/${accountId}/beneficiaries`,
        data,
      ),
    );
    return normalizeBeneficiary(response);
  },

  async removeBeneficiary(accountId: string, beneficiaryId: string): Promise<void> {
    await unwrapRequest(
      axiosInstance.delete(
        `/accounts/${accountId}/beneficiaries/${beneficiaryId}`,
      ),
    );
  },
};
