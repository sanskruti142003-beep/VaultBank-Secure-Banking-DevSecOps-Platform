import 'dotenv/config';
import { DataSource } from 'typeorm';
import { isDatabaseSslEnabled } from '../../../common/database/ssl';
import { AuditEvent, SystemLog } from './entities';

const url =
  process.env.AUDIT_MIGRATION_DATABASE_URL ?? process.env.AUDIT_DATABASE_URL;

if (!url) {
  throw new Error(
    'AUDIT_MIGRATION_DATABASE_URL or AUDIT_DATABASE_URL must be set',
  );
}

export default new DataSource({
  type: 'postgres',
  url,
  entities: [AuditEvent, SystemLog],
  migrations: [`${__dirname}/migrations/*{.ts,.js}`],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  ssl: isDatabaseSslEnabled(process.env.DATABASE_SSL)
    ? { rejectUnauthorized: false }
    : false,
});
