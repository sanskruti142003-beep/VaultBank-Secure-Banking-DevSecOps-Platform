import 'dotenv/config';
import { DataSource } from 'typeorm';
import { isDatabaseSslEnabled } from '../../../common/database/ssl';
import { Account, AccountLimit, Beneficiary } from './entities';

const url =
  process.env.ACCOUNT_MIGRATION_DATABASE_URL ??
  process.env.ACCOUNT_DATABASE_URL;

if (!url) {
  throw new Error(
    'ACCOUNT_MIGRATION_DATABASE_URL or ACCOUNT_DATABASE_URL must be set',
  );
}

export default new DataSource({
  type: 'postgres',
  url,
  entities: [Account, AccountLimit, Beneficiary],
  migrations: [`${__dirname}/migrations/*{.ts,.js}`],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  ssl: isDatabaseSslEnabled(process.env.DATABASE_SSL)
    ? { rejectUnauthorized: false }
    : false,
});
