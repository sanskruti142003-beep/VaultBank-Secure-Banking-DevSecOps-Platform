import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { normalizePhone } from '../phone.util';

export class RegisterDto {
  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  @IsString()
  @Length(3, 40)
  @Matches(/^[a-z0-9._-]+$/, {
    message:
      'username can contain lowercase letters, numbers, dots, underscores, or hyphens',
  })
  username!: string;

  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  @IsEmail()
  email!: string;

  @IsString()
  @Length(12, 72)
  @Matches(/[A-Z]/, { message: 'password must contain an uppercase letter' })
  @Matches(/[a-z]/, { message: 'password must contain a lowercase letter' })
  @Matches(/\d/, { message: 'password must contain a number' })
  password!: string;

  @IsOptional()
  @Transform(({ value }: { value?: string }) => {
    return normalizePhone(value) ?? undefined;
  })
  @IsString()
  @MaxLength(32)
  @Matches(/^\+[1-9]\d{9,14}$/, {
    message: 'phone must include country code, for example +919876543210',
  })
  phone?: string;

  @IsString()
  @Length(2, 160)
  full_name!: string;
}
