import { axiosInstance, unwrapRequest } from "@/api/axios";
import type {
  CreatePaymentDto,
  PaymentList,
  PaymentOrder,
  SendPaymentOtpDto,
  SendPaymentOtpResponse,
} from "@/types/payments.types";

type BackendPaymentOrder = Partial<PaymentOrder> & {
  user_id?: string;
  transaction_id?: string | null;
  from_account_id?: string;
  to_account_id?: string;
  gateway_reference?: string | null;
  created_at?: string;
  updated_at?: string;
};

type BackendPaymentList = {
  data?: BackendPaymentOrder[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  total_pages?: number;
};

type BackendSendPaymentOtpResponse = {
  email?: string;
  message?: string;
  phone?: string;
  expiresInSeconds?: number;
  expires_in_seconds?: number;
  deliveryStatus?: "sent" | "blocked";
  delivery_status?: "sent" | "blocked";
  deliveryChannel?: "email";
  delivery_channel?: "email";
};

function normalizePayment(order: BackendPaymentOrder): PaymentOrder {
  return {
    id: order.id ?? "",
    userId: order.userId ?? order.user_id ?? "",
    transactionId: order.transactionId ?? order.transaction_id ?? null,
    fromAccountId: order.fromAccountId ?? order.from_account_id ?? "",
    toAccountId: order.toAccountId ?? order.to_account_id ?? "",
    gateway: order.gateway as PaymentOrder["gateway"],
    gatewayReference: order.gatewayReference ?? order.gateway_reference ?? null,
    amount: order.amount ?? "0",
    currency: order.currency ?? "USD",
    status: order.status as PaymentOrder["status"],
    description: order.description ?? null,
    createdAt: order.createdAt ?? order.created_at ?? "",
    updatedAt: order.updatedAt ?? order.updated_at ?? "",
  };
}

export const paymentsApi = {
  async list(page = 1, limit = 10): Promise<PaymentList> {
    const response = await unwrapRequest(
      axiosInstance.get<BackendPaymentList>("/payments", {
        params: { page, limit },
      }),
    );
    return {
      data: (response.data ?? []).map(normalizePayment),
      total: response.total ?? 0,
      page: response.page ?? page,
      limit: response.limit ?? limit,
      totalPages: response.totalPages ?? response.total_pages ?? 1,
    };
  },

  async listAdmin(page = 1, limit = 100): Promise<PaymentList> {
    const response = await unwrapRequest(
      axiosInstance.get<BackendPaymentList>("/payments/admin/all", {
        params: { page, limit },
      }),
    );
    return {
      data: (response.data ?? []).map(normalizePayment),
      total: response.total ?? 0,
      page: response.page ?? page,
      limit: response.limit ?? limit,
      totalPages: response.totalPages ?? response.total_pages ?? 1,
    };
  },

  async create(data: CreatePaymentDto): Promise<PaymentOrder> {
    const response = await unwrapRequest(
      axiosInstance.post<BackendPaymentOrder>("/payments", data),
    );
    return normalizePayment(response);
  },

  async sendTransferOtp(
    data: SendPaymentOtpDto,
  ): Promise<SendPaymentOtpResponse> {
    const response = await unwrapRequest(
      axiosInstance.post<BackendSendPaymentOtpResponse>(
        "/payments/otp/send",
        data,
      ),
    );
    return {
      message: response.message ?? "OTP sent to registered email address.",
      email: response.email ?? data.email,
      expiresInSeconds:
        response.expiresInSeconds ?? response.expires_in_seconds ?? 120,
      deliveryStatus:
        response.deliveryStatus ?? response.delivery_status ?? "sent",
      deliveryChannel:
        response.deliveryChannel ?? response.delivery_channel ?? "email",
    };
  },
};
