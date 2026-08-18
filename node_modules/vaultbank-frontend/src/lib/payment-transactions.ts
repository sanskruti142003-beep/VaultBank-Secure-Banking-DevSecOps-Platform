import { PaymentStatus, type PaymentOrder } from "@/types/payments.types";
import {
  TransactionStatus,
  TransactionType,
  type Transaction,
} from "@/types/transactions.types";

function paymentReference(paymentId: string) {
  return `PAY${paymentId.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

export function isPaymentBackedTransaction(transaction: Transaction) {
  return (
    transaction.id.startsWith("payment-") ||
    transaction.metadata?.source === "payment"
  );
}

export function failedPaymentToTransaction(payment: PaymentOrder): Transaction {
  const timestamp = payment.updatedAt || payment.createdAt;

  return {
    id: `payment-${payment.id}`,
    reference: paymentReference(payment.id),
    fromAccountId: payment.fromAccountId || null,
    toAccountId: payment.toAccountId || null,
    amount: payment.amount,
    currency: payment.currency,
    type: TransactionType.TRANSFER,
    status: TransactionStatus.FAILED,
    description: payment.description ?? "Payment failed",
    metadata: {
      source: "payment",
      paymentId: payment.id,
      gateway: payment.gateway,
    },
    initiatedAt: payment.createdAt || timestamp,
    completedAt: timestamp || null,
    createdAt: payment.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

export function failedPaymentTransactions(
  payments: PaymentOrder[],
  options: {
    accountId?: string;
    status?: TransactionStatus | "all";
    type?: TransactionType | "all";
  } = {},
) {
  return payments
    .filter((payment) => payment.status === PaymentStatus.FAILED)
    .filter((payment) => !payment.transactionId)
    .filter(
      (payment) => !options.accountId || payment.fromAccountId === options.accountId,
    )
    .filter(
      () => !options.status || options.status === "all" || options.status === TransactionStatus.FAILED,
    )
    .filter(
      () => !options.type || options.type === "all" || options.type === TransactionType.TRANSFER,
    )
    .map(failedPaymentToTransaction);
}

export function mergeTransactionsWithFailedPayments(
  transactions: Transaction[],
  payments: PaymentOrder[],
  options: {
    accountId?: string;
    status?: TransactionStatus | "all";
    type?: TransactionType | "all";
  } = {},
) {
  const linkedPaymentIds = new Set(
    transactions
      .map((transaction) => transaction.metadata?.paymentId)
      .filter((id): id is string => typeof id === "string"),
  );
  const syntheticTransactions = failedPaymentTransactions(payments, options).filter(
    (transaction) =>
      !linkedPaymentIds.has(String(transaction.metadata?.paymentId ?? "")),
  );

  return [...transactions, ...syntheticTransactions].sort(
    (left, right) =>
      Date.parse(right.initiatedAt || right.createdAt || "0") -
      Date.parse(left.initiatedAt || left.createdAt || "0"),
  );
}
