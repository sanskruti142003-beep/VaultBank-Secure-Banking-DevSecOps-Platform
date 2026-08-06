import { buildMigrationDatabaseUrl } from './migration-url';

describe('buildMigrationDatabaseUrl', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.USER_MIGRATION_DATABASE_URL;
    delete process.env.AUTH_MIGRATOR_PASSWORD;
    delete process.env.DB_URL;
    delete process.env.POSTGRES_HOST;
    delete process.env.POSTGRES_PORT;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses the dedicated migration URL when present', () => {
    process.env.USER_MIGRATION_DATABASE_URL =
      'postgresql://auth_migrator:secret@postgres:5432/user_db';

    expect(
      buildMigrationDatabaseUrl({
        database: 'user_db',
        explicitEnv: 'USER_MIGRATION_DATABASE_URL',
        passwordEnv: 'AUTH_MIGRATOR_PASSWORD',
        username: 'auth_migrator',
      }),
    ).toBe('postgresql://auth_migrator:secret@postgres:5432/user_db');
  });

  it('builds a URL from the dedicated migrator password', () => {
    process.env.AUTH_MIGRATOR_PASSWORD = 'pa ss/word';
    process.env.POSTGRES_HOST = 'postgres';

    expect(
      buildMigrationDatabaseUrl({
        database: 'user_db',
        explicitEnv: 'USER_MIGRATION_DATABASE_URL',
        passwordEnv: 'AUTH_MIGRATOR_PASSWORD',
        username: 'auth_migrator',
      }),
    ).toBe('postgresql://auth_migrator:pa%20ss%2Fword@postgres:5432/user_db');
  });

  it('does not fall back to the runtime DB_URL', () => {
    process.env.DB_URL =
      'postgresql://auth_service:runtime@postgres:5432/user_db';

    expect(() =>
      buildMigrationDatabaseUrl({
        database: 'user_db',
        explicitEnv: 'USER_MIGRATION_DATABASE_URL',
        passwordEnv: 'AUTH_MIGRATOR_PASSWORD',
        username: 'auth_migrator',
      }),
    ).toThrow('USER_MIGRATION_DATABASE_URL or AUTH_MIGRATOR_PASSWORD');
  });
});
