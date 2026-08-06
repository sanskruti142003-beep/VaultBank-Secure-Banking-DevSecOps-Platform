interface MigrationUrlOptions {
  database: string;
  explicitEnv: string;
  passwordEnv: string;
  username: string;
}

export function buildMigrationDatabaseUrl({
  database,
  explicitEnv,
  passwordEnv,
  username,
}: MigrationUrlOptions): string {
  const explicit = process.env[explicitEnv];
  if (explicit) {
    return explicit;
  }

  const password = process.env[passwordEnv];
  if (!password) {
    throw new Error(`${explicitEnv} or ${passwordEnv} is required`);
  }

  const host = process.env.POSTGRES_HOST ?? '127.0.0.1';
  const port = process.env.POSTGRES_PORT ?? '5432';
  return `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(
    password,
  )}@${host}:${port}/${database}`;
}
