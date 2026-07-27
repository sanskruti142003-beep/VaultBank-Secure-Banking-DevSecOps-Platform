import { IsEnum } from 'class-validator';
import { KycStatus } from '../enums/kyc-status.enum';

export class UpdateKycDto {
  @IsEnum(KycStatus)
  status!: KycStatus;
}
