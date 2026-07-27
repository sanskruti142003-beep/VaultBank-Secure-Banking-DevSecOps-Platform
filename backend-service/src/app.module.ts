import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InfrastructureModule } from './common/infrastructure';
import { AppConfigModule } from './config/app-config.module';
import { AuthDatabaseModule } from './services/auth/database/database.module';

const runtimeImports =
  process.env.NODE_ENV === 'test'
    ? []
    : [AppConfigModule, InfrastructureModule, AuthDatabaseModule];

@Module({
  imports: runtimeImports,
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
