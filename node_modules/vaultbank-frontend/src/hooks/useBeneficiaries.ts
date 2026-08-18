import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { accountsApi } from "@/api/accounts.api";
import { getAccountErrorMessage } from "@/constants/accounts.constants";
import {
  findApprovedAccountById,
  getAccountApprovalRequests,
} from "@/lib/account-approval-store";
import type { AddBeneficiaryDto, Beneficiary } from "@/types/accounts.types";
import type { ApiError } from "@/types/auth.types";

export const beneficiaryQueryKeys = {
  list: (accountId: string) => ["beneficiaries", accountId] as const,
};

const LOCAL_BENEFICIARY_STORAGE_KEY = "vaultbank_local_beneficiaries";
const LOCAL_BENEFICIARY_UPDATED_EVENT = "vaultbank:local-beneficiaries-updated";

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isLocalAccount(accountId?: string) {
  return Boolean(
    accountId &&
      findApprovedAccountById(accountId, getAccountApprovalRequests()),
  );
}

function readLocalBeneficiaries(): Record<string, Beneficiary[]> {
  if (!canUseStorage()) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(LOCAL_BENEFICIARY_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, Beneficiary[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalBeneficiaries(data: Record<string, Beneficiary[]>) {
  if (!canUseStorage()) {
    return;
  }
  window.localStorage.setItem(
    LOCAL_BENEFICIARY_STORAGE_KEY,
    JSON.stringify(data),
  );
  window.dispatchEvent(new Event(LOCAL_BENEFICIARY_UPDATED_EVENT));
}

function getLocalBeneficiaries(accountId: string) {
  return readLocalBeneficiaries()[accountId] ?? [];
}

export function getAllLocalBeneficiaries() {
  return Object.values(readLocalBeneficiaries()).flat();
}

export function useAllLocalBeneficiaries() {
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>(() =>
    getAllLocalBeneficiaries(),
  );

  const refresh = useCallback(() => {
    setBeneficiaries(getAllLocalBeneficiaries());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(LOCAL_BENEFICIARY_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(LOCAL_BENEFICIARY_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  return beneficiaries;
}

function addLocalBeneficiary(accountId: string, data: AddBeneficiaryDto) {
  const all = readLocalBeneficiaries();
  const beneficiary: Beneficiary = {
    id: newId(),
    accountId,
    name: data.name,
    bankCode: data.bankCode,
    beneficiaryAccountNumber: data.beneficiaryAccountNumber,
    isVerified: true,
    createdAt: new Date().toISOString(),
  };
  all[accountId] = [beneficiary, ...(all[accountId] ?? [])];
  writeLocalBeneficiaries(all);
  return beneficiary;
}

function removeLocalBeneficiary(accountId: string, beneficiaryId: string) {
  const all = readLocalBeneficiaries();
  all[accountId] = (all[accountId] ?? []).filter(
    (beneficiary) => beneficiary.id !== beneficiaryId,
  );
  writeLocalBeneficiaries(all);
}

export function useBeneficiaries(accountId: string | undefined) {
  const query = useQuery({
    queryKey: beneficiaryQueryKeys.list(accountId ?? ""),
    queryFn: () =>
      isLocalAccount(accountId)
        ? Promise.resolve(getLocalBeneficiaries(accountId ?? ""))
        : accountsApi.getBeneficiaries(accountId ?? ""),
    enabled: Boolean(accountId),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return {
    ...query,
    beneficiaries: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useAddBeneficiary(accountId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: AddBeneficiaryDto) =>
      isLocalAccount(accountId)
        ? Promise.resolve(addLocalBeneficiary(accountId, data))
        : accountsApi.addBeneficiary(accountId, data),
    onSuccess: (beneficiary) => {
      queryClient.setQueryData<Beneficiary[]>(
        beneficiaryQueryKeys.list(accountId),
        (current) => (current ? [beneficiary, ...current] : [beneficiary]),
      );
      void queryClient.invalidateQueries({
        queryKey: beneficiaryQueryKeys.list(accountId),
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "beneficiaries"],
      });
      toast.success(`${beneficiary.name} added as a beneficiary`);
    },
  });

  return {
    ...mutation,
    addBeneficiary: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error as ApiError | null,
  };
}

export function useRemoveBeneficiary(accountId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (beneficiaryId: string) =>
      isLocalAccount(accountId)
        ? Promise.resolve(removeLocalBeneficiary(accountId, beneficiaryId))
        : accountsApi.removeBeneficiary(accountId, beneficiaryId),
    onMutate: async (beneficiaryId) => {
      await queryClient.cancelQueries({
        queryKey: beneficiaryQueryKeys.list(accountId),
      });
      const previous = queryClient.getQueryData<Beneficiary[]>(
        beneficiaryQueryKeys.list(accountId),
      );
      queryClient.setQueryData<Beneficiary[]>(
        beneficiaryQueryKeys.list(accountId),
        (current) =>
          current?.filter((beneficiary) => beneficiary.id !== beneficiaryId) ?? [],
      );
      return { previous };
    },
    onError: (error: ApiError, _beneficiaryId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          beneficiaryQueryKeys.list(accountId),
          context.previous,
        );
      }
      toast.error(getAccountErrorMessage(error.code) || "Failed to remove");
    },
    onSuccess: () => {
      toast.success("Beneficiary removed");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: beneficiaryQueryKeys.list(accountId),
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "beneficiaries"],
      });
    },
  });

  return {
    ...mutation,
    removeBeneficiary: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}
