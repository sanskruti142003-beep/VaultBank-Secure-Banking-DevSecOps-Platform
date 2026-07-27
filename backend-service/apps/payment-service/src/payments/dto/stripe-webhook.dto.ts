import { IsObject, IsString } from 'class-validator';

export class StripeWebhookDto {
  @IsString()
  id!: string;

  @IsString()
  type!: string;

  @IsObject()
  data!: { object: Record<string, unknown> };
}
