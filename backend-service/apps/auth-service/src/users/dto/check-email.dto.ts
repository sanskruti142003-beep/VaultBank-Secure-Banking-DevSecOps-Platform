import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

export class CheckEmailDto {
  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  @IsEmail()
  email!: string;
}
