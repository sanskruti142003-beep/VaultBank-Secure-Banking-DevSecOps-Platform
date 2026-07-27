import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RoleName, User } from './entities';
import { UsersRepository } from './users.repository';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { normalizePhone } from './phone.util';

interface DatabaseErrorShape {
  code?: unknown;
  message?: unknown;
  detail?: unknown;
  constraint?: unknown;
  driverError?: {
    code?: unknown;
    message?: unknown;
    detail?: unknown;
    constraint?: unknown;
  };
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly repository: UsersRepository) {}

  async getById(id: string): Promise<User> {
    try {
      const user = await this.repository.findById(id);
      if (!user) {
        throw new NotFoundException('User not found');
      }
      return user;
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to get user');
    }
  }

  async listProfiles(): Promise<Record<string, unknown>[]> {
    try {
      const users = await this.repository.findAll();
      return users.map((user) => this.profile(user));
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to list users');
    }
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    try {
      const user = await this.getById(id);
      if (dto.email !== undefined) {
        const email = dto.email.trim().toLowerCase();
        const existing = await this.repository.findByEmail(email);
        if (existing && existing.id !== id) {
          throw new ConflictException('Email is already registered');
        }
        user.email = email;
      }
      if (dto.phone !== undefined) {
        const phone = normalizePhone(dto.phone);
        if (phone) {
          const existing = await this.repository.findByPhone(phone);
          if (existing && existing.id !== id) {
            throw new ConflictException('Phone number is already registered');
          }
        }
        user.phone = phone;
      }
      if (dto.full_name !== undefined) {
        user.fullName = dto.full_name;
      }
      if (dto.pan_number !== undefined) {
        const panNumber = this.normalizePan(dto.pan_number);
        if (panNumber) {
          const existing = await this.repository.findByPanNumber(panNumber);
          if (existing && existing.id !== id) {
            throw new ConflictException('PAN number is already registered');
          }
        }
        user.panNumber = panNumber;
      }
      return await this.repository.saveUser(user);
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to update profile');
    }
  }

  async assignRole(id: string, role: RoleName): Promise<void> {
    try {
      const user = await this.getById(id);
      await this.repository.assignRole(user, role);
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to assign role');
    }
  }

  async deleteAllUsers(): Promise<number> {
    try {
      return await this.repository.deleteAllUsers();
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to delete users');
    }
  }

  roles(user: User): string[] {
    try {
      return user.userRoles?.map((item) => item.role.name) ?? [];
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to resolve user roles');
    }
  }

  profile(user: User): Record<string, unknown> {
    try {
      return {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        pan_number: user.panNumber,
        full_name: user.fullName,
        is_verified: user.isVerified,
        is_active: user.isActive,
        roles: this.roles(user),
        created_at: user.createdAt,
        updated_at: user.updatedAt,
      };
    } catch (error: unknown) {
      this.rethrow(error, 'Failed to build user profile');
    }
  }

  private normalizePan(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }
    const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    return normalized || null;
  }

  private rethrow(error: unknown, message: string): never {
    this.logger.error(
      message,
      error instanceof Error ? error.stack : undefined,
    );
    if (this.isUniqueConstraintError(error)) {
      const details = this.databaseErrorDetails(error);
      if (
        details.includes('pan_number') ||
        details.includes('uq_users_pan_number_active')
      ) {
        throw new ConflictException('PAN number is already registered');
      }
    }
    if (error instanceof HttpException) {
      throw error;
    }
    throw new InternalServerErrorException(message);
  }

  private isUniqueConstraintError(error: unknown): boolean {
    const databaseError = this.asDatabaseError(error);
    return (
      databaseError.code === '23505' ||
      databaseError.driverError?.code === '23505'
    );
  }

  private databaseErrorDetails(error: unknown): string {
    const databaseError = this.asDatabaseError(error);
    return [
      databaseError.message,
      databaseError.detail,
      databaseError.constraint,
      databaseError.driverError?.message,
      databaseError.driverError?.detail,
      databaseError.driverError?.constraint,
    ]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .toLowerCase();
  }

  private asDatabaseError(error: unknown): DatabaseErrorShape {
    if (typeof error === 'object' && error !== null) {
      return error as DatabaseErrorShape;
    }
    return {};
  }
}
