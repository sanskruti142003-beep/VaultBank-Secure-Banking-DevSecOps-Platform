import 'dotenv/config';
import { buildMigrationDatabaseUrl } from '@app/database';
import { DataSource } from 'typeorm';
import {
  LedgerEntry,
  Transaction,
  TransactionFee,
} from '../transactions/entities';

const url = buildMigrationDatabaseUrl({
  database: 'transaction_db',
  explicitEnv: 'TRANSACTION_MIGRATION_DATABASE_URL',
  passwordEnv: 'TRANSACTION_MIGRATOR_PASSWORD',
  username: 'transaction_migrator',
});

export default new DataSource({
  type: 'postgres',
  url,
  entities: [Transaction, LedgerEntry, TransactionFee],
  migrations: [`${__dirname}/migrations/*{.ts,.js}`],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
});
