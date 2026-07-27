import { IsString, Length, MaxLength } from 'class-validator';

export class AddBeneficiaryDto {
  @IsString()
  @Length(2, 160)
  name!: string;

  @IsString()
  @MaxLength(32)
  bankCode!: string;

  @IsString()
  @MaxLength(64)
  beneficiaryAccountNumber!: string;
}
