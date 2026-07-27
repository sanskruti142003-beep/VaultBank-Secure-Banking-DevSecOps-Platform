import { IsString, Length, Matches } from 'class-validator';
import { ForgotPasswordDto } from './forgot-password.dto';

export class ResetPasswordDto extends ForgotPasswordDto {
  @IsString()
  @Matches(/^\d{6}$/)
  otp!: string;

  @IsString()
  @Length(12, 72)
  @Matches(/[A-Z]/)
  @Matches(/[a-z]/)
  @Matches(/\d/)
  new_password!: string;
}
