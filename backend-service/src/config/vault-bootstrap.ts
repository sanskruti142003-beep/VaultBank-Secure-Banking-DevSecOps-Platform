import 'dotenv/config';
import nodeVault from 'node-vault';
import type { VaultServiceName } from '../common/infrastructure/vault';

type AppRoleLoginResponse = {
  auth: {
    client_token: string;
  };
};

type VaultKvResponse = {
  data: {
    data: Record<string, string>;
  };
};

const DATABASE_URL_ENV_BY_SERVICE: Partial<Record<VaultServiceName, string>> = {
  'auth-service': 'USER_DATABASE_URL',
  'account-service': 'ACCOUNT_DATABASE_URL',
  'transaction-service': 'TRANSACTION_DATABASE_URL',
  'payment-service': 'PAYMENT_DATABASE_URL',
  'audit-service': 'AUDIT_DATABASE_URL',
};

const SECRET_PATH_BY_SERVICE: Partial<Record<VaultServiceName, string>> = {
  'notification-service': 'shared',
};

export async function loadVaultSecretsBeforeBootstrap(
  serviceName: VaultServiceName,
): Promise<Record<string, string>> {
  const endpoint = requiredEnvironment('VAULT_ADDR');
  const client = nodeVault({ apiVersion: 'v1', endpoint });
  const login = (await client.approleLogin({
    role_id: requiredEnvironment('VAULT_ROLE_ID'),
    secret_id: requiredEnvironment('VAULT_SECRET_ID'),
  })) as AppRoleLoginResponse;

  client.token = login.auth.client_token;
  const secretPath = SECRET_PATH_BY_SERVICE[serviceName] ?? serviceName;
  const response = (await client.read(
    `secret/data/banking/${secretPath}`,
  )) as VaultKvResponse;
  const secrets = response.data.data;

  for (const [key, value] of Object.entries(secrets)) {
    process.env[key] = value;
  }

  const databaseEnv = DATABASE_URL_ENV_BY_SERVICE[serviceName];
  if (databaseEnv && secrets.DB_URL) {
    process.env.DATABASE_URL = secrets.DB_URL;
    process.env[databaseEnv] = secrets.DB_URL;
  }

  return secrets;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required before Vault bootstrap`);
  }
  return value;
}
