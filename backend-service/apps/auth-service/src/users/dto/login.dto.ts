import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { RoleName } from '../entities';

export class LoginDto {
  @Transform(({ value }: { value?: string }) => value?.trim().toLowerCase())
  @IsOptional()
  @IsString()
  @Length(3, 100)
  @Matches(/^[a-z0-9._@-]+$/, {
    message:
      'username can contain lowercase letters, numbers, dots, underscores, hyphens, or @',
  })
  username?: string;

  @Transform(({ value }: { value?: string }) => value?.trim().toLowerCase())
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsEnum(RoleName)
  role?: RoleName;
}
