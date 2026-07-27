import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createDatabaseOptions } from '@app/database';
import { OtpCode, RefreshToken, Role, User, UserRole } from '../users/entities';

@Module({
  imports: [
    TypeOrmModule.forRoot(
      createDatabaseOptions(requiredDatabaseUrl(), [
        User,
        Role,
        UserRole,
        RefreshToken,
        OtpCode,
      ]),
    ),
  ],
})
export class DatabaseModule {}

function requiredDatabaseUrl(): string {
  const value = process.env.DB_URL;
  if (!value) {
    throw new Error('DB_URL must be loaded from Vault');
  }
  return value;
}
