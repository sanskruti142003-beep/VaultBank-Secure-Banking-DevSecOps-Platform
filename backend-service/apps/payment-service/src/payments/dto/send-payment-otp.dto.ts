import { IsEmail, IsString } from 'class-validator';

export class SendPaymentOtpDto {
  @IsString()
  @IsEmail({}, { message: 'email must be a valid registered email address' })
  email!: string;
}
