import { IsString, Length, MaxLength } from 'class-validator';

export class RefundRequestDto {
  @IsString()
  @Length(3, 500)
  @MaxLength(500)
  reason!: string;
}
