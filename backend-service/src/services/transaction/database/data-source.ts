import 'dotenv/config';
import { DataSource } from 'typeorm';
import { isDatabaseSslEnabled } from '../../../common/database/ssl';
import { LedgerEntry, Transaction, TransactionFee } from './entities';

const url =
  process.env.TRANSACTION_MIGRATION_DATABASE_URL ??
  process.env.TRANSACTION_DATABASE_URL;

if (!url) {
  throw new Error(
    'TRANSACTION_MIGRATION_DATABASE_URL or TRANSACTION_DATABASE_URL must be set',
  );
}

export default new DataSource({
  type: 'postgres',
  url,
  entities: [Transaction, LedgerEntry, TransactionFee],
  migrations: [`${__dirname}/migrations/*{.ts,.js}`],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  ssl: isDatabaseSslEnabled(process.env.DATABASE_SSL)
    ? { rejectUnauthorized: false }
    : false,
});
