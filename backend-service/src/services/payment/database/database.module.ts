import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from '../../../common/database/database-options';
import { isDatabaseSslEnabled } from '../../../common/database/ssl';
import { PaymentOrder, PaymentReceipt, Refund } from './entities';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        databaseOptions(
          config.getOrThrow<string>('PAYMENT_DATABASE_URL'),
          [PaymentOrder, PaymentReceipt, Refund],
          isDatabaseSslEnabled(config.get<string>('DATABASE_SSL')),
        ),
    }),
    TypeOrmModule.forFeature([PaymentOrder, PaymentReceipt, Refund]),
  ],
  exports: [TypeOrmModule],
})
export class PaymentDatabaseModule {}
