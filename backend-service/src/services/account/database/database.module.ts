import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from '../../../common/database/database-options';
import { isDatabaseSslEnabled } from '../../../common/database/ssl';
import { Account, AccountLimit, Beneficiary } from './entities';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        databaseOptions(
          config.getOrThrow<string>('ACCOUNT_DATABASE_URL'),
          [Account, AccountLimit, Beneficiary],
          isDatabaseSslEnabled(config.get<string>('DATABASE_SSL')),
        ),
    }),
    TypeOrmModule.forFeature([Account, AccountLimit, Beneficiary]),
  ],
  exports: [TypeOrmModule],
})
export class AccountDatabaseModule {}
