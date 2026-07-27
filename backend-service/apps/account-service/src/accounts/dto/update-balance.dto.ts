import { IsDecimal, IsEnum } from 'class-validator';

export enum BalanceOperation {
  CREDIT = 'credit',
  DEBIT = 'debit',
}

export class UpdateBalanceDto {
  @IsEnum(BalanceOperation)
  operation!: BalanceOperation;

  @IsDecimal({ decimal_digits: '1,4', force_decimal: false })
  amount!: string;
}
