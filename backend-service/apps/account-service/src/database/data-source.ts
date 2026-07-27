import 'dotenv/config';
import { buildMigrationDatabaseUrl } from '@app/database';
import { DataSource } from 'typeorm';
import { Account, AccountLimit, Beneficiary } from '../accounts/entities';

const url = buildMigrationDatabaseUrl({
  database: 'account_db',
  explicitEnv: 'ACCOUNT_MIGRATION_DATABASE_URL',
  passwordEnv: 'ACCOUNT_MIGRATOR_PASSWORD',
  username: 'account_migrator',
});

export default new DataSource({
  type: 'postgres',
  url,
  entities: [Account, AccountLimit, Beneficiary],
  migrations: [`${__dirname}/migrations/*{.ts,.js}`],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
});
