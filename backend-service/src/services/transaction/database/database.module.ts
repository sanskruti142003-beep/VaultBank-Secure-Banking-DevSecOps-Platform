import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from '../../../common/database/database-options';
import { isDatabaseSslEnabled } from '../../../common/database/ssl';
import { LedgerEntry, Transaction, TransactionFee } from './entities';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        databaseOptions(
          config.getOrThrow<string>('TRANSACTION_DATABASE_URL'),
          [Transaction, LedgerEntry, TransactionFee],
          isDatabaseSslEnabled(config.get<string>('DATABASE_SSL')),
        ),
    }),
    TypeOrmModule.forFeature([Transaction, LedgerEntry, TransactionFee]),
  ],
  exports: [TypeOrmModule],
})
export class TransactionDatabaseModule {}
