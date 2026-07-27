import { BaseEntity } from '@app/database';
import { Column, Entity, OneToMany } from 'typeorm';
import { UserRole } from './user-role.entity';

export enum RoleName {
  ADMIN = 'admin',
  CUSTOMER = 'customer',
  AGENT = 'agent',
}

@Entity({ name: 'roles' })
export class Role extends BaseEntity {
  @Column({
    type: 'enum',
    enum: RoleName,
    enumName: 'role_name_enum',
    unique: true,
  })
  name!: RoleName;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @OneToMany(() => UserRole, (userRole) => userRole.role)
  userRoles!: UserRole[];
}
