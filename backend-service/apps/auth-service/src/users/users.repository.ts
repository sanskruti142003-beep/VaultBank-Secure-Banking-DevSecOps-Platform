import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  OtpCode,
  OtpPurpose,
  RefreshToken,
  Role,
  RoleName,
  User,
  UserRole,
} from './entities';
import { normalizePhone } from './phone.util';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(UserRole)
    private readonly userRoles: Repository<UserRole>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(OtpCode) private readonly otpCodes: Repository<OtpCode>,
    private readonly dataSource: DataSource,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({
      where: { email },
      relations: { userRoles: { role: true } },
    });
  }

  findByUsername(username: string): Promise<User | null> {
    return this.users.findOne({
      where: { username },
      relations: { userRoles: { role: true } },
    });
  }

  async findByPhone(phone: string): Promise<User | null> {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return null;
    }

    return this.users.findOne({
      where: { phone: normalizedPhone },
      relations: { userRoles: { role: true } },
    });
  }

  findByPanNumber(panNumber: string): Promise<User | null> {
    return this.users.findOne({
      where: { panNumber },
      relations: { userRoles: { role: true } },
    });
  }

  findByLoginIdentifier(identifier: string): Promise<User | null> {
    return identifier.includes('@')
      ? this.findByEmail(identifier)
      : this.findByUsername(identifier);
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({
      where: { id },
      relations: { userRoles: { role: true } },
    });
  }

  findAll(): Promise<User[]> {
    return this.users.find({
      relations: { userRoles: { role: true } },
      order: { createdAt: 'DESC' },
    });
  }

  async createUser(
    input: Pick<
      User,
      'username' | 'email' | 'passwordHash' | 'phone' | 'fullName'
    >,
  ): Promise<User> {
    return this.dataSource.transaction(async (manager) => {
      const user = manager.create(User, {
        ...input,
        phone: normalizePhone(input.phone),
      });
      const saved = await manager.save(user);
      let role = await manager.findOne(Role, {
        where: { name: RoleName.CUSTOMER },
      });
      if (!role) {
        role = await manager.save(
          manager.create(Role, {
            name: RoleName.CUSTOMER,
            description: 'Default banking customer',
          }),
        );
      }
      await manager.save(manager.create(UserRole, { user: saved, role }));
      return await manager.findOneOrFail(User, {
        where: { id: saved.id },
        relations: { userRoles: { role: true } },
      });
    });
  }

  saveUser(user: User): Promise<User> {
    return this.users.save(user);
  }

  async assignRole(user: User, name: RoleName): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      let role = await manager.findOne(Role, { where: { name } });
      if (!role) {
        role = await manager.save(
          manager.create(Role, { name, description: `${name} role` }),
        );
      }

      if (name === RoleName.ADMIN) {
        await manager
          .createQueryBuilder()
          .softDelete()
          .from(UserRole)
          .where('user_id = :userId', { userId: user.id })
          .andWhere('deleted_at IS NULL')
          .execute();
      } else {
        const adminRole = await manager.findOne(Role, {
          where: { name: RoleName.ADMIN },
        });
        if (adminRole) {
          await manager
            .createQueryBuilder()
            .softDelete()
            .from(UserRole)
            .where('user_id = :userId', { userId: user.id })
            .andWhere('role_id = :roleId', { roleId: adminRole.id })
            .andWhere('deleted_at IS NULL')
            .execute();
        }
      }

      const existing = await manager
        .createQueryBuilder(UserRole, 'userRole')
        .innerJoin('userRole.role', 'role')
        .where('userRole.user_id = :userId', { userId: user.id })
        .andWhere('role.id = :roleId', { roleId: role.id })
        .andWhere('userRole.deleted_at IS NULL')
        .getOne();

      if (!existing) {
        await manager.save(manager.create(UserRole, { user, role }));
      }
    });
  }

  async deleteAllUsers(): Promise<number> {
    const result = await this.dataSource
      .createQueryBuilder()
      .delete()
      .from(User)
      .where('1 = 1')
      .execute();
    return result.affected ?? 0;
  }

  createRefreshToken(
    id: string,
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<RefreshToken> {
    return this.refreshTokens.save(
      this.refreshTokens.create({
        id,
        userId,
        tokenHash,
        expiresAt,
        revoked: false,
      }),
    );
  }

  findRefreshToken(id: string): Promise<RefreshToken | null> {
    return this.refreshTokens.findOne({ where: { id } });
  }

  async revokeRefreshToken(id: string): Promise<void> {
    await this.refreshTokens.update({ id }, { revoked: true });
  }

  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.refreshTokens.update(
      { userId, revoked: false },
      { revoked: true },
    );
  }

  createOtp(
    userId: string,
    purpose: OtpPurpose,
    codeHash: string,
    expiresAt: Date,
  ): Promise<OtpCode> {
    return this.otpCodes.save(
      this.otpCodes.create({
        userId,
        purpose,
        codeHash,
        expiresAt,
        used: false,
      }),
    );
  }

  findActiveOtp(userId: string, purpose: OtpPurpose): Promise<OtpCode | null> {
    return this.otpCodes
      .createQueryBuilder('otp')
      .where('otp.user_id = :userId', { userId })
      .andWhere('otp.purpose = :purpose', { purpose })
      .andWhere('otp.used = false')
      .andWhere('otp.expires_at > :now', { now: new Date() })
      .orderBy('otp.created_at', 'DESC')
      .getOne();
  }

  async markOtpUsed(id: string): Promise<void> {
    await this.otpCodes.update({ id }, { used: true });
  }
}
