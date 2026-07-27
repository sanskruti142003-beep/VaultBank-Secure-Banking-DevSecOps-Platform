import { IsDecimal, IsEnum, IsOptional } from 'class-validator';
import { AccountCurrency } from '../entities';
import { AccountType } from '../enums/account-type.enum';

export class CreateAccountDto {
  @IsEnum(AccountType)
  type!: AccountType;

  @IsEnum(AccountCurrency)
  currency!: AccountCurrency;

  @IsOptional()
  @IsDecimal({ decimal_digits: '1,4', force_decimal: false })
  openingDeposit?: string;
}
