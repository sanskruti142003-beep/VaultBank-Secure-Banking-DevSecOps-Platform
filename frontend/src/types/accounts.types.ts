export enum AccountType {
  SAVINGS = "savings",
  CURRENT = "current",
  FIXED = "fixed",
}

export enum Currency {
  USD = "USD",
  EUR = "EUR",
  GBP = "GBP",
}

export enum AccountStatus {
  ACTIVE = "active",
  FROZEN = "frozen",
  CLOSED = "closed",
}

export enum KycStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
}

export interface AccountLimit {
  id: string;
  accountId: string;
  dailyTransferLimit: string;
  singleTxnLimit: string;
  updatedAt: string;
}

export interface Account {
  id: string;
  userId: string;
  ownerName?: string;
  accountNumber: string;
  type: AccountType;
  currency: Currency;
  balance: string;
  status: AccountStatus;
  kycStatus: KycStatus;
  createdAt: string;
  updatedAt: string;
  limits?: AccountLimit;
}

export interface Beneficiary {
  id: string;
  accountId: string;
  name: string;
  bankCode: string;
  beneficiaryAccountNumber: string;
  isVerified: boolean;
  createdAt: string;
}

export interface CreateAccountDto {
  type: AccountType;
  currency: Currency;
  openingDeposit?: string;
}

export interface AddBeneficiaryDto {
  name: string;
  bankCode: string;
  beneficiaryAccountNumber: string;
}

export interface UpdateLimitsDto {
  dailyTransferLimit: number;
  singleTxnLimit: number;
}
