import 'dotenv/config';
import { buildMigrationDatabaseUrl } from '@app/database';
import { DataSource } from 'typeorm';
import { OtpCode, RefreshToken, Role, User, UserRole } from '../users/entities';

const url = buildMigrationDatabaseUrl({
  database: 'user_db',
  explicitEnv: 'USER_MIGRATION_DATABASE_URL',
  passwordEnv: 'AUTH_MIGRATOR_PASSWORD',
  username: 'auth_migrator',
});

export default new DataSource({
  type: 'postgres',
  url,
  entities: [User, Role, UserRole, RefreshToken, OtpCode],
  migrations: [`${__dirname}/migrations/*{.ts,.js}`],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  ssl:
    process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
