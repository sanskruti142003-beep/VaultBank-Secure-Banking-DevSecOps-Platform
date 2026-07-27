export type VaultServiceName =
  | 'auth-service'
  | 'account-service'
  | 'transaction-service'
  | 'payment-service'
  | 'audit-service'
  | 'notification-service'
  | 'dead-letter-service'
  | 'shared';

export type ServiceSecrets = Record<string, string>;
