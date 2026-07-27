import { IsString, Matches } from 'class-validator';

export class DeleteAccountDto {
  @IsString()
  @Matches(/^\d{6}$/)
  otp!: string;
}
