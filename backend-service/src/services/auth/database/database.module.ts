import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from '../../../common/database/database-options';
import { isDatabaseSslEnabled } from '../../../common/database/ssl';
import { OtpCode, RefreshToken, Role, User, UserRole } from './entities';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        databaseOptions(
          config.getOrThrow<string>('USER_DATABASE_URL'),
          [User, Role, UserRole, RefreshToken, OtpCode],
          isDatabaseSslEnabled(config.get<string>('DATABASE_SSL')),
        ),
    }),
    TypeOrmModule.forFeature([User, Role, UserRole, RefreshToken, OtpCode]),
  ],
  exports: [TypeOrmModule],
})
export class AuthDatabaseModule {}
