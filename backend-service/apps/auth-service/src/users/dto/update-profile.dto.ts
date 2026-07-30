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

function normalizePan(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
  return normalized || null;
}

export class UpdateProfileDto {
  @IsOptional()
  @Transform(({ value }: { value?: string }) => {
    return typeof value === 'string' ? value.trim().toLowerCase() : value;
  })
  @IsString()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @Transform(({ value }: { value?: string }) => {
    return normalizePhone(value);
  })
  @IsString()
  @MaxLength(32)
  @Matches(/^\+[1-9]\d{9,14}$/, {
    message: 'phone must include country code, for example +919876543210',
  })
  phone?: string | null;

  @IsOptional()
  @IsString()
  @Length(2, 160)
  full_name?: string;

  @IsOptional()
  @Transform(({ value }: { value?: string | null }) => {
    return normalizePan(value);
  })
  @IsString()
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/, {
    message: 'pan_number must use PAN format ABCDE1234F',
  })
  pan_number?: string | null;
}
