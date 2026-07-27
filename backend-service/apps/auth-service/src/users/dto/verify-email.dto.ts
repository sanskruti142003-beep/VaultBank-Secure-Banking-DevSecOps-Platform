import { IsString, Matches } from 'class-validator';
import { ForgotPasswordDto } from './forgot-password.dto';

export class VerifyEmailDto extends ForgotPasswordDto {
  @IsString()
  @Matches(/^\d{6}$/)
  otp!: string;
}
