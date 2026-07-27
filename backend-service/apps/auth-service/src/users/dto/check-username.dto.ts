import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

export class CheckUsernameDto {
  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  @IsString()
  @Length(3, 40)
  @Matches(/^[a-z0-9._-]+$/, {
    message:
      'username can contain lowercase letters, numbers, dots, underscores, or hyphens',
  })
  username!: string;
}
