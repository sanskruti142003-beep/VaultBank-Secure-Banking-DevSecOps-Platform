import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { VaultServiceName } from '../common/infrastructure/vault';
import { loadVaultSecretsBeforeBootstrap } from './vault-bootstrap';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      cache: true,
    }),
  ],
  exports: [ConfigModule],
})
export class AppConfigModule {
  static loadVaultSecrets(
    serviceName: VaultServiceName,
  ): Promise<Record<string, string>> {
    return loadVaultSecretsBeforeBootstrap(serviceName);
  }
}
