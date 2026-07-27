import { Transform } from 'class-transformer';
import { IsEmail, IsString, IsUUID, Matches } from 'class-validator';

export class VerifyAdminLoginDto {
  @IsUUID()
  challenge_id!: string;

  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  otp!: string;
}
