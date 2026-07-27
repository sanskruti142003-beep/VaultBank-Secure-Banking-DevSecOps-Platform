import { IsObject, IsString } from 'class-validator';

export class PaypalWebhookDto {
  @IsString()
  id!: string;

  @IsString()
  event_type!: string;

  @IsObject()
  resource!: Record<string, unknown>;
}
