import { useCallback, useEffect, useState } from "react";
import {
  AccountStatus,
  AccountType,
  Currency,
  KycStatus,
  type Account,
} from "@/types/accounts.types";
import type { User } from "@/types/auth.types";

export type AccountApprovalAction = "open" | "delete";
export type AccountApprovalStatus = "pending" | "approved" | "rejected";

export interface AccountApprovalRequest {
  id: string;
  action: AccountApprovalAction;
  status: AccountApprovalStatus;
  userId: string;
  userName: string;
  userEmail?: string;
  accountId?: string;
  accountNumber?: string;
  accountType: AccountType;
  currency: Currency;
  openingDeposit?: string;
  requestedAt: string;
  reviewedAt?: string;
  reviewer?: string;
  reviewNote?: string;
  customerReadAt?: string;
  approvedAccount?: Account;
}

const ACCOUNT_APPROVAL_STORAGE_KEY = "vaultbank_account_approval_requests";
const ACCOUNT_APPROVAL_UPDATED_EVENT = "vaultbank:account-approval-updated";

function now() {
  return new Date().toISOString();
}

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function newId(prefix: string) {
  const fallback = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${fallback}`;
}

function generatedAccountNumber() {
  const left = String(Math.floor(100000 + Math.random() * 900000));
  const middle = String(Math.floor(100000 + Math.random() * 900000));
  const right = String(Math.floor(1000 + Math.random() * 9000));
  return `${left}${middle}${right}`;
}

function normalizeAmount(value?: string) {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) && parsed > 0 ? parsed.toFixed(4) : "0.0000";
}

function emitAccountApprovalUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ACCOUNT_APPROVAL_UPDATED_EVENT));
  }
}

function writeAccountApprovalRequests(requests: AccountApprovalRequest[]) {
  if (!canUseStorage()) {
    return;
  }
  window.localStorage.setItem(
    ACCOUNT_APPROVAL_STORAGE_KEY,
    JSON.stringify(requests),
  );
  emitAccountApprovalUpdated();
}

export function getAccountApprovalRequests(): AccountApprovalRequest[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(ACCOUNT_APPROVAL_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as AccountApprovalRequest[];
    return Array.isArray(parsed)
      ? parsed.filter((request) => request.id && request.userId)
      : [];
  } catch {
    return [];
  }
}

function userLabel(user: User | null | undefined) {
  return {
    userEmail: user?.email ?? undefined,
    userId: user?.id ?? "",
    userName: user?.fullName ?? user?.email ?? "Customer",
  };
}

function createApprovedAccount(request: AccountApprovalRequest): Account {
  const timestamp = now();
  const accountId = crypto.randomUUID();
  return {
    id: accountId,
    userId: request.userId,
    accountNumber: generatedAccountNumber(),
    type: request.accountType,
    currency: request.currency,
    balance: normalizeAmount(request.openingDeposit),
    status: AccountStatus.ACTIVE,
    kycStatus: KycStatus.APPROVED,
    createdAt: timestamp,
    updatedAt: timestamp,
    limits: {
      id: crypto.randomUUID(),
      accountId,
      dailyTransferLimit: "10000.0000",
      singleTxnLimit: "5000.0000",
      updatedAt: timestamp,
    },
  };
}

export function createAccountOpenRequest({
  user,
  accountType,
  currency,
  openingDeposit,
}: {
  user: User | null | undefined;
  accountType: AccountType;
  currency: Currency;
  openingDeposit?: string;
}) {
  const labels = userLabel(user);
  if (!labels.userId) {
    throw new Error("Please sign in again before opening an account.");
  }

  const requests = getAccountApprovalRequests();
  const request: AccountApprovalRequest = {
    id: newId("account-open-request"),
    action: "open",
    status: "pending",
    ...labels,
    accountType,
    currency,
    openingDeposit: normalizeAmount(openingDeposit),
    requestedAt: now(),
  };
  writeAccountApprovalRequests([request, ...requests]);
  return request;
}

export function createAccountDeleteRequest({
  user,
  account,
}: {
  user: User | null | undefined;
  account: Account;
}) {
  const labels = userLabel(user);
  if (!labels.userId) {
    throw new Error("Please sign in again before deleting an account.");
  }

  const requests = getAccountApprovalRequests();
  const existing = requests.find(
    (request) =>
      request.action === "delete" &&
      request.status === "pending" &&
      request.accountId === account.id,
  );
  if (existing) {
    return existing;
  }

  const request: AccountApprovalRequest = {
    id: newId("account-delete-request"),
    action: "delete",
    status: "pending",
    ...labels,
    accountId: account.id,
    accountNumber: account.accountNumber,
    accountType: account.type,
    currency: account.currency,
    requestedAt: now(),
  };
  writeAccountApprovalRequests([request, ...requests]);
  return request;
}

export function approveAccountApprovalRequest(
  requestId: string,
  reviewer = "Admin",
  note?: string,
  materializedAccount?: Account,
) {
  let approved: AccountApprovalRequest | undefined;
  const updated = getAccountApprovalRequests().map((request) => {
    if (request.id !== requestId) {
      return request;
    }
    const approvedAccount =
      request.action === "open"
        ? materializedAccount ?? request.approvedAccount ?? createApprovedAccount(request)
        : request.approvedAccount;
    approved = {
      ...request,
      approvedAccount,
      status: "approved",
      reviewedAt: now(),
      reviewer,
      reviewNote: note,
    };
    return approved;
  });
  writeAccountApprovalRequests(updated);
  return approved;
}

export function saveMaterializedApprovedAccount(
  requestId: string,
  account: Account,
) {
  let updatedRequest: AccountApprovalRequest | undefined;
  const updated = getAccountApprovalRequests().map((request) => {
    if (request.id !== requestId) {
      return request;
    }
    updatedRequest = {
      ...request,
      accountId: account.id,
      accountNumber: account.accountNumber,
      approvedAccount: account,
      status: "approved",
      reviewedAt: request.reviewedAt ?? now(),
      reviewer: request.reviewer ?? "Admin",
    };
    return updatedRequest;
  });
  writeAccountApprovalRequests(updated);
  return updatedRequest;
}

export function rejectAccountApprovalRequest(
  requestId: string,
  reviewer = "Admin",
  note?: string,
) {
  let rejected: AccountApprovalRequest | undefined;
  const updated = getAccountApprovalRequests().map((request) => {
    if (request.id !== requestId) {
      return request;
    }
    rejected = {
      ...request,
      status: "rejected",
      reviewedAt: now(),
      reviewer,
      reviewNote: note,
    };
    return rejected;
  });
  writeAccountApprovalRequests(updated);
  return rejected;
}

export function markAccountApprovalNotificationsRead(userId?: string | null) {
  if (!userId) {
    return;
  }

  const updated = getAccountApprovalRequests().map((request) =>
    request.userId === userId && request.status !== "pending"
      ? { ...request, customerReadAt: request.customerReadAt ?? now() }
      : request,
  );
  writeAccountApprovalRequests(updated);
}

export function approvedAccountsFromRequests(
  requests = getAccountApprovalRequests(),
) {
  return requests
    .filter((request) => request.action === "open" && request.status === "approved")
    .map((request) => request.approvedAccount)
    .filter((account): account is Account => Boolean(account));
}

export function findApprovedAccountById(
  accountId?: string | null,
  requests = getAccountApprovalRequests(),
) {
  if (!accountId) {
    return undefined;
  }
  return approvedAccountsFromRequests(requests).find(
    (account) => account.id === accountId,
  );
}

export function approvedDeleteAccountIds(
  requests = getAccountApprovalRequests(),
) {
  return new Set(
    requests
      .filter((request) => request.action === "delete" && request.status === "approved")
      .map((request) => request.accountId)
      .filter((id): id is string => Boolean(id)),
  );
}

export function pendingDeleteAccountIds(
  requests = getAccountApprovalRequests(),
) {
  return new Set(
    requests
      .filter((request) => request.action === "delete" && request.status === "pending")
      .map((request) => request.accountId)
      .filter((id): id is string => Boolean(id)),
  );
}

export function useAllAccountApprovalRequests() {
  const [requests, setRequests] = useState<AccountApprovalRequest[]>(() =>
    getAccountApprovalRequests(),
  );

  const refresh = useCallback(() => {
    setRequests(getAccountApprovalRequests());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(ACCOUNT_APPROVAL_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(ACCOUNT_APPROVAL_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  return requests;
}

export function useAccountApprovalRequests(userId?: string | null) {
  const requests = useAllAccountApprovalRequests();
  return userId ? requests.filter((request) => request.userId === userId) : [];
}
