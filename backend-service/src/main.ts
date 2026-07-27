import { NestFactory } from '@nestjs/core';
import { AppConfigModule } from './config/app-config.module';
import {
  verifyPostgresBeforeBootstrap,
  verifyRabbitMqBeforeBootstrap,
  verifyRedisBeforeBootstrap,
} from './config/dependency-bootstrap';

async function bootstrap(): Promise<void> {
  // Every microservice passes its own literal Vault path here.
  await AppConfigModule.loadVaultSecrets('auth-service');
  await verifyRedisBeforeBootstrap();
  await verifyRabbitMqBeforeBootstrap();
  await verifyPostgresBeforeBootstrap();

  // Dynamic import is intentional: module configuration is evaluated only
  // after Vault secrets have been copied into process.env.
  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.create(AppModule);

  // No network listener is opened until all dependency initialization succeeds.
  await app.init();
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
