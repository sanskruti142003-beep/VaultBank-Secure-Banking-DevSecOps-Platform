import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createDatabaseOptions } from '@app/database';
import {
  LedgerEntry,
  Transaction,
  TransactionFee,
} from '../transactions/entities';

@Module({
  imports: [
    TypeOrmModule.forRoot(
      createDatabaseOptions(requiredDatabaseUrl(), [
        Transaction,
        LedgerEntry,
        TransactionFee,
      ]),
    ),
  ],
})
export class DatabaseModule {}

function requiredDatabaseUrl(): string {
  const value = process.env.DB_URL;
  if (!value) {
    throw new Error('DB_URL must be loaded from Vault');
  }
  return value;
}
