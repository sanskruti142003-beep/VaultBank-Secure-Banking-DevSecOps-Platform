import { connect as connectRabbitMq } from 'amqplib';
import Redis from 'ioredis';
import { Client } from 'pg';

const DEPENDENCY_ATTEMPTS = Number(process.env.DEPENDENCY_ATTEMPTS ?? 20);
const DEPENDENCY_RETRY_DELAY_MS = Number(
  process.env.DEPENDENCY_RETRY_DELAY_MS ?? 3000,
);

export interface DependencyChecks {
  postgres?: boolean;
  rabbitMq?: boolean;
  redis?: boolean;
}

export async function verifyDependencies(
  checks: DependencyChecks = {},
): Promise<void> {
  const enabled = {
    postgres: checks.postgres ?? true,
    rabbitMq: checks.rabbitMq ?? true,
    redis: checks.redis ?? true,
  };

  if (enabled.redis) {
    await retryDependency('Redis', verifyRedis);
  }
  if (enabled.rabbitMq) {
    await retryDependency('RabbitMQ', verifyRabbitMq);
  }
  if (enabled.postgres) {
    await retryDependency('Postgres', verifyPostgres);
  }
}

async function verifyRedis(): Promise<void> {
  const client = new Redis(required('REDIS_URL'), {
    lazyConnect: true,
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
  });
  try {
    await client.connect();
    await client.ping();
  } finally {
    client.disconnect();
  }
}

async function verifyRabbitMq(): Promise<void> {
  const connection = await connectRabbitMq(required('RABBITMQ_URL'), {
    timeout: 5000,
  });
  await connection.close();
}

async function verifyPostgres(): Promise<void> {
  const client = new Client({
    connectionString: required('DB_URL'),
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
  } finally {
    await client.end();
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} was not loaded from Vault`);
  }
  return value;
}

async function retryDependency(
  name: string,
  probe: () => Promise<void>,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= DEPENDENCY_ATTEMPTS; attempt += 1) {
    try {
      await probe();
      return;
    } catch (error) {
      lastError = error;
      if (attempt === DEPENDENCY_ATTEMPTS) {
        break;
      }

      console.warn(
        `${name} is not ready yet (${attempt}/${DEPENDENCY_ATTEMPTS}): ${formatError(error)}`,
      );
      await delay(DEPENDENCY_RETRY_DELAY_MS);
    }
  }

  throw new Error(
    `${name} was not ready after ${DEPENDENCY_ATTEMPTS} attempts: ${formatError(lastError)}`,
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
