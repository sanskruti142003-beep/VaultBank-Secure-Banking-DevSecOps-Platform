import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { paymentsApi } from "@/api/payments.api";
import { accountQueryKeys } from "@/hooks/useAccounts";
import { useAuthStore } from "@/store/auth.store";
import {
  PaymentStatus,
  type CreatePaymentDto,
  type PaymentList,
  type PaymentOrder,
  type SendPaymentOtpDto,
} from "@/types/payments.types";
import type { ApiError } from "@/types/auth.types";

export const paymentQueryKeys = {
  list: (page = 1, limit = 10) => ["payments", page, limit] as const,
};

function hasInFlightPayment(payments: PaymentOrder[] | undefined): boolean {
  return Boolean(
    payments?.some((payment) =>
      [PaymentStatus.INITIATED, PaymentStatus.PROCESSING].includes(
        payment.status,
      ),
    ),
  );
}

export function usePayments(page = 1, limit = 10) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const query = useQuery({
    queryKey: paymentQueryKeys.list(page, limit),
    queryFn: () => paymentsApi.list(page, limit),
    enabled: Boolean(accessToken),
    staleTime: 30 * 1000,
    refetchInterval: (query) =>
      hasInFlightPayment(query.state.data?.data) ? 2000 : false,
    retry: false,
  });

  return {
    ...query,
    payments: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    totalPages: query.data?.totalPages ?? 1,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useCreatePayment() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: CreatePaymentDto) => paymentsApi.create(data),
    onSuccess: (payment) => {
      queryClient.setQueriesData<PaymentList>(
        { queryKey: ["payments"] },
        (current) => {
          if (!current) {
            return current;
          }
          const existingIndex = current.data.findIndex(
            (item) => item.id === payment.id,
          );
          const data =
            existingIndex >= 0
              ? current.data.map((item) =>
                  item.id === payment.id ? payment : item,
                )
              : [payment, ...current.data].slice(0, current.limit);
          return { ...current, data };
        },
      );
      void queryClient.invalidateQueries({ queryKey: ["payments"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void queryClient.invalidateQueries({ queryKey: accountQueryKeys.all });
      window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["payments"] });
      }, 1500);
      window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["payments"] });
      }, 5000);
      toast.success("Payment submitted successfully");
    },
    onError: (error: ApiError) => {
      void queryClient.invalidateQueries({ queryKey: ["payments"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.error(error.message || "Payment could not be submitted");
    },
  });

  return {
    ...mutation,
    createPayment: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}

export function useSendPaymentOtp() {
  const mutation = useMutation({
    mutationFn: (data: SendPaymentOtpDto) => paymentsApi.sendTransferOtp(data),
    onError: (error: ApiError) => {
      toast.error(error.message || "OTP could not be sent");
    },
  });

  return {
    ...mutation,
    sendPaymentOtp: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}
