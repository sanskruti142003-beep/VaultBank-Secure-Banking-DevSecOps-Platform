import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from '../../../common/database/database-options';
import { isDatabaseSslEnabled } from '../../../common/database/ssl';
import { AuditEvent, SystemLog } from './entities';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        databaseOptions(
          config.getOrThrow<string>('AUDIT_DATABASE_URL'),
          [AuditEvent, SystemLog],
          isDatabaseSslEnabled(config.get<string>('DATABASE_SSL')),
        ),
    }),
    TypeOrmModule.forFeature([AuditEvent, SystemLog]),
  ],
  exports: [TypeOrmModule],
})
export class AuditDatabaseModule {}
