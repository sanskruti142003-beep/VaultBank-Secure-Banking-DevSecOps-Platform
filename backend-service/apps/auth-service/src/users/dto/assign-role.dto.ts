import { IsEnum, IsUUID } from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';
import { RoleName } from '../entities';

const trimString = ({ value }: TransformFnParams): unknown => {
  const rawValue = value as unknown;
  return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
};

const normalizeRole = ({ value }: TransformFnParams): unknown => {
  const rawValue = value as unknown;
  return typeof rawValue === 'string'
    ? rawValue.trim().toLowerCase()
    : rawValue;
};

export class AssignRoleDto {
  @Transform(trimString)
  @IsUUID()
  userId!: string;

  @Transform(normalizeRole)
  @IsEnum(RoleName)
  role!: RoleName;
}
