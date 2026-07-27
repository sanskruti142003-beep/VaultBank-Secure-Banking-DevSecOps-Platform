import { BaseEntity } from '@app/database';
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { OtpCode } from './otp-code.entity';
import { RefreshToken } from './refresh-token.entity';
import { UserRole } from './user-role.entity';

@Entity({ name: 'users' })
@Index('uq_users_pan_number_active', ['panNumber'], {
  unique: true,
  where: 'pan_number IS NOT NULL AND deleted_at IS NULL',
})
export class User extends BaseEntity {
  @Column({ type: 'citext', unique: true })
  username!: string;

  @Column({ type: 'citext', unique: true })
  email!: string;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  @Column({ name: 'pan_number', type: 'varchar', length: 10, nullable: true })
  panNumber!: string | null;

  @Column({ name: 'full_name', type: 'varchar', length: 160 })
  fullName!: string;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'failed_login_attempts', type: 'int', default: 0 })
  failedLoginAttempts!: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;

  @OneToMany(() => UserRole, (userRole) => userRole.user)
  userRoles!: UserRole[];

  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens!: RefreshToken[];

  @OneToMany(() => OtpCode, (otp) => otp.user)
  otpCodes!: OtpCode[];
}
