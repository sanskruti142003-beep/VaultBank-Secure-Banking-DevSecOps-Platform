export interface UserRegisteredPayload {
  userId: string;
  email: string;
  fullName: string;
}

export interface UserLoginPayload {
  userId: string;
  sessionId: string;
  ipAddress: string;
  userAgent?: string;
}

export interface UserLogoutPayload {
  userId: string;
  sessionId: string;
}

export interface AccountCreatedPayload {
  accountId: string;
  userId: string;
  accountNumber: string;
  accountType: 'savings' | 'current' | 'fixed';
  currency: 'USD' | 'EUR' | 'GBP';
}

export interface AccountFrozenPayload {
  accountId: string;
  reason: string;
  frozenBy: string;
}

export interface AccountClosedPayload {
  accountId: string;
  reason: string;
  closedBy: string;
}

export interface KycUpdatedPayload {
  accountId: string;
  userId: string;
  previousStatus: 'pending' | 'approved' | 'rejected';
  status: 'pending' | 'approved' | 'rejected';
}

export interface TransactionInitiatedPayload {
  transactionId: string;
  reference: string;
  fromAccountId?: string;
  toAccountId?: string;
  amount: string;
  currency: string;
  transactionType: 'transfer' | 'deposit' | 'withdrawal';
}

export interface TransactionCompletedPayload {
  transactionId: string;
  reference: string;
  fromAccountId?: string;
  toAccountId?: string;
  amount: string;
  currency: string;
  completedAt: string;
}

export interface TransactionFailedPayload {
  transactionId: string;
  reference: string;
  failureCode: string;
  failureReason: string;
}

export interface TransactionReversedPayload {
  transactionId: string;
  reference: string;
  reversalTransactionId: string;
  reason: string;
}

export interface PaymentSuccessPayload {
  paymentOrderId: string;
  transactionId: string;
  gateway: 'stripe' | 'paypal' | 'bank_transfer';
  gatewayReference: string;
  amount: string;
  currency: string;
}

export interface PaymentFailedPayload {
  paymentOrderId: string;
  transactionId: string;
  gateway: 'stripe' | 'paypal' | 'bank_transfer';
  failureCode: string;
  failureReason: string;
}

export interface PaymentRefundedPayload {
  paymentOrderId: string;
  transactionId: string;
  refundId: string;
  amount: string;
  currency: string;
}

export interface BankingEventPayloadMap {
  'user.registered': UserRegisteredPayload;
  'user.login': UserLoginPayload;
  'user.logout': UserLogoutPayload;
  'account.created': AccountCreatedPayload;
  'account.frozen': AccountFrozenPayload;
  'account.closed': AccountClosedPayload;
  'kyc.updated': KycUpdatedPayload;
  'transaction.initiated': TransactionInitiatedPayload;
  'transaction.completed': TransactionCompletedPayload;
  'transaction.failed': TransactionFailedPayload;
  'transaction.reversed': TransactionReversedPayload;
  'payment.success': PaymentSuccessPayload;
  'payment.failed': PaymentFailedPayload;
  'payment.refunded': PaymentRefundedPayload;
}

export type BankingRoutingKey = keyof BankingEventPayloadMap;

export interface BankingEventEnvelope<K extends BankingRoutingKey> {
  id: string;
  routingKey: K;
  source: string;
  occurredAt: string;
  correlationId?: string;
  payload: BankingEventPayloadMap[K];
}
