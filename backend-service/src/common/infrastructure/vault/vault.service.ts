import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodeVault from 'node-vault';
import { ServiceSecrets, VaultServiceName } from './vault.types';

type VaultKvResponse<T> = {
  data: {
    data: T;
    metadata: Record<string, unknown>;
  };
};

type VaultAuth = {
  client_token: string;
  lease_duration: number;
  renewable: boolean;
};

type AppRoleLoginResponse = {
  auth: VaultAuth;
};

type TokenLookupResponse = {
  data: {
    ttl: number;
    renewable: boolean;
  };
};

type TokenRenewResponse = {
  auth: VaultAuth;
};

@Injectable()
export class VaultService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VaultService.name);
  private readonly client: nodeVault.client;
  private readonly mount: string;
  private readonly prefix: string;
  private renewalTimer: NodeJS.Timeout | null = null;

  constructor(private readonly config: ConfigService) {
    this.mount = config.get<string>('VAULT_KV_MOUNT', 'secret');
    this.prefix = config.get<string>('VAULT_SECRET_PREFIX', 'banking');
    this.client = nodeVault({
      apiVersion: 'v1',
      endpoint: config.getOrThrow<string>('VAULT_ADDR'),
      namespace: config.get<string>('VAULT_NAMESPACE'),
      token: config.get<string>('VAULT_TOKEN'),
      requestOptions: {
        timeout: config.get<number>('VAULT_TIMEOUT_MS', 5000),
      },
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.client.token) {
      await this.loginWithAppRole();
    } else {
      await this.configureRenewalForCurrentToken();
    }
    await this.client.health();
  }

  onModuleDestroy(): void {
    if (this.renewalTimer) {
      clearInterval(this.renewalTimer);
      this.renewalTimer = null;
    }
  }

  async getSecrets<T extends ServiceSecrets = ServiceSecrets>(
    serviceName: VaultServiceName,
  ): Promise<T> {
    return this.readSecret<T>(this.secretPath(serviceName));
  }

  async getSecret<T = string>(path: string, key: string): Promise<T> {
    const secrets = await this.readSecret<Record<string, T>>(path);
    if (!(key in secrets)) {
      throw new Error(`Vault secret key "${key}" was not found at "${path}"`);
    }
    return secrets[key];
  }

  async renewToken(): Promise<void> {
    const response = (await this.client.tokenRenewSelf({
      increment: '1h',
    })) as TokenRenewResponse;

    if (response.auth?.lease_duration) {
      this.scheduleRenewal(response.auth.lease_duration);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const health = (await this.client.health()) as { sealed?: boolean };
      return health.sealed === false;
    } catch {
      return false;
    }
  }

  private async loginWithAppRole(): Promise<void> {
    const response = (await this.client.approleLogin({
      role_id: this.config.getOrThrow<string>('VAULT_ROLE_ID'),
      secret_id: this.config.getOrThrow<string>('VAULT_SECRET_ID'),
    })) as AppRoleLoginResponse;

    this.client.token = response.auth.client_token;
    if (response.auth.renewable) {
      this.scheduleRenewal(response.auth.lease_duration);
    }
  }

  private async configureRenewalForCurrentToken(): Promise<void> {
    const response =
      (await this.client.tokenLookupSelf()) as TokenLookupResponse;
    if (response.data.renewable) {
      this.scheduleRenewal(response.data.ttl);
    }
  }

  private scheduleRenewal(ttlSeconds: number): void {
    if (this.renewalTimer) {
      clearInterval(this.renewalTimer);
    }

    const intervalMs = Math.max(30_000, Math.floor(ttlSeconds * 0.8 * 1000));
    this.renewalTimer = setInterval(() => {
      void this.renewToken().catch((error: unknown) => {
        const reason = error instanceof Error ? error.stack : String(error);
        this.logger.error('Vault token renewal failed', reason);
      });
    }, intervalMs);
    this.renewalTimer.unref();
  }

  private async readSecret<T>(path: string): Promise<T> {
    const response = (await this.client.read(
      this.dataPath(path),
    )) as VaultKvResponse<T>;
    return response.data.data;
  }

  private dataPath(path: string): string {
    const normalized = path.replace(/^\/+|\/+$/g, '');
    if (!normalized || normalized.includes('..')) {
      throw new Error('Invalid Vault secret path');
    }
    return `${this.mount}/data/${this.prefix}/${normalized}`;
  }

  private secretPath(serviceName: VaultServiceName): string {
    return serviceName === 'notification-service' ? 'shared' : serviceName;
  }
}
