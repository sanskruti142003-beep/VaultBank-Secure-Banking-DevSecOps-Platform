import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
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
  private readonly client: AxiosInstance = axios.create({
    baseURL: `${this.requiredVaultAddr()}/v1`,
    timeout: 10_000,
  });
  private timer: NodeJS.Timeout | null = null;

  async getSecrets<T extends ServiceSecrets = ServiceSecrets>(
    serviceName: VaultServiceName,
  ): Promise<T> {
    try {
      const path = serviceName;
      const result = await this.client.get<SecretResponse<T>>(
        `secret/data/banking/${path}`,
        this.requestConfig(),
      );
      return result.data.data.data;
    } catch (error: unknown) {
      this.logger.error('Failed to read Vault secrets');
      throw error;
    }
  }

  async getSecret<T = string>(path: string, key: string): Promise<T> {
    try {
      const result = await this.client.get<SecretResponse<Record<string, T>>>(
        `secret/data/banking/${path}`,
        this.requestConfig(),
      );
      if (!(key in result.data.data.data)) {
        throw new Error(`Secret ${key} not found at ${path}`);
      }
      return result.data.data.data[key];
    } catch (error: unknown) {
      this.logger.error(`Failed to read Vault key ${key}`);
      throw error;
    }
  }

  async renewToken(): Promise<void> {
    try {
      const result = await this.client.post<RenewResponse>(
        'auth/token/renew-self',
        { increment: '1h' },
        this.requestConfig(),
      );
      this.scheduleRenewal(result.data.auth?.lease_duration ?? 3600);
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
      const result = await this.client.get<{ sealed?: boolean }>('sys/health', {
        validateStatus: (status) => status < 500,
      });
      return result.data.sealed === false;
    } catch {
      return false;
    }
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private requestConfig(): { headers: Record<string, string> } {
    return { headers: { 'X-Vault-Token': this.requiredVaultToken() } };
  }

  private requiredVaultAddr(): string {
    const value = process.env.VAULT_ADDR?.replace(/\/+$/, '');
    if (!value) {
      throw new Error('VAULT_ADDR is required');
    }
    return value;
  }

  private requiredVaultToken(): string {
    const value = process.env.VAULT_TOKEN?.trim();
    if (!value) {
      throw new Error('VAULT_TOKEN is required');
    }
    return value;
  }
}
