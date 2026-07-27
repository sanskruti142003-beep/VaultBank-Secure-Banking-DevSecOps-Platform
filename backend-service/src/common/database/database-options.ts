import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ObjectLiteral } from 'typeorm';

export function databaseOptions(
  url: string,
  entities: Array<new () => ObjectLiteral>,
  sslEnabled: boolean,
): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    url,
    entities,
    synchronize: false,
    migrationsRun: false,
    logging: false,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
  };
}
