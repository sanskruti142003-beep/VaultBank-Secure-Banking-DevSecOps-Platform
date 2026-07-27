import { IsDecimal } from 'class-validator';

export class UpdateLimitsDto {
  @IsDecimal({ decimal_digits: '1,4', force_decimal: false })
  dailyTransferLimit!: string;

  @IsDecimal({ decimal_digits: '1,4', force_decimal: false })
  singleTxnLimit!: string;
}
