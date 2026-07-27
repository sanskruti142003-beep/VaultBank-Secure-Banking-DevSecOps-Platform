import 'dotenv/config';
import { DataSource } from 'typeorm';
import { isDatabaseSslEnabled } from '../../../common/database/ssl';
import { PaymentOrder, PaymentReceipt, Refund } from './entities';

const url =
  process.env.PAYMENT_MIGRATION_DATABASE_URL ??
  process.env.PAYMENT_DATABASE_URL;

if (!url) {
  throw new Error(
    'PAYMENT_MIGRATION_DATABASE_URL or PAYMENT_DATABASE_URL must be set',
  );
}

export default new DataSource({
  type: 'postgres',
  url,
  entities: [PaymentOrder, PaymentReceipt, Refund],
  migrations: [`${__dirname}/migrations/*{.ts,.js}`],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  ssl: isDatabaseSslEnabled(process.env.DATABASE_SSL)
    ? { rejectUnauthorized: false }
    : false,
});
