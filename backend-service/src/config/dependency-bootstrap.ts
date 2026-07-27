import { connect as connectRabbitMq } from 'amqplib';
import Redis from 'ioredis';
import { Client } from 'pg';

export async function verifyRedisBeforeBootstrap(): Promise<void> {
  const client = new Redis(requiredEnvironment('REDIS_URL'), {
    lazyConnect: true,
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  try {
    await client.connect();
    await client.ping();
  } finally {
    client.disconnect();
  }
}

export async function verifyRabbitMqBeforeBootstrap(): Promise<void> {
  const connection = await connectRabbitMq(
    requiredEnvironment('RABBITMQ_URL'),
    { timeout: 5000 },
  );
  await connection.close();
}

export async function verifyPostgresBeforeBootstrap(): Promise<void> {
  const client = new Client({
    connectionString: requiredEnvironment('DB_URL'),
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    await client.query('SELECT 1');
  } finally {
    await client.end();
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} was not loaded from Vault`);
  }
  return value;
}
