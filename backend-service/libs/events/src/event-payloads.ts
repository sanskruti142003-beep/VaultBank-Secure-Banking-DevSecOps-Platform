export interface UserRegisteredEvent {
  userId: string;
  email: string;
  fullName: string;
}

export interface UserLoginEvent {
  userId: string;
  email: string;
  ip: string;
  userAgent: string;
  timestamp: string;
}

export interface UserLogoutEvent {
  userId: string;
  timestamp: string;
}

export interface UserPasswordResetEvent {
  userId: string;
  timestamp: string;
}

export interface UserOtpIssuedEvent {
  userId: string;
  email: string;
  purpose: string;
  expiresAt: string;
}

export interface AccountCreatedEvent {
  accountId: string;
  userId: string;
  type: string;
  currency: string;
}

export interface AccountFrozenEvent {
  accountId: string;
  userId: string;
  reason: string;
}

export interface AccountClosedEvent {
  accountId: string;
  userId: string;
}

export interface KycUpdatedEvent {
  accountId: string;
  userId: string;
  oldStatus: string;
  newStatus: string;
}

export interface TransactionInitiatedEvent {
  txnId: string;
  reference: string;
  fromAccountId: string | null;
  toAccountId: string | null;
  amount: string;
  currency: string;
  type: string;
}

export interface TransactionCompletedEvent {
  txnId: string;
  reference: string;
  amount: string;
  currency: string;
  completedAt: string;
}

export interface TransactionFailedEvent {
  txnId: string;
  reference: string;
  reason: string;
  failedAt: string;
}

export interface TransactionReversedEvent {
  txnId: string;
  reference: string;
  reversedBy: string;
  reason: string;
  reversedAt: string;
}

export interface PaymentSuccessEvent {
  paymentId: string;
  txnId: string;
  amount: string;
  currency: string;
  userId: string;
  receiptId: string;
}

export interface PaymentFailedEvent {
  paymentId: string;
  txnId: string;
  reason: string;
  userId: string;
}

export interface PaymentRefundedEvent {
  paymentId: string;
  amount: string;
  reason: string;
  refundedAt: string;
}

export interface AuditRequestEvent {
  service: string;
  method: string;
  path: string;
  statusCode: number;
  userId: string | null;
  ip: string;
  durationMs: number;
  timestamp: string;
  correlationId: string;
}

export interface BankingEventMap {
  'user.registered': UserRegisteredEvent;
  'user.login': UserLoginEvent;
  'user.logout': UserLogoutEvent;
  'user.password_reset': UserPasswordResetEvent;
  'user.otp_issued': UserOtpIssuedEvent;
  'account.created': AccountCreatedEvent;
  'account.frozen': AccountFrozenEvent;
  'account.closed': AccountClosedEvent;
  'kyc.updated': KycUpdatedEvent;
  'transaction.initiated': TransactionInitiatedEvent;
  'transaction.completed': TransactionCompletedEvent;
  'transaction.failed': TransactionFailedEvent;
  'transaction.reversed': TransactionReversedEvent;
  'payment.success': PaymentSuccessEvent;
  'payment.failed': PaymentFailedEvent;
  'payment.refunded': PaymentRefundedEvent;
  'audit.request': AuditRequestEvent;
}

export type BankingRoutingKey = keyof BankingEventMap;

export interface BankingEventEnvelope<K extends BankingRoutingKey> {
  id: string;
  routingKey: K;
  source: string;
  occurredAt: string;
  correlationId: string;
  payload: BankingEventMap[K];
}
