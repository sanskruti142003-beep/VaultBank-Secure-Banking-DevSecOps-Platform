import 'dotenv/config';
import { DataSource } from 'typeorm';
import { isDatabaseSslEnabled } from '../../../common/database/ssl';
import { OtpCode, RefreshToken, Role, User, UserRole } from './entities';

const url =
  process.env.USER_MIGRATION_DATABASE_URL ?? process.env.USER_DATABASE_URL;

if (!url) {
  throw new Error(
    'USER_MIGRATION_DATABASE_URL or USER_DATABASE_URL must be set',
  );
}

export default new DataSource({
  type: 'postgres',
  url,
  entities: [User, Role, UserRole, RefreshToken, OtpCode],
  migrations: [`${__dirname}/migrations/*{.ts,.js}`],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  ssl: isDatabaseSslEnabled(process.env.DATABASE_SSL)
    ? { rejectUnauthorized: false }
    : false,
});
