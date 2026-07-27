import { IsString, IsUUID, Matches } from 'class-validator';

export class VerifyAccountDeletionOtpDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  otp!: string;
}
