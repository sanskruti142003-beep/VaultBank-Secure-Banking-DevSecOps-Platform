import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function createDatabaseOptions(
  url: string,
  entities: NonNullable<TypeOrmModuleOptions['entities']>,
): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    url,
    entities,
    synchronize: false,
    migrationsRun: false,
    logging: process.env.TYPEORM_LOGGING === 'true',
    ssl:
      process.env.DATABASE_SSL === 'true'
        ? { rejectUnauthorized: false }
        : false,
  };
}
