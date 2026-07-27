import {
  adaptSecretsForRuntime,
  prepareVaultEnvironment,
} from './vault-bootstrap';

describe('prepareVaultEnvironment', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('maps service-specific AppRole credentials and derives local Vault URL', () => {
    delete process.env.VAULT_ADDR;
    delete process.env.VAULT_ROLE_ID;
    delete process.env.VAULT_SECRET_ID;
    process.env.VAULT_PORT = '8200';
    process.env.AUTH_SERVICE_VAULT_ROLE_ID = 'auth-role-id';
    process.env.AUTH_SERVICE_VAULT_SECRET_ID = 'auth-secret-id';

    prepareVaultEnvironment('auth-service');

    expect(process.env.VAULT_ADDR).toBe('http://127.0.0.1:8200');
    expect(process.env.VAULT_ROLE_ID).toBe('auth-role-id');
    expect(process.env.VAULT_SECRET_ID).toBe('auth-secret-id');
  });

  it('preserves environment values supplied by Docker or the shell', () => {
    process.env.VAULT_ADDR = 'http://vault:8200';
    process.env.VAULT_ROLE_ID = 'container-role';
    process.env.VAULT_SECRET_ID = 'container-secret';
    process.env.AUTH_SERVICE_VAULT_ROLE_ID = 'local-role';
    process.env.AUTH_SERVICE_VAULT_SECRET_ID = 'local-secret';

    prepareVaultEnvironment('auth-service');

    expect(process.env.VAULT_ADDR).toBe('http://vault:8200');
    expect(process.env.VAULT_ROLE_ID).toBe('container-role');
    expect(process.env.VAULT_SECRET_ID).toBe('container-secret');
  });

  it('rewrites Docker service URLs for local watch mode', () => {
    process.env.APP_RUNTIME = 'host';
    delete process.env.RUNNING_IN_DOCKER;
    delete process.env.KUBERNETES_SERVICE_HOST;
    delete process.env.VAULT_REWRITE_DOCKER_URLS_FOR_HOST;
    process.env.POSTGRES_HOST = '127.0.0.1';
    process.env.POSTGRES_PORT = '5432';
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = '6379';
    process.env.RABBITMQ_HOST = '127.0.0.1';
    process.env.RABBITMQ_AMQP_PORT = '5672';

    const secrets = adaptSecretsForRuntime({
      DB_URL: 'postgresql://auth_service:password@postgres:5432/user_db',
      RABBITMQ_URL: 'amqp://auth_svc:password@rabbitmq:5672/%2Fbanking-dev',
      REDIS_URL: 'redis://:password@redis:6379/0',
    });

    expect(secrets.DB_URL).toBe(
      'postgresql://auth_service:password@127.0.0.1:5432/user_db',
    );
    expect(secrets.RABBITMQ_URL).toBe(
      'amqp://auth_svc:password@127.0.0.1:5672/%2Fbanking-dev',
    );
    expect(secrets.REDIS_URL).toBe('redis://:password@127.0.0.1:6379/0');
  });

  it('keeps Docker service URLs inside Docker runtime', () => {
    process.env.APP_RUNTIME = 'docker';

    const secrets = adaptSecretsForRuntime({
      DB_URL: 'postgresql://auth_service:password@postgres:5432/user_db',
      RABBITMQ_URL: 'amqp://auth_svc:password@rabbitmq:5672/%2Fbanking-dev',
      REDIS_URL: 'redis://:password@redis:6379/0',
    });

    expect(secrets.DB_URL).toBe(
      'postgresql://auth_service:password@postgres:5432/user_db',
    );
    expect(secrets.RABBITMQ_URL).toBe(
      'amqp://auth_svc:password@rabbitmq:5672/%2Fbanking-dev',
    );
    expect(secrets.REDIS_URL).toBe('redis://:password@redis:6379/0');
  });
});
