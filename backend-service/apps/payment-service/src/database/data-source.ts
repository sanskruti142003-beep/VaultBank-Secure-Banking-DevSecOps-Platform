import 'dotenv/config';
import { buildMigrationDatabaseUrl } from '@app/database';
import { DataSource } from 'typeorm';
import { PaymentOrder, PaymentReceipt, Refund } from '../payments/entities';

const url = buildMigrationDatabaseUrl({
  database: 'payment_db',
  explicitEnv: 'PAYMENT_MIGRATION_DATABASE_URL',
  passwordEnv: 'PAYMENT_MIGRATOR_PASSWORD',
  username: 'payment_migrator',
});

export default new DataSource({
  type: 'postgres',
  url,
  entities: [PaymentOrder, PaymentReceipt, Refund],
  migrations: [`${__dirname}/migrations/*{.ts,.js}`],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
});
