import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createDatabaseOptions } from '@app/database';
import { Account, AccountLimit, Beneficiary } from '../accounts/entities';

@Module({
  imports: [
    TypeOrmModule.forRoot(
      createDatabaseOptions(requiredDatabaseUrl(), [
        Account,
        AccountLimit,
        Beneficiary,
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
