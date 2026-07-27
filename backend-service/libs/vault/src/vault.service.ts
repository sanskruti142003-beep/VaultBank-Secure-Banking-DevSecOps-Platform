import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import nodeVault from 'node-vault';
import { ServiceSecrets, VaultServiceName } from './vault.types';

interface SecretResponse<T> {
  data: { data: T };
}

interface RenewResponse {
  auth?: { lease_duration?: number };
}

@Injectable()
export class VaultService implements OnModuleDestroy {
  private readonly logger = new Logger(VaultService.name);
  private readonly client = nodeVault({
    apiVersion: 'v1',
    endpoint: process.env.VAULT_ADDR,
    token: process.env.VAULT_TOKEN,
  });
  private timer: NodeJS.Timeout | null = null;

  async getSecrets<T extends ServiceSecrets = ServiceSecrets>(
    serviceName: VaultServiceName,
  ): Promise<T> {
    try {
      const path =
        serviceName === 'notification-service' ? 'shared' : serviceName;
      const result = (await this.client.read(
        `secret/data/banking/${path}`,
      )) as SecretResponse<T>;
      return result.data.data;
    } catch (error: unknown) {
      this.logger.error('Failed to read Vault secrets');
      throw error;
    }
  }

  async getSecret<T = string>(path: string, key: string): Promise<T> {
    try {
      const result = (await this.client.read(
        `secret/data/banking/${path}`,
      )) as SecretResponse<Record<string, T>>;
      if (!(key in result.data.data)) {
        throw new Error(`Secret ${key} not found at ${path}`);
      }
      return result.data.data[key];
    } catch (error: unknown) {
      this.logger.error(`Failed to read Vault key ${key}`);
      throw error;
    }
  }

  async renewToken(): Promise<void> {
    try {
      const result = (await this.client.tokenRenewSelf({
        increment: '1h',
      })) as RenewResponse;
      this.scheduleRenewal(result.auth?.lease_duration ?? 3600);
    } catch (error: unknown) {
      this.logger.error('Vault token renewal failed');
      throw error;
    }
  }

  scheduleRenewal(ttlSeconds = 3600): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timer = setInterval(
      () => {
        void this.renewToken();
      },
      Math.max(30_000, ttlSeconds * 800),
    );
    this.timer.unref();
  }

  async isHealthy(): Promise<boolean> {
    try {
      const result = (await this.client.health()) as { sealed?: boolean };
      return result.sealed === false;
    } catch {
      return false;
    }
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
}
