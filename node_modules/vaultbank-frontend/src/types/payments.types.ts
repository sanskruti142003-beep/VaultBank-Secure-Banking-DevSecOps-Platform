import type { PaginatedResult } from "@/types/transactions.types";

export enum PaymentGateway {
  STRIPE = "stripe",
  PAYPAL = "paypal",
  BANK_TRANSFER = "bank_transfer",
}

export enum PaymentStatus {
  INITIATED = "initiated",
  PROCESSING = "processing",
  SUCCESS = "success",
  FAILED = "failed",
  REFUNDED = "refunded",
}

export interface PaymentOrder {
  id: string;
  userId: string;
  transactionId: string | null;
  fromAccountId: string;
  toAccountId: string;
  gateway: PaymentGateway;
  gatewayReference: string | null;
  amount: string;
  currency: string;
  status: PaymentStatus;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentDto {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  currency: string;
  gateway: PaymentGateway;
  description?: string;
  email: string;
  otp: string;
}

export type PaymentList = PaginatedResult<PaymentOrder>;

export interface SendPaymentOtpDto {
  email: string;
}

export interface SendPaymentOtpResponse {
  email: string;
  message: string;
  expiresInSeconds: number;
  deliveryStatus: "sent" | "blocked";
  deliveryChannel: "email";
}
