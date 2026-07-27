import { IsDecimal, IsOptional, IsUUID } from 'class-validator';

export class ReverseTransactionBalanceDto {
  @IsOptional()
  @IsUUID()
  debitAccountId?: string | null;

  @IsOptional()
  @IsDecimal({ decimal_digits: '1,4', force_decimal: false })
  debitAmount?: string | null;

  @IsOptional()
  @IsUUID()
  creditAccountId?: string | null;

  @IsOptional()
  @IsDecimal({ decimal_digits: '1,4', force_decimal: false })
  creditAmount?: string | null;
}
