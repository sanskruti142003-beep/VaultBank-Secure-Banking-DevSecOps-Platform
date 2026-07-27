import { IsEnum, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { RoleName } from '../entities';

export class AssignRoleDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsUUID()
  userId!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEnum(RoleName)
  role!: RoleName;
}
