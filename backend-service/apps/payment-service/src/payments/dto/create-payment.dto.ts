import {
  IsDecimal,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Matches,
} from 'class-validator';
import { PaymentGateway } from '../enums/gateway.enum';

export class CreatePaymentDto {
  @IsUUID()
  fromAccountId!: string;

  @IsUUID()
  toAccountId!: string;

  @IsDecimal({ decimal_digits: '1,4', force_decimal: false })
  amount!: string;

  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsEnum(PaymentGateway)
  gateway!: PaymentGateway;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsEmail({}, { message: 'email must be a valid registered email address' })
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'otp must be a 6 digit code' })
  otp!: string;
}
