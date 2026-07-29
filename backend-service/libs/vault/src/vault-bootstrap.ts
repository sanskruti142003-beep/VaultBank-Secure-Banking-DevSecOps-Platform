import { config as loadEnvFile } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import nodeVault from 'node-vault';
import { ServiceSecrets, VaultServiceName } from './vault.types';

interface LoginResponse {
  auth: { client_token: string };
}

interface SecretResponse {
  data: { data: ServiceSecrets };
}

const paths: Partial<Record<VaultServiceName, string>> = {};

const environmentPrefixes: Record<VaultServiceName, string> = {
  'auth-service': 'AUTH_SERVICE',
  'account-service': 'ACCOUNT_SERVICE',
  'transaction-service': 'TRANSACTION_SERVICE',
  'payment-service': 'PAYMENT_SERVICE',
  'audit-service': 'AUDIT_SERVICE',
  'notification-service': 'NOTIFICATION_SERVICE',
  'dead-letter-service': 'DEAD_LETTER_SERVICE',
  shared: 'SHARED',
};

export async function loadVaultSecrets(
  serviceName: VaultServiceName,
): Promise<ServiceSecrets> {
  prepareVaultEnvironment(serviceName);

  const client = nodeVault({
    apiVersion: 'v1',
    endpoint: process.env.VAULT_ADDR,
  });

  let login: LoginResponse;
  try {
    login = (await client.approleLogin({
      role_id: process.env.VAULT_ROLE_ID,
      secret_id: process.env.VAULT_SECRET_ID,
    })) as LoginResponse;
  } catch (error: unknown) {
    throw new Error(
      [
        `Vault AppRole login failed for ${serviceName}: ${describeVaultError(error)}.`,
        'Run "docker compose up -d vault vault-init" to recreate local dev AppRoles,',
        'then restart the service container.',
      ].join(' '),
    );
  }

  process.env.VAULT_TOKEN = login.auth.client_token;
  client.token = login.auth.client_token;

  const path = paths[serviceName] ?? serviceName;
  let response: SecretResponse;
  try {
    response = (await client.read(
      `secret/data/banking/${path}`,
    )) as SecretResponse;
  } catch (error: unknown) {
    throw new Error(
      [
        `Vault secret read failed for ${serviceName} at secret/data/banking/${path}:`,
        `${describeVaultError(error)}.`,
        `Check docker/vault/policies/${path}.hcl and rerun "docker compose up -d vault vault-init".`,
      ].join(' '),
    );
  }

  const secrets = adaptSecretsForRuntime(response.data.data);
  Object.entries(secrets).forEach(([key, value]) => {
    if (value.trim() || !process.env[key]?.trim()) {
      process.env[key] = value;
    }
  });
  return secrets;
}

export function adaptSecretsForRuntime(
  secrets: ServiceSecrets,
): ServiceSecrets {
  if (!shouldRewriteDockerUrlsForHost()) {
    return secrets;
  }

  return {
    ...secrets,
    DB_URL: rewriteDockerServiceUrl(secrets.DB_URL, {
      defaultHost: '127.0.0.1',
      defaultPort: '5432',
      dockerHost: 'postgres',
      hostEnv: 'POSTGRES_HOST',
      portEnv: 'POSTGRES_PORT',
    }),
    RABBITMQ_URL: rewriteDockerServiceUrl(secrets.RABBITMQ_URL, {
      defaultHost: '127.0.0.1',
      defaultPort: '5672',
      dockerHost: 'rabbitmq',
      hostEnv: 'RABBITMQ_HOST',
      portEnv: 'RABBITMQ_AMQP_PORT',
    }),
    REDIS_URL: rewriteDockerServiceUrl(secrets.REDIS_URL, {
      defaultHost: '127.0.0.1',
      defaultPort: '6379',
      dockerHost: 'redis',
      hostEnv: 'REDIS_HOST',
      portEnv: 'REDIS_PORT',
    }),
  };
}

export function prepareVaultEnvironment(serviceName: VaultServiceName): void {
  const projectRoot = findProjectRoot();
  loadEnvFile({
    path: [
      join(projectRoot, '.env'),
      join(projectRoot, 'apps', serviceName, '.env'),
    ],
    quiet: true,
  });

  const prefix = environmentPrefixes[serviceName];
  process.env.VAULT_ADDR ||= `http://127.0.0.1:${process.env.VAULT_PORT ?? '8200'}`;
  process.env.VAULT_ROLE_ID ||= process.env[`${prefix}_VAULT_ROLE_ID`];
  process.env.VAULT_SECRET_ID ||= process.env[`${prefix}_VAULT_SECRET_ID`];

  const missing = ['VAULT_ADDR', 'VAULT_ROLE_ID', 'VAULT_SECRET_ID'].filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missing.length > 0) {
    throw new Error(
      [
        `Vault bootstrap is not configured for ${serviceName}.`,
        `Missing: ${missing.join(', ')}.`,
        `Set VAULT_ADDR plus VAULT_ROLE_ID/VAULT_SECRET_ID, or populate`,
        `${prefix}_VAULT_ROLE_ID and ${prefix}_VAULT_SECRET_ID in ${join(
          projectRoot,
          '.env',
        )}.`,
        'Start Vault, run "npm run vault:init", then copy the generated AppRole credentials into .env.',
      ].join(' '),
    );
  }
}

function findProjectRoot(): string {
  for (const start of [process.cwd(), __dirname]) {
    let current = resolve(start);
    while (true) {
      const packageFile = join(current, 'package.json');
      if (isBankingProject(packageFile)) {
        return current;
      }
      const parent = dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }
  return process.cwd();
}

function isBankingProject(packageFile: string): boolean {
  if (!existsSync(packageFile)) {
    return false;
  }
  try {
    const contents = JSON.parse(readFileSync(packageFile, 'utf8')) as {
      name?: string;
    };
    return contents.name === 'banking-microservices';
  } catch {
    return false;
  }
}

interface RuntimeUrlRewrite {
  defaultHost: string;
  defaultPort: string;
  dockerHost: string;
  hostEnv: string;
  portEnv: string;
}

function shouldRewriteDockerUrlsForHost(): boolean {
  if (process.env.VAULT_REWRITE_DOCKER_URLS_FOR_HOST === 'false') {
    return false;
  }
  if (process.env.APP_RUNTIME === 'host') {
    return true;
  }
  if (
    process.env.APP_RUNTIME === 'docker' ||
    process.env.RUNNING_IN_DOCKER === 'true' ||
    process.env.KUBERNETES_SERVICE_HOST
  ) {
    return false;
  }
  return !existsSync('/.dockerenv');
}

function rewriteDockerServiceUrl(
  value: string,
  rewrite: RuntimeUrlRewrite,
): string {
  if (!value) {
    return value;
  }

  try {
    const url = new URL(value);
    if (url.hostname !== rewrite.dockerHost) {
      return value;
    }

    url.hostname = localHost(rewrite.hostEnv, rewrite.defaultHost);
    url.port = localPort(rewrite.portEnv, rewrite.defaultPort);
    return url.toString();
  } catch {
    return value;
  }
}

function localHost(envName: string, fallback: string): string {
  return (
    process.env[envName]?.trim() ||
    process.env.INFRASTRUCTURE_HOST?.trim() ||
    fallback
  );
}

function localPort(envName: string, fallback: string): string {
  return process.env[envName]?.trim() || fallback;
}

function describeVaultError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return String(error);
  }

  const response = (error as { response?: unknown }).response;
  if (response && typeof response === 'object') {
    const statusCode = (response as { statusCode?: unknown }).statusCode;
    const body = (response as { body?: unknown }).body;
    if (body && typeof body === 'object') {
      const errors = (body as { errors?: unknown }).errors;
      if (Array.isArray(errors)) {
        return `HTTP ${formatPrimitive(statusCode)} ${errors
          .map(formatPrimitive)
          .join(', ')}`;
      }
    }
    if (statusCode) {
      return `HTTP ${formatPrimitive(statusCode)}`;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'unknown Vault error';
}

function formatPrimitive(value: unknown): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  return 'unknown';
}
