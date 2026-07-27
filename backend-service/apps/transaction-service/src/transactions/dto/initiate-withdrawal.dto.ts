import { IsDecimal, IsString, IsUUID, Length } from 'class-validator';

export class InitiateWithdrawalDto {
  @IsUUID()
  fromAccountId!: string;

  @IsDecimal({ decimal_digits: '1,4', force_decimal: false })
  amount!: string;

  @IsString()
  @Length(3, 3)
  currency!: string;
}
