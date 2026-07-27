import { BaseEntity } from '@app/database';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { User } from './user.entity';

export enum OtpPurpose {
  LOGIN = 'login',
  RESET_PASSWORD = 'reset_password',
  VERIFY_EMAIL = 'verify_email',
  ACCOUNT_DELETE = 'account_delete',
  ADMIN_LOGIN = 'admin_login',
}

@Entity({ name: 'otp_codes' })
@Index('idx_otp_codes_user_id', ['userId'])
export class OtpCode extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.otpCodes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'code_hash', type: 'varchar', length: 255 })
  codeHash!: string;

  @Column({
    type: 'enum',
    enum: OtpPurpose,
    enumName: 'otp_purpose_enum',
  })
  purpose!: OtpPurpose;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'boolean', default: false })
  used!: boolean;
}
