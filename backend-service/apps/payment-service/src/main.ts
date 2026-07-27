import { NestFactory } from '@nestjs/core';
import { configureApp, verifyDependencies } from '@app/common';
import { loadVaultSecrets } from '@app/vault';

async function bootstrap(): Promise<void> {
  process.env.SERVICE_NAME = 'payment-service';
  await loadVaultSecrets('payment-service');
  await verifyDependencies();
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);
  await app.listen(Number(process.env.PORT ?? 3004), '0.0.0.0');
}

void bootstrap();
