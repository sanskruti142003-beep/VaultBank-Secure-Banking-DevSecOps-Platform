import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';
import { normalizePhone } from '../phone.util';

export class CheckPhoneDto {
  @Transform(({ value }: { value?: string }) => {
    return normalizePhone(value);
  })
  @IsString()
  @MaxLength(32)
  @Matches(/^\+[1-9]\d{9,14}$/, {
    message: 'phone must include country code, for example +919876543210',
  })
  phone!: string;
}
