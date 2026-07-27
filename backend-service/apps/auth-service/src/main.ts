import { NestFactory } from '@nestjs/core';
import { configureApp, verifyDependencies } from '@app/common';
import { loadVaultSecrets } from '@app/vault';

async function bootstrap(): Promise<void> {
  process.env.SERVICE_NAME = 'auth-service';
  await loadVaultSecrets('auth-service');
  await verifyDependencies();
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(Number(process.env.PORT ?? 3001), '0.0.0.0');
}

void bootstrap();
